import { qrl as blockQrl } from '@ethereumjs/block'
import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRL VM receipts', () => {
  it('builds a QRL receipt from a successful runTx result', () => {
    const createdAddress = address(3)
    const receipt = qrl.createQRLReceiptFromRunTxResult({
      result: {
        txHash: new Uint8Array(32).fill(1),
        sender: address(2),
        createdAddress,
        returnValue: new Uint8Array(0),
        gasUsed: 4n,
        gasRemaining: 5n,
        gasRefund: 0n,
        totalGasSpent: 8n,
        effectiveGasPrice: 2n,
        status: 1,
      },
      blockHash: new Uint8Array(32).fill(6),
      blockNumber: 7n,
      transactionIndex: 8,
      cumulativeGasUsed: 9n,
      logs: [new blockQrl.QRLLog({ address: createdAddress })],
    })

    const json = receipt.toJSON()
    assert.strictEqual(json.status, '0x1')
    assert.strictEqual(json.contractAddress, createdAddress.toString())
    assert.strictEqual(json.blockNumber, '0x7')
    assert.strictEqual(json.transactionIndex, '0x8')
    assert.strictEqual(json.cumulativeGasUsed, '0x9')
    assert.strictEqual(json.effectiveGasPrice, '0x2')
    assert.strictEqual(json.logs.length, 1)
  })

  it('converts runTx execution logs into receipt logs', () => {
    const logAddress = address(4)
    const receipt = qrl.createQRLReceiptFromRunTxResult({
      result: {
        txHash: new Uint8Array(32).fill(1),
        sender: address(2),
        to: address(3),
        returnValue: new Uint8Array(0),
        gasUsed: 4n,
        gasRemaining: 5n,
        gasRefund: 0n,
        totalGasSpent: 8n,
        effectiveGasPrice: 2n,
        status: 1,
        logs: [
          {
            address: logAddress,
            topics: [new Uint8Array(64).fill(5)],
            data: new Uint8Array([6, 7]),
          },
        ],
      },
    })

    assert.strictEqual(receipt.logs.length, 1)
    assert.strictEqual(receipt.logs[0].address.toString(), logAddress.toString())
    assert.strictEqual(receipt.logs[0].topics[0][0], 5)
    assert.deepEqual([...receipt.logs[0].data], [6, 7])
  })

  it('omits created address for failed creation result', () => {
    const receipt = qrl.createQRLReceiptFromRunTxResult({
      result: {
        txHash: new Uint8Array(32).fill(1),
        sender: address(2),
        createdAddress: address(3),
        returnValue: new Uint8Array(0),
        gasUsed: 4n,
        gasRemaining: 5n,
        gasRefund: 0n,
        totalGasSpent: 8n,
        effectiveGasPrice: 2n,
        executionError: new Error('reverted'),
        status: 0,
      },
    })

    assert.strictEqual(receipt.status, 0)
    assert.strictEqual(receipt.createdAddress, undefined)
  })
})
