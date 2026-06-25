# QRL Trie Root Helper

Minimal local trie-root helper used by QRL block root generation. It intentionally exposes only the surface required by the QRL local execution stack.

## Usage

```ts
import { MerklePatriciaTrie } from '@ethereumjs/mpt'

const trie = new MerklePatriciaTrie()
await trie.put(new Uint8Array([0]), new Uint8Array([1]))
const root = trie.root()
```

## Development

Run package tests with:

```sh
npm test --workspace @ethereumjs/mpt
```

Run type checks with:

```sh
npm run tsc --workspace @ethereumjs/mpt
```
