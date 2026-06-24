import { RLP } from '@ethereumjs/rlp'
import {
  EthereumJSErrorWithoutCode,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  qrl,
} from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'

import {
  type QRLAccessList,
  accessListFromBytes,
  accessListToBytes,
  copyQRLAccessList,
} from './access.ts'
import { QRL_DESCRIPTOR_BYTES, QRL_DYNAMIC_FEE_TX_TYPE } from './constants.ts'

import type { Input } from '@ethereumjs/rlp'
import type { NormalizedQRLDynamicFeeTxData, QRLDynamicFeeTxData } from './types.ts'

type QRLDynamicFeeTxRaw = [
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  [Uint8Array, Uint8Array[]][],
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
]

type QRLDynamicFeeTxSigningRaw = [
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  Uint8Array,
  [Uint8Array, Uint8Array[]][],
  Uint8Array,
  Uint8Array,
]

export class QRLDynamicFeeTransaction {
  public readonly type = QRL_DYNAMIC_FEE_TX_TYPE

  public readonly chainId: bigint
  public readonly nonce: bigint
  public readonly gasTipCap: bigint
  public readonly gasFeeCap: bigint
  public readonly gasLimit: bigint
  public readonly to?: qrl.QRLAddress
  public readonly value: bigint
  public readonly data: Uint8Array
  public readonly accessList: QRLAccessList
  public readonly descriptor: Uint8Array
  public readonly extraParams: Uint8Array
  public readonly signature: Uint8Array
  public readonly publicKey: Uint8Array

  public constructor(data: QRLDynamicFeeTxData) {
    const normalized = normalizeTxData(data)

    this.chainId = normalized.chainId
    this.nonce = normalized.nonce
    this.gasTipCap = normalized.gasTipCap
    this.gasFeeCap = normalized.gasFeeCap
    this.gasLimit = normalized.gasLimit
    this.to = normalized.to
    this.value = normalized.value
    this.data = normalized.data
    this.accessList = normalized.accessList
    this.descriptor = normalized.descriptor
    this.extraParams = normalized.extraParams
    this.signature = normalized.signature
    this.publicKey = normalized.publicKey

    Object.freeze(this)
  }

  public isContractCreation(): boolean {
    return this.to === undefined
  }

  public gasPrice(): bigint {
    return this.gasFeeCap
  }

  public cost(): bigint {
    return this.gasPrice() * this.gasLimit + this.value
  }

  public raw(): QRLDynamicFeeTxRaw {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasTipCap),
      bigIntToUnpaddedBytes(this.gasFeeCap),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.toBytes() ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      new Uint8Array(this.data),
      accessListToBytes(this.accessList),
      new Uint8Array(this.descriptor),
      new Uint8Array(this.extraParams),
      new Uint8Array(this.signature),
      new Uint8Array(this.publicKey),
    ]
  }

  public signingRaw(): QRLDynamicFeeTxSigningRaw {
    return [
      bigIntToUnpaddedBytes(this.chainId),
      bigIntToUnpaddedBytes(this.nonce),
      bigIntToUnpaddedBytes(this.gasTipCap),
      bigIntToUnpaddedBytes(this.gasFeeCap),
      bigIntToUnpaddedBytes(this.gasLimit),
      this.to?.toBytes() ?? new Uint8Array(0),
      bigIntToUnpaddedBytes(this.value),
      new Uint8Array(this.data),
      accessListToBytes(this.accessList),
      new Uint8Array(this.descriptor),
      new Uint8Array(this.extraParams),
    ]
  }

  public getMessageToSign(): Uint8Array {
    return prefixedRlpHash(this.type, this.signingRaw())
  }

  public hash(): Uint8Array {
    return prefixedRlpHash(this.type, this.raw())
  }

  public serialize(): Uint8Array {
    return concatBytes(new Uint8Array([this.type]), RLP.encode(this.raw() as Input))
  }

  public toJSON() {
    return {
      type: `0x${this.type.toString(16).padStart(2, '0')}`,
      chainId: `0x${this.chainId.toString(16)}`,
      nonce: `0x${this.nonce.toString(16)}`,
      gasTipCap: `0x${this.gasTipCap.toString(16)}`,
      gasFeeCap: `0x${this.gasFeeCap.toString(16)}`,
      gasLimit: `0x${this.gasLimit.toString(16)}`,
      to: this.to?.toString(),
      value: `0x${this.value.toString(16)}`,
      data: bytesToHex(this.data),
      accessList: this.accessList.map((tuple) => ({
        address: tuple.address.toString(),
        storageKeys: tuple.storageKeys.map((key) => bytesToHex(key)),
      })),
      descriptor: bytesToHex(this.descriptor),
      extraParams: bytesToHex(this.extraParams),
      signature: bytesToHex(this.signature),
      publicKey: bytesToHex(this.publicKey),
    }
  }

  public static fromSerialized(serialized: Uint8Array): QRLDynamicFeeTransaction {
    if (serialized[0] !== QRL_DYNAMIC_FEE_TX_TYPE) {
      throw EthereumJSErrorWithoutCode(
        `Invalid QRL transaction type=${serialized[0] ?? 'undefined'}`,
      )
    }
    const decoded = RLP.decode(serialized.subarray(1))
    if (!Array.isArray(decoded) || decoded.length !== 13) {
      throw EthereumJSErrorWithoutCode('Invalid QRL dynamic fee transaction payload')
    }

    const [
      chainId,
      nonce,
      gasTipCap,
      gasFeeCap,
      gasLimit,
      to,
      value,
      data,
      accessList,
      descriptor,
      extraParams,
      signature,
      publicKey,
    ] = decoded

    for (const field of [
      chainId,
      nonce,
      gasTipCap,
      gasFeeCap,
      gasLimit,
      to,
      value,
      data,
      descriptor,
      extraParams,
      signature,
      publicKey,
    ]) {
      if (!(field instanceof Uint8Array)) {
        throw EthereumJSErrorWithoutCode('Invalid QRL dynamic fee transaction scalar field')
      }
    }
    if (!Array.isArray(accessList)) {
      throw EthereumJSErrorWithoutCode('Invalid QRL dynamic fee transaction access list')
    }

    const toBytes = asBytes(to)
    return new QRLDynamicFeeTransaction({
      chainId: bytesToBigInt(asBytes(chainId)),
      nonce: bytesToBigInt(asBytes(nonce)),
      gasTipCap: bytesToBigInt(asBytes(gasTipCap)),
      gasFeeCap: bytesToBigInt(asBytes(gasFeeCap)),
      gasLimit: bytesToBigInt(asBytes(gasLimit)),
      to: toBytes.length === 0 ? undefined : qrl.QRLAddress.fromBytes(toBytes),
      value: bytesToBigInt(asBytes(value)),
      data: asBytes(data),
      accessList: accessListFromBytes(accessList),
      descriptor: asBytes(descriptor),
      extraParams: asBytes(extraParams),
      signature: asBytes(signature),
      publicKey: asBytes(publicKey),
    })
  }
}

