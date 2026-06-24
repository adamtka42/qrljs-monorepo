import type { qrl as blockQrl } from '@ethereumjs/block'
import type { qrl as txQrl } from '@ethereumjs/tx'
import type { qrl } from '@ethereumjs/util'

import type { QRLRunTxContext } from './context.ts'
import type { QRLLocalChain } from './localChain.ts'

export interface QRLLocalProviderRequest {
  method: string
  params?: unknown[]
}

export interface QRLLocalProviderOptions {
  chain?: QRLLocalChain
  accounts?: QRLProviderAccount[]
  defaultContext?: QRLRunTxContext
  automine?: boolean
}

export interface QRLProviderAccount {
  address: qrl.QRLAddress
  balance?: bigint
  nonce?: bigint
  signer?: txQrl.QRLSigner
}

export interface QRLProviderTransactionRequest {
  from: string
  to?: string
  nonce?: bigint | number | string
  gas?: bigint | number | string
  gasLimit?: bigint | number | string
  maxFeePerGas?: bigint | number | string
  maxPriorityFeePerGas?: bigint | number | string
  value?: bigint | number | string
  data?: string | Uint8Array
}

export type QRLBlockTag = 'latest' | 'earliest'

export interface QRLFormattedTransaction {
  hash: string
  type: string
  chainId: string
  nonce: string
  from?: string
  to?: string
  gas: string
  gasLimit: string
  gasFeeCap: string
  gasTipCap: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
  value: string
  input: string
  data: string
  blockHash?: string
  blockNumber?: string
  transactionIndex?: string
}

export interface QRLFormattedBlock {
  hash: string
  parentHash: string
  number: string
  timestamp: string
  gasLimit: string
  gasUsed: string
  baseFeePerGas: string
  miner: string
  stateRoot: string
  transactionsRoot: string
  receiptsRoot: string
  logsBloom: string
  transactions: string[] | QRLFormattedTransaction[]
  receipts: ReturnType<blockQrl.QRLReceipt['toJSON']>[]
}
