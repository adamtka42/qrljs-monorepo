import type { qrl as blockQrl } from '@ethereumjs/block'
import type { qrl as stateQrl } from '@ethereumjs/statemanager'
import type { qrl as txQrl } from '@ethereumjs/tx'
import type { QRLRunTxResult } from './result.ts'

export type QRLChainSnapshotId = bigint

export interface QRLChainSnapshot {
  id: QRLChainSnapshotId
  stateManager: stateQrl.QRLStateManager
  latestBlockHash: Uint8Array
  blocksByNumber: Map<string, blockQrl.QRLBlock>
  blocksByHash: Map<string, blockQrl.QRLBlock>
  transactionsByHash: Map<string, txQrl.QRLDynamicFeeTransaction>
  receiptsByTxHash: Map<string, blockQrl.QRLReceipt>
  pendingTransactions: txQrl.QRLDynamicFeeTransaction[]
  pendingResults: QRLRunTxResult[]
}
