import { bytesToBigInt, bytesToHex, concatBytes } from '@theqrl/util'

const payload = concatBytes(new Uint8Array([1, 2]), new Uint8Array([3]))
const value = bytesToBigInt(payload)

process.stdout.write(bytesToHex(payload) + ' ' + value + '\n')
