import { QRLJSErrorWithoutCode } from '@theqrl/util'

export function qrlBlockError(message: string): Error {
  return QRLJSErrorWithoutCode(message)
}
