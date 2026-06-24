import { qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, expect, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLLocalProvider', () => {
  it('serves local QRL account, transaction, block, and receipt requests', async () => {
    const sender = address(1)
    const receiver = address(2)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 1000n, noBaseFee: true },
    })

    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x0')
    assert.strictEqual(
      await provider.request({ method: 'qrl_getBalance', params: [sender.toString()] }),
      '0x3e8',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getTransactionCount', params: [sender.toString()] }),
      '0x0',
    )

    const txHash = (await provider.request({
      method: 'qrl_sendTransaction',
      params: [
        {
          from: sender.toString(),
          to: receiver.toString(),
          gas: '0x64',
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
          value: '0x2a',
        },
      ],
    })) as string

    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x1')
    assert.strictEqual(
      await provider.request({ method: 'qrl_getBalance', params: [receiver.toString()] }),
      '0x2a',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getTransactionCount', params: [sender.toString()] }),
      '0x1',
    )

    const receipt = (await provider.request({
      method: 'qrl_getTransactionReceipt',
      params: [txHash],
    })) as { status: string; blockNumber: string; from: string; to: string }
    assert.strictEqual(receipt.status, '0x1')
    assert.strictEqual(receipt.blockNumber, '0x1')
    assert.strictEqual(receipt.from, sender.toString())
    assert.strictEqual(receipt.to, receiver.toString())

    const tx = (await provider.request({
      method: 'qrl_getTransactionByHash',
      params: [txHash],
    })) as { hash: string; blockNumber: string; from: string }
    assert.strictEqual(tx.hash, txHash)
    assert.strictEqual(tx.blockNumber, '0x1')
    assert.strictEqual(tx.from, sender.toString())

    const block = (await provider.request({
      method: 'qrl_getBlockByNumber',
      params: ['0x1', false],
    })) as { number: string; transactions: string[] }
    assert.strictEqual(block.number, '0x1')
    assert.deepEqual(block.transactions, [txHash])

    const blockByHash = (await provider.request({
      method: 'qrl_getBlockByHash',
      params: [
        (
          (await provider.request({ method: 'qrl_getBlockByNumber', params: ['latest'] })) as {
            hash: string
          }
        ).hash,
      ],
    })) as { number: string }
    assert.strictEqual(blockByHash.number, '0x1')
  })

  it('supports code, storage, qrl_call, mining, snapshots, and revert', async () => {
    const sender = address(1)
    const contract = address(3)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 1000n, noBaseFee: true },
    })

    await provider.chain.stateManager.putCode(
      contract,
      new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    )
    await provider.chain.stateManager.putStorage(
      contract,
      new Uint8Array(32).fill(1),
      new Uint8Array(64).fill(2),
    )

    assert.strictEqual(
      await provider.request({ method: 'qrl_getCode', params: [contract.toString()] }),
      '0x602a60005260406000f3',
    )
    assert.strictEqual(
      await provider.request({
        method: 'qrl_getStorageAt',
        params: [contract.toString(), `0x${'01'.repeat(32)}`],
      }),
      `0x${'02'.repeat(64)}`,
    )
    assert.strictEqual(
      await provider.request({
        method: 'qrl_call',
        params: [{ from: sender.toString(), to: contract.toString(), gasLimit: '0x64' }],
      }),
      `0x${'00'.repeat(63)}2a`,
    )

    const snapshot = (await provider.request({ method: 'qrl_snapshot' })) as string
    const minedHash = await provider.request({ method: 'qrl_mine' })
    assert.strictEqual(typeof minedHash, 'string')
    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x1')
    assert.strictEqual(await provider.request({ method: 'qrl_revert', params: [snapshot] }), true)
    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x0')
  })

  it('reverts only its own qrl_call checkpoint on execution errors', async () => {
    const sender = address(1)
    const contract = address(4)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 1000n, noBaseFee: true },
    })

    await provider.chain.stateManager.putCode(contract, new Uint8Array([0xfe]))
    await provider.chain.stateManager.checkpoint()

    await expect(
      provider.request({
        method: 'qrl_call',
        params: [{ from: sender.toString(), to: contract.toString(), gasLimit: '0x64' }],
      }),
    ).rejects.toMatchObject({ code: -32000 })

    await provider.chain.stateManager.revert()
  })

  it('rejects invalid methods and params', async () => {
    const sender = address(1)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, noBaseFee: true },
    })

    await expect(provider.request({ method: 'qrl_unknown' })).rejects.toMatchObject({
      code: -32601,
    })
    await expect(
      provider.request({ method: 'qrl_getBalance', params: ['0x1234'] }),
    ).rejects.toMatchObject({ code: -32602 })
    await expect(
      provider.request({
        method: 'qrl_sendTransaction',
        params: [{ from: sender.toString(), gas: '0x1', gasLimit: '0x2' }],
      }),
    ).rejects.toMatchObject({ code: -32602 })
    await expect(
      provider.request({ method: 'qrl_getBalance', params: [sender.toString(), 'earliest'] }),
    ).rejects.toMatchObject({ code: -32602 })
  })
})
