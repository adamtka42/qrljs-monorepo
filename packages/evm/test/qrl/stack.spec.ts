import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLStack', () => {
  it('pushes, pops, duplicates, and swaps values', () => {
    const stack = new qrl.QRLStack()

    stack.push(qrl.QRLUint512.fromBigInt(1n))
    stack.push(qrl.QRLUint512.fromBigInt(2n))
    stack.dup(2)
    assert.strictEqual(stack.pop().toBigInt(), 1n)
    stack.swap(1)
    assert.strictEqual(stack.pop().toBigInt(), 1n)
    assert.strictEqual(stack.pop().toBigInt(), 2n)
  })

  it('throws on underflow and overflow', () => {
    const stack = new qrl.QRLStack(1)

    assert.throws(() => stack.pop())
    stack.push(qrl.QRLUint512.zero())
    assert.throws(() => stack.push(qrl.QRLUint512.zero()))
    assert.throws(() => stack.dup(2))
    assert.throws(() => stack.swap(1))
  })
})
