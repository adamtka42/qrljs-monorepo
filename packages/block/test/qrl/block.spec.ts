import { qrl as txQrl } from '@ethereumjs/tx'
import { bytesToHex, qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function tx(): txQrl.QRLDynamicFeeTransaction {
  return new txQrl.QRLDynamicFeeTransaction({
    chainId: 1n,
    nonce: 0n,
    gasTipCap: 0n,
    gasFeeCap: 0n,
    gasLimit: 100n,
    to: address(1),
  })
}

function receipt(): qrl.QRLReceipt {
  return new qrl.QRLReceipt({
    txHash: new Uint8Array(32).fill(1),
    from: address(2),
    to: address(3),
    status: 1,
    gasUsed: 4n,
    cumulativeGasUsed: 4n,
  })
}

describe('QRLBlock', () => {
  it('creates an empty local block', () => {
    const block = new qrl.QRLBlock()

    assert.strictEqual(block.transactions.length, 0)
    assert.strictEqual(block.receipts.length, 0)
    assert.strictEqual(block.hash().length, 32)
    assert.strictEqual(block.toJSON().transactions.length, 0)
  })

  it('contains QRL transactions and receipts', () => {
    const transaction = tx()
    const blockReceipt = receipt()
    const block = new qrl.QRLBlock({
      header: { number: 2n },
      transactions: [transaction],
      receipts: [blockReceipt],
    })

    assert.strictEqual(block.header.number, 2n)
    assert.strictEqual(block.header.gasUsed, 4n)
    assert.strictEqual(block.transactions[0], transaction)
    assert.strictEqual(block.receipts[0], blockReceipt)
    assert.strictEqual(block.toJSON().transactions[0].to, address(1).toString())
  })

  it('aggregates receipt blooms into the generated header', () => {
    const log = new qrl.QRLLog({
      address: address(6),
      topics: [new Uint8Array(64).fill(7)],
    })
    const blockReceipt = receipt().withInclusion({
      blockHash: new Uint8Array(32).fill(8),
      blockNumber: 1n,
      transactionIndex: 0,
    })
    const receiptWithBloom = new qrl.QRLReceipt({
      txHash: blockReceipt.txHash,
      from: blockReceipt.from,
      to: blockReceipt.to,
      status: blockReceipt.status,
      gasUsed: blockReceipt.gasUsed,
      cumulativeGasUsed: blockReceipt.cumulativeGasUsed,
      logs: [log],
    })
    const block = new qrl.QRLBlock({ receipts: [receiptWithBloom] })

    assert.strictEqual(
      bytesToHex(block.header.logsBloom),
      bytesToHex(qrl.createQRLReceiptsBloom([receiptWithBloom])),
    )
    assert.notStrictEqual(
      bytesToHex(block.header.logsBloom),
      bytesToHex(new Uint8Array(qrl.QRL_LOGS_BLOOM_BYTES)),
    )
  })

  it('freezes array membership from external mutation', () => {
    const transactions = [tx()]
    const receipts = [receipt()]
    const block = new qrl.QRLBlock({ transactions, receipts })

    transactions.push(tx())
    receipts.push(receipt())
    assert.throws(() => (block.transactions as txQrl.QRLDynamicFeeTransaction[]).push(tx()))
    assert.throws(() => (block.receipts as qrl.QRLReceipt[]).push(receipt()))

    assert.strictEqual(block.transactions.length, 1)
    assert.strictEqual(block.receipts.length, 1)
  })
})
