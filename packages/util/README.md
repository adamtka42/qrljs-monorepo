# QRL Utilities

Minimal byte, error, hex, bigint, and QRL 64-byte address utilities used by the local execution stack.

## Usage

```ts
import { qrl, hexToBytes, bytesToHex } from '@theqrl/util'

const address = qrl.QRLAddress.zero()
```

## Development

Run package tests with:

```sh
npm test --workspace @theqrl/util
```

Run type checks with:

```sh
npm run tsc --workspace @theqrl/util
```
