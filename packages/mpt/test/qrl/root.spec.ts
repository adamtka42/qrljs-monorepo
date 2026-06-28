import { bytesToHex, hexToBytes } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { MerklePatriciaTrie } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

const utf8ToBytes = (value: string): Uint8Array => new TextEncoder().encode(value)

describe('QRL Merkle Patricia Trie', () => {
  it('returns the canonical empty trie root', () => {
    const trie = new MerklePatriciaTrie()

    assert.strictEqual(
      bytesToHex(trie.root()),
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    )
  })

  it('matches go-qrl for a single leaf', async () => {
    const trie = new MerklePatriciaTrie()
    await trie.put(utf8ToBytes('key'), utf8ToBytes('value'))

    assert.strictEqual(
      bytesToHex(trie.root()),
      '0x98021eec76a352d4214ee9d22f2670f3abe01d5805441249f4b70dda75a0e07a',
    )
  })

  it('matches go-qrl for sorted branch entries independent of insertion order', async () => {
    const trie = new MerklePatriciaTrie()
    await trie.put(utf8ToBytes('receipt:2'), utf8ToBytes('second'))
    await trie.put(utf8ToBytes('receipt:1'), utf8ToBytes('first'))

    assert.strictEqual(
      bytesToHex(trie.root()),
      '0xf2f6042e1b8cb2f98697b45a46b0fd5215d0f1d8a5cf5fa8a623df770e66cec8',
    )
  })

  it('copies inserted values before storing them', async () => {
    const trie = new MerklePatriciaTrie()
    const value = utf8ToBytes('mutable')

    await trie.put(utf8ToBytes('key'), value)
    const beforeMutation = bytesToHex(trie.root())
    value.fill(0)

    assert.strictEqual(bytesToHex(trie.root()), beforeMutation)
  })

  it('overwrites existing keys and matches go-qrl', async () => {
    const trie = new MerklePatriciaTrie()
    const key = hexToBytes('0x01' as PrefixedHexString)

    await trie.put(key, utf8ToBytes('first'))
    const firstRoot = bytesToHex(trie.root())
    await trie.put(key, utf8ToBytes('second'))

    assert.notStrictEqual(bytesToHex(trie.root()), firstRoot)
    assert.strictEqual(
      bytesToHex(trie.root()),
      '0x4df56fce643f9a5bd379cc079dc23111a5b7edc1e857eb81d62a6922d70d8682',
    )
  })

  it('matches go-qrl for mixed branch, extension, and leaf nodes', async () => {
    const trie = new MerklePatriciaTrie()
    await trie.put(utf8ToBytes('do'), utf8ToBytes('verb'))
    await trie.put(utf8ToBytes('dog'), utf8ToBytes('puppy'))
    await trie.put(utf8ToBytes('doge'), utf8ToBytes('coin'))
    await trie.put(utf8ToBytes('horse'), utf8ToBytes('stallion'))

    assert.strictEqual(
      bytesToHex(trie.root()),
      '0x5991bb8c6514148a29db676a14ac506cd2cd5775ace63c30a4fe457715e9ac84',
    )
  })
})
