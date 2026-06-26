import { qrl as blockQrl } from '@theqrl/block'
import { qrl as evmQrl } from '@theqrl/evm'
import { qrl as stateQrl } from '@theqrl/statemanager'
import type { qrl as txQrl } from '@theqrl/tx'
import { qrl } from '@theqrl/util'

import { cloneQRLMap, qrlLookupKey, qrlNumberKey } from './blockLookup.ts'
import { type QRLRunTxContext } from './context.ts'
import { createQRLReceiptFromRunTxResult } from './receipt.ts'
import { type QRLRunTxOptions, runQRLTx } from './runTx.ts'

import type { QRLRunTxResult } from './result.ts'
import type { QRLChainSnapshot, QRLChainSnapshotId } from './snapshot.ts'

export interface QRLLocalChainOptions {
  stateManager?: stateQrl.QRLStateManager
  evm?: evmQrl.QRLEVM
  context?: QRLRunTxContext
  genesisHeader?: blockQrl.QRLBlockHeaderData
  genesisBlock?: blockQrl.QRLBlock
  automine?: boolean
}

export interface QRLLocalChainRunTxOptions extends Omit<QRLRunTxOptions, 'stateManager' | 'evm'> {
  mine?: boolean
}

export interface QRLLocalChainRunTxResult {
  runTxResult: QRLRunTxResult
  transaction: txQrl.QRLDynamicFeeTransaction
  receipt?: blockQrl.QRLReceipt
  block?: blockQrl.QRLBlock
}

export interface QRLMineBlockOptions {
  timestamp?: bigint
  coinbase?: qrl.QRLAddress
  gasLimit?: bigint
  baseFee?: bigint
}

interface PendingQRLTransaction {
  tx: txQrl.QRLDynamicFeeTransaction
  result: QRLRunTxResult
}

export class QRLLocalChain {
  public stateManager: stateQrl.QRLStateManager
  public evm: evmQrl.QRLEVM

  private readonly automine: boolean
  private readonly context?: QRLRunTxContext
  private latestBlockHash: Uint8Array
  private nextSnapshotId = 1n
  private blocksByNumber = new Map<string, blockQrl.QRLBlock>()
  private blocksByHash = new Map<string, blockQrl.QRLBlock>()
  private transactionsByHash = new Map<string, txQrl.QRLDynamicFeeTransaction>()
  private receiptsByTxHash = new Map<string, blockQrl.QRLReceipt>()
  private pending: PendingQRLTransaction[] = []
  private snapshots = new Map<string, QRLChainSnapshot>()

  public constructor(options: QRLLocalChainOptions = {}) {
    this.stateManager = options.stateManager ?? new stateQrl.QRLStateManager()
    this.evm = options.evm ?? new evmQrl.QRLEVM({ stateManager: this.stateManager })
    this.context = options.context
    this.automine = options.automine ?? true

    const genesis = options.genesisBlock ?? createGenesisBlock(options)
    this.latestBlockHash = genesis.hash()
    this.indexBlock(genesis)
  }

  public getLatestBlock(): blockQrl.QRLBlock {
    return this.blocksByHash.get(qrlLookupKey(this.latestBlockHash))!
  }

  public getBlockNumber(): bigint {
    return this.getLatestBlock().header.number
  }

  public getBlockByNumber(number: bigint): blockQrl.QRLBlock | undefined {
    return this.blocksByNumber.get(qrlNumberKey(number))
  }

  public getBlockByHash(hash: Uint8Array): blockQrl.QRLBlock | undefined {
    return this.blocksByHash.get(qrlLookupKey(hash))
  }

  public getTransaction(hash: Uint8Array): txQrl.QRLDynamicFeeTransaction | undefined {
    return this.transactionsByHash.get(qrlLookupKey(hash))
  }

  public getReceipt(hash: Uint8Array): blockQrl.QRLReceipt | undefined {
    return this.receiptsByTxHash.get(qrlLookupKey(hash))
  }

  public async runTx(options: QRLLocalChainRunTxOptions): Promise<QRLLocalChainRunTxResult> {
    const runTxResult = await runQRLTx({
      ...options,
      stateManager: this.stateManager,
      evm: this.evm,
      context: options.context ?? nextBlockContext(this.context, this.getLatestBlock()),
    })
    const pending = { tx: options.tx, result: runTxResult }

    if (options.mine ?? this.automine) {
      const block = await this.mineBlockWithPending([pending])
      return {
        runTxResult,
        transaction: options.tx,
        receipt: block.receipts[0],
        block,
      }
    }

    this.pending.push(pending)
    this.transactionsByHash.set(qrlLookupKey(options.tx.hash()), options.tx)
    return {
      runTxResult,
      transaction: options.tx,
    }
  }

  public async mineBlock(options: QRLMineBlockOptions = {}): Promise<blockQrl.QRLBlock> {
    const pending = this.pending
    this.pending = []
    return this.mineBlockWithPending(pending, options)
  }

