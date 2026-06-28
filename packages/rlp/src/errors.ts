/**
 * Generic QRL JS error class with metadata attached
 *
 * Kudos to https://github.com/ChainSafe/lodestar monorepo
 * for the inspiration :-)
 * See: https://github.com/ChainSafe/lodestar/blob/unstable/packages/utils/src/errors.ts
 */
export type QRLJSErrorMetaData = Record<string, string | number | null>
export type QRLJSErrorObject = {
  message: string
  stack: string
  className: string
  type: QRLJSErrorMetaData
}

// In order to update all our errors to use `QRLJSError`, temporarily include the
// unset error code. All errors throwing this code should be updated to use the relevant
// error code.
export const DEFAULT_ERROR_CODE = 'QRLJS_DEFAULT_ERROR_CODE'

/**
 * Generic QRL JS error with attached metadata
 */
export class QRLJSError<T extends { code: string }> extends Error {
  type: T
  constructor(type: T, message?: string, stack?: string) {
    super(message ?? type.code)
    this.type = type
    if (stack !== undefined) this.stack = stack
  }

  getMetadata(): QRLJSErrorMetaData {
    return this.type
  }

  /**
   * Get the metadata and the stacktrace for the error.
   */
  toObject(): QRLJSErrorObject {
    return {
      type: this.getMetadata(),
      message: this.message ?? '',
      stack: this.stack ?? '',
      className: this.constructor.name,
    }
  }
}

/**
 * @deprecated Use `QRLJSError` with a set error code instead
 * @param message Optional error message
 * @param stack Optional stack trace
 * @returns
 */
export function QRLJSErrorWithoutCode(message?: string, stack?: string) {
  return new QRLJSError({ code: DEFAULT_ERROR_CODE }, message, stack)
}
