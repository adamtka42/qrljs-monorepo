import { qrl as stateQrl } from '@ethereumjs/statemanager'
import { qrl as utilQrl } from '@ethereumjs/util'
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
})
