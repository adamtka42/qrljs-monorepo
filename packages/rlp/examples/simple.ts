import assert from 'assert'
import { RLP } from '@theqrl/rlp'

const nestedList = [[], [[]], [[], [[]]]]
const encoded = RLP.encode(nestedList)
const decoded = RLP.decode(encoded)

assert.deepStrictEqual(decoded, nestedList, 'decoded output does not match original')
