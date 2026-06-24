import { bytesToHex, qrl as utilQrl } from '@ethereumjs/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

function address(byte: number): utilQrl.QRLAddress {
  return utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(byte))
}

describe('QRLBlockHeader', () => {
  it('uses deterministic defaults and hash copies', () => {
    const first = new qrl.QRLBlockHeader()
    const second = new qrl.QRLBlockHeader()
    const firstHash = first.hash()

    firstHash.fill(9)

    assert.strictEqual(first.number, 0n)
    assert.strictEqual(first.timestamp, 0n)
    assert.strictEqual(first.hash().length, 32)
    assert.strictEqual(
      first.toJSON().transactionsRoot,
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    )
    assert.strictEqual(
      first.toJSON().receiptsRoot,
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    )
    assert.strictEqual(bytesToHex(first.hash()), bytesToHex(second.hash()))
    assert.notStrictEqual(bytesToHex(first.hash()), bytesToHex(firstHash))
  })

  it('accepts custom local block context', () => {
    const header = new qrl.QRLBlockHeader({
      parentHash: new Uint8Array(32).fill(1),
      coinbase: address(2),
      number: 3n,
      timestamp: 4n,
      gasLimit: 5n,
      gasUsed: 6n,
      baseFee: 7n,
      extraData: new Uint8Array([8]),
    })
    const json = header.toJSON()

    assert.strictEqual(json.number, '0x3')
    assert.strictEqual(json.timestamp, '0x4')
    assert.strictEqual(json.gasLimit, '0x5')
    assert.strictEqual(json.gasUsed, '0x6')
    assert.strictEqual(json.baseFeePerGas, '0x7')
    assert.strictEqual(json.extraData, '0x08')
    assert.strictEqual(json.miner, address(2).toString())
  })

  it('validates fixed-width fields', () => {
    assert.throws(() => new qrl.QRLBlockHeader({ parentHash: new Uint8Array(31) }))
    assert.throws(() => new qrl.QRLBlockHeader({ logsBloom: new Uint8Array(255) }))
    assert.throws(() => new qrl.QRLBlockHeader({ number: -1n }))
  })
})
