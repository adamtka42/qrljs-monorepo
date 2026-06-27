import { assert, describe, it } from 'vitest'

import {
  bigIntToBytes,
  bigIntToUnpaddedBytes,
  bytesToBigInt,
  bytesToHex,
  concatBytes,
  equalsBytes,
  hexToBytes,
} from '../../src/index.ts'

import type { PrefixedHexString } from '../../src/index.ts'

describe('byte helpers', () => {
  it('converts between 0x-prefixed hex and bytes', () => {
    assert.deepEqual([...hexToBytes('0x0102ff' as PrefixedHexString)], [1, 2, 255])
    assert.deepEqual([...hexToBytes('0xf' as PrefixedHexString)], [15])
    assert.strictEqual(bytesToHex(new Uint8Array([1, 2, 255])), '0x0102ff')
  })

  it('rejects unprefixed hex strings', () => {
    assert.throws(() => hexToBytes('0102' as PrefixedHexString), /0x prefixed/)
  })

  it('converts bigint values to padded and unpadded bytes', () => {
    assert.deepEqual([...bigIntToBytes(0n)], [0])
    assert.deepEqual([...bigIntToBytes(255n)], [255])
    assert.deepEqual([...bigIntToBytes(256n)], [1, 0])
    assert.deepEqual([...bigIntToUnpaddedBytes(0n)], [])
  })

  it('converts bytes to bigint values', () => {
    assert.strictEqual(bytesToBigInt(new Uint8Array()), 0n)
    assert.strictEqual(bytesToBigInt(new Uint8Array([1, 0])), 256n)
  })

  it('concatenates and compares byte arrays', () => {
    const combined = concatBytes(new Uint8Array([1]), new Uint8Array([2, 3]))

    assert.deepEqual([...combined], [1, 2, 3])
    assert.isTrue(equalsBytes(combined, new Uint8Array([1, 2, 3])))
    assert.isFalse(equalsBytes(combined, new Uint8Array([1, 2])))
    assert.isFalse(equalsBytes(combined, new Uint8Array([1, 2, 4])))
  })
})
