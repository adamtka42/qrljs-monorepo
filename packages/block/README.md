# QRL Block

QRL block, header, receipt, log, bloom, and local transaction/receipt root helpers.

## Usage

```ts
import { qrl } from '@theqrl/block'

const header = new qrl.QRLBlockHeader({ number: 1n })
const block = new qrl.QRLBlock({ header })
```

## Development

Run package tests with:

```sh
npm test --workspace @theqrl/block
```

Run type checks with:

```sh
npm run tsc --workspace @theqrl/block
```
