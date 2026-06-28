import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRL gas accounting helpers', () => {
  it('calculates 64-byte gas words', () => {
    assert.strictEqual(qrl.qrlWordGas(0), 0n)
    assert.strictEqual(qrl.qrlWordGas(1), 1n)
    assert.strictEqual(qrl.qrlWordGas(64), 1n)
    assert.strictEqual(qrl.qrlWordGas(65), 2n)
  })

  it('calculates quadratic QRL memory gas totals and expansion deltas', () => {
    assert.strictEqual(qrl.qrlMemoryTotalGas(0), 0n)
    assert.strictEqual(qrl.qrlMemoryTotalGas(64), 3n)
    assert.strictEqual(qrl.qrlMemoryTotalGas(128), 6n)
    assert.strictEqual(qrl.qrlMemoryTotalGas(1024), 48n)
    assert.strictEqual(qrl.qrlMemoryExpansionGas(0, 64), 3n)
    assert.strictEqual(qrl.qrlMemoryExpansionGas(64, 128), 3n)
    assert.strictEqual(qrl.qrlMemoryExpansionGas(128, 64), 0n)
    assert.strictEqual(qrl.qrlMemoryExpansionGas(0, 1536), 73n)
  })

  it('rejects invalid memory gas sizes', () => {
    assert.throws(() => qrl.qrlWordGas(-1), qrl.QRLVMError)
    assert.throws(() => qrl.qrlMemoryTotalGas(qrl.QRL_MAX_MEMORY_GAS_SIZE + 1n), qrl.QRLVMError)
  })

  it('maps QRL static opcode gas from go-qrl', () => {
    assert.strictEqual(qrl.qrlBaseGas(0x00), 0n)
    assert.strictEqual(qrl.qrlBaseGas(0x01), 3n)
    assert.strictEqual(qrl.qrlBaseGas(0x02), 5n)
    assert.strictEqual(qrl.qrlBaseGas(0x08), 8n)
    assert.strictEqual(qrl.qrlBaseGas(0x57), 10n)
    assert.strictEqual(qrl.qrlBaseGas(0x40), 20n)
    assert.strictEqual(qrl.qrlBaseGas(0x30), 2n)
    assert.strictEqual(qrl.qrlBaseGas(0x5f), 2n)
    assert.strictEqual(qrl.qrlBaseGas(0x60), 3n)
    assert.strictEqual(qrl.qrlBaseGas(0x9f), 3n)
    assert.strictEqual(qrl.qrlBaseGas(0xa0), 3n)
    assert.strictEqual(qrl.qrlBaseGas(0xbf), 3n)
    assert.strictEqual(qrl.qrlBaseGas(0x20), 30n)
    assert.strictEqual(qrl.qrlBaseGas(0x31), 100n)
    assert.strictEqual(qrl.qrlBaseGas(0x3c), 100n)
    assert.strictEqual(qrl.qrlBaseGas(0xf1), 100n)
    assert.strictEqual(qrl.qrlBaseGas(0xfa), 100n)
    assert.strictEqual(qrl.qrlBaseGas(0xf0), 32000n)
    assert.strictEqual(qrl.qrlBaseGas(0xf5), 32000n)
    assert.strictEqual(qrl.qrlBaseGas(0xc0), 0n)
    assert.strictEqual(qrl.qrlBaseGas(0xf3), 0n)
    assert.strictEqual(qrl.qrlBaseGas(0xfd), 0n)
    assert.throws(() => qrl.qrlBaseGas(0xf2), qrl.QRLVMError)
    assert.throws(() => qrl.qrlBaseGas(0xff), qrl.QRLVMError)
  })

  it('calculates dynamic gas components', () => {
    assert.strictEqual(qrl.qrlCopyGas(0), 0n)
    assert.strictEqual(qrl.qrlCopyGas(1), 3n)
    assert.strictEqual(qrl.qrlCopyGas(65), 6n)
    assert.strictEqual(qrl.qrlKeccak256DynamicGas(1), 6n)
    assert.strictEqual(qrl.qrlKeccak256DynamicGas(65), 12n)
    assert.strictEqual(qrl.qrlLogDynamicGas(2, 10), 1205n)
    assert.strictEqual(qrl.qrlCreateInitCodeGas(65), 4n)
    assert.strictEqual(qrl.qrlCreate2InitCodeGas(65), 16n)
    assert.strictEqual(qrl.qrlExpDynamicGas(0), 10n)
    assert.strictEqual(qrl.qrlExpDynamicGas(3), 160n)
  })

  it('combines dynamic gas by opcode without executing it', () => {
    assert.strictEqual(qrl.qrlDynamicGas(0x20, { hashSizeBytes: 65, memoryTargetBytes: 64 }), 15n)
    assert.strictEqual(qrl.qrlDynamicGas(0xc2, { logDataSizeBytes: 10 }), 1205n)
    assert.strictEqual(qrl.qrlDynamicGas(0xf5, { initCodeSizeBytes: 65 }), 16n)
    assert.strictEqual(
      qrl.qrlDynamicGas(0x52, { memoryCurrentBytes: 64, memoryTargetBytes: 128 }),
      3n,
    )
  })

  it('calculates QRL call dynamic gas and child call gas', () => {
    assert.strictEqual(
      qrl.qrlCallDynamicGas({
        memoryCurrentBytes: 0,
        inputOffset: 0,
        inputSizeBytes: 64,
        outputOffset: 64,
        outputSizeBytes: 64,
        warmAccess: false,
      }),
      2506n,
    )
    assert.strictEqual(
      qrl.qrlCallDynamicGas({
        memoryCurrentBytes: 128,
        inputOffset: 0,
        inputSizeBytes: 64,
        outputOffset: 64,
        outputSizeBytes: 64,
        transfersValue: true,
        createsAccount: true,
        warmAccess: true,
      }),
      34000n,
    )
    assert.strictEqual(qrl.qrlChildCallGas(10000n, 100n, 5000n), 5000n)
    assert.strictEqual(qrl.qrlChildCallGas(10000n, 100n, 9900n), 9746n)
  })
})
