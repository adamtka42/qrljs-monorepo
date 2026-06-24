import { bigIntToUnpaddedBytes, bytesToHex, hexToBytes } from '@ethereumjs/util'

import { QRL_HASH_BYTES, QRL_LOGS_BLOOM_BYTES, QRL_LOG_TOPIC_BYTES } from './constants.ts'
import { qrlBlockError } from './errors.ts'

import type { PrefixedHexString } from '@ethereumjs/util'

export type QRLJSONHex = PrefixedHexString

export function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes)
}

export function copyOptionalBytes(bytes: Uint8Array | undefined): Uint8Array | undefined {
  return bytes === undefined ? undefined : copyBytes(bytes)
}

export function assertBytes(name: string, value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw qrlBlockError(`${name} must be Uint8Array`)
  }
}

export function assertByteLength(name: string, value: Uint8Array, length: number): void {
  assertBytes(name, value)
  if (value.length !== length) {
    throw qrlBlockError(`Invalid ${name} length=${value.length}`)
  }
}

export function assertNonNegativeBigInt(name: string, value: bigint): void {
  if (typeof value !== 'bigint' || value < 0n) {
    throw qrlBlockError(`${name} must be a non-negative bigint`)
  }
}

export function assertOptionalNumber(name: string, value: number | undefined): void {
  if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
    throw qrlBlockError(`${name} must be a non-negative safe integer`)
  }
}

export function qrlZeroHash(): Uint8Array {
  return new Uint8Array(QRL_HASH_BYTES)
}

export function qrlEmptyRootHash(): Uint8Array {
  return hexToBytes(
    '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421' as PrefixedHexString,
  )
}

export function qrlZeroBloom(): Uint8Array {
  return new Uint8Array(QRL_LOGS_BLOOM_BYTES)
}

export function validateHash(name: string, value: Uint8Array): Uint8Array {
  assertByteLength(name, value, QRL_HASH_BYTES)
  return copyBytes(value)
}

export function validateLogTopic(name: string, value: Uint8Array): Uint8Array {
  assertByteLength(name, value, QRL_LOG_TOPIC_BYTES)
  return copyBytes(value)
}

export function validateBloom(name: string, value: Uint8Array): Uint8Array {
  assertByteLength(name, value, QRL_LOGS_BLOOM_BYTES)
  return copyBytes(value)
}

export function hex(bytes: Uint8Array): QRLJSONHex {
  return bytesToHex(bytes)
}

export function optionalHex(bytes: Uint8Array | undefined): QRLJSONHex | undefined {
  return bytes === undefined ? undefined : hex(bytes)
}

export function quantity(value: bigint): QRLJSONHex {
  return `0x${value.toString(16)}` as QRLJSONHex
}

export function optionalQuantity(value: bigint | undefined): QRLJSONHex | undefined {
  return value === undefined ? undefined : quantity(value)
}

export function numberQuantity(value: number): QRLJSONHex {
  return `0x${value.toString(16)}` as QRLJSONHex
}

export function optionalNumberQuantity(value: number | undefined): QRLJSONHex | undefined {
  return value === undefined ? undefined : numberQuantity(value)
}

export function bigintToRLP(value: bigint): Uint8Array {
  assertNonNegativeBigInt('RLP bigint', value)
  return bigIntToUnpaddedBytes(value)
}
