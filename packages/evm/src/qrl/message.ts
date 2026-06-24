import { qrl } from '@ethereumjs/util'

export interface QRLExecutionContext {
  origin: qrl.QRLAddress
  caller: qrl.QRLAddress
  address: qrl.QRLAddress
  coinbase: qrl.QRLAddress
  gasPrice: bigint
  blockNumber: bigint
  timestamp: bigint
  gasLimit: bigint
}

export interface QRLMessageData {
  caller: qrl.QRLAddress
  to: qrl.QRLAddress
  value?: bigint
  data?: Uint8Array
  code?: Uint8Array
  gasLimit?: bigint
  isStatic?: boolean
}

export class QRLMessage {
  public readonly caller: qrl.QRLAddress
  public readonly to: qrl.QRLAddress
  public readonly value: bigint
  public readonly data: Uint8Array
  public readonly code: Uint8Array
  public readonly gasLimit: bigint
  public readonly isStatic: boolean

  public constructor(data: QRLMessageData) {
    this.caller = data.caller
    this.to = data.to
    this.value = data.value ?? 0n
    this.data = new Uint8Array(data.data ?? new Uint8Array(0))
    this.code = new Uint8Array(data.code ?? new Uint8Array(0))
    this.gasLimit = data.gasLimit ?? 0xffffffffffn
    this.isStatic = data.isStatic ?? false
  }
}

export function defaultQRLExecutionContext(): QRLExecutionContext {
  const zero = qrl.QRLAddress.zero()
  return {
    origin: zero,
    caller: zero,
    address: zero,
    coinbase: zero,
    gasPrice: 0n,
    blockNumber: 0n,
    timestamp: 0n,
    gasLimit: 0n,
  }
}
