import { qrl as stateQrl } from '@ethereumjs/statemanager'
import type { qrl } from '@ethereumjs/util'

import { QRLInterpreter, type QRLWarmStorageAccess } from './interpreter.ts'
import { type QRLExecutionContext, QRLMessage, defaultQRLExecutionContext } from './message.ts'
import { type QRLExecutionResult } from './result.ts'

export interface QRLEVMOptions {
  stateManager?: stateQrl.QRLStateManager
  context?: Partial<QRLExecutionContext>
}

export interface QRLRunCodeOptions {
  code: Uint8Array
  data?: Uint8Array
  returnData?: Uint8Array
  caller?: qrl.QRLAddress
  to?: qrl.QRLAddress
  origin?: qrl.QRLAddress
  value?: bigint
  gasLimit?: bigint
  isStatic?: boolean
  context?: Partial<QRLExecutionContext>
  warmedAccounts?: qrl.QRLAddress[]
  warmedStorage?: QRLWarmStorageAccess[]
}

export interface QRLRunCallOptions {
  to: qrl.QRLAddress
  caller?: qrl.QRLAddress
  origin?: qrl.QRLAddress
  data?: Uint8Array
  code?: Uint8Array
  returnData?: Uint8Array
  value?: bigint
  gasLimit?: bigint
  isStatic?: boolean
  context?: Partial<QRLExecutionContext>
  warmedAccounts?: qrl.QRLAddress[]
  warmedStorage?: QRLWarmStorageAccess[]
}

export class QRLEVM {
  public readonly stateManager: stateQrl.QRLStateManager
  private readonly baseContext: QRLExecutionContext

  public constructor(options: QRLEVMOptions = {}) {
    this.stateManager = options.stateManager ?? new stateQrl.QRLStateManager()
    this.baseContext = {
      ...defaultQRLExecutionContext(),
      ...options.context,
    }
  }

  public async runCode(options: QRLRunCodeOptions): Promise<QRLExecutionResult> {
    const to = options.to ?? this.baseContext.address
    const caller = options.caller ?? this.baseContext.caller
    return this.runMessage({
      to,
      caller,
      origin: options.origin,
      data: options.data,
      code: options.code,
      returnData: options.returnData,
      value: options.value,
      gasLimit: options.gasLimit,
      isStatic: options.isStatic,
      context: options.context,
      warmedAccounts: options.warmedAccounts,
      warmedStorage: options.warmedStorage,
    })
  }

  public async runCall(options: QRLRunCallOptions): Promise<QRLExecutionResult> {
    const code = options.code ?? (await this.stateManager.getCode(options.to))
    return this.runMessage({
      ...options,
      caller: options.caller ?? this.baseContext.caller,
      code,
    })
  }

  private async runMessage(
    options: Required<Pick<QRLRunCallOptions, 'to' | 'caller'>> &
      Omit<QRLRunCallOptions, 'to' | 'caller'>,
  ): Promise<QRLExecutionResult> {
    const context: QRLExecutionContext = {
      ...this.baseContext,
      ...options.context,
      origin: options.origin ?? this.baseContext.origin,
      caller: options.caller,
      address: options.to,
    }
    const interpreter = new QRLInterpreter({
      stateManager: this.stateManager,
      context,
      warmedAccounts: options.warmedAccounts,
      warmedStorage: options.warmedStorage,
    })
    return interpreter.run(
      new QRLMessage({
        caller: options.caller,
        to: options.to,
        value: options.value,
        data: options.data,
        code: options.code,
        returnData: options.returnData,
        gasLimit: options.gasLimit,
        isStatic: options.isStatic,
      }),
    )
  }
}
