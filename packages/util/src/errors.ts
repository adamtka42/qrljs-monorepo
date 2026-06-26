import {
  DEFAULT_ERROR_CODE,
  QRLJSError,
  type QRLJSErrorMetaData,
  type QRLJSErrorObject,
  QRLJSErrorWithoutCode,
} from '@theqrl/rlp'

export {
  DEFAULT_ERROR_CODE,
  QRLJSError,
  QRLJSErrorWithoutCode,
  type QRLJSErrorMetaData,
  type QRLJSErrorObject,
}

// Below here: specific monorepo-wide errors (examples and commented out)

/*export enum UsageErrorType {
  UNSUPPORTED_FEATURE = 'unsupported feature',
}*

/**
 * Error along API Usage
 *
 * Use directly or in a subclassed context for error comparison (`e instanceof UsageError`)
 */
//export class UsageError extends QRLJSError<{ code: UsageErrorType }> {}
