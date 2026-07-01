import { QRLVMError } from './errors.ts'
import { QRLUint512, QRL_WORD_BYTES } from './uint512.ts'

export class QRLMemory {
  private store = new Uint8Array(0)

  public length(): number {
    return this.store.length
  }

  public resize(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new QRLVMError(`Invalid QRL memory size=${size}`)
    }
    const alignedSize = alignMemorySize(size)
    if (alignedSize <= this.store.length) {
      return
    }
    const next = new Uint8Array(alignedSize)
    next.set(this.store)
    this.store = next
  }

  public getCopy(offset: number, size: number): Uint8Array {
    this.assertRange(offset, size)
    if (size === 0) {
      return new Uint8Array(0)
    }
    this.resize(offset + size)
    return new Uint8Array(this.store.subarray(offset, offset + size))
  }

  public getWord(offset: number): QRLUint512 {
    return QRLUint512.fromBytes(this.getCopy(offset, QRL_WORD_BYTES))
  }

  public set(offset: number, size: number, value: Uint8Array): void {
    this.assertRange(offset, size)
    if (value.length < size) {
      throw new QRLVMError('QRL memory write value is shorter than size')
    }
    this.resize(offset + size)
    this.store.set(value.subarray(0, size), offset)
  }

  public setWord(offset: number, value: QRLUint512): void {
    this.set(offset, QRL_WORD_BYTES, value.toBytes64())
  }

  public setByte(offset: number, value: QRLUint512): void {
    this.set(offset, 1, new Uint8Array([Number(value.toBigInt() & 0xffn)]))
  }

  private assertRange(offset: number, size: number): void {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0) {
      throw new QRLVMError(`Invalid QRL memory range offset=${offset} size=${size}`)
    }
  }
}

function alignMemorySize(size: number): number {
  if (size === 0) {
    return 0
  }
  return Math.ceil(size / QRL_WORD_BYTES) * QRL_WORD_BYTES
}
