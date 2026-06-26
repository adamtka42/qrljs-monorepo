import type { qrl } from '@theqrl/util'

import { QRLDynamicFeeTransaction } from './dynamicFee.ts'

import type { QRLDynamicFeeTxData } from './types.ts'

export function createQRLDynamicFeeTransaction(
  data: QRLDynamicFeeTxData,
): QRLDynamicFeeTransaction {
  return new QRLDynamicFeeTransaction(data)
}

export function createQRLContractCreationTransaction(
  data: Omit<QRLDynamicFeeTxData, 'to'>,
): QRLDynamicFeeTransaction {
  return new QRLDynamicFeeTransaction(data)
}

export function createQRLContractCallTransaction(
  data: QRLDynamicFeeTxData & { to: qrl.QRLAddress | Uint8Array | string },
): QRLDynamicFeeTransaction {
  return new QRLDynamicFeeTransaction(data)
}
