import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLUint512', () => {
  it('wraps arithmetic modulo 2^512', () => {
    const max = qrl.QRLUint512.fromBigInt(qrl.QRL_WORD_MAX)

    assert.strictEqual(max.add(qrl.QRLUint512.one()).toBigInt(), 0n)
    assert.strictEqual(qrl.QRLUint512.zero().sub(qrl.QRLUint512.one()).toBigInt(), qrl.QRL_WORD_MAX)
    assert.strictEqual(max.mul(qrl.QRLUint512.fromBigInt(2n)).toBigInt(), qrl.QRL_WORD_MAX - 1n)
  })

  it('converts to low 32 bytes and full 64 bytes', () => {
    const value = qrl.QRLUint512.fromBigInt((1n << 256n) + 0x1234n)

    assert.strictEqual(value.toBytes32().length, 32)
    assert.strictEqual(value.toBytes64().length, 64)
    assert.strictEqual(value.toBytes32()[30], 0x12)
    assert.strictEqual(value.toBytes32()[31], 0x34)
  })

  it('rejects byte arrays wider than 64 bytes', () => {
    assert.throws(() => qrl.QRLUint512.fromBytes(new Uint8Array(65)))
  })

  it('handles shifts at 512-bit boundaries', () => {
    const one = qrl.QRLUint512.one()
    const shift511 = qrl.QRLUint512.fromBigInt(511n)
    const shift512 = qrl.QRLUint512.fromBigInt(512n)

    assert.strictEqual(one.shl(shift511).toBigInt(), 1n << 511n)
    assert.strictEqual(one.shl(shift512).toBigInt(), 0n)
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(1n << 511n)
        .shr(shift511)
        .toBigInt(),
      1n,
    )
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(1n << 511n)
        .sar(shift512)
        .toBigInt(),
      qrl.QRL_WORD_MAX,
    )
  })

  it('handles signed arithmetic and comparisons', () => {
    const minusTwo = qrl.QRLUint512.fromBigInt(-2n)
    const seven = qrl.QRLUint512.fromBigInt(7n)
    const three = qrl.QRLUint512.fromBigInt(3n)

    assert.strictEqual(minusTwo.sdiv(three).toBigInt(), 0n)
    assert.strictEqual(qrl.QRLUint512.fromBigInt(-7n).sdiv(three).toBigInt(), qrl.QRL_WORD_MAX - 1n)
    assert.strictEqual(qrl.QRLUint512.fromBigInt(-7n).smod(three).toBigInt(), qrl.QRL_WORD_MAX - 0n)
    assert.strictEqual(minusTwo.slt(three).toBigInt(), 1n)
    assert.strictEqual(three.sgt(minusTwo).toBigInt(), 1n)
    assert.strictEqual(seven.smod(qrl.QRLUint512.zero()).toBigInt(), 0n)
  })

  it('handles modular arithmetic, exponentiation, and sign extension', () => {
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(7n)
        .addmod(qrl.QRLUint512.fromBigInt(8n), qrl.QRLUint512.fromBigInt(10n))
        .toBigInt(),
      5n,
    )
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(7n)
        .mulmod(qrl.QRLUint512.fromBigInt(8n), qrl.QRLUint512.fromBigInt(10n))
        .toBigInt(),
      6n,
    )
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(2n).exp(qrl.QRLUint512.fromBigInt(10n)).toBigInt(),
      1024n,
    )
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(2n).exp(qrl.QRLUint512.fromBigInt(512n)).toBigInt(),
      0n,
    )
    assert.strictEqual(
      qrl.QRLUint512.fromBigInt(0x80n).signExtend(qrl.QRLUint512.zero()).toBigInt(),
      qrl.QRL_WORD_MAX - 0x7fn,
    )
  })
})
