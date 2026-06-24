import { EthereumJSErrorWithoutCode, equalsBytes } from '@ethereumjs/util'

import { QRL_STORAGE_KEY_BYTES, QRL_STORAGE_VALUE_BYTES } from './constants.ts'

export type QRLStorageKey = Uint8Array
export type QRLStorageValue = Uint8Array

export function assertQRLStorageKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array)) {
    throw EthereumJSErrorWithoutCode('QRL storage key must be Uint8Array')
  }
  if (key.length !== QRL_STORAGE_KEY_BYTES) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL storage key length=${key.length}`)
  }
}

export function assertQRLStorageValue(value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw EthereumJSErrorWithoutCode('QRL storage value must be Uint8Array')
  }
  if (value.length !== QRL_STORAGE_VALUE_BYTES) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL storage value length=${value.length}`)
  }
}

export function cloneQRLStorageValue(value: Uint8Array): Uint8Array {
  assertQRLStorageValue(value)
  return new Uint8Array(value)
}

export function emptyQRLStorageValue(): Uint8Array {
  return new Uint8Array(QRL_STORAGE_VALUE_BYTES)
}

export function isEmptyQRLStorageValue(value: Uint8Array): boolean {
  assertQRLStorageValue(value)
  return equalsBytes(value, emptyQRLStorageValue())
}
