import { equalsBytes, hexToBytes } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl as stateQrl } from '../../src/index.ts'

import type { PrefixedHexString } from '@ethereumjs/util'

describe('QRLAccount', () => {
  it('creates an empty QRL account with QRL empty hashes', () => {
    const account = stateQrl.QRLAccount.empty()

    assert.strictEqual(account.nonce, 0n)
    assert.strictEqual(account.balance, 0n)
    assert.isTrue(equalsBytes(account.storageRoot, stateQrl.QRL_EMPTY_ROOT_HASH))
    assert.isTrue(equalsBytes(account.codeHash, stateQrl.QRL_EMPTY_CODE_HASH))
    assert.isTrue(account.isEmpty())
  })

  it('rejects invalid nonce and balance values', () => {
    assert.throws(() => new stateQrl.QRLAccount({ nonce: -1 }))
    assert.throws(() => new stateQrl.QRLAccount({ nonce: stateQrl.QRL_STATE_NONCE_MAX + 1n }))
    assert.throws(() => new stateQrl.QRLAccount({ balance: -1n }))
  })

  it('enforces 32-byte root and code hash values', () => {
    assert.throws(() => new stateQrl.QRLAccount({ storageRoot: new Uint8Array(31) }))
    assert.throws(() => new stateQrl.QRLAccount({ codeHash: new Uint8Array(33) }))
  })

  it('defensively copies byte array inputs and outputs', () => {
    const codeHash = hexToBytes(`0x${'11'.repeat(32)}` as PrefixedHexString)
    const account = new stateQrl.QRLAccount({ codeHash })

    codeHash[0] = 0xff
    assert.strictEqual(account.codeHash[0], 0x11)

    const returned = account.codeHash
    returned[0] = 0xee
    assert.strictEqual(account.codeHash[0], 0x11)
  })

  it('clones and creates modified copies without mutating the original', () => {
    const account = new stateQrl.QRLAccount({ nonce: 1, balance: 2n })
    const clone = account.clone()
    const modified = account.with({ nonce: 3 })

    assert.notStrictEqual(clone, account)
    assert.strictEqual(clone.nonce, 1n)
    assert.strictEqual(modified.nonce, 3n)
    assert.strictEqual(account.nonce, 1n)
  })
})
