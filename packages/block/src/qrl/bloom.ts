import { keccak_256 } from '@noble/hashes/sha3.js'

import { QRL_LOGS_BLOOM_BYTES } from './constants.ts'
import { qrlZeroBloom, validateBloom } from './utils.ts'

import type { QRLLog } from './log.ts'

export interface QRLBloomBacked {
  logsBloom: Uint8Array
}

export function createQRLLogsBloom(logs: readonly QRLLog[]): Uint8Array {
  const bloom = qrlZeroBloom()
  for (const log of logs) {
    addToBloom(bloom, log.address.toBytes())
    for (const topic of log.topics) {
      addToBloom(bloom, topic)
    }
  }
  return bloom
}

export function createQRLReceiptsBloom(receipts: readonly QRLBloomBacked[]): Uint8Array {
  return mergeQRLBlooms(receipts.map((receipt) => receipt.logsBloom))
}

export function mergeQRLBlooms(blooms: readonly Uint8Array[]): Uint8Array {
  const out = qrlZeroBloom()
  for (const [index, bloom] of blooms.entries()) {
    const validated = validateBloom(`QRL bloom ${index}`, bloom)
    for (let i = 0; i < QRL_LOGS_BLOOM_BYTES; i++) {
      out[i] |= validated[i]
    }
  }
  return out
}

function addToBloom(bloom: Uint8Array, data: Uint8Array): void {
  const hash = keccak_256(data)
  setBloomBit(bloom, hash[0], hash[1])
  setBloomBit(bloom, hash[2], hash[3])
  setBloomBit(bloom, hash[4], hash[5])
}

function setBloomBit(bloom: Uint8Array, high: number, low: number): void {
  const bit = ((high << 8) | low) & 0x7ff
  const byteIndex = QRL_LOGS_BLOOM_BYTES - (bit >> 3) - 1
  bloom[byteIndex] |= 1 << (low & 0x07)
}
