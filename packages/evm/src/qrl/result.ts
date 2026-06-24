import type { QRLVMError } from './errors.ts'
import type { QRLStack } from './stack.ts'

export interface QRLExecutionResult {
  returnValue: Uint8Array
  gasUsed: bigint
  gasRemaining: bigint
  exceptionError?: QRLVMError
  stack?: QRLStack
}
