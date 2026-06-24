import type { qrl } from '@ethereumjs/util'
import type { QRLDynamicFeeTransaction } from './dynamicFee.ts'

export interface QRLAuthValues {
  signature: Uint8Array
  publicKey: Uint8Array
  descriptor: Uint8Array
  extraParams: Uint8Array
}

export interface QRLSigner {
  chainId: bigint
  hash(tx: QRLDynamicFeeTransaction, descriptor: Uint8Array, extraParams: Uint8Array): Uint8Array
  verify(tx: QRLDynamicFeeTransaction): boolean | Promise<boolean>
  sender(tx: QRLDynamicFeeTransaction): qrl.QRLAddress | Promise<qrl.QRLAddress>
}
