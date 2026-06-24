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

  validateQrlInitCodeSize(tx)

  const intrinsicGas = qrlIntrinsicGas(tx)
  if (tx.gasLimit < intrinsicGas) {
    throw qrlRunTxError('INTRINSIC_GAS_TOO_LOW', 'QRL transaction gas limit is below intrinsic gas')
  }
  const executionGasLimit = tx.gasLimit - intrinsicGas

  const maxGasCost = tx.gasLimit * tx.gasFeeCap
  const upfrontCost = maxGasCost + tx.value
  if (options.skipBalance !== true && (await stateManager.getBalance(sender)) < upfrontCost) {
    throw qrlRunTxError('INSUFFICIENT_FUNDS', 'QRL sender has insufficient funds')
  }

  const evm = options.evm ?? new evmQrl.QRLEVM({ stateManager })
  let createdAddress: qrl.QRLAddress | undefined
  if (tx.isContractCreation()) {
    const createNonce = await stateManager.getNonce(sender)
    createdAddress = createQRLContractAddress(sender, createNonce)
    await ensureNoContractCollision(stateManager, createdAddress)
  }

  const warmedAccounts = qrlTxWarmedAccounts(tx, sender, context)
  const warmedStorage = qrlTxWarmedStorage(tx)

  await stateManager.subBalance(sender, tx.gasLimit * effectiveGasPrice)
  await stateManager.incrementNonce(sender)

  await stateManager.checkpoint()
  try {
    let execution: evmQrl.QRLExecutionResult

    if (tx.isContractCreation()) {
      await transferValue(stateManager, sender, createdAddress!, tx.value)
      execution = await evm.runCode({
        to: createdAddress!,
        caller: sender,
        origin: sender,
        code: tx.data,
        value: tx.value,
        gasLimit: executionGasLimit,
        warmedAccounts,
        warmedStorage,
        context: {
          coinbase: context.coinbase,
          blockNumber: context.blockNumber,
          timestamp: context.timestamp,
          gasLimit: context.gasLimit,
          chainId: context.chainId,
          baseFee: context.baseFee,
          gasPrice: effectiveGasPrice,
        },
      })
      if (execution.exceptionError === undefined) {
        if (!isValidDeployedCode(execution.returnValue)) {
          execution = {
            ...execution,
            exceptionError: new evmQrl.QRLVMError('QRL invalid deployed code'),
          }
        } else {
          await stateManager.putCode(createdAddress!, execution.returnValue)
        }
      }
    } else {
      await transferValue(stateManager, sender, tx.to!, tx.value)
      execution = await evm.runCall({
        to: tx.to!,
        caller: sender,
        origin: sender,
        data: tx.data,
        value: tx.value,
        gasLimit: executionGasLimit,
        warmedAccounts,
        warmedStorage,
        context: {
          coinbase: context.coinbase,
          blockNumber: context.blockNumber,
          timestamp: context.timestamp,
          gasLimit: context.gasLimit,
          chainId: context.chainId,
          baseFee: context.baseFee,
          gasPrice: effectiveGasPrice,
        },
      })
    }

    if (execution.exceptionError !== undefined) {
      await stateManager.revert()
      await refundRemainingGas(stateManager, sender, execution, intrinsicGas, effectiveGasPrice)
      return buildResult(tx, sender, effectiveGasPrice, execution, intrinsicGas, 0, createdAddress)
    }

    await refundRemainingGas(stateManager, sender, execution, intrinsicGas, effectiveGasPrice)
    await stateManager.commit()

    return buildResult(tx, sender, effectiveGasPrice, execution, intrinsicGas, 1, createdAddress)
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

async function refundRemainingGas(
  stateManager: stateQrl.QRLStateManager,
  sender: qrl.QRLAddress,
  execution: evmQrl.QRLExecutionResult,
  intrinsicGas: bigint,
  effectiveGasPrice: bigint,
): Promise<void> {
  const refundableGas = execution.gasRemaining + cappedGasRefund(execution, intrinsicGas)
  const refund = refundableGas * effectiveGasPrice
  if (refund > 0n) {
    await stateManager.addBalance(sender, refund)
  }
}

function qrlTxWarmedAccounts(
  tx: txQrl.QRLDynamicFeeTransaction,
  sender: qrl.QRLAddress,
  context: NormalizedQRLRunTxContext,
): qrl.QRLAddress[] {
  const accounts = [sender, context.coinbase]
  if (tx.to !== undefined) {
    accounts.push(tx.to)
  }
  return accounts
}

function qrlTxWarmedStorage(tx: txQrl.QRLDynamicFeeTransaction): evmQrl.QRLWarmStorageAccess[] {
  return tx.accessList.flatMap((tuple) =>
    tuple.storageKeys.map((key) => ({
      address: tuple.address,
      key,
    })),
  )
}

function validateQrlInitCodeSize(tx: txQrl.QRLDynamicFeeTransaction): void {
  if (tx.isContractCreation() && tx.data.length > evmQrl.QRL_MAX_INIT_CODE_SIZE) {
    throw qrlRunTxError('INIT_CODE_SIZE_EXCEEDED', 'QRL init code size exceeds limit')
  }
}

export function qrlIntrinsicGas(tx: txQrl.QRLDynamicFeeTransaction): bigint {
  let gas = tx.isContractCreation() ? 53000n : 21000n
  for (const byte of tx.data) {
    gas += byte === 0 ? 4n : 16n
  }
  if (tx.isContractCreation()) {
    gas += evmQrl.qrlCreateInitCodeGas(tx.data.length)
  }
  for (const tuple of tx.accessList) {
    gas += 2400n + BigInt(tuple.storageKeys.length) * 1900n
  }
  return gas
}

function isValidDeployedCode(code: Uint8Array): boolean {
  return code.length <= evmQrl.QRL_MAX_CODE_SIZE && code[0] !== 0xef
}

function chargedGasUsed(execution: evmQrl.QRLExecutionResult, intrinsicGas: bigint): bigint {
  return intrinsicGas + execution.gasUsed - cappedGasRefund(execution, intrinsicGas)
}

function cappedGasRefund(execution: evmQrl.QRLExecutionResult, intrinsicGas: bigint): bigint {
  const maxRefund = (intrinsicGas + execution.gasUsed) / 5n
  return execution.gasRefund < maxRefund ? execution.gasRefund : maxRefund
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
  intrinsicGas: bigint,
  status: 0 | 1,
  createdAddress?: qrl.QRLAddress,
): QRLRunTxResult {
  return {
    txHash: tx.hash(),
    sender,
    to: tx.to,
    createdAddress,
    returnValue: new Uint8Array(execution.returnValue),
    gasUsed: chargedGasUsed(execution, intrinsicGas),
    gasRemaining: execution.gasRemaining + cappedGasRefund(execution, intrinsicGas),
    gasRefund: execution.gasRefund,
    totalGasSpent: chargedGasUsed(execution, intrinsicGas) * effectiveGasPrice,
    effectiveGasPrice,
    executionError: execution.exceptionError,
    status,
    logs: (execution.logs ?? []).map(copyExecutionLog),
  }
}

function copyExecutionLog(log: evmQrl.QRLExecutionLog): evmQrl.QRLExecutionLog {
  return {
    address: qrl.QRLAddress.fromBytes(log.address.toBytes()),
    topics: log.topics.map((topic) => new Uint8Array(topic)),
    data: new Uint8Array(log.data),
  }
}
