import type { qrl } from '@theqrl/util'
import { QRLJSErrorWithoutCode } from '@theqrl/util'

import { QRL_DYNAMIC_FEE_TX_TYPE } from './constants.ts'
import { QRLDynamicFeeTransaction } from './dynamicFee.ts'

import type { QRLDynamicFeeTxData } from './types.ts'

export class QRLTransaction {
  public readonly inner: QRLDynamicFeeTransaction

  private constructor(inner: QRLDynamicFeeTransaction) {
    this.inner = inner
    Object.freeze(this)
  }

  static fromDynamicFee(data: QRLDynamicFeeTxData): QRLTransaction {
    return new QRLTransaction(new QRLDynamicFeeTransaction(data))
  }

  static fromSerialized(bytes: Uint8Array): QRLTransaction {
    if (bytes[0] !== QRL_DYNAMIC_FEE_TX_TYPE) {
      throw QRLJSErrorWithoutCode(`Unsupported QRL transaction type=${bytes[0]}`)
    }
    return new QRLTransaction(QRLDynamicFeeTransaction.fromSerialized(bytes))
  }

  type(): number {
    return this.inner.type
  }

  chainId(): bigint {
    return this.inner.chainId
  }

  nonce(): bigint {
    return this.inner.nonce
  }

  to(): qrl.QRLAddress | undefined {
    return this.inner.to
  }

  data(): Uint8Array {
    return new Uint8Array(this.inner.data)
  }

  gasLimit(): bigint {
    return this.inner.gasLimit
  }

  gasPrice(): bigint {
    return this.inner.gasPrice()
  }

  gasTipCap(): bigint {
    return this.inner.gasTipCap
  }

  gasFeeCap(): bigint {
    return this.inner.gasFeeCap
  }

  value(): bigint {
    return this.inner.value
  }

  cost(): bigint {
    return this.inner.cost()
  }

  hash(): Uint8Array {
    return this.inner.hash()
  }

  serialize(): Uint8Array {
    return this.inner.serialize()
  }

  isContractCreation(): boolean {
    return this.inner.isContractCreation()
  }
}
