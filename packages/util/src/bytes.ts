import {
  bytesToHex as bytesToUnprefixedHex,
  hexToBytes as hexToBytesNoble,
} from '@noble/hashes/utils.js'

import { QRLJSErrorWithoutCode } from './errors.ts'

import type { PrefixedHexString } from './types.ts'

function padToEven(value: string): string {
  return value.length % 2 === 0 ? value : `0${value}`
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value
}

export const hexToBytes = (hex: PrefixedHexString): Uint8Array => {
  if (!hex.startsWith('0x')) {
    throw QRLJSErrorWithoutCode('input string must be 0x prefixed')
  }
  return hexToBytesNoble(padToEven(stripHexPrefix(hex)))
}

export const bytesToHex = (bytes: Uint8Array): PrefixedHexString => {
  return `0x${bytesToUnprefixedHex(bytes)}`
}

export const bigIntToBytes = (num: bigint): Uint8Array => {
  return hexToBytes(`0x${padToEven(num.toString(16))}` as PrefixedHexString)
}

export const bigIntToUnpaddedBytes = (value: bigint): Uint8Array => {
  const bytes = bigIntToBytes(value)
  let first = 0
  while (first < bytes.length && bytes[first] === 0) first++
  return bytes.slice(first)
}

export const bytesToBigInt = (bytes: Uint8Array): bigint => {
  const hex = bytesToHex(bytes)
  return hex === '0x' ? 0n : BigInt(hex)
}

export const concatBytes = (...arrays: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const length = arrays.reduce((sum, array) => sum + array.length, 0)
  const result = new Uint8Array(length)
  let offset = 0
  for (const array of arrays) {
    result.set(array, offset)
    offset += array.length
  }
  return result
}

export function equalsBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
