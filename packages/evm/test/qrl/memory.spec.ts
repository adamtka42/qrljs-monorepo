import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLMemory', () => {
  it('stores and loads 64-byte words', () => {
    const memory = new qrl.QRLMemory()
    const value = qrl.QRLUint512.fromBigInt(0x1234n)

    memory.setWord(4, value)

    assert.strictEqual(memory.length(), 128)
    assert.strictEqual(memory.getWord(4).toBigInt(), 0x1234n)
    assert.strictEqual(memory.getCopy(4, 64).length, 64)
  })

  it('stores a single low byte for MSTORE8 behavior', () => {
    const memory = new qrl.QRLMemory()

    memory.setByte(2, qrl.QRLUint512.fromBigInt(0x1234n))

    assert.deepEqual([...memory.getCopy(0, 4)], [0, 0, 0x34, 0])
  })

  it('returns defensive copies', () => {
    const memory = new qrl.QRLMemory()
    memory.set(0, 2, new Uint8Array([1, 2]))

    const copy = memory.getCopy(0, 2)
    copy[0] = 9

    assert.deepEqual([...memory.getCopy(0, 2)], [1, 2])
  })

  it('aligns memory growth to 64-byte words', () => {
    const memory = new qrl.QRLMemory()

    memory.setByte(64, qrl.QRLUint512.fromBigInt(0x01n))

    assert.strictEqual(memory.length(), 128)
  })

  it('does not grow memory for zero-length reads', () => {
    const memory = new qrl.QRLMemory()

    assert.deepEqual([...memory.getCopy(10, 0)], [])
    assert.strictEqual(memory.length(), 0)
  })
})
