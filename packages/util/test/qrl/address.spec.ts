import { assert, describe, it } from 'vitest'

import { bytesToHex, hexToBytes, qrl } from '../../src/index.ts'

import type { PrefixedHexString } from '../../src/index.ts'

describe('QRLAddress', () => {
  const LOWERCASE_ADDRESS =
    'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72'
  const CHECKSUM_ADDRESS =
    'Qd5812F6Cf4a0f645aa620cd57319a0Ed649dd8f5519A9dde7770ae5b0E49e547985f35eB972A2a07041561aa39c65A3991478f9B1e6749e05277dcf58A9A8B72'
  const CONTRACT_ADDRESS =
    'QBc0fe193Abc30F1404Cee6e5297a272cdE7b8e7293B30214E55D60D69876Dfd980Dff538C1aCae8c6D092B97f3e8b182C22c66D2313C771D8E054aCb8379f222'
  const LOWERCASE_BODY = LOWERCASE_ADDRESS.slice(1)
  const LOWERCASE_HEX = `0x${LOWERCASE_BODY}` as PrefixedHexString

  it('constructs from exactly 64 bytes', () => {
    const bytes = hexToBytes(LOWERCASE_HEX)
    const address = qrl.QRLAddress.fromBytes(bytes)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)
  })

  it('rejects non-64-byte arrays', () => {
    assert.throws(() => qrl.QRLAddress.fromBytes(new Uint8Array(63)))
    assert.throws(() => qrl.QRLAddress.fromBytes(new Uint8Array(65)))
  })

  it('copies input and output bytes', () => {
    const bytes = hexToBytes(LOWERCASE_HEX)
    const address = qrl.QRLAddress.fromBytes(bytes)
    bytes.fill(0)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)

    const output = address.toBytes()
    output.fill(0)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)
  })

  it('constructs from 0x-prefixed hex', () => {
    const address = qrl.QRLAddress.fromHex(LOWERCASE_HEX)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)
  })

  it('rejects malformed hex', () => {
    assert.throws(() => qrl.QRLAddress.fromHex(LOWERCASE_BODY))
    assert.throws(() => qrl.QRLAddress.fromHex(`0x${LOWERCASE_BODY.slice(2)}`))
    assert.throws(() => qrl.QRLAddress.fromHex(`0x${LOWERCASE_BODY}00`))
    assert.throws(() => qrl.QRLAddress.fromHex(`0x${LOWERCASE_BODY.slice(0, -1)}g`))
  })

  it('constructs from lowercase QRL string', () => {
    const address = qrl.QRLAddress.fromString(LOWERCASE_ADDRESS)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)
    assert.strictEqual(address.toString(), CHECKSUM_ADDRESS)
  })

  it('constructs from checksummed QRL string', () => {
    const address = qrl.QRLAddress.fromString(CHECKSUM_ADDRESS)
    assert.strictEqual(address.toHex(), LOWERCASE_HEX)
    assert.strictEqual(address.toString(), CHECKSUM_ADDRESS)
  })

  it('rejects invalid QRL strings', () => {
    assert.throws(() => qrl.QRLAddress.fromString(`q${LOWERCASE_BODY}`))
    assert.throws(() => qrl.QRLAddress.fromString(`Q${LOWERCASE_BODY.slice(2)}`))
    assert.throws(() => qrl.QRLAddress.fromString(`Q${LOWERCASE_BODY}00`))
    assert.throws(() => qrl.QRLAddress.fromString(`Q${LOWERCASE_BODY.slice(0, -1)}g`))
    assert.throws(() => qrl.QRLAddress.fromString(CHECKSUM_ADDRESS.replace('d', 'D')))
  })

  it('validates address strings', () => {
    assert.isTrue(qrl.isValidQRLAddress(LOWERCASE_ADDRESS))
    assert.isTrue(qrl.isValidQRLAddress(`Q${LOWERCASE_BODY.toUpperCase()}`))
    assert.isTrue(qrl.isValidQRLAddress(CHECKSUM_ADDRESS))
    assert.isTrue(qrl.isValidQRLAddress(CONTRACT_ADDRESS))
    assert.isFalse(qrl.isValidQRLAddress(`q${LOWERCASE_BODY}`))
    assert.isFalse(qrl.isValidQRLAddress(`Q${LOWERCASE_BODY.slice(2)}`))
    assert.isFalse(qrl.isValidQRLAddress(CHECKSUM_ADDRESS.replace('d', 'D')))
  })

  it('compares addresses and detects zero address', () => {
    const address1 = qrl.QRLAddress.fromString(LOWERCASE_ADDRESS)
    const address2 = qrl.QRLAddress.fromHex(LOWERCASE_HEX)
    const zero = qrl.QRLAddress.zero()

    assert.isTrue(address1.equals(address2))
    assert.isFalse(address1.equals(zero))
    assert.isTrue(zero.isZero())
    assert.isFalse(address1.isZero())
    assert.strictEqual(zero.toHex(), bytesToHex(new Uint8Array(qrl.QRL_ADDRESS_BYTES)))
  })
})
