import { qrl as txQrl } from '@theqrl/tx'
import { qrl as utilQrl } from '@theqrl/util'
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
    gasLimit: 50000n,
    to: address(2),
  })
}

describe('QRLLocalChain lookups', () => {
  it('returns undefined for unknown lookup keys', () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n } })

    assert.strictEqual(chain.getBlockByNumber(99n), undefined)
    assert.strictEqual(chain.getBlockByHash(new Uint8Array(32).fill(9)), undefined)
    assert.strictEqual(chain.getTransaction(new Uint8Array(32).fill(9)), undefined)
    assert.strictEqual(chain.getReceipt(new Uint8Array(32).fill(9)), undefined)
  })

  it('uses stable byte keys when caller mutates hash arrays', async () => {
    const chain = new qrl.QRLLocalChain({ context: { chainId: 1n } })
    const sender = address(1)
    await chain.stateManager.setBalance(sender, 1000n)

    const transaction = tx()
    const result = await chain.runTx({ tx: transaction, sender })
    const blockHash = result.block!.hash()
    const txHash = transaction.hash()

    blockHash.fill(0)
    txHash.fill(0)

    assert.strictEqual(chain.getBlockByHash(result.block!.hash()), result.block)
    assert.strictEqual(chain.getTransaction(transaction.hash()), transaction)
    assert.strictEqual(chain.getReceipt(transaction.hash()), result.receipt)
  })
})
