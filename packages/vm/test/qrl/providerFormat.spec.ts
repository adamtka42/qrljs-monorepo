import { qrl as blockQrl } from '@ethereumjs/block'
import { qrl as txQrl } from '@ethereumjs/tx'
import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRL provider formatting', () => {
  it('formats quantities, data, hashes, transactions, blocks, receipts, and logs', () => {
    const tx = new txQrl.QRLDynamicFeeTransaction({
      chainId: 1n,
      nonce: 2n,
      gasTipCap: 3n,
      gasFeeCap: 4n,
      gasLimit: 5n,
      to: address(2),
      value: 6n,
      data: new Uint8Array([0x60, 0x2a]),
    })
    const log = new blockQrl.QRLLog({
      address: address(3),
      topics: [new Uint8Array(64).fill(4)],
      data: new Uint8Array([1, 2]),
    })
    const receipt = new blockQrl.QRLReceipt({
      txHash: tx.hash(),
      from: address(1),
      to: address(2),
      status: 1,
      gasUsed: 0n,
      cumulativeGasUsed: 0n,
      logs: [log],
    })
    const block = new blockQrl.QRLBlock({
      header: { number: 7n, timestamp: 8n, gasLimit: 9n, baseFee: 10n },
      transactions: [tx],
      receipts: [receipt],
    })

    assert.strictEqual(qrl.qrlQuantity(0n), '0x0')
    assert.strictEqual(qrl.qrlQuantity(15n), '0xf')
    assert.strictEqual(qrl.qrlData(new Uint8Array([0, 15])), '0x000f')
    assert.strictEqual(qrl.qrlAddress(address(1)).startsWith('Q'), true)

    const formattedTx = qrl.formatQRLTransaction(tx, block, 0, address(1))
    assert.strictEqual(formattedTx.nonce, '0x2')
    assert.strictEqual(formattedTx.from, address(1).toString())
    assert.strictEqual(formattedTx.to, address(2).toString())
    assert.strictEqual(formattedTx.input, '0x602a')
    assert.strictEqual(formattedTx.blockNumber, '0x7')

    const formattedBlock = qrl.formatQRLBlock(block, false)
    assert.strictEqual(formattedBlock.number, '0x7')
    assert.deepEqual(formattedBlock.transactions, [qrl.qrlHash(tx.hash())])

    const formattedBlockWithTxs = qrl.formatQRLBlock(block, true)
    assert.strictEqual(typeof formattedBlockWithTxs.transactions[0], 'object')

    assert.strictEqual(qrl.formatQRLReceipt(receipt).status, '0x1')
    assert.strictEqual(qrl.formatQRLLog(log).topics[0], `0x${'04'.repeat(64)}`)
  })
})
