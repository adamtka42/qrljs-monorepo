import { keccak_256 } from '@noble/hashes/sha3.js'
import { RLP } from '@theqrl/rlp'
import { bytesToHex, hexToBytes } from '@theqrl/util'

import type { Input } from '@theqrl/rlp'
import type { PrefixedHexString } from '@theqrl/util'

const EMPTY_TRIE_ROOT = hexToBytes(
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421' as PrefixedHexString,
)
const BRANCH_NODE_LENGTH = 17
const HASH_LENGTH = 32
const TERMINATOR_NIBBLE = 16

interface TrieEntry {
  key: Uint8Array
  value: Uint8Array
}

interface NibbleEntry {
  nibbles: number[]
  value: Uint8Array
}

type TrieNode = BranchNode | ExtensionNode | LeafNode
type NodeInput = Input

interface BranchNode {
  type: 'branch'
  children: Array<TrieNode | undefined>
  value?: Uint8Array
}

interface ExtensionNode {
  type: 'extension'
  path: number[]
  child: TrieNode
}

interface LeafNode {
  type: 'leaf'
  path: number[]
  value: Uint8Array
}

/**
 * In-memory Merkle Patricia Trie root calculator compatible with go-qrl/geth trie roots.
 *
 * This class intentionally exposes only the API qrljs currently needs for block, receipt,
 * account, and storage roots. It builds a canonical Patricia trie from the inserted
 * entries whenever root() is called.
 */
export class MerklePatriciaTrie {
  readonly #entries = new Map<string, TrieEntry>()

  async put(key: Uint8Array, value: Uint8Array): Promise<void> {
    this.#entries.set(bytesToHex(key), {
      key: new Uint8Array(key),
      value: new Uint8Array(value),
    })
  }

  root(): Uint8Array {
    if (this.#entries.size === 0) {
      return new Uint8Array(EMPTY_TRIE_ROOT)
    }

    const entries = [...this.#entries.values()]
      .sort((left, right) => bytesToHex(left.key).localeCompare(bytesToHex(right.key)))
      .map((entry) => ({
        nibbles: keybytesToHex(entry.key),
        value: entry.value,
      }))

    return keccak_256(encodeNode(buildNode(entries, 0)))
  }
}

function buildNode(entries: NibbleEntry[], depth: number): TrieNode {
  if (entries.length === 1) {
    return {
      type: 'leaf',
      path: entries[0].nibbles.slice(depth),
      value: entries[0].value,
    }
  }

  const sharedPrefixLength = commonPrefixLength(entries, depth)
  if (sharedPrefixLength > 0) {
    return {
      type: 'extension',
      path: entries[0].nibbles.slice(depth, depth + sharedPrefixLength),
      child: buildNode(entries, depth + sharedPrefixLength),
    }
  }

  const children: Array<TrieNode | undefined> = new Array(BRANCH_NODE_LENGTH - 1).fill(undefined)
  let value: Uint8Array | undefined
  const groups = new Map<number, NibbleEntry[]>()

  for (const entry of entries) {
    if (entry.nibbles.length === depth) {
      value = entry.value
      continue
    }

    const nibble = entry.nibbles[depth]
    if (nibble === TERMINATOR_NIBBLE) {
      value = entry.value
      continue
    }

    const group = groups.get(nibble)
    if (group === undefined) {
      groups.set(nibble, [entry])
    } else {
      group.push(entry)
    }
  }

  for (const [nibble, group] of groups) {
    children[nibble] = buildNode(group, depth + 1)
  }

  return { type: 'branch', children, value }
}

function encodeNode(node: TrieNode): Uint8Array {
  return RLP.encode(nodeToInput(node))
}

function nodeToInput(node: TrieNode): NodeInput {
  switch (node.type) {
    case 'branch':
      return [
        ...node.children.map((child) =>
          child === undefined ? new Uint8Array(0) : nodeReference(child),
        ),
        node.value ?? new Uint8Array(0),
      ] satisfies Input
    case 'extension':
      return [compactEncode(node.path), nodeReference(node.child)] satisfies Input
    case 'leaf':
      return [compactEncode(node.path), node.value] satisfies Input
  }
}

function nodeReference(node: TrieNode): NodeInput {
  const encoded = encodeNode(node)
  return encoded.length < HASH_LENGTH ? nodeToInput(node) : keccak_256(encoded)
}

function keybytesToHex(bytes: Uint8Array): number[] {
  const nibbles: number[] = []
  for (const byte of bytes) {
    nibbles.push(byte >> 4, byte & 0x0f)
  }
  nibbles.push(TERMINATOR_NIBBLE)
  return nibbles
}

function compactEncode(path: number[]): Uint8Array {
  const nibbles = [...path]
  const hasTerminator = nibbles[nibbles.length - 1] === TERMINATOR_NIBBLE
  if (hasTerminator) {
    nibbles.pop()
  }

  const oddLength = nibbles.length % 2 === 1
  const bytes: number[] = []
  let index = 0
  let firstByte = hasTerminator ? 1 << 5 : 0
  if (oddLength) {
    firstByte |= 1 << 4
    firstByte |= nibbles[0]
    index = 1
  }
  bytes.push(firstByte)

  for (; index < nibbles.length; index += 2) {
    bytes.push((nibbles[index] << 4) | nibbles[index + 1])
  }
  return new Uint8Array(bytes)
}

function commonPrefixLength(entries: NibbleEntry[], depth: number): number {
  const first = entries[0].nibbles
  let length = 0

  while (depth + length < first.length) {
    const nibble = first[depth + length]
    for (let i = 1; i < entries.length; i++) {
      if (entries[i].nibbles[depth + length] !== nibble) {
        return length
      }
    }
    length++
  }

  return length
}
