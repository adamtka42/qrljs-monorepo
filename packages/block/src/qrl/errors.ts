import { QRLJSErrorWithoutCode } from '@ethereumjs/util'

export function qrlBlockError(message: string): Error {
  return QRLJSErrorWithoutCode(message)
}
