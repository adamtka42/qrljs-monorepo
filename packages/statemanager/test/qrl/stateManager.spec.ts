import { keccak_256 } from '@noble/hashes/sha3.js'
import { equalsBytes, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl as stateQrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

async function assertRejects(action: () => Promise<unknown>): Promise<void> {
  try {
    await action()
  } catch {
    return
  }
  assert.fail('Expected promise to reject')
}

describe('QRLStateManager', () => {
  it('stores, clones, and deletes accounts', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(1)

    assert.isUndefined(await state.getAccount(addr))
    assert.isFalse(await state.accountExists(addr))

    await state.putAccount(addr, new stateQrl.QRLAccount({ nonce: 1, balance: 2n }))
    const account = await state.getAccount(addr)
    assert.strictEqual(account?.nonce, 1n)
    assert.strictEqual(account?.balance, 2n)
    assert.isTrue(await state.accountExists(addr))

    await state.deleteAccount(addr)
    assert.isUndefined(await state.getAccount(addr))
    assert.isFalse(await state.accountExists(addr))
  })

  it('updates balances and nonces with validation', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(2)

    await state.setBalance(addr, 10n)
    await state.addBalance(addr, 5n)
    await state.subBalance(addr, 3n)
    assert.strictEqual(await state.getBalance(addr), 12n)
    await assertRejects(() => state.subBalance(addr, 13n))

    await state.setNonce(addr, 1)
    await state.incrementNonce(addr)
    assert.strictEqual(await state.getNonce(addr), 2n)
    await assertRejects(() => state.setNonce(addr, stateQrl.QRL_STATE_NONCE_MAX + 1n))
  })

  it('stores code defensively and updates the account code hash', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(3)
    const code = new Uint8Array([1, 2, 3])

    await state.putCode(addr, code)
    code[0] = 9

    const stored = await state.getCode(addr)
    assert.deepEqual([...stored], [1, 2, 3])
    assert.strictEqual(await state.getCodeSize(addr), 3)

    stored[0] = 8
    assert.deepEqual([...(await state.getCode(addr))], [1, 2, 3])

    const account = await state.getAccount(addr)
    assert.isTrue(
      equalsBytes(account?.codeHash ?? new Uint8Array(), keccak_256(new Uint8Array([1, 2, 3]))),
    )
  })

  it('stores 64-byte storage values behind 32-byte keys', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(4)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 42

    assert.isTrue(stateQrl.isEmptyQRLStorageValue(await state.getStorage(addr, key)))

    await state.putStorage(addr, key, value)
    value[63] = 1

    const stored = await state.getStorage(addr, key)
    assert.strictEqual(stored[63], 42)
    stored[63] = 2
    assert.strictEqual((await state.getStorage(addr, key))[63], 42)

    await assertRejects(() => state.getStorage(addr, new Uint8Array(31)))
    await assertRejects(() => state.putStorage(addr, key, new Uint8Array(32)))
  })

  it('clears storage only for the selected account', async () => {
    const state = new stateQrl.QRLStateManager()
    const key = new Uint8Array(32)
    const value = new Uint8Array(64)
    value[0] = 1

    await state.putStorage(address(5), key, value)
    await state.putStorage(address(6), key, value)
    await state.clearStorage(address(5))

    assert.isTrue(stateQrl.isEmptyQRLStorageValue(await state.getStorage(address(5), key)))
    assert.strictEqual((await state.getStorage(address(6), key))[0], 1)
  })

  it('supports checkpoint commit and revert', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(7)

    await state.setBalance(addr, 1n)
    await state.checkpoint()
    await state.setBalance(addr, 2n)
    await state.revert()
    assert.strictEqual(await state.getBalance(addr), 1n)

    await state.checkpoint()
    await state.setBalance(addr, 3n)
    await state.commit()
    assert.strictEqual(await state.getBalance(addr), 3n)

    await assertRejects(() => state.commit())
    await assertRejects(() => state.revert())
  })

  it('supports nested checkpoints and isolated shallow copies', async () => {
    const state = new stateQrl.QRLStateManager()
    const addr = address(8)

    await state.setBalance(addr, 1n)
    await state.checkpoint()
    await state.setBalance(addr, 2n)
    await state.checkpoint()
    await state.setBalance(addr, 3n)
    await state.revert()
    assert.strictEqual(await state.getBalance(addr), 2n)
    await state.commit()
    assert.strictEqual(await state.getBalance(addr), 2n)

    const copy = state.shallowCopy()
    await copy.setBalance(addr, 9n)
    assert.strictEqual(await state.getBalance(addr), 2n)
    assert.strictEqual(await copy.getBalance(addr), 9n)
  })
})