function normalizeTxData(data: QRLDynamicFeeTxData): NormalizedQRLDynamicFeeTxData {
  const chainId = validateNonNegativeBigint('chainId', data.chainId)
  const nonce = validateBigintLike('nonce', data.nonce)
  const gasTipCap = validateNonNegativeBigint('gasTipCap', data.gasTipCap)
  const gasFeeCap = validateNonNegativeBigint('gasFeeCap', data.gasFeeCap)
  const gasLimit = validateBigintLike('gasLimit', data.gasLimit)
  const value = validateNonNegativeBigint('value', data.value ?? 0n)

  if (gasFeeCap < gasTipCap) {
    throw EthereumJSErrorWithoutCode('QRL gasFeeCap cannot be less than gasTipCap')
  }

  const descriptor = copyBytes(data.descriptor ?? new Uint8Array(QRL_DESCRIPTOR_BYTES))
  if (descriptor.length !== QRL_DESCRIPTOR_BYTES) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL descriptor length=${descriptor.length}`)
  }

  return {
    chainId,
    nonce,
    gasTipCap,
    gasFeeCap,
    gasLimit,
    to: normalizeTo(data.to),
    value,
    data: copyBytes(data.data ?? new Uint8Array(0)),
    accessList: copyQRLAccessList(data.accessList ?? []),
    descriptor,
    extraParams: copyBytes(data.extraParams ?? new Uint8Array(0)),
    signature: copyBytes(data.signature ?? new Uint8Array(0)),
    publicKey: copyBytes(data.publicKey ?? new Uint8Array(0)),
  }
}

function normalizeTo(to?: qrl.QRLAddress | Uint8Array | string): qrl.QRLAddress | undefined {
  if (to === undefined) {
    return undefined
  }
  if (to instanceof qrl.QRLAddress) {
    return qrl.QRLAddress.fromBytes(to.toBytes())
  }
  if (to instanceof Uint8Array) {
    if (to.length === 0) {
      return undefined
    }
    return qrl.QRLAddress.fromBytes(to)
  }
  if (typeof to === 'string') {
    return qrl.QRLAddress.fromString(to)
  }
  throw EthereumJSErrorWithoutCode('Invalid QRL transaction to field')
}

function validateBigintLike(name: string, value: bigint | number): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw EthereumJSErrorWithoutCode(`QRL ${name} must be a safe integer`)
    }
    return validateNonNegativeBigint(name, BigInt(value))
  }
  return validateNonNegativeBigint(name, value)
}

function validateNonNegativeBigint(name: string, value: bigint): bigint {
  if (typeof value !== 'bigint') {
    throw EthereumJSErrorWithoutCode(`QRL ${name} must be a bigint`)
  }
  if (value < 0n) {
    throw EthereumJSErrorWithoutCode(`QRL ${name} cannot be negative`)
  }
  return value
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) {
    throw EthereumJSErrorWithoutCode('QRL transaction byte fields must be Uint8Array')
  }
  return new Uint8Array(bytes)
}

function asBytes(value: unknown): Uint8Array {
  if (!(value instanceof Uint8Array)) {
    throw EthereumJSErrorWithoutCode('Invalid QRL dynamic fee transaction scalar field')
  }
  return value
}

function prefixedRlpHash(prefix: number, value: Input): Uint8Array {
  return keccak_256(concatBytes(new Uint8Array([prefix]), RLP.encode(value)))
}
