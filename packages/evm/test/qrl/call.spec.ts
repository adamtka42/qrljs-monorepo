import { qrl as stateQrl } from '@theqrl/statemanager'
import { qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function pushAddress(addr: utilQrl.QRLAddress): number[] {
  return [0x9f, ...addr.toBytes()]
}

function callCode(target: utilQrl.QRLAddress, value = 0): number[] {
  return [
    0x60,
    0x40,
    0x5f,
    0x5f,
    0x5f,
    value === 0 ? 0x5f : 0x60,
    ...(value === 0 ? [] : [value]),
    ...pushAddress(target),
    0x61,
    0x10,
    0x00,
    0xf1,
  ]
}

function staticCallCode(target: utilQrl.QRLAddress): number[] {
  return [0x60, 0x40, 0x5f, 0x5f, 0x5f, ...pushAddress(target), 0x61, 0x10, 0x00, 0xfa]
}

function delegateCallCode(target: utilQrl.QRLAddress): number[] {
  return [0x60, 0x40, 0x5f, 0x5f, 0x5f, ...pushAddress(target), 0x61, 0x80, 0x00, 0xf4]
}

describe('QRLEVM call opcodes', () => {
  it('executes CALL and exposes child return data', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(1)
    const target = address(2)
    await stateManager.putCode(
      target,
      new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0xf3]),
    )
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array([...callCode(target), 0x3d, 0x60, 0x40, 0x52, 0x60, 0x80, 0x5f, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(result.returnValue[63], 0x2a)
    assert.strictEqual(result.returnValue[127], 0x40)
  })

  it('transfers value on successful CALL and rolls it back on failed CALL', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(3)
    const target = address(4)
    await stateManager.setBalance(caller, 10n)
    await stateManager.putCode(target, new Uint8Array([0x00]))
    const evm = new qrl.QRLEVM({ stateManager })

    const success = await evm.runCode({
      to: caller,
      code: new Uint8Array([...callCode(target, 3), 0x00]),
    })
    assert.isUndefined(success.exceptionError)
    assert.strictEqual(success.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(await stateManager.getBalance(caller), 7n)
    assert.strictEqual(await stateManager.getBalance(target), 3n)

    const failed = await evm.runCode({
      to: caller,
      code: new Uint8Array([...callCode(target, 9), 0x00]),
    })
    assert.isUndefined(failed.exceptionError)
    assert.strictEqual(failed.stack?.pop().toBigInt(), 0n)
    assert.strictEqual(await stateManager.getBalance(caller), 7n)
    assert.strictEqual(await stateManager.getBalance(target), 3n)
  })

  it('runs STATICCALL with static restrictions and discards failed child writes', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(5)
    const target = address(6)
    await stateManager.putCode(target, new Uint8Array([0x60, 0x2a, 0x5f, 0x55, 0x00]))
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array([...staticCallCode(target), 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0n)
    assert.isTrue(
      stateQrl.isEmptyQRLStorageValue(await stateManager.getStorage(target, new Uint8Array(32))),
    )
  })

  it('runs DELEGATECALL against caller storage and address context', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(7)
    const target = address(8)
    await stateManager.putCode(
      target,
      new Uint8Array([0x60, 0x2a, 0x5f, 0x55, 0x30, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0xf3]),
    )
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array([...delegateCallCode(target), 0x60, 0x40, 0x5f, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.deepEqual([...result.returnValue], [...caller.toBytes()])
    assert.strictEqual((await stateManager.getStorage(caller, new Uint8Array(32)))[63], 0x2a)
    assert.isTrue(
      stateQrl.isEmptyQRLStorageValue(await stateManager.getStorage(target, new Uint8Array(32))),
    )
  })

  it('charges dynamic QRL CALL memory, account, and child gas', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(9)
    const target = address(10)
    await stateManager.putCode(
      target,
      new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0xf3]),
    )
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      gasLimit: 100000n,
      code: new Uint8Array([...callCode(target), 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(result.gasUsed, 2636n)
  })

  it('charges warm account access for repeated QRL CALL targets', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(11)
    const target = address(12)
    await stateManager.putCode(target, new Uint8Array([0x00]))
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      gasLimit: 100000n,
      code: new Uint8Array([...callCode(target), 0x50, ...callCode(target), 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(result.gasUsed, 2742n)
  })

  it('charges QRL CALL value transfer and new account gas before child execution', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(13)
    const target = address(14)
    await stateManager.setBalance(caller, 10n)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      gasLimit: 100000n,
      code: new Uint8Array([...callCode(target, 3), 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(result.gasUsed, 36621n)
    assert.strictEqual(await stateManager.getBalance(target), 3n)
  })

  it('limits QRL child call gas with the 63/64 rule', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(15)
    const target = address(16)
    await stateManager.putCode(target, new Uint8Array([0x5a, 0x00]))
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      gasLimit: 10000n,
      code: new Uint8Array([...callCode(target), 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
    assert.strictEqual(result.gasUsed, 2622n)
  })
})
