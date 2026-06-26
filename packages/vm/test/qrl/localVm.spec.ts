import { qrl as txQrl } from '@theqrl/tx'
import { qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLVM local chain', () => {
  it('exposes a local chain without changing direct runTx behavior', async () => {
    const vm = new qrl.QRLVM({ context: { chainId: 1n } })
    const sender = address(1)
    await vm.stateManager.setBalance(sender, 1000n)

    const direct = await vm.runTx({
      tx: new txQrl.QRLDynamicFeeTransaction({
        chainId: 1n,
        nonce: 0n,
        gasTipCap: 0n,
        gasFeeCap: 0n,
        gasLimit: 50000n,
        to: address(2),
      }),
      sender,
    })

    assert.strictEqual(direct.status, 1)
    assert.strictEqual(vm.localChain.getBlockNumber(), 1n)
    assert.strictEqual(vm.localChain.getReceipt(direct.txHash)?.status, 1)

    const mined = await vm.localChain.runTx({
      tx: new txQrl.QRLDynamicFeeTransaction({
        chainId: 1n,
        nonce: 1n,
        gasTipCap: 0n,
        gasFeeCap: 0n,
        gasLimit: 50000n,
        to: address(2),
      }),
      sender,
    })

    assert.strictEqual(mined.block?.header.number, 2n)
    assert.strictEqual(vm.localChain.getReceipt(mined.transaction.hash()), mined.receipt)
  })
})
