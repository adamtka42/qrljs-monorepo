import { qrl as evmQrl } from '@ethereumjs/evm'
import { qrl as stateQrl } from '@ethereumjs/statemanager'

import { type QRLRunTxContext } from './context.ts'
import { type QRLRunTxOptions, runQRLTx } from './runTx.ts'

export interface QRLVMOptions {
  stateManager?: stateQrl.QRLStateManager
  evm?: evmQrl.QRLEVM
  context?: QRLRunTxContext
}

export class QRLVM {
  public readonly stateManager: stateQrl.QRLStateManager
  public readonly evm: evmQrl.QRLEVM
  private readonly context?: QRLRunTxContext

  public constructor(options: QRLVMOptions = {}) {
    this.stateManager = options.stateManager ?? new stateQrl.QRLStateManager()
    this.evm = options.evm ?? new evmQrl.QRLEVM({ stateManager: this.stateManager })
    this.context = options.context
  }

  public runTx(
    options: Omit<QRLRunTxOptions, 'stateManager' | 'evm'>,
  ): ReturnType<typeof runQRLTx> {
    return runQRLTx({
      ...options,
      stateManager: this.stateManager,
      evm: this.evm,
      context: options.context ?? this.context,
    })
  }
}
