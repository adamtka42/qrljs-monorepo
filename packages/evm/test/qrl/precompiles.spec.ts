import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { bytesToHex, hexToBytes, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

interface PrecompileFixture {
  Input: string
  Expected: string
  Gas: number
}

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function precompileAddress(id: number): utilQrl.QRLAddress {
  const bytes = new Uint8Array(64)
  bytes[63] = id
  return utilQrl.QRLAddress.fromBytes(bytes)
}

function fromHex(value: string): Uint8Array {
  return hexToBytes(`0x${value}` as PrefixedHexString)
}

function fixture(name: string): PrecompileFixture[] {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf8'))
}

function writeBytes(bytes: Uint8Array, offset = 0): number[] {
  return Array.from(bytes).flatMap((byte, index) => [
    0x60,
    byte,
    ...pushValue(offset + index),
    0x53,
  ])
}

function pushValue(value: number): number[] {
  if (value > 0xff) {
    throw new Error('test helper only supports one-byte immediates')
  }
  return value === 0 ? [0x5f] : [0x60, value]
}

function pushAddress(address: utilQrl.QRLAddress): number[] {
  return [0x9f, ...address.toBytes()]
}

function callPrecompileCode(
  target: utilQrl.QRLAddress,
  input: Uint8Array,
  outputSize: number,
  gasLimit = 0xffff,
): Uint8Array {
  const outputOffset = 0x80
  return new Uint8Array([
    ...writeBytes(input),
    ...pushValue(outputSize),
    ...pushValue(outputOffset),
    ...pushValue(input.length),
    0x5f,
    0x5f,
    ...pushAddress(target),
    0x61,
    (gasLimit >> 8) & 0xff,
    gasLimit & 0xff,
    0xf1,
    0x50,
    ...pushValue(outputSize),
    ...pushValue(outputOffset),
    0xf3,
  ])
}

describe('QRL precompiles', () => {
  it('routes SHA256 through address 0x02', async () => {
    const evm = new qrl.QRLEVM()
    const result = await evm.runCode({
      code: callPrecompileCode(precompileAddress(2), new TextEncoder().encode('abc'), 32),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(
      bytesToHex(result.returnValue),
      '0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('routes identity/dataCopy through address 0x04', async () => {
    const evm = new qrl.QRLEVM()
    const input = fromHex('00112233445566778899aabbccddeeff')
    const result = await evm.runCode({
      code: callPrecompileCode(precompileAddress(4), input, input.length),
    })

    assert.isUndefined(result.exceptionError)
    assert.strictEqual(bytesToHex(result.returnValue), bytesToHex(input))
  })

  it('matches go-qrl depositroot vectors at address 0x01', () => {
    for (const test of fixture('depositroot')) {
      const result = qrl.runQRLPrecompile(
        precompileAddress(1),
        fromHex(test.Input),
        BigInt(test.Gas),
        0n,
      )
      assert.isUndefined(result.exceptionError)
      assert.strictEqual(result.gasUsed, BigInt(test.Gas))
      assert.strictEqual(bytesToHex(result.returnValue), `0x${test.Expected}`)
    }
  })

  it('matches go-qrl modexp vectors at address 0x05', () => {
    for (const test of fixture('modexp')) {
      const result = qrl.runQRLPrecompile(
        precompileAddress(5),
        fromHex(test.Input),
        BigInt(test.Gas),
        0n,
      )
      assert.isUndefined(result.exceptionError)
      assert.strictEqual(result.gasUsed, BigInt(test.Gas))
      assert.strictEqual(bytesToHex(result.returnValue), `0x${test.Expected}`)
    }
  })

  it('fails precompile execution when supplied gas is too low', () => {
    const result = qrl.runQRLPrecompile(precompileAddress(2), new Uint8Array(65), 71n, 0n)

    assert.isDefined(result.exceptionError)
    assert.strictEqual(result.gasRemaining, 0n)
  })
})
