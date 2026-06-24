import { RLP } from '@ethereumjs/rlp'
import { keccak_512, shake256 } from '@noble/hashes/sha3.js'

import { bytesToHex, equalsBytes, hexToBytes } from '../bytes.ts'
import { EthereumJSErrorWithoutCode } from '../errors.ts'

import { QRL_ADDRESS_BYTES, QRL_ADDRESS_HEX_LENGTH, QRL_ADDRESS_PREFIX } from './constants.ts'

import type { Input } from '@ethereumjs/rlp'
import type { PrefixedHexString } from '../types.ts'

const QRL_ADDRESS_RE = new RegExp(`^${QRL_ADDRESS_PREFIX}[0-9a-fA-F]{${QRL_ADDRESS_HEX_LENGTH}}$`)
const QRL_HEX_RE = new RegExp(`^0x[0-9a-fA-F]{${QRL_ADDRESS_HEX_LENGTH}}$`)
const QRL_CONTRACT_ADDRESS_DOMAIN = new TextEncoder().encode('QRL-ADDR-v1')
const UINT64_MAX = 2n ** 64n - 1n

/**
 * Handling and validating QRL 64-byte addresses.
 */
export class QRLAddress {
  public readonly bytes: Uint8Array

  private constructor(bytes: Uint8Array) {
    assertQRLAddressBytes(bytes)
    this.bytes = new Uint8Array(bytes)
  }

  /**
   * Returns a QRL address from a 64-byte array.
   */
  static fromBytes(bytes: Uint8Array): QRLAddress {
    return new QRLAddress(bytes)
  }

  /**
   * Returns a QRL address from a 0x-prefixed 128-character hex string.
   */
  static fromHex(hex: string): QRLAddress {
    if (!QRL_HEX_RE.test(hex)) {
      throw EthereumJSErrorWithoutCode(`Invalid QRL address hex input=${hex}`)
    }
    return new QRLAddress(hexToBytes(hex as PrefixedHexString))
  }

  /**
   * Returns a QRL address from a Q-prefixed address string.
   */
  static fromString(value: string): QRLAddress {
    if (!isValidQRLAddress(value)) {
      throw EthereumJSErrorWithoutCode(`Invalid QRL address input=${value}`)
    }
    return new QRLAddress(hexToBytes(`0x${value.slice(1)}` as PrefixedHexString))
  }

  /**
   * Returns the zero QRL address.
   */
  static zero(): QRLAddress {
    return new QRLAddress(new Uint8Array(QRL_ADDRESS_BYTES))
  }

  /**
   * Is address equal to another.
   */
  equals(address: QRLAddress): boolean {
    return equalsBytes(this.bytes, address.bytes)
  }

  /**
   * Is address zero.
   */
  isZero(): boolean {
    return this.equals(QRLAddress.zero())
  }

  /**
   * Returns a new Uint8Array representation of address.
   */
  toBytes(): Uint8Array {
    return new Uint8Array(this.bytes)
  }

  /**
   * Returns a 0x-prefixed lowercase hex encoding of address bytes.
   */
  toHex(): PrefixedHexString {
    return bytesToHex(this.bytes)
  }

  /**
   * Returns the canonical QIP-55 mixed-case QRL address string.
   */
  toString(): string {
    return toQRLChecksumAddress(this.bytes)
  }
}

/**
 * Checks whether bytes can represent a QRL 64-byte address.
 */
export function assertQRLAddressBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    throw EthereumJSErrorWithoutCode('QRL address bytes must be Uint8Array')
  }
  if (bytes.length !== QRL_ADDRESS_BYTES) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL address length=${bytes.length}`)
  }
}

/**
 * Checks whether a string is a valid Q-prefixed QRL 64-byte address.
 *
 * Lowercase and uppercase address bodies are accepted as compatibility forms.
 * Mixed-case address bodies must match the QIP-55 SHAKE-256 checksum.
 */
export function isValidQRLAddress(value: string): boolean {
  if (typeof value !== 'string' || !QRL_ADDRESS_RE.test(value)) {
    return false
  }

  const body = value.slice(1)
  if (body === body.toLowerCase() || body === body.toUpperCase()) {
    return true
  }

  return value === toQRLChecksumAddress(hexToBytes(`0x${body}` as PrefixedHexString))
}

export function qrlAddressFromBytes(bytes: Uint8Array): QRLAddress {
  return QRLAddress.fromBytes(bytes)
}

export function qrlAddressFromHex(hex: string): QRLAddress {
  return QRLAddress.fromHex(hex)
}

export function createQRLContractAddress(sender: QRLAddress, nonce: bigint): QRLAddress {
  if (nonce < 0n || nonce > UINT64_MAX) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL contract nonce=${nonce.toString()}`)
  }
  const encoded = RLP.encode([sender.toBytes(), nonce] as Input)
  return QRLAddress.fromBytes(qrlContractAddressHash(encoded))
}

export function createQRLContractAddress2(
  sender: QRLAddress,
  salt64: Uint8Array,
  initCodeHash: Uint8Array,
): QRLAddress {
  if (salt64.length !== QRL_ADDRESS_BYTES) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL CREATE2 salt length=${salt64.length}`)
  }
  if (initCodeHash.length !== 32) {
    throw EthereumJSErrorWithoutCode(
      `Invalid QRL CREATE2 init code hash length=${initCodeHash.length}`,
    )
  }
  return QRLAddress.fromBytes(
    qrlContractAddressHash(new Uint8Array([0xff]), sender.toBytes(), salt64, initCodeHash),
  )
}

function qrlContractAddressHash(...parts: Uint8Array[]): Uint8Array {
  const hasher = keccak_512.create()
  hasher.update(QRL_CONTRACT_ADDRESS_DOMAIN)
  for (const part of parts) {
    hasher.update(part)
  }
  return hasher.digest()
}

function toQRLChecksumAddress(bytes: Uint8Array): string {
  assertQRLAddressBytes(bytes)

  const lowerBody = bytesToHex(bytes).slice(2)
  const checksum = shake256
    .create({ dkLen: QRL_ADDRESS_BYTES })
    .update(new TextEncoder().encode(lowerBody))
    .digest()

  let out = QRL_ADDRESS_PREFIX
  for (let i = 0; i < lowerBody.length; i++) {
    const char = lowerBody[i]
    if (char >= 'a' && char <= 'f') {
      let nibble = checksum[Math.floor(i / 2)]
      if (i % 2 === 0) {
        nibble >>= 4
      } else {
        nibble &= 0x0f
      }
      out += nibble >= 8 ? char.toUpperCase() : char
    } else {
      out += char
    }
  }
  return out
}
