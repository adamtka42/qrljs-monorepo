import { qrl as evmQrl } from '@ethereumjs/evm'
import type { qrl as stateQrl } from '@ethereumjs/statemanager'
import type { qrl as txQrl } from '@ethereumjs/tx'
import { qrl } from '@ethereumjs/util'

import { createQRLContractAddress } from './address.ts'
import { type NormalizedQRLRunTxContext, type QRLRunTxContext } from './context.ts'
import { qrlRunTxError } from './errors.ts'

import type { QRLRunTxResult } from './result.ts'

export interface QRLRunTxOptions {
  tx: txQrl.QRLDynamicFeeTransaction
  stateManager: stateQrl.QRLStateManager
  evm?: evmQrl.QRLEVM
  sender?: qrl.QRLAddress
  signer?: txQrl.QRLSigner
  context?: QRLRunTxContext
  skipBalance?: boolean
  skipNonce?: boolean
}

export async function runQRLTx(options: QRLRunTxOptions): Promise<QRLRunTxResult> {
  const { tx, stateManager } = options
  const context = normalizeContext(options.context)
  const sender = await resolveSender(options)

  validateChainId(tx, context)
  const effectiveGasPrice = effectiveQrlGasPrice(tx, context)

  if (options.skipNonce !== true) {
    await validateNonce(stateManager, sender, tx.nonce)
  }

  const maxGasCost = tx.gasLimit * tx.gasFeeCap
  const upfrontCost = maxGasCost + tx.value
  if (options.skipBalance !== true && (await stateManager.getBalance(sender)) < upfrontCost) {
    throw qrlRunTxError('INSUFFICIENT_FUNDS', 'QRL sender has insufficient funds')
  }

  const evm = options.evm ?? new evmQrl.QRLEVM({ stateManager })
  await stateManager.checkpoint()
  try {
    await stateManager.subBalance(sender, tx.gasLimit * effectiveGasPrice)

    let execution: evmQrl.QRLExecutionResult
    let createdAddress: qrl.QRLAddress | undefined

    if (tx.isContractCreation()) {
      const createNonce = await stateManager.getNonce(sender)
      createdAddress = createQRLContractAddress(sender, createNonce)
      await ensureNoContractCollision(stateManager, createdAddress)
      await stateManager.incrementNonce(sender)
      await transferValue(stateManager, sender, createdAddress, tx.value)
      execution = await evm.runCode({
        to: createdAddress,
        caller: sender,
        origin: sender,
        code: tx.data,
        value: tx.value,
        gasLimit: tx.gasLimit,
        context: {
          coinbase: context.coinbase,
          blockNumber: context.blockNumber,
          timestamp: context.timestamp,
          gasLimit: context.gasLimit,
        },
      })
      if (execution.exceptionError === undefined) {
        await stateManager.putCode(createdAddress, execution.returnValue)
      }
    } else {
      await stateManager.incrementNonce(sender)
      await transferValue(stateManager, sender, tx.to!, tx.value)
      execution = await evm.runCall({
        to: tx.to!,
        caller: sender,
        origin: sender,
        data: tx.data,
        value: tx.value,
        gasLimit: tx.gasLimit,
        context: {
          coinbase: context.coinbase,
          blockNumber: context.blockNumber,
          timestamp: context.timestamp,
          gasLimit: context.gasLimit,
        },
      })
    }

    if (execution.exceptionError !== undefined) {
      await stateManager.revert()
      return buildResult(tx, sender, effectiveGasPrice, execution, 0, createdAddress)
    }

    const refund = execution.gasRemaining * effectiveGasPrice
    if (refund > 0n) {
      await stateManager.addBalance(sender, refund)
    }
    await stateManager.commit()

    return buildResult(tx, sender, effectiveGasPrice, execution, 1, createdAddress)
  } catch (error) {
    await stateManager.revert()
    throw error
  }
}

