import { qrl as evmQrl } from '@ethereumjs/evm'
import { qrl as stateQrl } from '@ethereumjs/statemanager'
import { qrl as txQrl } from '@ethereumjs/tx'
import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function createTx(data: Partial<txQrl.QRLDynamicFeeTxData> = {}): txQrl.QRLDynamicFeeTransaction {
  return new txQrl.QRLDynamicFeeTransaction({
    chainId: 1n,
    nonce: 0n,
    gasTipCap: 0n,
    gasFeeCap: 0n,
    gasLimit: 80000n,
    value: 0n,
    data: new Uint8Array([0x60, 0x00, 0x60, 0x00, 0x53, 0x60, 0x01, 0x60, 0x00, 0xf3]),
    ...data,
  })
}

async function assertRejects(action: () => Promise<unknown>, code: string): Promise<void> {
  try {
    await action()
  } catch (error) {
    assert.strictEqual((error as qrl.QRLRunTxError).code, code)
    return
  }
  assert.fail('Expected promise to reject')
}

describe('runQRLTx contract creation', () => {
  it('derives address, stores runtime code, increments nonce, and transfers value', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)

    const expectedAddress = qrl.createQRLContractAddress(sender, 0n)
    const result = await qrl.runQRLTx({
      tx: createTx({ value: 9n }),
      stateManager,
      sender,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 1)
    assert.isTrue(result.createdAddress?.equals(expectedAddress))
    assert.deepEqual(await stateManager.getCode(expectedAddress), new Uint8Array([0]))
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
    assert.strictEqual(await stateManager.getBalance(sender), 991n)
    assert.strictEqual(await stateManager.getBalance(expectedAddress), 9n)
  })

  it('rejects contract address collisions', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    const createdAddress = qrl.createQRLContractAddress(sender, 0n)
    await stateManager.setBalance(sender, 1000n)
    await stateManager.putCode(createdAddress, new Uint8Array([0x00]))

    await assertRejects(
      () =>
        qrl.runQRLTx({
          tx: createTx(),
          stateManager,
          sender,
          context: { chainId: 1n },
        }),
      'CONTRACT_ADDRESS_COLLISION',
    )
  })

  it('does not store code when init execution reverts', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)
    const createdAddress = qrl.createQRLContractAddress(sender, 0n)

    const result = await qrl.runQRLTx({
      tx: createTx({ data: new Uint8Array([0x60, 0x00, 0x60, 0x00, 0xfd]) }),
      stateManager,
      sender,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 0)
    assert.deepEqual(await stateManager.getCode(createdAddress), new Uint8Array())
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
  })

  it('rejects top-level contract creation with invalid deployed code', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)
    const createdAddress = qrl.createQRLContractAddress(sender, 0n)

    const result = await qrl.runQRLTx({
      tx: createTx({
        data: new Uint8Array([0x60, 0xef, 0x60, 0x00, 0x53, 0x60, 0x01, 0x60, 0x00, 0xf3]),
      }),
      stateManager,
      sender,
      context: { chainId: 1n },
    })

    assert.strictEqual(result.status, 0)
    assert.deepEqual(await stateManager.getCode(createdAddress), new Uint8Array())
    assert.strictEqual(await stateManager.getNonce(sender), 1n)
  })

  it('rejects top-level contract creation when init code exceeds the QRL limit', async () => {
    const stateManager = new stateQrl.QRLStateManager()
    const sender = address(1)
    await stateManager.setBalance(sender, 1000n)
    const createdAddress = qrl.createQRLContractAddress(sender, 0n)

    await assertRejects(
      () =>
        qrl.runQRLTx({
          tx: createTx({ data: new Uint8Array(evmQrl.QRL_MAX_INIT_CODE_SIZE + 1) }),
          stateManager,
          sender,
          context: { chainId: 1n },
        }),
      'INIT_CODE_SIZE_EXCEEDED',
    )

    assert.deepEqual(await stateManager.getCode(createdAddress), new Uint8Array())
    assert.strictEqual(await stateManager.getNonce(sender), 0n)
    assert.strictEqual(await stateManager.getBalance(sender), 1000n)
  })
})
