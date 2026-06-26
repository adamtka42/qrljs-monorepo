import { qrl as txQrl } from '@theqrl/tx'
import { qrl as utilQrl } from '@theqrl/util'
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

describe('QRLLocalChain snapshots', () => {
  it('restores state and local chain indexes', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n } })
    const sender = address(1)
    await chain.stateManager.setBalance(sender, 1000n)
    const snapshot = await chain.snapshot()

    const transaction = tx()
    await chain.runTx({ tx: transaction, sender })

    assert.strictEqual(await chain.stateManager.getNonce(sender), 1n)
    assert.strictEqual(chain.getBlockNumber(), 1n)
    assert.isDefined(chain.getReceipt(transaction.hash()))

    assert.isTrue(await chain.revert(snapshot))

    assert.strictEqual(await chain.stateManager.getNonce(sender), 0n)
    assert.strictEqual(await chain.stateManager.getBalance(sender), 1000n)
    assert.strictEqual(chain.getBlockNumber(), 0n)
    assert.strictEqual(chain.getReceipt(transaction.hash()), undefined)
    assert.strictEqual(chain.getTransaction(transaction.hash()), undefined)
    assert.strictEqual(chain.getBlockByNumber(1n), undefined)
  })

  it('handles unknown and nested snapshots', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n } })
    const sender = address(1)
    await chain.stateManager.setBalance(sender, 1000n)

    const snapshotA = await chain.snapshot()
    const txA = tx(0n)
    await chain.runTx({ tx: txA, sender })

    const snapshotB = await chain.snapshot()
    const txB = tx(1n)
    await chain.runTx({ tx: txB, sender })

    assert.strictEqual(chain.getBlockNumber(), 2n)
    assert.isFalse(await chain.revert(999n))
    assert.isTrue(await chain.revert(snapshotB))
    assert.strictEqual(chain.getBlockNumber(), 1n)
    assert.isDefined(chain.getReceipt(txA.hash()))
    assert.strictEqual(chain.getReceipt(txB.hash()), undefined)
    assert.isFalse(await chain.revert(snapshotB))
    assert.isTrue(await chain.revert(snapshotA))
    assert.strictEqual(chain.getBlockNumber(), 0n)
    assert.strictEqual(chain.getReceipt(txA.hash()), undefined)
  })
})
