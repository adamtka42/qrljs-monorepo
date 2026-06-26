import { bytesToHex } from '@theqrl/util'

export function qrlLookupKey(bytes: Uint8Array): string {
  return bytesToHex(bytes).toLowerCase()
}

export function qrlNumberKey(number: bigint): string {
  return number.toString(10)
}

export function cloneQRLMap<K, V>(map: ReadonlyMap<K, V>): Map<K, V> {
  return new Map(map)
}
