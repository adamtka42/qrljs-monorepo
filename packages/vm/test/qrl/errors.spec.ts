import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLRunTxError', () => {
  it('exposes a stable code and message', () => {
    const error = qrl.qrlRunTxError('TEST_CODE', 'test message')

    assert.instanceOf(error, qrl.QRLRunTxError)
    assert.strictEqual(error.name, 'QRLRunTxError')
    assert.strictEqual(error.code, 'TEST_CODE')
    assert.strictEqual(error.message, 'test message')
  })
})
