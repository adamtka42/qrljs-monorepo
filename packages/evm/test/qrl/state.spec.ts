import { keccak_256 } from '@noble/hashes/sha3.js'
import { qrl as stateQrl } from '@theqrl/statemanager'
import { qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLEVM state opcodes', () => {
  it('round-trips 64-byte storage values through SSTORE and SLOAD', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(1)
    const evm = new qrl.QRLEVM({ stateManager })

    const store = await evm.runCode({
      to: addr,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x00]),
    })
    assert.isUndefined(store.exceptionError)

    const key = new Uint8Array(32)
    key[31] = 1
    const stored = await stateManager.getStorage(addr, key)
    assert.strictEqual(stored.length, 64)
    assert.strictEqual(stored[63], 0x2a)

    const load = await evm.runCode({
      to: addr,
      code: new Uint8Array([0x60, 0x01, 0x54, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    })
    assert.isUndefined(load.exceptionError)
    assert.strictEqual(load.returnValue[63], 0x2a)
  })

  it('reads balances through BALANCE and SELFBALANCE', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const contract = address(3)
    const account = address(4)
    await stateManager.setBalance(contract, 123n)
    await stateManager.setBalance(account, 456n)
    const evm = new qrl.QRLEVM({ stateManager })

    const balance = await evm.runCode({
      to: contract,
      code: new Uint8Array([0x9f, ...account.toBytes(), 0x31, 0x00]),
    })
    assert.isUndefined(balance.exceptionError)
    assert.strictEqual(balance.stack?.pop().toBigInt(), 456n)

    const selfBalance = await evm.runCode({
      to: contract,
      code: new Uint8Array([0x47, 0x00]),
    })
    assert.isUndefined(selfBalance.exceptionError)
    assert.strictEqual(selfBalance.stack?.pop().toBigInt(), 123n)
  })

  it('reads external contract code metadata and bytes', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const contract = address(5)
    const target = address(6)
    const code = new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x00])
    await stateManager.putCode(target, code)
    const evm = new qrl.QRLEVM({ stateManager })

    const codeSize = await evm.runCode({
      to: contract,
      code: new Uint8Array([0x9f, ...target.toBytes(), 0x3b, 0x00]),
    })
    assert.isUndefined(codeSize.exceptionError)
    assert.strictEqual(codeSize.stack?.pop().toBigInt(), BigInt(code.length))

    const codeCopy = await evm.runCode({
      to: contract,
      code: new Uint8Array([
        0x60,
        0x03,
        0x60,
        0x01,
        0x60,
        0x00,
        0x9f,
        ...target.toBytes(),
        0x3c,
        0x60,
        0x03,
        0x60,
        0x00,
        0xf3,
      ]),
    })
    assert.isUndefined(codeCopy.exceptionError)
    assert.deepEqual([...codeCopy.returnValue], [...code.slice(1, 4)])

    const codeHash = await evm.runCode({
      to: contract,
      code: new Uint8Array([0x9f, ...target.toBytes(), 0x3f, 0x00]),
    })
    assert.isUndefined(codeHash.exceptionError)
    assert.deepEqual(codeHash.stack?.pop().toBytes32(), keccak_256(code))

    const missingHash = await evm.runCode({
      to: contract,
      code: new Uint8Array([0x9f, ...address(7).toBytes(), 0x3f, 0x00]),
    })
    assert.isUndefined(missingHash.exceptionError)
    assert.strictEqual(missingHash.stack?.pop().toBigInt(), 0n)
  })

  it('rejects static SSTORE and reverts state changes on failure', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(2)
    const evm = new qrl.QRLEVM({ stateManager })

    const staticResult = await evm.runCode({
      to: addr,
      isStatic: true,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x00]),
    })
    assert.instanceOf(staticResult.exceptionError, qrl.QRLVMError)

    const revertResult = await evm.runCode({
      to: addr,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x60, 0x00, 0x60, 0x00, 0xfd]),
    })
    assert.instanceOf(revertResult.exceptionError, qrl.QRLVMRevert)

    const key = new Uint8Array(32)
    key[31] = 1
    assert.isTrue(stateQrl.isEmptyQRLStorageValue(await stateManager.getStorage(addr, key)))
  })

  it('charges cold and warm QRL SLOAD gas', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(8)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 0x2a
    await stateManager.putStorage(addr, key, value)
    const evm = new qrl.QRLEVM({ stateManager })

    const cold = await evm.runCode({
      to: addr,
      gasLimit: 3000n,
      code: new Uint8Array([0x60, 0x01, 0x54, 0x00]),
    })
    const warm = await evm.runCode({
      to: addr,
      gasLimit: 3000n,
      code: new Uint8Array([0x60, 0x01, 0x54, 0x50, 0x60, 0x01, 0x54, 0x00]),
    })

    assert.isUndefined(cold.exceptionError)
    assert.strictEqual(cold.gasUsed, 2103n)
    assert.strictEqual(cold.stack?.pop().toBigInt(), 0x2an)
    assert.isUndefined(warm.exceptionError)
    assert.strictEqual(warm.gasUsed, 2208n)
    assert.strictEqual(warm.stack?.pop().toBigInt(), 0x2an)
  })

  it('charges QRL SSTORE create/noop/clear gas and refunds', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(9)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 0x2a
    await stateManager.putStorage(addr, key, value)
    const evm = new qrl.QRLEVM({ stateManager })

    const create = await evm.runCode({
      to: addr,
      gasLimit: 30000n,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x02, 0x55, 0x00]),
    })
    const noop = await evm.runCode({
      to: addr,
      gasLimit: 30000n,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x00]),
    })
    const clear = await evm.runCode({
      to: addr,
      gasLimit: 30000n,
      code: new Uint8Array([0x5f, 0x60, 0x01, 0x55, 0x00]),
    })

    assert.isUndefined(create.exceptionError)
    assert.strictEqual(create.gasUsed, 22106n)
    assert.strictEqual(create.gasRefund, 0n)
    assert.isUndefined(noop.exceptionError)
    assert.strictEqual(noop.gasUsed, 2206n)
    assert.strictEqual(noop.gasRefund, 0n)
    assert.isUndefined(clear.exceptionError)
    assert.strictEqual(clear.gasUsed, 5005n)
    assert.strictEqual(clear.gasRefund, 4800n)
  })

  it('tracks QRL SSTORE dirty slot reset refunds within one execution', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(10)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: addr,
      gasLimit: 30000n,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x5f, 0x60, 0x01, 0x55, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.gasUsed, 22211n)
    assert.strictEqual(result.gasRefund, 19900n)
    const key = new Uint8Array(32)
    key[31] = 1
    assert.isTrue(stateQrl.isEmptyQRLStorageValue(await stateManager.getStorage(addr, key)))
  })

  it('rolls SSTORE clear refunds back when execution reverts', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(21)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 0x2a
    await stateManager.putStorage(addr, key, value)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: addr,
      gasLimit: 30000n,
      code: new Uint8Array([0x5f, 0x60, 0x01, 0x55, 0x5f, 0x5f, 0xfd]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMRevert)
    assert.strictEqual(result.gasRefund, 0n)
    assert.strictEqual((await stateManager.getStorage(addr, key))[63], 0x2a)
  })

  it('rolls SSTORE clear refunds back when a nested call reverts', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const parent = address(22)
    const child = address(23)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 0x2a
    await stateManager.putStorage(child, key, value)
    await stateManager.putCode(child, new Uint8Array([0x5f, 0x60, 0x01, 0x55, 0x5f, 0x5f, 0xfd]))
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: parent,
      gasLimit: 100000n,
      code: new Uint8Array([
        0x5f,
        0x5f,
        0x5f,
        0x5f,
        0x5f,
        0x9f,
        ...child.toBytes(),
        0x61,
        0x75,
        0x30,
        0xf1,
        0x00,
      ]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0n)
    assert.strictEqual(result.gasRefund, 0n)
    assert.strictEqual((await stateManager.getStorage(child, key))[63], 0x2a)
  })

  it('rejects QRL SSTORE when sentry gas is not available', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const addr = address(11)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: addr,
      gasLimit: 2306n,
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x01, 0x55, 0x00]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    assert.strictEqual(result.exceptionError?.message, 'QRL SSTORE sentry gas not met')
    assert.strictEqual(result.gasUsed, 2306n)
    assert.strictEqual(result.gasRemaining, 0n)
    assert.strictEqual(result.gasRefund, 0n)
    const key = new Uint8Array(32)
    key[31] = 1
    assert.isTrue(stateQrl.isEmptyQRLStorageValue(await stateManager.getStorage(addr, key)))
  })

  it('charges cold and warm account access for BALANCE and EXTCODE opcodes', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const contract = address(12)
    const target = address(13)
    const code = new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x00])
    await stateManager.setBalance(target, 456n)
    await stateManager.putCode(target, code)
    const evm = new qrl.QRLEVM({ stateManager })

    const balance = await evm.runCode({
      to: contract,
      gasLimit: 4000n,
      code: new Uint8Array([0x9f, ...target.toBytes(), 0x31, 0x00]),
    })
    const warmBalance = await evm.runCode({
      to: contract,
      gasLimit: 5000n,
      code: new Uint8Array([
        0x9f,
        ...target.toBytes(),
        0x31,
        0x50,
        0x9f,
        ...target.toBytes(),
        0x31,
        0x00,
      ]),
    })
    const codeSize = await evm.runCode({
      to: contract,
      gasLimit: 4000n,
      code: new Uint8Array([0x9f, ...target.toBytes(), 0x3b, 0x00]),
    })
    const codeHash = await evm.runCode({
      to: contract,
      gasLimit: 4000n,
      code: new Uint8Array([0x9f, ...target.toBytes(), 0x3f, 0x00]),
    })
    const codeCopy = await evm.runCode({
      to: contract,
      gasLimit: 5000n,
      code: new Uint8Array([0x60, 0x03, 0x60, 0x01, 0x5f, 0x9f, ...target.toBytes(), 0x3c, 0x00]),
    })

    assert.isUndefined(balance.exceptionError)
    assert.strictEqual(balance.gasUsed, 2603n)
    assert.strictEqual(balance.stack?.pop().toBigInt(), 456n)
    assert.isUndefined(warmBalance.exceptionError)
    assert.strictEqual(warmBalance.gasUsed, 2708n)
    assert.strictEqual(warmBalance.stack?.pop().toBigInt(), 456n)
    assert.isUndefined(codeSize.exceptionError)
    assert.strictEqual(codeSize.gasUsed, 2603n)
    assert.strictEqual(codeSize.stack?.pop().toBigInt(), BigInt(code.length))
    assert.isUndefined(codeHash.exceptionError)
    assert.strictEqual(codeHash.gasUsed, 2603n)
    assert.deepEqual(codeHash.stack?.pop().toBytes32(), keccak_256(code))
    assert.isUndefined(codeCopy.exceptionError)
    assert.strictEqual(codeCopy.gasUsed, 2617n)
  })
})
