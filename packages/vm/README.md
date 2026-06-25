# QRL VM

Local in-memory QRL VM/provider layer built on QRL block, transaction, state-manager, and EVM packages.

## Usage

```ts
import { qrl } from '@ethereumjs/vm'

const vm = new qrl.QRLVM()
```

## Development

Run package tests with:

```sh
npm test --workspace @ethereumjs/vm
```

Run type checks with:

```sh
npm run tsc --workspace @ethereumjs/vm
```
