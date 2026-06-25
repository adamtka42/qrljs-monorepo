# RLP

RLP encoding and decoding helpers retained as a generic serialization dependency for the QRL local execution stack.

## Usage

```ts
import { RLP } from '@ethereumjs/rlp'

const encoded = RLP.encode([new Uint8Array([1])])
```

## Development

Run package tests with:

```sh
npm test --workspace @ethereumjs/rlp
```

Run type checks with:

```sh
npm run tsc --workspace @ethereumjs/rlp
```
