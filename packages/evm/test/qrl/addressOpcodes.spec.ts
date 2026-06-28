import { qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLEVM address opcodes', () => {
  it('pushes 64-byte ADDRESS, ORIGIN, CALLER, and COINBASE values', async () => {
    const contract = address(1)
    const origin = address(2)
    const caller = address(3)
    const coinbase = address(4)
    const evm = new qrl.QRLEVM({
      context: {
        origin,
        coinbase,
      },
    })

    for (const [opcode, expected] of [
      [0x30, contract],
      [0x32, origin],
      [0x33, caller],
      [0x41, coinbase],
    ] as const) {
      const result = await evm.runCode({
        to: contract,
        caller,
        code: new Uint8Array([opcode, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
      })

      assert.isUndefined(result.exceptionError)
      assert.deepEqual(result.returnValue, expected.toBytes())
    }
  })
})
