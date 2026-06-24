import type { qrl } from '@ethereumjs/util'

import { createQRLLogsBloom } from './bloom.ts'
import { qrlBlockError } from './errors.ts'
import type { QRLLog } from './log.ts'
import {
  copyBytes,
  hex,
  optionalHex,
  optionalNumberQuantity,
  optionalQuantity,
  quantity,
  validateBloom,
  validateHash,
} from './utils.ts'

import type { QRLJSONHex } from './utils.ts'

export interface QRLReceiptData {
  txHash: Uint8Array
  blockHash?: Uint8Array
  blockNumber?: bigint
  transactionIndex?: number
  from: qrl.QRLAddress
  to?: qrl.QRLAddress
  createdAddress?: qrl.QRLAddress
  status: 0 | 1
  gasUsed: bigint
  cumulativeGasUsed: bigint
  effectiveGasPrice?: bigint
  logs?: QRLLog[]
  logsBloom?: Uint8Array
}

export interface QRLReceiptJSON {
  transactionHash: QRLJSONHex
  blockHash?: QRLJSONHex
  blockNumber?: QRLJSONHex
  transactionIndex?: QRLJSONHex
  from: string
  to?: string
  contractAddress?: string
  status: QRLJSONHex
  gasUsed: QRLJSONHex
  cumulativeGasUsed: QRLJSONHex
  effectiveGasPrice?: QRLJSONHex
  logsBloom: QRLJSONHex
  logs: ReturnType<QRLLog['toJSON']>[]
}

export class QRLReceipt {
  public readonly blockNumber?: bigint
  public readonly transactionIndex?: number
  public readonly from: qrl.QRLAddress
  public readonly to?: qrl.QRLAddress
  public readonly createdAddress?: qrl.QRLAddress
  public readonly status: 0 | 1
  public readonly gasUsed: bigint
  public readonly cumulativeGasUsed: bigint
  public readonly effectiveGasPrice?: bigint

  private readonly _txHash: Uint8Array
  private readonly _blockHash?: Uint8Array
  private readonly _logs: readonly QRLLog[]
  private readonly _logsBloom: Uint8Array

  public constructor(data: QRLReceiptData) {
    this._txHash = validateHash('QRL receipt txHash', data.txHash)
    this._blockHash =
      data.blockHash === undefined
        ? undefined
        : validateHash('QRL receipt blockHash', data.blockHash)
    this.blockNumber = data.blockNumber
    this.transactionIndex = data.transactionIndex
    this.from = data.from
    this.to = data.to
    this.createdAddress = data.createdAddress
    this.status = data.status
    this.gasUsed = data.gasUsed
    this.cumulativeGasUsed = data.cumulativeGasUsed
    this.effectiveGasPrice = data.effectiveGasPrice
    this._logs = Object.freeze([...(data.logs ?? [])])
    this._logsBloom =
      data.logsBloom === undefined
        ? createQRLLogsBloom(this._logs)
        : validateBloom('QRL receipt logsBloom', data.logsBloom)

    if (this.status !== 0 && this.status !== 1) {
      throw qrlBlockError(`Invalid QRL receipt status=${this.status}`)
    }
    if (this.gasUsed < 0n || this.cumulativeGasUsed < 0n) {
      throw qrlBlockError('QRL receipt gas values must be non-negative')
    }
    if (this.effectiveGasPrice !== undefined && this.effectiveGasPrice < 0n) {
      throw qrlBlockError('QRL receipt effective gas price must be non-negative')
    }

    Object.freeze(this)
  }

  public get txHash(): Uint8Array {
    return copyBytes(this._txHash)
  }

  public get blockHash(): Uint8Array | undefined {
    return this._blockHash === undefined ? undefined : copyBytes(this._blockHash)
  }

  public get logs(): readonly QRLLog[] {
    return Object.freeze([...this._logs])
  }

  public get logsBloom(): Uint8Array {
    return copyBytes(this._logsBloom)
  }

  public withInclusion(data: {
    blockHash: Uint8Array
    blockNumber: bigint
    transactionIndex: number
    cumulativeGasUsed?: bigint
    logIndexStart?: number
  }): QRLReceipt {
    let logIndex = data.logIndexStart ?? 0
    const includedLogs = this._logs.map((log) =>
      log.withInclusion({
        blockHash: data.blockHash,
        blockNumber: data.blockNumber,
        txHash: this._txHash,
        txIndex: data.transactionIndex,
        index: logIndex++,
      }),
    )
    return new QRLReceipt({
      txHash: this._txHash,
      blockHash: data.blockHash,
      blockNumber: data.blockNumber,
      transactionIndex: data.transactionIndex,
      from: this.from,
      to: this.to,
      createdAddress: this.createdAddress,
      status: this.status,
      gasUsed: this.gasUsed,
      cumulativeGasUsed: data.cumulativeGasUsed ?? this.cumulativeGasUsed,
      effectiveGasPrice: this.effectiveGasPrice,
      logs: includedLogs,
      logsBloom: this._logsBloom,
    })
  }

  public toJSON(): QRLReceiptJSON {
    return {
      transactionHash: hex(this._txHash),
      blockHash: optionalHex(this._blockHash),
      blockNumber: optionalQuantity(this.blockNumber),
      transactionIndex: optionalNumberQuantity(this.transactionIndex),
      from: this.from.toString(),
      to: this.to?.toString(),
      contractAddress: this.createdAddress?.toString(),
      status: quantity(BigInt(this.status)),
      gasUsed: quantity(this.gasUsed),
      cumulativeGasUsed: quantity(this.cumulativeGasUsed),
      effectiveGasPrice: optionalQuantity(this.effectiveGasPrice),
      logsBloom: hex(this._logsBloom),
      logs: this._logs.map((log) => log.toJSON()),
    }
  }
}
