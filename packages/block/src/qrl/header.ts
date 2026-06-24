import { RLP } from '@ethereumjs/rlp'
import { qrl } from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'

import { qrlBlockError } from './errors.ts'
import {
  bigintToRLP,
  copyBytes,
  hex,
  optionalHex,
  optionalQuantity,
  qrlEmptyRootHash,
  qrlZeroBloom,
  qrlZeroHash,
  quantity,
  validateBloom,
  validateHash,
} from './utils.ts'

import type { Input } from '@ethereumjs/rlp'
import type { QRLJSONHex } from './utils.ts'

export interface QRLBlockHeaderData {
  parentHash?: Uint8Array
  number?: bigint
  timestamp?: bigint
  gasLimit?: bigint
  gasUsed?: bigint
  baseFee?: bigint
  coinbase?: qrl.QRLAddress
  transactionsRoot?: Uint8Array
  receiptsRoot?: Uint8Array
  stateRoot?: Uint8Array
  logsBloom?: Uint8Array
  random?: Uint8Array
  extraData?: Uint8Array
  withdrawalsRoot?: Uint8Array
}

export interface QRLBlockHeaderJSON {
  parentHash: QRLJSONHex
  miner: string
  stateRoot: QRLJSONHex
  transactionsRoot: QRLJSONHex
  receiptsRoot: QRLJSONHex
  logsBloom: QRLJSONHex
  number: QRLJSONHex
  gasLimit: QRLJSONHex
  gasUsed: QRLJSONHex
  timestamp: QRLJSONHex
  extraData: QRLJSONHex
  prevRandao: QRLJSONHex
  baseFeePerGas?: QRLJSONHex
  withdrawalsRoot?: QRLJSONHex
  hash: QRLJSONHex
}

export class QRLBlockHeader {
  public readonly parentHash: Uint8Array
  public readonly number: bigint
  public readonly timestamp: bigint
  public readonly gasLimit: bigint
  public readonly gasUsed: bigint
  public readonly baseFee: bigint
  public readonly coinbase: qrl.QRLAddress
  public readonly transactionsRoot: Uint8Array
  public readonly receiptsRoot: Uint8Array
  public readonly stateRoot: Uint8Array
  public readonly logsBloom: Uint8Array
  public readonly random: Uint8Array
  public readonly extraData: Uint8Array
  public readonly withdrawalsRoot?: Uint8Array

  private readonly cachedHash: Uint8Array

  public constructor(data: QRLBlockHeaderData = {}) {
    this.parentHash = validateHash('QRL header parentHash', data.parentHash ?? qrlZeroHash())
    this.number = data.number ?? 0n
    this.timestamp = data.timestamp ?? 0n
    this.gasLimit = data.gasLimit ?? 0n
    this.gasUsed = data.gasUsed ?? 0n
    this.baseFee = data.baseFee ?? 0n
    this.coinbase = data.coinbase ?? qrl.QRLAddress.zero()
    this.transactionsRoot = validateHash(
      'QRL header transactionsRoot',
      data.transactionsRoot ?? qrlEmptyRootHash(),
    )
    this.receiptsRoot = validateHash(
      'QRL header receiptsRoot',
      data.receiptsRoot ?? qrlEmptyRootHash(),
    )
    this.stateRoot = validateHash('QRL header stateRoot', data.stateRoot ?? qrlZeroHash())
    this.logsBloom =
      data.logsBloom === undefined
        ? qrlZeroBloom()
        : validateBloom('QRL header logsBloom', data.logsBloom)
    this.random = validateHash('QRL header random', data.random ?? qrlZeroHash())
    this.extraData = copyBytes(data.extraData ?? new Uint8Array(0))
    this.withdrawalsRoot =
      data.withdrawalsRoot === undefined
        ? undefined
        : validateHash('QRL header withdrawalsRoot', data.withdrawalsRoot)

    for (const [name, value] of [
      ['number', this.number],
      ['timestamp', this.timestamp],
      ['gasLimit', this.gasLimit],
      ['gasUsed', this.gasUsed],
      ['baseFee', this.baseFee],
    ] as const) {
      if (value < 0n) {
        throw qrlBlockError(`QRL header ${name} must be non-negative`)
      }
    }

    this.cachedHash = keccak_256(RLP.encode(this.raw() as Input))
    Object.freeze(this)
  }

  public raw(): Input[] {
    const fields: Input[] = [
      this.parentHash,
      this.coinbase.toBytes(),
      this.stateRoot,
      this.transactionsRoot,
      this.receiptsRoot,
      this.logsBloom,
      bigintToRLP(this.number),
      bigintToRLP(this.gasLimit),
      bigintToRLP(this.gasUsed),
      bigintToRLP(this.timestamp),
      this.extraData,
      this.random,
      bigintToRLP(this.baseFee),
    ]
    if (this.withdrawalsRoot !== undefined) {
      fields.push(this.withdrawalsRoot)
    }
    return fields
  }

  public hash(): Uint8Array {
    return copyBytes(this.cachedHash)
  }

  public toJSON(): QRLBlockHeaderJSON {
    return {
      parentHash: hex(this.parentHash),
      miner: this.coinbase.toString(),
      stateRoot: hex(this.stateRoot),
      transactionsRoot: hex(this.transactionsRoot),
      receiptsRoot: hex(this.receiptsRoot),
      logsBloom: hex(this.logsBloom),
      number: quantity(this.number),
      gasLimit: quantity(this.gasLimit),
      gasUsed: quantity(this.gasUsed),
      timestamp: quantity(this.timestamp),
      extraData: hex(this.extraData),
      prevRandao: hex(this.random),
      baseFeePerGas: optionalQuantity(this.baseFee),
      withdrawalsRoot: optionalHex(this.withdrawalsRoot),
      hash: hex(this.cachedHash),
    }
  }
}
