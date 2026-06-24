import { qrl as stateQrl } from '@ethereumjs/statemanager'
import { qrl as utilQrl } from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function pushSmall(value: number): number[] {
  return value === 0 ? [0x5f] : [0x60, value]
}

function createCode(initCode: number[], value = 0, after: number[] = [0x00]): number[] {
  const prefix = [
    0x60,
    initCode.length,
    0x60,
    0x00,
    0x5f,
    0x39,
    0x60,
    initCode.length,
    0x5f,
    ...pushSmall(value),
    0xf0,
  ]
  prefix[3] = prefix.length + after.length
  return [...prefix, ...after, ...initCode]
}

function create2Code(
  initCode: number[],
  salt: number,
  value = 0,
  after: number[] = [0x00],
): number[] {
  const prefix = [
    0x60,
    initCode.length,
    0x60,
    0x00,
    0x5f,
    0x39,
    0x60,
    salt,
    0x60,
    initCode.length,
    0x5f,
    ...pushSmall(value),
    0xf5,
  ]
  prefix[3] = prefix.length + after.length
  return [...prefix, ...after, ...initCode]
}

describe('QRLEVM create opcodes', () => {
  it('executes CREATE and stores returned runtime code', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(1)
    const initCode = [0x60, 0x2a, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xf3]
    const expectedAddress = utilQrl.createQRLContractAddress(caller, 0n)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array(createCode(initCode)),
    })

    assert.isUndefined(result.exceptionError)
    assert.deepEqual(result.stack?.pop().toBytes64(), expectedAddress.toBytes())
    assert.deepEqual(await stateManager.getCode(expectedAddress), new Uint8Array([0x2a]))
    assert.strictEqual(await stateManager.getNonce(caller), 1n)
    assert.strictEqual(await stateManager.getNonce(expectedAddress), 1n)
  })

  it('transfers value on successful CREATE', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(2)
    const initCode = [0x60, 0x00, 0x60, 0x00, 0xf3]
    const expectedAddress = utilQrl.createQRLContractAddress(caller, 0n)
    await stateManager.setBalance(caller, 10n)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array(createCode(initCode, 3)),
    })

    assert.isUndefined(result.exceptionError)
    assert.deepEqual(result.stack?.pop().toBytes64(), expectedAddress.toBytes())
    assert.strictEqual(await stateManager.getBalance(caller), 7n)
    assert.strictEqual(await stateManager.getBalance(expectedAddress), 3n)
  })

  it('executes CREATE2 with a salt-derived address', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(3)
    const salt = new Uint8Array(64)
    salt[63] = 0x7b
    const initCode = [0x60, 0x2b, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xf3]
    const expectedAddress = utilQrl.createQRLContractAddress2(
      caller,
      salt,
      keccak_256(new Uint8Array(initCode)),
    )
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array(create2Code(initCode, 0x7b)),
    })

    assert.isUndefined(result.exceptionError)
    assert.deepEqual(result.stack?.pop().toBytes64(), expectedAddress.toBytes())
    assert.deepEqual(await stateManager.getCode(expectedAddress), new Uint8Array([0x2b]))
  })

  it('exposes initcode revert data and keeps creator nonce incremented on failed CREATE', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(4)
    const initCode = [0x60, 0xaa, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xfd]
    const expectedAddress = utilQrl.createQRLContractAddress(caller, 0n)
    const evm = new qrl.QRLEVM({ stateManager })

    const result = await evm.runCode({
      to: caller,
      code: new Uint8Array(createCode(initCode, 0, [0x3d, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0xf3])),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue[63], 1)
    assert.deepEqual(await stateManager.getCode(expectedAddress), new Uint8Array())
    assert.strictEqual(await stateManager.getNonce(caller), 1n)
    assert.strictEqual(await stateManager.getNonce(expectedAddress), 0n)
  })

  it('rejects CREATE in static execution', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      isStatic: true,
      code: new Uint8Array(createCode([0x00])),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
  })

  it('charges child execution gas for CREATE and CREATE2', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const caller = address(6)
    const createInitCode = [0x60, 0x2a, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xf3]
    const create2InitCode = [0x60, 0x2b, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xf3]
    const evm = new qrl.QRLEVM({ stateManager })

    const created = await evm.runCode({
      to: caller,
      gasLimit: 100000n,
      code: new Uint8Array(createCode(createInitCode)),
    })
    const created2 = await evm.runCode({
      to: caller,
      gasLimit: 100000n,
      code: new Uint8Array(create2Code(create2InitCode, 0x7c)),
    })

    assert.isUndefined(created.exceptionError)
    assert.strictEqual(created.gasUsed, 32042n)
    assert.isUndefined(created2.exceptionError)
    assert.strictEqual(created2.gasUsed, 32051n)
  })
})
