import { assert, describe, it } from 'vitest'

import { qrl as stateQrl } from '../../src/index.ts'

describe('QRL storage helpers', () => {
  it('accepts 32-byte keys and rejects other key lengths', () => {
    assert.doesNotThrow(() => stateQrl.assertQRLStorageKey(new Uint8Array(32)))
    assert.throws(() => stateQrl.assertQRLStorageKey(new Uint8Array(31)))
    assert.throws(() => stateQrl.assertQRLStorageKey(new Uint8Array(33)))
  })

  it('accepts 64-byte values and rejects other value lengths', () => {
    assert.doesNotThrow(() => stateQrl.assertQRLStorageValue(new Uint8Array(64)))
    assert.throws(() => stateQrl.assertQRLStorageValue(new Uint8Array(32)))
    assert.throws(() => stateQrl.assertQRLStorageValue(new Uint8Array(65)))
  })

  it('returns and recognizes the QRL empty storage value', () => {
    const empty = stateQrl.emptyQRLStorageValue()

    assert.strictEqual(empty.length, 64)
    assert.isTrue(stateQrl.isEmptyQRLStorageValue(empty))

    empty[63] = 1
    assert.isFalse(stateQrl.isEmptyQRLStorageValue(empty))
  })

  it('clones storage values defensively', () => {
    const value = new Uint8Array(64)
    value[0] = 1

    const clone = stateQrl.cloneQRLStorageValue(value)
    value[0] = 2

    assert.strictEqual(clone[0], 1)
  })
})
