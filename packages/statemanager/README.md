# QRL State Manager

In-memory QRL account, storage, and genesis state management for local execution.

## Usage

```ts
import { qrl } from '@ethereumjs/statemanager'

const state = new qrl.QRLStateManager()
```

## Development

Run package tests with:

```sh
npm test --workspace @ethereumjs/statemanager
```

Run type checks with:

```sh
npm run tsc --workspace @ethereumjs/statemanager
```
