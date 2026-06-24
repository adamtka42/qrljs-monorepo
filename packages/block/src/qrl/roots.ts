import { MerklePatriciaTrie } from '@ethereumjs/mpt'
import { RLP } from '@ethereumjs/rlp'
import { qrl as txQrl } from '@ethereumjs/tx'
import { concatBytes } from '@ethereumjs/util'

import { type QRLLog } from './log.ts'
import { type QRLReceipt } from './receipt.ts'
import { bigintToRLP, qrlEmptyRootHash } from './utils.ts'

import type { Input } from '@ethereumjs/rlp'

export async function genQRLTransactionsRoot(
  transactions: readonly txQrl.QRLDynamicFeeTransaction[],
): Promise<Uint8Array> {
  return genQRLTrieRoot(transactions.map((tx) => tx.serialize()))
}

export async function genQRLReceiptsRoot(receipts: readonly QRLReceipt[]): Promise<Uint8Array> {
  return genQRLTrieRoot(receipts.map(encodeQRLReceiptForRoot))
}

async function genQRLTrieRoot(values: readonly Uint8Array[]): Promise<Uint8Array> {
  if (values.length === 0) {
    return qrlEmptyRootHash()
  }

  const trie = new MerklePatriciaTrie()
  for (const [index, value] of values.entries()) {
    await trie.put(RLP.encode(index), value)
  }
  return trie.root()
}

function encodeQRLReceiptForRoot(receipt: QRLReceipt): Uint8Array {
  return concatBytes(
    new Uint8Array([txQrl.QRL_DYNAMIC_FEE_TX_TYPE]),
    RLP.encode([
      receipt.status === 1 ? new Uint8Array([1]) : new Uint8Array(0),
      bigintToRLP(receipt.cumulativeGasUsed),
      receipt.logsBloom,
      receipt.logs.map(encodeQRLLogForRoot),
    ] satisfies Input),
  )
}

function encodeQRLLogForRoot(log: QRLLog): Input {
  return [log.address.toBytes(), log.topics.map((topic) => new Uint8Array(topic)), log.data]
}
