import { EthereumJSErrorWithoutCode } from '@ethereumjs/util'

export function qrlBlockError(message: string): Error {
  return EthereumJSErrorWithoutCode(message)
}
