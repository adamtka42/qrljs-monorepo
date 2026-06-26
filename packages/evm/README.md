# QRL EVM

In-memory QRL execution components: interpreter, stack, memory, gas accounting, messages, and execution results.

## Usage

```ts
import { qrl } from '@theqrl/evm'

const evm = new qrl.QRLEVM()
```

## Development

Run package tests with:

```sh
npm test --workspace @theqrl/evm
```

Run type checks with:

```sh
npm run tsc --workspace @theqrl/evm
```
