import type { qrl } from '@ethereumjs/util'

export interface QRLRunTxContext {
  chainId: bigint
  baseFee?: bigint
  coinbase?: qrl.QRLAddress
  blockNumber?: bigint
  timestamp?: bigint
  gasLimit?: bigint
  noBaseFee?: boolean
}

export interface NormalizedQRLRunTxContext {
  chainId: bigint
  baseFee: bigint
  coinbase: qrl.QRLAddress
  blockNumber: bigint
  timestamp: bigint
  gasLimit: bigint
  noBaseFee: boolean
}
