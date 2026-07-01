import { qrl as blockQrl } from '@theqrl/block'
import { qrl as txQrl } from '@theqrl/tx'
import { bytesToHex, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function tx(nonce = 0n): txQrl.QRLDynamicFeeTransaction {
  return new txQrl.QRLDynamicFeeTransaction({
    chainId: 1n,
    nonce,
    gasTipCap: 0n,
    gasFeeCap: 0n,
    gasLimit: 50000n,
    to: address(2),
  })
}

describe('QRLLocalChain', () => {
  it('creates deterministic genesis and automines transactions', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n, gasLimit: 1000n } })
    const sender = address(1)
    await chain.stateManager.setBalance(sender, 1000n)

    assert.strictEqual(chain.getBlockNumber(), 0n)
    assert.strictEqual(chain.getLatestBlock().header.gasLimit, 1000n)

    const transaction = tx()
    const result = await chain.runTx({ tx: transaction, sender })

    assert.strictEqual(result.runTxResult.status, 1)
    assert.strictEqual(chain.getBlockNumber(), 1n)
    assert.strictEqual(result.block?.header.number, 1n)
    assert.strictEqual(result.receipt?.blockNumber, 1n)
    assert.strictEqual(result.receipt?.transactionIndex, 0)
    assert.strictEqual(chain.getReceipt(transaction.hash()), result.receipt)
    assert.strictEqual(chain.getTransaction(transaction.hash()), transaction)
    assert.strictEqual(chain.getBlockByNumber(1n), result.block)
    assert.strictEqual(chain.getBlockByHash(result.block!.hash()), result.block)
    assert.strictEqual(
      bytesToHex(result.block!.header.transactionsRoot),
      bytesToHex(await blockQrl.genQRLTransactionsRoot([transaction])),
    )
    assert.strictEqual(
      bytesToHex(result.block!.header.receiptsRoot),
      bytesToHex(await blockQrl.genQRLReceiptsRoot(result.block!.receipts)),
    )
    assert.strictEqual(
      bytesToHex(result.block!.header.stateRoot),
      bytesToHex(await chain.stateManager.getStateRoot()),
    )
    assert.notStrictEqual(
      bytesToHex(result.block!.header.stateRoot),
      bytesToHex(new Uint8Array(32)),
    )
  })

  it('stores pending transactions when mining is disabled and mines them later', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n }, automine: false })
    const sender = address(1)
    await chain.stateManager.setBalance(sender, 1000n)

    const transaction = tx()
    const result = await chain.runTx({ tx: transaction, sender })

    assert.strictEqual(result.block, undefined)
    assert.strictEqual(result.receipt, undefined)
    assert.strictEqual(chain.getBlockNumber(), 0n)
    assert.strictEqual(chain.getTransaction(transaction.hash()), transaction)
    assert.strictEqual(chain.getReceipt(transaction.hash()), undefined)
    assert.strictEqual(await chain.stateManager.getNonce(sender), 0n)
    assert.strictEqual(await chain.getPendingStateManager().getNonce(sender), 1n)

    const block = await chain.mineBlock()

    assert.strictEqual(block.header.number, 1n)
    assert.strictEqual(block.transactions[0], transaction)
    assert.strictEqual(chain.getReceipt(transaction.hash()), block.receipts[0])
    assert.strictEqual(await chain.stateManager.getNonce(sender), 1n)
    assert.strictEqual(
      bytesToHex(block.header.stateRoot),
      bytesToHex(await chain.stateManager.getStateRoot()),
    )
  })

  it('mines empty blocks with parent tracking', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n } })
    const genesisHash = chain.getLatestBlock().hash()
    const block = await chain.mineBlock()

    assert.strictEqual(block.header.number, 1n)
    assert.strictEqual(bytesToHex(block.header.parentHash), bytesToHex(genesisHash))
    assert.strictEqual(block.transactions.length, 0)
    assert.strictEqual(block.receipts.length, 0)
  })

  it('uses refunded gas in automined QRL receipts', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n, gasLimit: 100000n } })
    const sender = address(1)
    const receiver = address(2)
    const key = new Uint8Array(32)
    key[31] = 1
    const value = new Uint8Array(64)
    value[63] = 0x2a
    await chain.stateManager.setBalance(sender, 100000n)
    await chain.stateManager.putStorage(receiver, key, value)
    await chain.stateManager.putCode(receiver, new Uint8Array([0x5f, 0x60, 0x01, 0x55, 0x00]))

    const result = await chain.runTx({
      tx: new txQrl.QRLDynamicFeeTransaction({
        chainId: 1n,
        nonce: 0n,
        gasTipCap: 0n,
        gasFeeCap: 1n,
        gasLimit: 50000n,
        to: receiver,
      }),
      sender,
    })

    assert.strictEqual(result.runTxResult.gasUsed, 21205n)
    assert.strictEqual(result.receipt?.gasUsed, 21205n)
    assert.strictEqual(result.receipt?.cumulativeGasUsed, 21205n)
  })
})
