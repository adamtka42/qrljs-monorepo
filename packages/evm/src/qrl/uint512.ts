import { QRLVMError } from './errors.ts'

export const QRL_WORD_BITS = 512n
export const QRL_WORD_BYTES = 64
export const QRL_WORD_MOD = 1n << QRL_WORD_BITS
export const QRL_WORD_MAX = QRL_WORD_MOD - 1n
const QRL_SIGN_BIT = 1n << (QRL_WORD_BITS - 1n)

export class QRLUint512 {
  private readonly value: bigint

  private constructor(value: bigint) {
    this.value = moduloWord(value)
  }

  public static zero(): QRLUint512 {
    return new QRLUint512(0n)
  }

  public static one(): QRLUint512 {
    return new QRLUint512(1n)
  }

  public static fromBigInt(value: bigint): QRLUint512 {
    return new QRLUint512(value)
  }

  public static fromBytes(bytes: Uint8Array): QRLUint512 {
    if (bytes.length > QRL_WORD_BYTES) {
      throw new QRLVMError(`QRL uint512 byte length exceeds 64 bytes: ${bytes.length}`)
    }
    let value = 0n
    for (const byte of bytes) {
      value = (value << 8n) + BigInt(byte)
    }
    return new QRLUint512(value)
  }

  public toBigInt(): bigint {
    return this.value
  }

  public toBytes32(): Uint8Array {
    return bigintToBytes(this.value & ((1n << 256n) - 1n), 32)
  }

  public toBytes64(): Uint8Array {
    return bigintToBytes(this.value, QRL_WORD_BYTES)
  }

  public isZero(): boolean {
    return this.value === 0n
  }

  public add(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value + other.value)
  }

  public sub(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value - other.value)
  }

  public mul(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value * other.value)
  }

  public div(other: QRLUint512): QRLUint512 {
    return other.isZero() ? QRLUint512.zero() : new QRLUint512(this.value / other.value)
  }

  public mod(other: QRLUint512): QRLUint512 {
    return other.isZero() ? QRLUint512.zero() : new QRLUint512(this.value % other.value)
  }

  public sdiv(other: QRLUint512): QRLUint512 {
    const dividend = this.toSignedBigInt()
    const divisor = other.toSignedBigInt()
    if (divisor === 0n) {
      return QRLUint512.zero()
    }
    const quotient = abs(dividend) / abs(divisor)
    return QRLUint512.fromBigInt(dividend < 0n !== divisor < 0n ? -quotient : quotient)
  }

  public smod(other: QRLUint512): QRLUint512 {
    const dividend = this.toSignedBigInt()
    const divisor = other.toSignedBigInt()
    if (divisor === 0n) {
      return QRLUint512.zero()
    }
    const remainder = abs(dividend) % abs(divisor)
    return QRLUint512.fromBigInt(dividend < 0n ? -remainder : remainder)
  }

  public addmod(addend: QRLUint512, modulo: QRLUint512): QRLUint512 {
    return modulo.isZero()
      ? QRLUint512.zero()
      : QRLUint512.fromBigInt((this.value + addend.value) % modulo.value)
  }

  public mulmod(multiplier: QRLUint512, modulo: QRLUint512): QRLUint512 {
    return modulo.isZero()
      ? QRLUint512.zero()
      : QRLUint512.fromBigInt((this.value * multiplier.value) % modulo.value)
  }

  public exp(exponent: QRLUint512): QRLUint512 {
    return new QRLUint512(modularPow(this.value, exponent.value, QRL_WORD_MOD))
  }

  public lt(other: QRLUint512): QRLUint512 {
    return this.value < other.value ? QRLUint512.one() : QRLUint512.zero()
  }

  public gt(other: QRLUint512): QRLUint512 {
    return this.value > other.value ? QRLUint512.one() : QRLUint512.zero()
  }

  public slt(other: QRLUint512): QRLUint512 {
    return this.toSignedBigInt() < other.toSignedBigInt() ? QRLUint512.one() : QRLUint512.zero()
  }

  public sgt(other: QRLUint512): QRLUint512 {
    return this.toSignedBigInt() > other.toSignedBigInt() ? QRLUint512.one() : QRLUint512.zero()
  }

  public eq(other: QRLUint512): QRLUint512 {
    return this.value === other.value ? QRLUint512.one() : QRLUint512.zero()
  }

  public byte(index: QRLUint512): QRLUint512 {
    if (index.value >= BigInt(QRL_WORD_BYTES)) {
      return QRLUint512.zero()
    }
    return QRLUint512.fromBigInt(BigInt(this.toBytes64()[Number(index.value)]))
  }

  public signExtend(byteIndex: QRLUint512): QRLUint512 {
    if (byteIndex.value >= BigInt(QRL_WORD_BYTES)) {
      return this
    }
    const bitIndex = (byteIndex.value + 1n) * 8n - 1n
    const signBit = 1n << bitIndex
    const mask = signBit - 1n
    return (this.value & signBit) !== 0n
      ? new QRLUint512(this.value | (QRL_WORD_MAX ^ mask))
      : new QRLUint512(this.value & mask)
  }

  public and(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value & other.value)
  }

  public or(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value | other.value)
  }

  public xor(other: QRLUint512): QRLUint512 {
    return new QRLUint512(this.value ^ other.value)
  }

  public not(): QRLUint512 {
    return new QRLUint512(QRL_WORD_MAX ^ this.value)
  }

  public shl(bits: QRLUint512): QRLUint512 {
    if (bits.value >= QRL_WORD_BITS) {
      return QRLUint512.zero()
    }
    return new QRLUint512(this.value << bits.value)
  }

  public shr(bits: QRLUint512): QRLUint512 {
    if (bits.value >= QRL_WORD_BITS) {
      return QRLUint512.zero()
    }
    return new QRLUint512(this.value >> bits.value)
  }

  public sar(bits: QRLUint512): QRLUint512 {
    const signed = this.toSignedBigInt()
    if (bits.value >= QRL_WORD_BITS) {
      return signed < 0n ? new QRLUint512(QRL_WORD_MAX) : QRLUint512.zero()
    }
    return new QRLUint512(signed >> bits.value)
  }

  private toSignedBigInt(): bigint {
    return this.value >= QRL_SIGN_BIT ? this.value - QRL_WORD_MOD : this.value
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}

function modularPow(base: bigint, exponent: bigint, modulo: bigint): bigint {
  if (modulo === 1n) {
    return 0n
  }
  let result = 1n
  let currentBase = base % modulo
  let currentExponent = exponent
  while (currentExponent > 0n) {
    if ((currentExponent & 1n) === 1n) {
      result = (result * currentBase) % modulo
    }
    currentExponent >>= 1n
    currentBase = (currentBase * currentBase) % modulo
  }
  return result
}

function moduloWord(value: bigint): bigint {
  const modded = value % QRL_WORD_MOD
  return modded >= 0n ? modded : modded + QRL_WORD_MOD
}

function bigintToBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let current = value
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(current & 0xffn)
    current >>= 8n
  }
  return out
}
