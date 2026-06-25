import { RLP } from '@ethereumjs/rlp'
import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'

import type { PrefixedHexString } from '@ethereumjs/util'

const EMPTY_TRIE_ROOT = hexToBytes(
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421' as PrefixedHexString,
)

export class MerklePatriciaTrie {
  readonly #entries = new Map<string, Uint8Array>()

  async put(key: Uint8Array, value: Uint8Array): Promise<void> {
    this.#entries.set(bytesToHex(key), new Uint8Array(value))
  }

  root(): Uint8Array {
    if (this.#entries.size === 0) {
      return new Uint8Array(EMPTY_TRIE_ROOT)
    }

    const encodedEntries = [...this.#entries.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [hexToBytes(key as PrefixedHexString), value])

    return keccak_256(RLP.encode(encodedEntries))
  }
}
