import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToBigInt } from '@theqrl/util'

import type { qrl } from '@theqrl/util'

import { QRLVMError } from './errors.ts'
import { QRL_WORD_BYTES } from './uint512.ts'

import type { QRLExecutionResult } from './result.ts'

const PRECOMPILE_DEPOSIT_ROOT = 0x01
const PRECOMPILE_SHA256 = 0x02
const PRECOMPILE_IDENTITY = 0x04
const PRECOMPILE_BIG_MODEXP = 0x05

const SHA256_BASE_GAS = 60n
const SHA256_PER_WORD_GAS = 12n
const IDENTITY_BASE_GAS = 15n
const IDENTITY_PER_WORD_GAS = 3n
const DEPOSIT_ROOT_SHA256_OPS = 238n
const BIG_MODEXP_MIN_GAS = 200n

const ZERO_CHUNK = new Uint8Array(32)

export function isQRLPrecompile(address: qrl.QRLAddress): boolean {
  const id = precompileId(address)
  return (
    id === PRECOMPILE_DEPOSIT_ROOT ||
    id === PRECOMPILE_SHA256 ||
    id === PRECOMPILE_IDENTITY ||
    id === PRECOMPILE_BIG_MODEXP
  )
}

export function runQRLPrecompile(
  address: qrl.QRLAddress,
  input: Uint8Array,
  gasLimit: bigint,
  gasRefund: bigint,
): QRLExecutionResult {
  const gasUsed = qrlPrecompileGas(address, input)
  if (gasUsed > gasLimit) {
    return {
      returnValue: new Uint8Array(0),
      gasUsed: gasLimit,
      gasRemaining: 0n,
      gasRefund: 0n,
      exceptionError: new QRLVMError('QRL out of gas'),
    }
  }

  return {
    returnValue: qrlPrecompileOutput(address, input),
    gasUsed,
    gasRemaining: gasLimit - gasUsed,
    gasRefund,
  }
}

export function qrlPrecompileGas(address: qrl.QRLAddress, input: Uint8Array): bigint {
  switch (precompileId(address)) {
    case PRECOMPILE_DEPOSIT_ROOT:
      return (wordGas(64) * SHA256_PER_WORD_GAS + SHA256_BASE_GAS) * DEPOSIT_ROOT_SHA256_OPS
    case PRECOMPILE_SHA256:
      return wordGas(input.length) * SHA256_PER_WORD_GAS + SHA256_BASE_GAS
    case PRECOMPILE_IDENTITY:
      return wordGas(input.length) * IDENTITY_PER_WORD_GAS + IDENTITY_BASE_GAS
    case PRECOMPILE_BIG_MODEXP:
      return bigModExpGas(input)
    default:
      throw new QRLVMError('Unsupported QRL precompile')
  }
}

function qrlPrecompileOutput(address: qrl.QRLAddress, input: Uint8Array): Uint8Array {
  switch (precompileId(address)) {
    case PRECOMPILE_DEPOSIT_ROOT:
      return depositRoot(input)
    case PRECOMPILE_SHA256:
      return Uint8Array.from(sha256(input))
    case PRECOMPILE_IDENTITY:
      return new Uint8Array(input)
    case PRECOMPILE_BIG_MODEXP:
      return bigModExp(input)
    default:
      throw new QRLVMError('Unsupported QRL precompile')
  }
}

function precompileId(address: qrl.QRLAddress): number {
  const bytes = address.toBytes()
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] !== 0) {
      return -1
    }
  }
  return bytes[bytes.length - 1]
}

function wordGas(sizeBytes: number): bigint {
  return sizeBytes === 0
    ? 0n
    : (BigInt(sizeBytes) + BigInt(QRL_WORD_BYTES) - 1n) / BigInt(QRL_WORD_BYTES)
}

function bigModExpGas(input: Uint8Array): bigint {
  const baseLen = bytesToBigInt(getData(input, 0, 32))
  const expLen = bytesToBigInt(getData(input, 32, 32))
  const modLen = bytesToBigInt(getData(input, 64, 32))
  const payload = input.length > 96 ? input.slice(96) : new Uint8Array(0)

  let expHead: bigint
  if (BigInt(payload.length) <= baseLen) {
    expHead = 0n
  } else if (expLen > 32n) {
    expHead = bytesToBigInt(getData(payload, baseLen, 32n))
  } else {
    expHead = bytesToBigInt(getData(payload, baseLen, expLen))
  }

  const msb = expHead === 0n ? 0n : BigInt(expHead.toString(2).length - 1)
  const adjustedExpLen = (expLen > 32n ? (expLen - 32n) * 8n : 0n) + msb
  const maxLen = baseLen > modLen ? baseLen : modLen
  let gas = ((maxLen + 7n) / 8n) ** 2n
  gas = (gas * (adjustedExpLen > 1n ? adjustedExpLen : 1n)) / 3n
  return gas < BIG_MODEXP_MIN_GAS ? BIG_MODEXP_MIN_GAS : gas
}

