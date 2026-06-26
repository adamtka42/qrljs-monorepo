import { bytesToHex, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function receipt(data: Partial<qrl.QRLReceiptData> = {}): qrl.QRLReceipt {
  return new qrl.QRLReceipt({
    txHash: new Uint8Array(32).fill(1),
    from: address(2),
    to: address(3),
    status: 1,
    gasUsed: 4n,
    cumulativeGasUsed: 4n,
    ...data,
  })
}

describe('QRLReceipt', () => {
  it('represents successful, failed, and contract creation receipts', () => {
    const success = receipt()
    const failure = receipt({ status: 0 })
    const createdAddress = address(4)
    const creation = receipt({ to: undefined, createdAddress })

    assert.strictEqual(success.toJSON().status, '0x1')
    assert.strictEqual(failure.toJSON().status, '0x0')
    assert.strictEqual(creation.toJSON().contractAddress, createdAddress.toString())
  })

  it('defensively copies byte fields and logs', () => {
    const txHash = new Uint8Array(32).fill(1)
    const blockHash = new Uint8Array(32).fill(2)
    const log = new qrl.QRLLog({ address: address(3), data: new Uint8Array([4]) })
    const value = receipt({ txHash, blockHash, logs: [log] })

    txHash.fill(9)
    blockHash.fill(9)
    assert.throws(() => (value.logs as qrl.QRLLog[]).push(new qrl.QRLLog({ address: address(5) })))

    assert.strictEqual(value.txHash[0], 1)
    assert.strictEqual(value.blockHash?.[0], 2)
    assert.strictEqual(value.logs.length, 1)
    assert.throws(() => receipt({ txHash: new Uint8Array(31) }))
  })

  it('computes logs bloom from log addresses and topics', () => {
    const log = new qrl.QRLLog({
      address: address(3),
      topics: [new Uint8Array(64).fill(4)],
      data: new Uint8Array([5]),
    })
    const value = receipt({ logs: [log] })

    assert.strictEqual(bytesToHex(value.logsBloom), bytesToHex(qrl.createQRLLogsBloom([log])))
    assert.notStrictEqual(
      bytesToHex(value.logsBloom),
      bytesToHex(new Uint8Array(qrl.QRL_LOGS_BLOOM_BYTES)),
    )
  })

  it('attaches block inclusion metadata to receipt and logs', () => {
    const log = new qrl.QRLLog({ address: address(3), data: new Uint8Array([4]) })
    const included = receipt({ logs: [log] }).withInclusion({
      blockHash: new Uint8Array(32).fill(6),
      blockNumber: 7n,
      transactionIndex: 8,
      cumulativeGasUsed: 9n,
      logIndexStart: 10,
    })

    const json = included.toJSON()
    assert.strictEqual(json.blockNumber, '0x7')
    assert.strictEqual(json.transactionIndex, '0x8')
    assert.strictEqual(json.cumulativeGasUsed, '0x9')
    assert.strictEqual(json.logs[0].logIndex, '0xa')
  })
})
