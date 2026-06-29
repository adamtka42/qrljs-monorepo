import { qrl as utilQrl } from '@theqrl/util'
import { assert, describe, expect, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

function logCode(topic: number): Uint8Array {
  return new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x60, topic, 0x60, 0x40, 0x5f, 0xc1, 0x00])
}

function topicHex(byte: number): string {
  return `0x${'00'.repeat(63)}${byte.toString(16).padStart(2, '0')}`
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
          gas: '0xc350',
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

  it('separates latest and pending state for queued local transactions', async () => {
    const sender = address(1)
    const receiver = address(2)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      automine: false,
      defaultContext: { chainId: 1n, gasLimit: 100000n, noBaseFee: true },
    })

    assert.strictEqual(
      await provider.request({
        method: 'qrl_getTransactionCount',
        params: [sender.toString(), 'pending'],
      }),
      '0x0',
    )

    await provider.request({
      method: 'qrl_sendTransaction',
      params: [
        {
          from: sender.toString(),
          to: receiver.toString(),
          gas: '0x5208',
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
          value: '0x2a',
        },
      ],
    })

    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x0')
    assert.strictEqual(
      await provider.request({
        method: 'qrl_getTransactionCount',
        params: [sender.toString(), 'latest'],
      }),
      '0x0',
    )
    assert.strictEqual(
      await provider.request({
        method: 'qrl_getTransactionCount',
        params: [sender.toString(), 'pending'],
      }),
      '0x1',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getBalance', params: [receiver.toString(), 'latest'] }),
      '0x0',
    )
    assert.strictEqual(
      await provider.request({
        method: 'qrl_getBalance',
        params: [receiver.toString(), 'pending'],
      }),
      '0x2a',
    )

    const pendingBlock = (await provider.request({
      method: 'qrl_getBlockByNumber',
      params: ['pending', false],
    })) as { number: string; transactions: string[]; receipts: Array<{ status: string }> }

    assert.strictEqual(pendingBlock.number, '0x1')
    assert.strictEqual(pendingBlock.transactions.length, 1)
    assert.strictEqual(pendingBlock.receipts[0].status, '0x1')
    assert.strictEqual(await provider.request({ method: 'qrl_blockNumber' }), '0x0')

    const pendingBlockWithTxs = (await provider.request({
      method: 'qrl_getBlockByNumber',
      params: ['pending', true],
    })) as { transactions: Array<{ from: string; to: string }> }
    assert.strictEqual(pendingBlockWithTxs.transactions[0].from, sender.toString())
    assert.strictEqual(pendingBlockWithTxs.transactions[0].to, receiver.toString())

    await provider.request({ method: 'qrl_mine' })

    const latestBlock = (await provider.request({
      method: 'qrl_getBlockByNumber',
      params: ['latest', false],
    })) as { number: string; transactions: string[] }

    assert.strictEqual(latestBlock.number, pendingBlock.number)
    assert.deepEqual(latestBlock.transactions, pendingBlock.transactions)
    assert.strictEqual(
      await provider.request({
        method: 'qrl_getTransactionCount',
        params: [sender.toString(), 'latest'],
      }),
      '0x1',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getBalance', params: [receiver.toString(), 'latest'] }),
      '0x2a',
    )
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
        params: [{ from: sender.toString(), to: contract.toString(), gasLimit: '0xc350' }],
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

  it('estimates gas for transfers, calls, and contract creation without changing state', async () => {
    const sender = address(1)
    const receiver = address(2)
    const contract = address(3)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 100000n, noBaseFee: true },
    })

    assert.strictEqual(
      await provider.request({
        method: 'qrl_estimateGas',
        params: [
          {
            from: sender.toString(),
            to: receiver.toString(),
            value: '0x1',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
        ],
      }),
      '0x5208',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getTransactionCount', params: [sender.toString()] }),
      '0x0',
    )
    assert.strictEqual(
      await provider.request({ method: 'qrl_getBalance', params: [receiver.toString()] }),
      '0x0',
    )

    await provider.chain.stateManager.putCode(
      contract,
      new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    )
    assert.strictEqual(
      await provider.request({
        method: 'qrl_estimateGas',
        params: [
          {
            from: sender.toString(),
            to: contract.toString(),
            gas: '0x186a0',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
        ],
      }),
      '0x521a',
    )

    assert.strictEqual(
      await provider.request({
        method: 'qrl_estimateGas',
        params: [
          {
            from: sender.toString(),
            data: '0x602a60005260406000f3',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
        ],
      }),
      '0xcfa4',
    )
  })

  it('rejects gas estimation when the requested cap cannot execute the transaction', async () => {
    const sender = address(1)
    const receiver = address(2)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 100000n, noBaseFee: true },
    })

    await expect(
      provider.request({
        method: 'qrl_estimateGas',
        params: [
          {
            from: sender.toString(),
            to: receiver.toString(),
            gas: '0x5207',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
        ],
      }),
    ).rejects.toMatchObject({ code: -32000 })
  })

  it('returns logs filtered by block range, block hash, address, and topics', async () => {
    const sender = address(1)
    const firstContract = address(3)
    const secondContract = address(4)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      automine: false,
      defaultContext: { chainId: 1n, gasLimit: 100000n, noBaseFee: true },
    })

    await provider.chain.stateManager.putCode(firstContract, logCode(0x7b))
    await provider.chain.stateManager.putCode(secondContract, logCode(0x7c))

    await provider.request({
      method: 'qrl_sendTransaction',
      params: [
        {
          from: sender.toString(),
          to: firstContract.toString(),
          gas: '0x186a0',
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
        },
      ],
    })
    await provider.request({
      method: 'qrl_sendTransaction',
      params: [
        {
          from: sender.toString(),
          to: secondContract.toString(),
          gas: '0x186a0',
          maxFeePerGas: '0x0',
          maxPriorityFeePerGas: '0x0',
        },
      ],
    })
    await provider.request({ method: 'qrl_mine' })

    const allLogs = (await provider.request({
      method: 'qrl_getLogs',
      params: [{ fromBlock: 'earliest', toBlock: 'latest' }],
    })) as Array<{
      address: string
      topics: string[]
      data: string
      blockNumber: string
      blockHash: string
      logIndex: string
    }>

    assert.strictEqual(allLogs.length, 2)
    assert.strictEqual(allLogs[0].address, firstContract.toString())
    assert.strictEqual(allLogs[0].topics[0], topicHex(0x7b))
    assert.strictEqual(allLogs[0].data, `0x${'00'.repeat(63)}2a`)
    assert.strictEqual(allLogs[0].blockNumber, '0x1')
    assert.strictEqual(allLogs[0].logIndex, '0x0')
    assert.strictEqual(allLogs[1].address, secondContract.toString())
    assert.strictEqual(allLogs[1].topics[0], topicHex(0x7c))
    assert.strictEqual(allLogs[1].logIndex, '0x1')

    const block = (await provider.request({
      method: 'qrl_getBlockByNumber',
      params: ['0x1'],
    })) as { hash: string }

    assert.strictEqual(
      (
        (await provider.request({
          method: 'qrl_getLogs',
          params: [{ blockHash: block.hash, address: firstContract.toString() }],
        })) as unknown[]
      ).length,
      1,
    )
    assert.strictEqual(
      (
        (await provider.request({
          method: 'qrl_getLogs',
          params: [
            { fromBlock: '0x1', toBlock: '0x1', topics: [[topicHex(0x7b), topicHex(0x7c)]] },
          ],
        })) as unknown[]
      ).length,
      2,
    )
    assert.strictEqual(
      (
        (await provider.request({
          method: 'qrl_getLogs',
          params: [{ fromBlock: '0x2', toBlock: 'latest' }],
        })) as unknown[]
      ).length,
      0,
    )
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
        params: [{ from: sender.toString(), to: contract.toString(), gasLimit: '0xc350' }],
      }),
    ).rejects.toMatchObject({ code: -32000 })

    await provider.chain.stateManager.revert()
  })

  it('includes revert return data in qrl_call provider errors', async () => {
    const sender = address(1)
    const contract = address(4)
    const provider = new qrl.QRLLocalProvider({
      accounts: [{ address: sender, balance: 1000n }],
      defaultContext: { chainId: 1n, gasLimit: 1000n, noBaseFee: true },
    })

    await provider.chain.stateManager.putCode(
      contract,
      new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x53, 0x60, 0x01, 0x60, 0x00, 0xfd]),
    )

    await expect(
      provider.request({
        method: 'qrl_call',
        params: [{ from: sender.toString(), to: contract.toString(), gasLimit: '0xc350' }],
      }),
    ).rejects.toMatchObject({
      code: -32000,
      data: '0x2a',
    })
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
