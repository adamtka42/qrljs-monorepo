import { qrl as blockQrl } from '@ethereumjs/block'

import type { QRLRunTxResult } from './result.ts'

export interface CreateQRLReceiptFromRunTxResultOptions {
  result: QRLRunTxResult
  blockHash?: Uint8Array
  blockNumber?: bigint
  transactionIndex?: number
  cumulativeGasUsed?: bigint
  logs?: blockQrl.QRLLog[]
}

export function createQRLReceiptFromRunTxResult(
  options: CreateQRLReceiptFromRunTxResultOptions,
): blockQrl.QRLReceipt {
  const { result } = options
  return new blockQrl.QRLReceipt({
    txHash: result.txHash,
    blockHash: options.blockHash,
    blockNumber: options.blockNumber,
    transactionIndex: options.transactionIndex,
    from: result.sender,
    to: result.to,
    createdAddress: result.status === 1 ? result.createdAddress : undefined,
    status: result.status,
    gasUsed: result.gasUsed,
    cumulativeGasUsed: options.cumulativeGasUsed ?? result.gasUsed,
    effectiveGasPrice: result.effectiveGasPrice,
    logs: options.logs ?? [],
  })
}
