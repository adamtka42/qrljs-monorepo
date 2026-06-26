import type { qrl } from '@theqrl/util'

import type { QRLVMError } from './errors.ts'
import type { QRLStack } from './stack.ts'

export interface QRLExecutionLog {
  address: qrl.QRLAddress
  topics: Uint8Array[]
  data: Uint8Array
}

export interface QRLExecutionResult {
  returnValue: Uint8Array
  gasUsed: bigint
  gasRemaining: bigint
  gasRefund: bigint
  exceptionError?: QRLVMError
  stack?: QRLStack
  logs?: QRLExecutionLog[]
}
