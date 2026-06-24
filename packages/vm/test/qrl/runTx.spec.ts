import { qrl as evmQrl } from '@ethereumjs/evm'
import { qrl as stateQrl } from '@ethereumjs/statemanager'
import { qrl as txQrl } from '@ethereumjs/tx'
import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function tx(data: Partial<txQrl.QRLDynamicFeeTxData> = {}): txQrl.QRLDynamicFeeTransaction {
  return new txQrl.QRLDynamicFeeTransaction({
    chainId: 1n,
    nonce: 0n,
    gasTipCap: 0n,
    gasFeeCap: 0n,
    gasLimit: 100n,
    to: address(2),
    value: 0n,
    ...data,
  })
}

async function assertRejects(action: () => Promise<unknown>, code?: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    if (code !== undefined) {
      assert.strictEqual((error as qrl.QRLRunTxError).code, code)
    }
    return
  }
  assert.fail('Expected promise to reject')
}

describe('runQRLTx', () => {
  it('rejects missing sender, wrong chain id, bad nonce, and insufficient funds', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)

    await assertRejects(
      () => qrl.runQRLTx({ tx: tx(), stateManager, context: { chainId: 1n } }),
      'MISSING_SENDER',
    )
    await assertRejects(
      () => qrl.runQRLTx({ tx: tx(), stateManager, sender, context: { chainId: 2n } }),
      'WRONG_CHAIN_ID',
    )
    await assertRejects(
      () => qrl.runQRLTx({ tx: tx({ nonce: 1n }), stateManager, sender, context: { chainId: 1n } }),
      'NONCE_TOO_HIGH',
    )

    await stateManager.setNonce(sender, 1n)
    await assertRejects(
      () => qrl.runQRLTx({ tx: tx({ nonce: 0n }), stateManager, sender, context: { chainId: 1n } }),
      'NONCE_TOO_LOW',
    )

    await stateManager.setNonce(sender, 0n)
    await assertRejects(
      () =>
        qrl.runQRLTx({
          tx: tx({ gasFeeCap: 2n, value: 10n }),
          stateManager,
          sender,
          context: { chainId: 1n },
        }),
      'INSUFFICIENT_FUNDS',
    )
  })

  it('rejects fee cap below base fee', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)

    await assertRejects(
      () =>
        qrl.runQRLTx({
          tx: tx({ gasFeeCap: 1n }),
          stateManager,
          sender,
          context: { chainId: 1n, baseFee: 2n, noBaseFee: false },
        }),
      'FEE_CAP_BELOW_BASE_FEE',
    )
  })

  it('executes a call, increments nonce, transfers value, and returns data', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    const receiver = address(2)
    await stateManager.setBalance(sender, 1000n)
    await stateManager.putCode(
      receiver,
      new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    )

    const result = await qrl.runQRLTx({
      tx: tx({ to: receiver, value: 7n }),
      stateManager,
      sender,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 1)
    assert.strictEqual(result.returnValue.length, 64)
    assert.strictEqual(result.returnValue[63], 0x2a)
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
    assert.strictEqual(await stateManager.getBalance(sender), 993n)
    assert.strictEqual(await stateManager.getBalance(receiver), 7n)
  })

  it('uses signer sender path with a fake signer', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)

    const fakeSigner: txQrl.QRLSigner = {
      chainId: 1n,
      hash: (transaction) => transaction.getMessageToSign(),
      verify: () => true,
      sender: () => sender,
    }

    const result = await qrl.runQRLTx({
      tx: tx(),
      stateManager,
      signer: fakeSigner,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 1)
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
  })

  it('returns status 0 and rolls state back when execution reverts', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    const receiver = address(2)
    await stateManager.setBalance(sender, 1000n)
    await stateManager.putCode(receiver, new Uint8Array([0x60, 0x00, 0x60, 0x00, 0xfd]))

    const result = await qrl.runQRLTx({
      tx: tx({ to: receiver, value: 7n }),
      stateManager,
      sender,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 0)
    assert.instanceOf(result.executionError, evmQrl.QRLVMRevert)
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
    assert.strictEqual(await stateManager.getBalance(sender), 1000n)
    assert.strictEqual(await stateManager.getBalance(receiver), 0n)
  })

  it('executes through QRLVM wrapper', async () => {
    const vm = new qrl.QRLVM({ context: { chainId: 1n } })
    const sender = address(1)
    await vm.stateManager.setBalance(sender, 1000n)

    const result = await vm.runTx({
      tx: tx(),
      sender,
    })

    assert.strictEqual(result.status, 1)
  })
})
