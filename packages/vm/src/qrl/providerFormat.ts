import type { qrl as blockQrl } from '@theqrl/block'
import type { qrl as txQrl } from '@theqrl/tx'
import { QRLJSErrorWithoutCode, bytesToHex } from '@theqrl/util'
import type { qrl } from '@theqrl/util'

import type { QRLFormattedBlock, QRLFormattedTransaction } from './providerTypes.ts'

export function qrlQuantity(value: bigint | number): string {
  const normalized = typeof value === 'number' ? BigInt(value) : value
  if (normalized < 0n) {
    throw QRLJSErrorWithoutCode('QRL quantity cannot be negative')
  }
  return `0x${normalized.toString(16)}`
}

export function qrlData(bytes: Uint8Array): string {
  return bytesToHex(bytes)
}

export function qrlHash(bytes: Uint8Array): string {
  return bytesToHex(bytes)
}

export function qrlAddress(address: qrl.QRLAddress): string {
  return address.toString()
}

export function formatQRLTransaction(
  tx: txQrl.QRLDynamicFeeTransaction,
  block?: blockQrl.QRLBlock,
  transactionIndex?: number,
  from?: qrl.QRLAddress,
): QRLFormattedTransaction {
  return {
    hash: qrlHash(tx.hash()),
    type: qrlQuantity(tx.type),
    chainId: qrlQuantity(tx.chainId),
    nonce: qrlQuantity(tx.nonce),
    from: from?.toString(),
    to: tx.to?.toString(),
    gas: qrlQuantity(tx.gasLimit),
    gasLimit: qrlQuantity(tx.gasLimit),
    gasFeeCap: qrlQuantity(tx.gasFeeCap),
    gasTipCap: qrlQuantity(tx.gasTipCap),
    maxFeePerGas: qrlQuantity(tx.gasFeeCap),
    maxPriorityFeePerGas: qrlQuantity(tx.gasTipCap),
    value: qrlQuantity(tx.value),
    input: qrlData(tx.data),
    data: qrlData(tx.data),
    blockHash: block === undefined ? undefined : qrlHash(block.hash()),
    blockNumber: block === undefined ? undefined : qrlQuantity(block.header.number),
    transactionIndex:
      transactionIndex === undefined ? undefined : qrlQuantity(BigInt(transactionIndex)),
  }
}

export function formatQRLBlock(
  block: blockQrl.QRLBlock,
  includeTransactions: boolean,
): QRLFormattedBlock {
  return {
    hash: qrlHash(block.hash()),
    parentHash: qrlHash(block.header.parentHash),
    number: qrlQuantity(block.header.number),
    timestamp: qrlQuantity(block.header.timestamp),
    gasLimit: qrlQuantity(block.header.gasLimit),
    gasUsed: qrlQuantity(block.header.gasUsed),
    baseFeePerGas: qrlQuantity(block.header.baseFee),
    miner: block.header.coinbase.toString(),
    stateRoot: qrlHash(block.header.stateRoot),
    transactionsRoot: qrlHash(block.header.transactionsRoot),
    receiptsRoot: qrlHash(block.header.receiptsRoot),
    logsBloom: qrlData(block.header.logsBloom),
    transactions: includeTransactions
      ? block.transactions.map((tx, index) => formatQRLTransaction(tx, block, index))
      : block.transactions.map((tx) => qrlHash(tx.hash())),
    receipts: block.receipts.map((receipt) => formatQRLReceipt(receipt)),
  }
}

export function formatQRLReceipt(
  receipt: blockQrl.QRLReceipt,
): ReturnType<blockQrl.QRLReceipt['toJSON']> {
  return receipt.toJSON()
}

export function formatQRLLog(log: blockQrl.QRLLog): ReturnType<blockQrl.QRLLog['toJSON']> {
  return log.toJSON()
}