function bigModExp(input: Uint8Array): Uint8Array {
  const baseLen = bytesToBigInt(getData(input, 0, 32))
  const expLen = bytesToBigInt(getData(input, 32, 32))
  const modLen = bytesToBigInt(getData(input, 64, 32))
  const payload = input.length > 96 ? input.slice(96) : new Uint8Array(0)

  if (baseLen === 0n && modLen === 0n) {
    return new Uint8Array(0)
  }

  const base = bytesToBigInt(getData(payload, 0, baseLen))
  const exp = bytesToBigInt(getData(payload, baseLen, expLen))
  const mod = bytesToBigInt(getData(payload, baseLen + expLen, modLen))
  if (mod === 0n) {
    return leftPad(new Uint8Array(0), Number(modLen))
  }

  const value = modPow(base, exp, mod)
  return leftPad(bigIntToBytes(value), Number(modLen))
}

function modPow(baseInput: bigint, exponentInput: bigint, modulus: bigint): bigint {
  let result = 1n
  let base = baseInput % modulus
  let exponent = exponentInput
  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) {
      result = (result * base) % modulus
    }
    exponent >>= 1n
    base = (base * base) % modulus
  }
  return result
}

function depositRoot(input: Uint8Array): Uint8Array {
  const publicKey = getData(input, 0, 2592)
  const withdrawalCredentials = getData(input, 2592, 64)
  const amount = getData(input, 2656, 8)
  const signature = getData(input, 2664, 4627)

  return merkleize([
    merkleize(chunks(publicKey)),
    merkleize(chunks(withdrawalCredentials)),
    amountChunk(amount),
    merkleize(chunks(signature)),
  ])
}

function chunks(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  for (let offset = 0; offset < bytes.length; offset += 32) {
    const chunk = new Uint8Array(32)
    chunk.set(bytes.slice(offset, offset + 32))
    out.push(chunk)
  }
  return out.length === 0 ? [new Uint8Array(32)] : out
}

function merkleize(leavesInput: Uint8Array[]): Uint8Array {
  let leaves: Uint8Array<ArrayBufferLike>[] = leavesInput.map((leaf) => {
    if (leaf.length !== 32) {
      throw new QRLVMError('QRL depositroot SSZ leaf must be 32 bytes')
    }
    return new Uint8Array(leaf)
  })

  const targetLength = nextPowerOfTwo(leaves.length)
  while (leaves.length < targetLength) {
    leaves.push(ZERO_CHUNK)
  }

  while (leaves.length > 1) {
    const next: Uint8Array<ArrayBufferLike>[] = []
    for (let i = 0; i < leaves.length; i += 2) {
      next.push(Uint8Array.from(sha256(concat32(leaves[i], leaves[i + 1]))))
    }
    leaves = next
  }
  return leaves[0]
}

function amountChunk(amountBytes: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(32)
  chunk.set(amountBytes.slice(0, 8))
  return chunk
}

function nextPowerOfTwo(value: number): number {
  let power = 1
  while (power < value) {
    power *= 2
  }
  return power
}

function concat32(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(64)
  out.set(left)
  out.set(right, 32)
  return out
}

function getData(
  input: Uint8Array,
  offsetInput: bigint | number,
  sizeInput: bigint | number,
): Uint8Array {
  const offset = Number(offsetInput)
  const size = Number(sizeInput)
  const output = new Uint8Array(size)
  if (offset < input.length) {
    output.set(input.slice(offset, offset + size))
  }
  return output
}

function bigIntToBytes(value: bigint): Uint8Array {
  if (value === 0n) {
    return new Uint8Array(0)
  }
  let hex = value.toString(16)
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function leftPad(bytes: Uint8Array, length: number): Uint8Array {
  if (bytes.length >= length) {
    return bytes.slice(bytes.length - length)
  }
  const out = new Uint8Array(length)
  out.set(bytes, length - bytes.length)
  return out
}
