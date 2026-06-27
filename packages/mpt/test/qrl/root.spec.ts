import { keccak_256 } from '@noble/hashes/sha3.js'
import { RLP } from '@theqrl/rlp'
import { bytesToHex, hexToBytes } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { MerklePatriciaTrie } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

const utf8ToBytes = (value: string): Uint8Array => new TextEncoder().encode(value)

describe('QRL trie root helper', () => {
  it('returns the canonical empty trie root', () => {
    const trie = new MerklePatriciaTrie()

    assert.strictEqual(
      bytesToHex(trie.root()),
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    )
  })

  it('derives deterministic roots from sorted key/value entries', async () => {
    const trie = new MerklePatriciaTrie()
    await trie.put(utf8ToBytes('receipt:2'), utf8ToBytes('second'))
    await trie.put(utf8ToBytes('receipt:1'), utf8ToBytes('first'))

    const expected = keccak_256(
      RLP.encode([
        [utf8ToBytes('receipt:1'), utf8ToBytes('first')],
        [utf8ToBytes('receipt:2'), utf8ToBytes('second')],
      ]),
    )

    assert.strictEqual(bytesToHex(trie.root()), bytesToHex(expected))
  })

  it('copies inserted values before storing them', async () => {
    const trie = new MerklePatriciaTrie()
    const value = utf8ToBytes('mutable')

    await trie.put(utf8ToBytes('key'), value)
    const beforeMutation = bytesToHex(trie.root())
    value.fill(0)

    assert.strictEqual(bytesToHex(trie.root()), beforeMutation)
  })

  it('overwrites existing keys', async () => {
    const trie = new MerklePatriciaTrie()
    const key = hexToBytes('0x01' as PrefixedHexString)

    await trie.put(key, utf8ToBytes('first'))
    const firstRoot = bytesToHex(trie.root())
    await trie.put(key, utf8ToBytes('second'))

    assert.notStrictEqual(bytesToHex(trie.root()), firstRoot)
    assert.strictEqual(
      bytesToHex(trie.root()),
      bytesToHex(keccak_256(RLP.encode([[key, utf8ToBytes('second')]]))),
    )
  })
})
