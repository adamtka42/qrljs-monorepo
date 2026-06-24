import type { qrl as evmQrl } from '@ethereumjs/evm'
import type { qrl as stateQrl } from '@ethereumjs/statemanager'

import { type QRLRunTxContext } from './context.ts'
import { QRLLocalChain } from './localChain.ts'
import type { QRLRunTxResult } from './result.ts'
import { type QRLRunTxOptions } from './runTx.ts'

export interface QRLVMOptions {
  stateManager?: stateQrl.QRLStateManager
  evm?: evmQrl.QRLEVM
  context?: QRLRunTxContext
  localChain?: QRLLocalChain
}

export class QRLVM {
  public readonly localChain: QRLLocalChain
  private readonly context?: QRLRunTxContext

  public constructor(options: QRLVMOptions = {}) {
    this.context = options.context
    this.localChain =
      options.localChain ??
      new QRLLocalChain({
        stateManager: options.stateManager,
        evm: options.evm,
        context: this.context,
      })
  }

  public get stateManager(): stateQrl.QRLStateManager {
    return this.localChain.stateManager
  }

  public get evm(): evmQrl.QRLEVM {
    return this.localChain.evm
  }

  public async runTx(
    options: Omit<QRLRunTxOptions, 'stateManager' | 'evm'>,
  ): Promise<QRLRunTxResult> {
    const result = await this.localChain.runTx({
      ...options,
      context: options.context ?? this.context,
    })
    return result.runTxResult
  }
}
