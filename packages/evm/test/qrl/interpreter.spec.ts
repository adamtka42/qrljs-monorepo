import { qrl as utilQrl } from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

describe('QRLEVM interpreter', () => {
  it('runs arithmetic and exposes final stack', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x02, 0x60, 0x03, 0x01, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 5n)
  })

  it('returns 64-byte MSTORE data', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue.length, 64)
    assert.strictEqual(result.returnValue[63], 0x2a)
  })

  it('loads 64-byte calldata words', async () => {
    const evm = new qrl.QRLEVM()
    const data = new Uint8Array(64)
    data[63] = 0x7b
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x00, 0x35, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
      data,
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue[63], 0x7b)
  })

  it('returns revert data and reports an exception', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0x60, 0x00, 0x53, 0x60, 0x01, 0x60, 0x00, 0xfd]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMRevert)
    assert.deepEqual([...result.returnValue], [0x2a])
  })

  it('handles valid and invalid jumps', async () => {
    const evm = new qrl.QRLEVM()
    const valid = await evm.runCode({
      code: new Uint8Array([0x60, 0x03, 0x56, 0x5b, 0x60, 0x01, 0x00]),
    })
    const invalid = await evm.runCode({
      code: new Uint8Array([0x60, 0x04, 0x56, 0x5b, 0x00]),
    })

    assert.isUndefined(valid.exceptionError)
    assert.strictEqual(valid.stack?.pop().toBigInt(), 1n)
    assert.instanceOf(invalid.exceptionError, qrl.QRLVMError)
  })

  it('supports QRL PUSH33 through PUSH64 opcodes', async () => {
    const evm = new qrl.QRLEVM()
    const immediate = Uint8Array.from(Array.from({ length: 33 }, (_, index) => index + 1))
    const result = await evm.runCode({
      code: Uint8Array.from([0x80, ...immediate, 0x60, 0x00, 0x52, 0x60, 0x40, 0x60, 0x00, 0xf3]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue.length, 64)
    assert.deepEqual([...result.returnValue.slice(0, 31)], new Array(31).fill(0))
    assert.deepEqual([...result.returnValue.slice(31)], [...immediate])
  })

  it('right-pads truncated QRL PUSH immediate bytes', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x61, 0x01]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0x0100n)
  })

  it('uses QRL opcode ranges for DUP and SWAP', async () => {
    const evm = new qrl.QRLEVM()
    const dup = await evm.runCode({
      code: new Uint8Array([0x60, 0x2a, 0xa0, 0x00]),
    })
    const swap = await evm.runCode({
      code: new Uint8Array([0x60, 0x01, 0x60, 0x02, 0xb0, 0x00]),
    })

    assert.isUndefined(dup.exceptionError)
    assert.strictEqual(dup.stack?.pop().toBigInt(), 0x2an)
    assert.strictEqual(dup.stack?.pop().toBigInt(), 0x2an)
    assert.isUndefined(swap.exceptionError)
    assert.strictEqual(swap.stack?.pop().toBigInt(), 0x01n)
    assert.strictEqual(swap.stack?.pop().toBigInt(), 0x02n)
  })

  it('supports QRVM arithmetic opcodes needed by Hyperion output', async () => {
    const evm = new qrl.QRLEVM()
    const exp = await evm.runCode({
      code: new Uint8Array([0x60, 0x0a, 0x60, 0x02, 0x0a, 0x00]),
    })
    const addmod = await evm.runCode({
      code: new Uint8Array([0x60, 0x0a, 0x60, 0x08, 0x60, 0x07, 0x08, 0x00]),
    })
    const mulmod = await evm.runCode({
      code: new Uint8Array([0x60, 0x0a, 0x60, 0x08, 0x60, 0x07, 0x09, 0x00]),
    })
    const signedLt = await evm.runCode({
      code: new Uint8Array([0x60, 0x01, 0x60, 0xff, 0x60, 0x00, 0x0b, 0x12, 0x00]),
    })

    assert.isUndefined(exp.exceptionError)
    assert.strictEqual(exp.stack?.pop().toBigInt(), 1024n)
    assert.isUndefined(addmod.exceptionError)
    assert.strictEqual(addmod.stack?.pop().toBigInt(), 5n)
    assert.isUndefined(mulmod.exceptionError)
    assert.strictEqual(mulmod.stack?.pop().toBigInt(), 6n)
    assert.isUndefined(signedLt.exceptionError)
    assert.strictEqual(signedLt.stack?.pop().toBigInt(), 1n)
  })

  it('supports QRVM hash and local environment opcodes', async () => {
    const blockHash = new Uint8Array(32)
    blockHash[31] = 0xab
    const evm = new qrl.QRLEVM({
      context: {
        gasPrice: 7n,
        blockNumber: 8n,
        timestamp: 9n,
        gasLimit: 10n,
        chainId: 11n,
        baseFee: 12n,
        prevRandao: 13n,
        blockHashes: new Map([[3n, blockHash]]),
      },
    })

    const hash = await evm.runCode({
      code: new Uint8Array([
        0x60, 0x2a, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0x20, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0xf3,
      ]),
    })
    const hashedData = new Uint8Array(64)
    hashedData[63] = 0x2a
    assert.isUndefined(hash.exceptionError)
    assert.deepEqual([...hash.returnValue.slice(32)], [...keccak_256(hashedData)])

    for (const [opcode, expected] of [
      [0x38, 2n],
      [0x3a, 7n],
      [0x42, 9n],
      [0x43, 8n],
      [0x44, 13n],
      [0x45, 10n],
      [0x46, 11n],
      [0x48, 12n],
      [0x5a, 0x1232n],
    ] as const) {
      const result = await evm.runCode({
        gasLimit: 0x1234n,
        code: new Uint8Array([opcode, 0x00]),
      })
      assert.isUndefined(result.exceptionError)
      assert.strictEqual(result.stack?.pop().toBigInt(), expected)
    }

    const knownBlock = await evm.runCode({
      code: new Uint8Array([0x60, 0x03, 0x40, 0x00]),
    })
    assert.isUndefined(knownBlock.exceptionError)
    assert.deepEqual(knownBlock.stack?.pop().toBytes32(), blockHash)

    const unknownBlock = await evm.runCode({
      code: new Uint8Array([0x60, 0x04, 0x40, 0x00]),
    })
    assert.isUndefined(unknownBlock.exceptionError)
    assert.strictEqual(unknownBlock.stack?.pop().toBigInt(), 0n)
  })

  it('reports INVALID opcode as an execution error', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({ code: new Uint8Array([0xfe]) })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
  })

  it('keeps opcodes absent from go-qrl unsupported', async () => {
    const evm = new qrl.QRLEVM()
    for (const opcode of [0xf2, 0xff]) {
      const result = await evm.runCode({ code: new Uint8Array([opcode]) })
      assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    }
  })

  it('copies previous return data into memory', async () => {
    const evm = new qrl.QRLEVM()
    const returnData = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])
    const result = await evm.runCode({
      returnData,
      code: new Uint8Array([
        0x3d, 0x60, 0x00, 0x52, 0x60, 0x03, 0x60, 0x01, 0x60, 0x40, 0x3e, 0x60, 0x43, 0x60, 0x00,
        0xf3,
      ]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.returnValue[63], 4)
    assert.deepEqual([...result.returnValue.slice(64)], [0xbb, 0xcc, 0xdd])
  })

  it('rejects return data copies beyond the available buffer', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      returnData: new Uint8Array([0xaa, 0xbb]),
      code: new Uint8Array([0x60, 0x03, 0x5f, 0x5f, 0x3e, 0x00]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
  })

  it('emits LOG records without reverting prior state writes', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([
        0x60, 0x2a, 0x5f, 0x55, 0x60, 0x2a, 0x5f, 0x52, 0x60, 0x7b, 0x60, 0x40, 0x5f, 0xc1, 0x00,
      ]),
    })
    const stored = await evm.stateManager.getStorage(utilQrl.QRLAddress.zero(), new Uint8Array(32))

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(stored[63], 0x2a)
    assert.strictEqual(result.logs?.length, 1)
    assert.strictEqual(result.logs[0].address.toString(), utilQrl.QRLAddress.zero().toString())
    assert.strictEqual(result.logs[0].topics.length, 1)
    assert.strictEqual(result.logs[0].topics[0].length, 64)
    assert.strictEqual(result.logs[0].topics[0][63], 0x7b)
    assert.strictEqual(result.logs[0].data.length, 64)
    assert.strictEqual(result.logs[0].data[63], 0x2a)
  })

  it('rejects LOG opcodes in static execution', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: new Uint8Array([0x5f, 0x5f, 0xc0]),
      isStatic: true,
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    assert.strictEqual(result.logs, undefined)
  })

  it('reports base gas used and remaining gas', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 20n,
      code: new Uint8Array([0x60, 0x02, 0x60, 0x03, 0x01, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.gasUsed, 9n)
    assert.strictEqual(result.gasRemaining, 11n)
  })

  it('charges QRL PUSH0 and GAS before executing them', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 10n,
      code: new Uint8Array([0x5f, 0x5a, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.gasUsed, 4n)
    assert.strictEqual(result.gasRemaining, 6n)
    assert.strictEqual(result.stack?.pop().toBigInt(), 6n)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0n)
  })

  it('returns an out-of-gas execution error when base gas exceeds the limit', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 5n,
      code: new Uint8Array([0x60, 0x02, 0x60, 0x03, 0x01, 0x00]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    assert.strictEqual(result.exceptionError?.message, 'QRL out of gas')
    assert.strictEqual(result.gasUsed, 5n)
    assert.strictEqual(result.gasRemaining, 0n)
    assert.strictEqual(result.gasRefund, 0n)
  })

  it('charges dynamic memory expansion and hash gas', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 100n,
      code: new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x60, 0x40, 0x5f, 0x20, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.gasUsed, 52n)
    assert.strictEqual(result.gasRemaining, 48n)
  })

  it('charges dynamic copy gas with 64-byte memory words', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 100n,
      data: new Uint8Array(65),
      code: new Uint8Array([0x60, 0x41, 0x5f, 0x5f, 0x37, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.gasUsed, 22n)
    assert.strictEqual(result.gasRemaining, 78n)
  })

  it('charges return and log memory/data gas', async () => {
    const evm = new qrl.QRLEVM()
    const returned = await evm.runCode({
      gasLimit: 100n,
      code: new Uint8Array([0x60, 0x40, 0x5f, 0xf3]),
    })
    const logged = await evm.runCode({
      gasLimit: 2000n,
      code: new Uint8Array([0x60, 0x7b, 0x60, 0x40, 0x5f, 0xc1, 0x00]),
    })

    assert.isUndefined(returned.exceptionError)
    assert.strictEqual(returned.returnValue.length, 64)
    assert.strictEqual(returned.gasUsed, 8n)
    assert.isUndefined(logged.exceptionError)
    assert.strictEqual(logged.logs?.length, 1)
    assert.strictEqual(logged.gasUsed, 1273n)
  })

  it('charges EXP exponent-byte gas', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 100n,
      code: new Uint8Array([0x60, 0x0a, 0x60, 0x02, 0x0a, 0x00]),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1024n)
    assert.strictEqual(result.gasUsed, 66n)
  })

  it('returns out-of-gas when dynamic memory gas exceeds the limit', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      gasLimit: 10n,
      code: new Uint8Array([0x60, 0x2a, 0x5f, 0x52, 0x00]),
    })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    assert.strictEqual(result.exceptionError?.message, 'QRL out of gas')
    assert.strictEqual(result.gasUsed, 10n)
    assert.strictEqual(result.gasRemaining, 0n)
    assert.strictEqual(result.gasRefund, 0n)
  })

  it('returns nested call failure instead of executing beyond QRL depth limit', async () => {
    const evm = new qrl.QRLEVM()
    const interpreter = new qrl.QRLInterpreter({
      stateManager: evm.stateManager,
      context: qrl.defaultQRLExecutionContext(),
    })

    const result = await interpreter.run(
      new qrl.QRLMessage({
        caller: utilQrl.QRLAddress.zero(),
        to: utilQrl.QRLAddress.zero(),
        gasLimit: 10000n,
        depth: qrl.QRL_CALL_CREATE_DEPTH,
        code: new Uint8Array([0x5f, 0x5f, 0x5f, 0x5f, 0x5f, 0x5f, 0x60, 0xff, 0xf1, 0x00]),
      }),
    )

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0n)
  })

  it('adds the QRL value-transfer stipend to CALL child gas', async () => {
    const evm = new qrl.QRLEVM()
    const caller = utilQrl.QRLAddress.zero()
    const target = utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(2))
    await evm.stateManager.setBalance(caller, 1n)
    await evm.stateManager.putCode(target, new Uint8Array([0x60, 0x01, 0x00]))

    const code = new Uint8Array([
      0x5f,
      0x5f,
      0x5f,
      0x5f,
      0x60,
      0x01,
      0x9f,
      ...target.toBytes(),
      0x5f,
      0xf1,
      0x00,
    ])
    const result = await evm.runCode({ code, gasLimit: 50000n })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 1n)
  })

  it('rejects CREATE runtime code starting with 0xef', async () => {
    const evm = new qrl.QRLEVM()
    const creator = utilQrl.QRLAddress.zero()
    const initCode = new Uint8Array([0x60, 0xef, 0x5f, 0x53, 0x60, 0x01, 0x5f, 0xf3])
    const parentCode = new Uint8Array([
      0x60,
      initCode.length,
      0x60,
      12,
      0x5f,
      0x39,
      0x60,
      initCode.length,
      0x5f,
      0x5f,
      0xf0,
      0x00,
      ...initCode,
    ])

    const result = await evm.runCode({ code: parentCode, gasLimit: 100000n, to: creator })
    const createdAddress = utilQrl.createQRLContractAddress(creator, 0n)

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(result.stack?.pop().toBigInt(), 0n)
    assert.strictEqual(await evm.stateManager.getCodeSize(createdAddress), 0)
  })
  it('charges new-account gas for existing empty QRL accounts', async () => {
    const evm = new qrl.QRLEVM()
    const target = utilQrl.QRLAddress.fromBytes(new Uint8Array(64).fill(3))
    await evm.stateManager.setBalance(target, 0n)

    const code = new Uint8Array([
      0x5f,
      0x5f,
      0x5f,
      0x5f,
      0x60,
      0x01,
      0x9f,
      ...target.toBytes(),
      0x5f,
      0xf1,
      0x00,
    ])
    const result = await evm.runCode({ code, gasLimit: 36615n })

    assert.instanceOf(result.exceptionError, qrl.QRLVMError)
    assert.strictEqual(result.exceptionError?.message, 'QRL out of gas')
  })
})
