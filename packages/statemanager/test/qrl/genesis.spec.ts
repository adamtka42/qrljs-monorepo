import { hexToBytes, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl as stateQrl } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

const ADDRESS = utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(0x11)).toString()

async function assertRejects(action: () => Promise<unknown>): Promise<void> {
  try {
    await action()
  } catch {
    return
  }
  assert.fail('Expected promise to reject')
}

describe('QRL genesis loader', () => {
  it('loads prefunded accounts, code, nonce, and storage', async () => {
    const state = new stateQrl.QRLStateManager()
    const address = utilQrl.QRLAddress.fromString(ADDRESS)
    const key = `0x${'01'.repeat(32)}`
    const value = `0x${'02'.repeat(64)}`

    await stateQrl.applyQRLGenesisState(state, {
      [ADDRESS]: {
        balance: '100',
        nonce: 2,
        code: '0x010203',
        storage: {
          [key]: value,
        },
      },
    })

    assert.strictEqual(await state.getBalance(address), 100n)
    assert.strictEqual(await state.getNonce(address), 2n)
    assert.deepEqual([...(await state.getCode(address))], [1, 2, 3])
    assert.deepEqual(
      await state.getStorage(address, hexToBytes(key as PrefixedHexString)),
      hexToBytes(value as PrefixedHexString),
    )
  })

  it('loads hex balances through constructor genesis options', async () => {
    const state = new stateQrl.QRLStateManager({
      genesis: {
        [ADDRESS]: {
          balance: '0x10',
        },
      },
    })

    assert.strictEqual(await state.getBalance(utilQrl.QRLAddress.fromString(ADDRESS)), 16n)
  })

  it('rejects invalid genesis entries early', async () => {
    const state = new stateQrl.QRLStateManager()

    await assertRejects(() =>
      stateQrl.applyQRLGenesisState(state, {
        notAQrlAddress: {
          balance: 1n,
        },
      }),
    )

    await assertRejects(() =>
      stateQrl.applyQRLGenesisState(state, {
        [ADDRESS]: {
          storage: {
            '0x01': `0x${'02'.repeat(64)}`,
          },
        },
      }),
    )

    await assertRejects(() =>
      stateQrl.applyQRLGenesisState(state, {
        [ADDRESS]: {
          storage: {
            [`0x${'01'.repeat(32)}`]: '0x02',
          },
        },
      }),
    )
  })
})
