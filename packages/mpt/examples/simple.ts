import { MerklePatriciaTrie } from '@theqrl/mpt'
import { bytesToHex } from '@theqrl/util'

const utf8ToBytes = (value: string): Uint8Array => new TextEncoder().encode(value)

const trie = new MerklePatriciaTrie()

await trie.put(utf8ToBytes('qrl:block:1'), utf8ToBytes('root input'))

process.stdout.write(bytesToHex(trie.root()) + '\n')
