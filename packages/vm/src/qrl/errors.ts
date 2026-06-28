export class QRLRunTxError extends Error {
  public readonly code: string

  public constructor(code: string, message: string) {
    super(message)
    this.name = 'QRLRunTxError'
    this.code = code
  }
}

export function qrlRunTxError(code: string, message: string): QRLRunTxError {
  return new QRLRunTxError(code, message)
}
