# QRL EVM

In-memory QRL execution components: interpreter, stack, memory, gas accounting, messages, and execution results.

## Usage

```ts
import { qrl } from '@ethereumjs/evm'

const evm = new qrl.QRLEVM()
```

## Development

Run package tests with:

```sh
npm test --workspace @ethereumjs/evm
```

Run type checks with:

```sh
npm run tsc --workspace @ethereumjs/evm
```
