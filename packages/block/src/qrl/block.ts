import type { qrl as txQrl } from '@theqrl/tx'

import { createQRLReceiptsBloom } from './bloom.ts'
import { QRLBlockHeader, type QRLBlockHeaderData, type QRLBlockHeaderJSON } from './header.ts'
import { hex } from './utils.ts'

import type { QRLReceipt, QRLReceiptJSON } from './receipt.ts'
import type { QRLJSONHex } from './utils.ts'

export interface QRLBlockData {
  header?: QRLBlockHeader | QRLBlockHeaderData
  transactions?: txQrl.QRLDynamicFeeTransaction[]
  receipts?: QRLReceipt[]
}

export interface QRLBlockJSON {
  hash: QRLJSONHex
  header: QRLBlockHeaderJSON
  transactions: ReturnType<txQrl.QRLDynamicFeeTransaction['toJSON']>[]
  receipts: QRLReceiptJSON[]
}

export class QRLBlock {
  public readonly header: QRLBlockHeader
  public readonly transactions: readonly txQrl.QRLDynamicFeeTransaction[]
  public readonly receipts: readonly QRLReceipt[]

  public constructor(data: QRLBlockData = {}) {
    this.transactions = Object.freeze([...(data.transactions ?? [])])
    this.receipts = Object.freeze([...(data.receipts ?? [])])
    this.header = normalizeHeader(data.header, this.receipts)

    Object.freeze(this)
  }

  public hash(): Uint8Array {
    return this.header.hash()
  }

  public toJSON(): QRLBlockJSON {
    return {
      hash: hex(this.hash()),
      header: this.header.toJSON(),
      transactions: this.transactions.map((tx) => tx.toJSON()),
      receipts: this.receipts.map((receipt) => receipt.toJSON()),
    }
  }
}

function normalizeHeader(
  header: QRLBlockHeader | QRLBlockHeaderData | undefined,
  receipts: readonly QRLReceipt[],
): QRLBlockHeader {
  if (header instanceof QRLBlockHeader) {
    return header
  }
  const gasUsed = receipts.at(-1)?.cumulativeGasUsed
  return new QRLBlockHeader({
    ...header,
    gasUsed: header?.gasUsed ?? gasUsed ?? 0n,
    logsBloom: header?.logsBloom ?? createQRLReceiptsBloom(receipts),
  })
}
