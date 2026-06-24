import type { qrl as evmQrl } from '@ethereumjs/evm'
import type { qrl } from '@ethereumjs/util'

export interface QRLRunTxResult {
  txHash: Uint8Array
  sender: qrl.QRLAddress
  to?: qrl.QRLAddress
  createdAddress?: qrl.QRLAddress
  returnValue: Uint8Array
  gasUsed: bigint
  gasRemaining: bigint
  gasRefund: bigint
  totalGasSpent: bigint
  effectiveGasPrice: bigint
  executionError?: Error
  status: 0 | 1
  logs?: evmQrl.QRLExecutionLog[]
}