  public async snapshot(): Promise<QRLChainSnapshotId> {
    const id = this.nextSnapshotId++
    this.snapshots.set(id.toString(10), {
      id,
      stateManager: this.stateManager.shallowCopy(),
      latestBlockHash: new Uint8Array(this.latestBlockHash),
      blocksByNumber: cloneQRLMap(this.blocksByNumber),
      blocksByHash: cloneQRLMap(this.blocksByHash),
      transactionsByHash: cloneQRLMap(this.transactionsByHash),
      receiptsByTxHash: cloneQRLMap(this.receiptsByTxHash),
      pendingTransactions: this.pending.map((entry) => entry.tx),
      pendingResults: this.pending.map((entry) => entry.result),
    })
    return id
  }

  public async revert(snapshotId: QRLChainSnapshotId): Promise<boolean> {
    const key = snapshotId.toString(10)
    const snapshot = this.snapshots.get(key)
    if (snapshot === undefined) {
      return false
    }

    this.stateManager = snapshot.stateManager.shallowCopy()
    this.evm = new evmQrl.QRLEVM({ stateManager: this.stateManager })
    this.latestBlockHash = new Uint8Array(snapshot.latestBlockHash)
    this.blocksByNumber = cloneQRLMap(snapshot.blocksByNumber)
    this.blocksByHash = cloneQRLMap(snapshot.blocksByHash)
    this.transactionsByHash = cloneQRLMap(snapshot.transactionsByHash)
    this.receiptsByTxHash = cloneQRLMap(snapshot.receiptsByTxHash)
    this.pending = snapshot.pendingTransactions.map((tx, index) => ({
      tx,
      result: snapshot.pendingResults[index],
    }))

    for (const [id] of this.snapshots) {
      if (BigInt(id) >= snapshotId) {
        this.snapshots.delete(id)
      }
    }
    return true
  }

  private async mineBlockWithPending(
    pending: readonly PendingQRLTransaction[],
    options: QRLMineBlockOptions = {},
  ): Promise<blockQrl.QRLBlock> {
    const latest = this.getLatestBlock()
    let cumulativeGasUsed = 0n
    const receipts = pending.map((entry, index) => {
      cumulativeGasUsed += entry.result.gasUsed
      return createQRLReceiptFromRunTxResult({
        result: entry.result,
        blockNumber: latest.header.number + 1n,
        transactionIndex: index,
        cumulativeGasUsed,
      })
    })
    const transactions = pending.map((entry) => entry.tx)
    const transactionsRoot = await blockQrl.genQRLTransactionsRoot(transactions)
    const receiptsRoot = await blockQrl.genQRLReceiptsRoot(receipts)

    const draftBlock = new blockQrl.QRLBlock({
      header: {
        parentHash: latest.hash(),
        number: latest.header.number + 1n,
        timestamp: options.timestamp ?? latest.header.timestamp + 1n,
        gasLimit: options.gasLimit ?? this.context?.gasLimit ?? latest.header.gasLimit,
        baseFee: options.baseFee ?? this.context?.baseFee ?? latest.header.baseFee,
        coinbase: options.coinbase ?? this.context?.coinbase ?? latest.header.coinbase,
        transactionsRoot,
        receiptsRoot,
      },
      transactions,
      receipts,
    })
    const blockHash = draftBlock.hash()
    const includedReceipts = receipts.map((receipt, index) =>
      receipt.withInclusion({
        blockHash,
        blockNumber: draftBlock.header.number,
        transactionIndex: index,
        cumulativeGasUsed: receipt.cumulativeGasUsed,
      }),
    )
    const block = new blockQrl.QRLBlock({
      header: draftBlock.header,
      transactions,
      receipts: includedReceipts,
    })

    this.indexBlock(block)
    for (const [index, entry] of pending.entries()) {
      const txHash = qrlLookupKey(entry.tx.hash())
      this.transactionsByHash.set(txHash, entry.tx)
      this.receiptsByTxHash.set(txHash, block.receipts[index])
    }
    return block
  }

  private indexBlock(block: blockQrl.QRLBlock): void {
    this.latestBlockHash = block.hash()
    this.blocksByNumber.set(qrlNumberKey(block.header.number), block)
    this.blocksByHash.set(qrlLookupKey(block.hash()), block)
  }
}

function createGenesisBlock(options: QRLLocalChainOptions): blockQrl.QRLBlock {
  return new blockQrl.QRLBlock({
    header: {
      number: 0n,
      timestamp: 0n,
      gasLimit: options.context?.gasLimit ?? 0n,
      baseFee: options.context?.baseFee ?? 0n,
      coinbase: options.context?.coinbase ?? qrl.QRLAddress.zero(),
      ...options.genesisHeader,
    },
  })
}

function nextBlockContext(
  context: QRLRunTxContext | undefined,
  latest: blockQrl.QRLBlock,
): QRLRunTxContext {
  return {
    chainId: context?.chainId ?? 1n,
    baseFee: context?.baseFee ?? latest.header.baseFee,
    coinbase: context?.coinbase ?? latest.header.coinbase,
    blockNumber: latest.header.number + 1n,
    timestamp: context?.timestamp ?? latest.header.timestamp + 1n,
    gasLimit: context?.gasLimit ?? latest.header.gasLimit,
    noBaseFee: context?.noBaseFee ?? true,
  }
}
