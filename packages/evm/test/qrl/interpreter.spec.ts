import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLEVM interpreter', () => {
  it('runs arithmetic and exposes final stack', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x02, 0x60, 0x03, 0x01, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 5n)
  })

  it('returns 64-byte MSTORE data', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue.length, 64)
    assert.strictEqual(result.returnValue[63], 0x2a)
  })

  it('loads 64-byte calldata words', async () => {
    const evm = new qrl.QRLEVM()
    const data = new Uint8Array(64)
    data[63] = 0x7b
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x00, 0x35, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
      data,
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue[63], 0x7b)
  })

  it('returns revert data and reports an exception', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x53, 0x60, 0x01, 0x60, 0x00, 0xfd]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMRevert)
    assert.deepEqual([...result.returnValue], [0x2a])
  })

  it('handles valid and invalid jumps', async () => {
    const evm = new qrl.QRLEVM()
    const valid = await evm.runCode({
      code: new Uint8Array([0x60, 0x03, 0x56, 0x5b, 0x60, 0x01, 0x00]),
    })
    const invalid = await evm.runCode({
      code: new Uint8Array([0x60, 0x04, 0x56, 0x5b, 0x00]),
    })

    assert.isUndefined(valid.exceptionError)
    assert.strictEqual(valid.stack?.pop().toBigInt(), 1n)
    assert.instanceOf(invalid.exceptionError, qrl.QRLVMError)
  })

  it('supports QRL PUSH33 through PUSH64 opcodes', async () => {
    const evm = new qrl.QRLEVM()
    const immediate = Uint8Array.from(Array.from({ length: 33 }, (_, index) => index + 1))
    const result = await evm.runCode({
      code: Uint8Array.from([0x80, ...immediate, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue.length, 64)
    assert.deepEqual([...result.returnValue.slice(0, 31)], new Array(31).fill(0))
    assert.deepEqual([...result.returnValue.slice(31)], [...immediate])
  })

  it('right-pads truncated QRL PUSH immediate bytes', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x61, 0x01]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0x0100n)
  })

  it('uses QRL opcode ranges for DUP and SWAP', async () => {
    const evm = new qrl.QRLEVM()
    const dup = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0xa0, 0x00]),
    })
    const swap = await evm.runCode({
      code: new Uint8Array([0x60, 0x01, 0x60, 0x02, 0xb0, 0x00]),
    })

    assert.isUndefined(dup.exceptionError)
    assert.strictEqual(dup.stack?.pop().toBigInt(), 0x2an)
    assert.strictEqual(dup.stack?.pop().toBigInt(), 0x2an)
    assert.isUndefined(swap.exceptionError)
    assert.strictEqual(swap.stack?.pop().toBigInt(), 0x01n)
    assert.strictEqual(swap.stack?.pop().toBigInt(), 0x02n)
  })
})