export function effectiveQrlGasPrice(
  tx: txQrl.QRLDynamicFeeTransaction,
  context: NormalizedQRLRunTxContext,
): bigint {
  if (context.noBaseFee && tx.gasFeeCap === 0n && tx.gasTipCap === 0n) {
    return 0n
  }
  if (tx.gasFeeCap < tx.gasTipCap) {
    throw qrlRunTxError('FEE_CAP_BELOW_TIP', 'QRL gas fee cap is below gas tip cap')
  }
  if (tx.gasFeeCap < context.baseFee) {
    throw qrlRunTxError('FEE_CAP_BELOW_BASE_FEE', 'QRL gas fee cap is below base fee')
  }
  const tipPlusBaseFee = tx.gasTipCap + context.baseFee
  return tipPlusBaseFee < tx.gasFeeCap ? tipPlusBaseFee : tx.gasFeeCap
}

async function resolveSender(options: QRLRunTxOptions): Promise<qrl.QRLAddress> {
  if (options.sender !== undefined) {
    return options.sender
  }
  if (options.signer !== undefined) {
    return options.signer.sender(options.tx)
  }
  throw qrlRunTxError('MISSING_SENDER', 'QRL transaction execution requires sender or signer')
}

function normalizeContext(context: QRLRunTxContext = { chainId: 1n }): NormalizedQRLRunTxContext {
  return {
    chainId: context.chainId,
    baseFee: context.baseFee ?? 0n,
    coinbase: context.coinbase ?? qrl.QRLAddress.zero(),
    blockNumber: context.blockNumber ?? 0n,
    timestamp: context.timestamp ?? 0n,
    gasLimit: context.gasLimit ?? 0n,
    noBaseFee: context.noBaseFee ?? true,
  }
}

function validateChainId(
  tx: txQrl.QRLDynamicFeeTransaction,
  context: NormalizedQRLRunTxContext,
): void {
  if (tx.chainId !== context.chainId) {
    throw qrlRunTxError('WRONG_CHAIN_ID', 'QRL transaction chain id does not match context')
  }
}

async function validateNonce(
  stateManager: stateQrl.QRLStateManager,
  sender: qrl.QRLAddress,
  txNonce: bigint,
): Promise<void> {
  const stateNonce = await stateManager.getNonce(sender)
  if (stateNonce < txNonce) {
    throw qrlRunTxError('NONCE_TOO_HIGH', 'QRL transaction nonce is higher than state nonce')
  }
  if (stateNonce > txNonce) {
    throw qrlRunTxError('NONCE_TOO_LOW', 'QRL transaction nonce is lower than state nonce')
  }
}

async function transferValue(
  stateManager: stateQrl.QRLStateManager,
  from: qrl.QRLAddress,
  to: qrl.QRLAddress,
  value: bigint,
): Promise<void> {
  if (value === 0n) {
    return
  }
  await stateManager.subBalance(from, value)
  await stateManager.addBalance(to, value)
}

async function ensureNoContractCollision(
  stateManager: stateQrl.QRLStateManager,
  address: qrl.QRLAddress,
): Promise<void> {
  if (
    (await stateManager.getNonce(address)) !== 0n ||
    (await stateManager.getCodeSize(address)) !== 0
  ) {
    throw qrlRunTxError('CONTRACT_ADDRESS_COLLISION', 'QRL contract address collision')
  }
}

function buildResult(
  tx: txQrl.QRLDynamicFeeTransaction,
  sender: qrl.QRLAddress,
  effectiveGasPrice: bigint,
  execution: evmQrl.QRLExecutionResult,
  status: 0 | 1,
  createdAddress?: qrl.QRLAddress,
): QRLRunTxResult {
  return {
    txHash: tx.hash(),
    sender,
    to: tx.to,
    createdAddress,
    returnValue: new Uint8Array(execution.returnValue),
    gasUsed: execution.gasUsed,
    gasRemaining: execution.gasRemaining,
    totalGasSpent: execution.gasUsed * effectiveGasPrice,
    effectiveGasPrice,
    executionError: execution.exceptionError,
    status,
  }
}
