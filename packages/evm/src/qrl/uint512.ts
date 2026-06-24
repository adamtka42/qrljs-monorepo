import { QRLVMError } from './errors.ts'

export const QRL_WORD_BITS = 512n
export const QRL_WORD_BYTES = 64
export const QRL_WORD_MOD = 1n << QRL_WORD_BITS
export const QRL_WORD_MAX = QRL_WORD_MOD - 1n

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

  public lt(other: QRLUint512): QRLUint512 {
    return this.value < other.value ? QRLUint512.one() : QRLUint512.zero()
  }

  public gt(other: QRLUint512): QRLUint512 {
    return this.value > other.value ? QRLUint512.one() : QRLUint512.zero()
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
    const signed = this.value >= 1n << 511n ? this.value - QRL_WORD_MOD : this.value
    if (bits.value >= QRL_WORD_BITS) {
      return signed < 0n ? new QRLUint512(QRL_WORD_MAX) : QRLUint512.zero()
    }
    return new QRLUint512(signed >> bits.value)
  }
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
