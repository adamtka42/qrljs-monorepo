import type { qrl } from '@theqrl/util'

import type { QRLAccessList } from './access.ts'

export interface QRLDynamicFeeTxData {
  chainId: bigint
  nonce: bigint | number
  gasTipCap: bigint
  gasFeeCap: bigint
  gasLimit: bigint | number
  to?: qrl.QRLAddress | Uint8Array | string
  value?: bigint
  data?: Uint8Array
  accessList?: QRLAccessList
  descriptor?: Uint8Array
  extraParams?: Uint8Array
  signature?: Uint8Array
  publicKey?: Uint8Array
}

export interface NormalizedQRLDynamicFeeTxData {
  chainId: bigint
  nonce: bigint
  gasTipCap: bigint
  gasFeeCap: bigint
  gasLimit: bigint
  to?: qrl.QRLAddress
  value: bigint
  data: Uint8Array
  accessList: QRLAccessList
  descriptor: Uint8Array
  extraParams: Uint8Array
  signature: Uint8Array
  publicKey: Uint8Array
}
