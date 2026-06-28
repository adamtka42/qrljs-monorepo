import { qrl } from '@theqrl/util'

export interface QRLExecutionContext {
  origin: qrl.QRLAddress
  caller: qrl.QRLAddress
  address: qrl.QRLAddress
  coinbase: qrl.QRLAddress
  gasPrice: bigint
  blockNumber: bigint
  timestamp: bigint
  gasLimit: bigint
  chainId: bigint
  baseFee: bigint
  prevRandao: bigint
  blockHashes: ReadonlyMap<bigint, Uint8Array>
}

export interface QRLMessageData {
  caller: qrl.QRLAddress
  to: qrl.QRLAddress
  value?: bigint
  data?: Uint8Array
  code?: Uint8Array
  returnData?: Uint8Array
  gasLimit?: bigint
  depth?: number
  isStatic?: boolean
}

export class QRLMessage {
  public readonly caller: qrl.QRLAddress
  public readonly to: qrl.QRLAddress
  public readonly value: bigint
  public readonly data: Uint8Array
  public readonly code: Uint8Array
  public readonly returnData: Uint8Array
  public readonly gasLimit: bigint
  public readonly depth: number
  public readonly isStatic: boolean

  public constructor(data: QRLMessageData) {
    this.caller = data.caller
    this.to = data.to
    this.value = data.value ?? 0n
    this.data = new Uint8Array(data.data ?? new Uint8Array(0))
    this.code = new Uint8Array(data.code ?? new Uint8Array(0))
    this.returnData = new Uint8Array(data.returnData ?? new Uint8Array(0))
    this.gasLimit = data.gasLimit ?? 0xffffffffffn
    this.depth = data.depth ?? 0
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
    chainId: 1n,
    baseFee: 0n,
    prevRandao: 0n,
    blockHashes: new Map(),
  }
}
