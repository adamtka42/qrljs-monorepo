import type { qrl } from '@ethereumjs/util'

import {
  copyBytes,
  hex,
  optionalHex,
  optionalNumberQuantity,
  optionalQuantity,
  validateHash,
  validateLogTopic,
} from './utils.ts'

import type { QRLJSONHex } from './utils.ts'

export interface QRLLogData {
  address: qrl.QRLAddress
  topics?: Uint8Array[]
  data?: Uint8Array
  blockNumber?: bigint
  txHash?: Uint8Array
  txIndex?: number
  blockHash?: Uint8Array
  index?: number
  removed?: boolean
}

export interface QRLLogJSON {
  address: string
  topics: QRLJSONHex[]
  data: QRLJSONHex
  blockNumber?: QRLJSONHex
  transactionHash?: QRLJSONHex
  transactionIndex?: QRLJSONHex
  blockHash?: QRLJSONHex
  logIndex?: QRLJSONHex
  removed: boolean
}

export class QRLLog {
  public readonly address: qrl.QRLAddress
  public readonly blockNumber?: bigint
  public readonly txIndex?: number
  public readonly index?: number
  public readonly removed: boolean

  private readonly _topics: readonly Uint8Array[]
  private readonly _data: Uint8Array
  private readonly _txHash?: Uint8Array
  private readonly _blockHash?: Uint8Array

  public constructor(data: QRLLogData) {
    this.address = data.address
    this._topics = Object.freeze(
      (data.topics ?? []).map((topic, index) => validateLogTopic(`QRL log topic ${index}`, topic)),
    )
    this._data = copyBytes(data.data ?? new Uint8Array(0))
    this.blockNumber = data.blockNumber
    this._txHash =
      data.txHash === undefined ? undefined : validateHash('QRL log txHash', data.txHash)
    this.txIndex = data.txIndex
    this._blockHash =
      data.blockHash === undefined ? undefined : validateHash('QRL log blockHash', data.blockHash)
    this.index = data.index
    this.removed = data.removed ?? false

    Object.freeze(this)
  }

  public get topics(): readonly Uint8Array[] {
    return Object.freeze(this._topics.map(copyBytes))
  }

  public get data(): Uint8Array {
    return copyBytes(this._data)
  }

  public get txHash(): Uint8Array | undefined {
    return this._txHash === undefined ? undefined : copyBytes(this._txHash)
  }

  public get blockHash(): Uint8Array | undefined {
    return this._blockHash === undefined ? undefined : copyBytes(this._blockHash)
  }

  public withInclusion(data: {
    blockNumber: bigint
    txHash: Uint8Array
    txIndex: number
    blockHash: Uint8Array
    index: number
  }): QRLLog {
    return new QRLLog({
      address: this.address,
      topics: this._topics.map(copyBytes),
      data: this._data,
      blockNumber: data.blockNumber,
      txHash: data.txHash,
      txIndex: data.txIndex,
      blockHash: data.blockHash,
      index: data.index,
      removed: this.removed,
    })
  }

  public toJSON(): QRLLogJSON {
    return {
      address: this.address.toString(),
      topics: this._topics.map(hex),
      data: hex(this._data),
      blockNumber: optionalQuantity(this.blockNumber),
      transactionHash: optionalHex(this._txHash),
      transactionIndex: optionalNumberQuantity(this.txIndex),
      blockHash: optionalHex(this._blockHash),
      logIndex: optionalNumberQuantity(this.index),
      removed: this.removed,
    }
  }
}
