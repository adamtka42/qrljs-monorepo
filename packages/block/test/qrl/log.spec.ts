import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLLog', () => {
  it('defensively copies topics and data', () => {
    const topic = new Uint8Array(64).fill(1)
    const data = new Uint8Array([2, 3])
    const log = new qrl.QRLLog({ address: address(4), topics: [topic], data })

    topic.fill(9)
    data.fill(9)
    log.topics[0][0] = 8
    log.data[0] = 8

    assert.strictEqual(log.topics[0][0], 1)
    assert.strictEqual(log.data[0], 2)
    assert.throws(() => new qrl.QRLLog({ address: address(1), topics: [new Uint8Array(32)] }))
  })

  it('serializes QRL log JSON with inclusion metadata', () => {
    const log = new qrl.QRLLog({
      address: address(1),
      topics: [new Uint8Array(64).fill(2)],
      data: new Uint8Array([3]),
    }).withInclusion({
      blockNumber: 7n,
      blockHash: new Uint8Array(32).fill(4),
      txHash: new Uint8Array(32).fill(5),
      txIndex: 1,
      index: 2,
    })

    const json = log.toJSON()
    assert.strictEqual(json.address.length, 129)
    assert.strictEqual(json.topics[0].length, 130)
    assert.strictEqual(json.data, '0x03')
    assert.strictEqual(json.blockNumber, '0x7')
    assert.strictEqual(json.transactionIndex, '0x1')
    assert.strictEqual(json.logIndex, '0x2')
    assert.isFalse(json.removed)
  })
})
