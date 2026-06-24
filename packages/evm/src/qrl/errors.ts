export class QRLVMError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'QRLVMError'
  }
}

export class QRLVMRevert extends QRLVMError {
  public readonly returnValue: Uint8Array

  public constructor(returnValue: Uint8Array) {
    super('QRL execution reverted')
    this.returnValue = new Uint8Array(returnValue)
  }
}
