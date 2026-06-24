import { QRLVMError } from './errors.ts'
import { QRLUint512 } from './uint512.ts'

export class QRLStack {
  private readonly data: QRLUint512[] = []
  private readonly limit: number

  public constructor(limit = 1024) {
    this.limit = limit
  }

  public push(value: QRLUint512): void {
    if (this.data.length >= this.limit) {
      throw new QRLVMError('QRL stack overflow')
    }
    this.data.push(QRLUint512.fromBigInt(value.toBigInt()))
  }

  public pop(): QRLUint512 {
    const value = this.data.pop()
    if (value === undefined) {
      throw new QRLVMError('QRL stack underflow')
    }
    return value
  }

  public peek(): QRLUint512 {
    const value = this.data[this.data.length - 1]
    if (value === undefined) {
      throw new QRLVMError('QRL stack underflow')
    }
    return value
  }

  public replaceTop(value: QRLUint512): void {
    if (this.data.length === 0) {
      throw new QRLVMError('QRL stack underflow')
    }
    this.data[this.data.length - 1] = QRLUint512.fromBigInt(value.toBigInt())
  }

  public dup(position: number): void {
    if (position < 1 || position > this.data.length) {
      throw new QRLVMError('QRL stack underflow')
    }
    this.push(this.data[this.data.length - position])
  }

  public swap(position: number): void {
    if (position < 1 || position >= this.data.length) {
      throw new QRLVMError('QRL stack underflow')
    }
    const top = this.data.length - 1
    const other = top - position
    const tmp = this.data[top]
    this.data[top] = this.data[other]
    this.data[other] = tmp
  }

  public length(): number {
    return this.data.length
  }

  public values(): QRLUint512[] {
    return this.data.map((value) => QRLUint512.fromBigInt(value.toBigInt()))
  }
}
