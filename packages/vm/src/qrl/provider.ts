import { qrl as txQrl } from '@theqrl/tx'
import { hexToBytes, qrl } from '@theqrl/util'

import { type QRLRunTxContext } from './context.ts'
import { QRLLocalChain } from './localChain.ts'
import {
  formatQRLBlock,
  formatQRLReceipt,
  formatQRLTransaction,
  qrlData,
  qrlHash,
  qrlQuantity,
} from './providerFormat.ts'
import type {
  QRLLocalProviderOptions,
  QRLLocalProviderRequest,
  QRLProviderTransactionRequest,
} from './providerTypes.ts'

import type { PrefixedHexString } from '@theqrl/util'

const DEFAULT_GAS_LIMIT = 30_000_000n
const DEFAULT_CHAIN_ID = 1n

export class QRLProviderError extends Error {
  public readonly code: number
  public readonly data?: unknown

  public constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'QRLProviderError'
    this.code = code
    this.data = data
  }
}

export class QRLLocalProvider {
  public readonly chain: QRLLocalChain
  private readonly defaultContext: QRLRunTxContext
  private readonly ready: Promise<void>

  public constructor(options: QRLLocalProviderOptions = {}) {
    this.defaultContext = options.defaultContext ?? { chainId: DEFAULT_CHAIN_ID, noBaseFee: true }
    this.chain =
      options.chain ??
      new QRLLocalChain({
        context: this.defaultContext,
        automine: options.automine,
      })
    this.ready = this.initializeAccounts(options.accounts ?? [])
  }

  public async request(args: QRLLocalProviderRequest): Promise<unknown> {
    await this.ready
    const params = args.params ?? []

    switch (args.method) {
      case 'qrl_blockNumber':
        expectParamCount(args.method, params, 0)
        return qrlQuantity(this.chain.getBlockNumber())
      case 'qrl_getBalance':
        return this.getBalance(params)
      case 'qrl_getTransactionCount':
        return this.getTransactionCount(params)
      case 'qrl_getCode':
        return this.getCode(params)
      case 'qrl_getStorageAt':
        return this.getStorageAt(params)
      case 'qrl_sendTransaction':
        return this.sendTransaction(params)
      case 'qrl_call':
        return this.call(params)
      case 'qrl_getTransactionByHash':
        return this.getTransactionByHash(params)
      case 'qrl_getTransactionReceipt':
        return this.getTransactionReceipt(params)
      case 'qrl_getBlockByNumber':
        return this.getBlockByNumber(params)
      case 'qrl_getBlockByHash':
        return this.getBlockByHash(params)
      case 'qrl_snapshot':
        expectParamCount(args.method, params, 0)
        return qrlQuantity(await this.chain.snapshot())
      case 'qrl_revert':
        return this.revert(params)
      case 'qrl_mine':
        return this.mine(params)
      default:
        throw new QRLProviderError(-32601, `Unknown QRL provider method: ${args.method}`)
    }
  }

  private async initializeAccounts(accounts: NonNullable<QRLLocalProviderOptions['accounts']>) {
    for (const account of accounts) {
      if (account.balance !== undefined) {
        await this.chain.stateManager.setBalance(account.address, account.balance)
      }
      if (account.nonce !== undefined) {
        await this.chain.stateManager.setNonce(account.address, account.nonce)
      }
    }
  }

  private async getBalance(params: unknown[]): Promise<string> {
    expectParamRange('qrl_getBalance', params, 1, 2)
    const address = parseAddress(params[0])
    assertLatestBlockTag(params[1])
    return qrlQuantity(await this.chain.stateManager.getBalance(address))
  }

  private async getTransactionCount(params: unknown[]): Promise<string> {
    expectParamRange('qrl_getTransactionCount', params, 1, 2)
    const address = parseAddress(params[0])
    assertLatestBlockTag(params[1])
    return qrlQuantity(await this.chain.stateManager.getNonce(address))
  }

  private async getCode(params: unknown[]): Promise<string> {
    expectParamRange('qrl_getCode', params, 1, 2)
    const address = parseAddress(params[0])
    assertLatestBlockTag(params[1])
    return qrlData(await this.chain.stateManager.getCode(address))
  }

  private async getStorageAt(params: unknown[]): Promise<string> {
    expectParamRange('qrl_getStorageAt', params, 2, 3)
    const address = parseAddress(params[0])
    const key = parseFixedBytes('QRL storage key', params[1], 32)
    assertLatestBlockTag(params[2])
    return qrlData(await this.chain.stateManager.getStorage(address, key))
  }

  private async sendTransaction(params: unknown[]): Promise<string> {
    expectParamCount('qrl_sendTransaction', params, 1)
    const request = parseTransactionRequest(params[0])
    const sender = parseAddress(request.from)
    const tx = await this.createTransaction(request, sender)
    const result = await this.chain.runTx({ tx, sender })
    return qrlHash(result.transaction.hash())
  }

  private async call(params: unknown[]): Promise<string> {
    expectParamRange('qrl_call', params, 1, 2)
    const request = parseTransactionRequest(params[0])
    if (request.to === undefined) {
      throw invalidParams('qrl_call requires a QRL to address')
    }
    assertLatestBlockTag(params[1])

    const sender = parseAddress(request.from)
    const to = parseAddress(request.to)
    const value = parseOptionalQuantity(request.value, 0n, 'value')
    const gasLimit = parseGasLimit(request)
    const data = parseOptionalData(request.data)
    const latest = this.chain.getLatestBlock()

    await this.chain.stateManager.checkpoint()
    try {
      const result = await this.chain.evm.runCall({
        to,
        caller: sender,
        origin: sender,
        data,
        value,
        gasLimit,
        isStatic: true,
        context: {
          coinbase: this.defaultContext.coinbase ?? latest.header.coinbase,
          blockNumber: latest.header.number,
          timestamp: this.defaultContext.timestamp ?? latest.header.timestamp,
          gasLimit: this.defaultContext.gasLimit ?? latest.header.gasLimit,
        },
      })
      if (result.exceptionError !== undefined) {
        throw new QRLProviderError(-32000, result.exceptionError.message)
      }
      return qrlData(result.returnValue)
    } finally {
      await this.chain.stateManager.revert()
    }
  }

  private async getTransactionByHash(params: unknown[]): Promise<unknown> {
    expectParamCount('qrl_getTransactionByHash', params, 1)
    const hash = parseHash(params[0])
    const tx = this.chain.getTransaction(hash)
    if (tx === undefined) {
      return null
    }
    const receipt = this.chain.getReceipt(hash)
    const block =
      receipt?.blockNumber === undefined
        ? undefined
        : this.chain.getBlockByNumber(receipt.blockNumber)
    return formatQRLTransaction(tx, block, receipt?.transactionIndex, receipt?.from)
  }

  private async getTransactionReceipt(params: unknown[]): Promise<unknown> {
    expectParamCount('qrl_getTransactionReceipt', params, 1)
    const receipt = this.chain.getReceipt(parseHash(params[0]))
    return receipt === undefined ? null : formatQRLReceipt(receipt)
  }

  private async getBlockByNumber(params: unknown[]): Promise<unknown> {
    expectParamRange('qrl_getBlockByNumber', params, 1, 2)
    const block = this.resolveBlock(params[0])
    return block === undefined ? null : formatQRLBlock(block, parseIncludeTransactions(params[1]))
  }

  private async getBlockByHash(params: unknown[]): Promise<unknown> {
    expectParamRange('qrl_getBlockByHash', params, 1, 2)
    const block = this.chain.getBlockByHash(parseHash(params[0]))
    return block === undefined ? null : formatQRLBlock(block, parseIncludeTransactions(params[1]))
  }

  private async revert(params: unknown[]): Promise<boolean> {
    expectParamCount('qrl_revert', params, 1)
    return this.chain.revert(parseQuantity(params[0], 'snapshot id'))
  }

  private async mine(params: unknown[]): Promise<string> {
    expectParamRange('qrl_mine', params, 0, 1)
    const options = params[0]
    if (options !== undefined && !isRecord(options)) {
      throw invalidParams('qrl_mine options must be an object')
    }
    const block = await this.chain.mineBlock(
      options === undefined
        ? undefined
        : {
            timestamp: optionalRecordQuantity(options, 'timestamp'),
            gasLimit: optionalRecordQuantity(options, 'gasLimit'),
            baseFee: optionalRecordQuantity(options, 'baseFee'),
            coinbase: options.coinbase === undefined ? undefined : parseAddress(options.coinbase),
          },
    )
    return qrlHash(block.hash())
  }

  private async createTransaction(
    request: QRLProviderTransactionRequest,
    sender: qrl.QRLAddress,
  ): Promise<txQrl.QRLDynamicFeeTransaction> {
    const chainId = this.defaultContext.chainId
    const nonce =
      request.nonce === undefined
        ? await this.chain.stateManager.getNonce(sender)
        : parseQuantity(request.nonce, 'nonce')

    return new txQrl.QRLDynamicFeeTransaction({
      chainId,
      nonce,
      gasTipCap: parseOptionalQuantity(request.maxPriorityFeePerGas, 0n, 'maxPriorityFeePerGas'),
      gasFeeCap: parseOptionalQuantity(request.maxFeePerGas, 0n, 'maxFeePerGas'),
      gasLimit: parseGasLimit(request),
      to: request.to === undefined ? undefined : parseAddress(request.to),
      value: parseOptionalQuantity(request.value, 0n, 'value'),
      data: parseOptionalData(request.data),
    })
  }

  private resolveBlock(value: unknown) {
    if (value === 'latest') {
      return this.chain.getLatestBlock()
    }
    if (value === 'earliest') {
      return this.chain.getBlockByNumber(0n)
    }
    return this.chain.getBlockByNumber(parseQuantity(value, 'block number'))
  }
}

function parseTransactionRequest(value: unknown): QRLProviderTransactionRequest {
  if (!isRecord(value) || typeof value.from !== 'string') {
    throw invalidParams('QRL transaction request requires a from address')
  }
  return value as unknown as QRLProviderTransactionRequest
}

function parseAddress(value: unknown): qrl.QRLAddress {
  if (value instanceof qrl.QRLAddress) {
    return qrl.QRLAddress.fromBytes(value.toBytes())
  }
  if (typeof value !== 'string') {
    throw invalidParams('QRL address must be a string')
  }
  try {
    return value.startsWith('0x') ? qrl.QRLAddress.fromHex(value) : qrl.QRLAddress.fromString(value)
  } catch (error) {
    throw invalidParams('Invalid QRL address', error)
  }
}

function parseHash(value: unknown): Uint8Array {
  return parseFixedBytes('QRL hash', value, 32)
}

function parseFixedBytes(name: string, value: unknown, length: number): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.length !== length) {
      throw invalidParams(`Invalid ${name} length=${value.length}`)
    }
    return new Uint8Array(value)
  }
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) {
    throw invalidParams(`${name} must be 0x-prefixed hex`)
  }
  const bytes = hexToBytes(value as PrefixedHexString)
  if (bytes.length !== length) {
    throw invalidParams(`Invalid ${name} length=${bytes.length}`)
  }
  return bytes
}

function parseOptionalData(value: QRLProviderTransactionRequest['data']): Uint8Array {
  if (value === undefined) {
    return new Uint8Array(0)
  }
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (typeof value !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(value)) {
    throw invalidParams('QRL data must be even-length 0x-prefixed hex')
  }
  return hexToBytes(value as PrefixedHexString)
}

function parseGasLimit(request: QRLProviderTransactionRequest): bigint {
  const gas = parseOptionalQuantity(request.gas, undefined, 'gas')
  const gasLimit = parseOptionalQuantity(request.gasLimit, undefined, 'gasLimit')
  if (gas !== undefined && gasLimit !== undefined && gas !== gasLimit) {
    throw invalidParams('QRL gas and gasLimit cannot differ')
  }
  return gas ?? gasLimit ?? DEFAULT_GAS_LIMIT
}

function parseOptionalQuantity(
  value: bigint | number | string | undefined,
  fallback: bigint | undefined,
  name: string,
): bigint
function parseOptionalQuantity(
  value: bigint | number | string | undefined,
  fallback: bigint,
  name: string,
): bigint
function parseOptionalQuantity(
  value: bigint | number | string | undefined,
  fallback: bigint | undefined,
  name: string,
): bigint | undefined {
  return value === undefined ? fallback : parseQuantity(value, name)
}

function parseQuantity(value: unknown, name: string): bigint {
  if (typeof value === 'bigint') {
    if (value < 0n) {
      throw invalidParams(`QRL ${name} cannot be negative`)
    }
    return value
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw invalidParams(`QRL ${name} must be a non-negative safe integer`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string') {
    if (/^0x[0-9a-fA-F]+$/.test(value)) {
      return BigInt(value)
    }
    if (/^[0-9]+$/.test(value)) {
      return BigInt(value)
    }
  }
  throw invalidParams(`QRL ${name} must be a quantity`)
}

function optionalRecordQuantity(record: Record<string, unknown>, name: string): bigint | undefined {
  return record[name] === undefined ? undefined : parseQuantity(record[name], name)
}

function assertLatestBlockTag(value: unknown): void {
  if (value === undefined || value === 'latest') {
    return
  }
  throw invalidParams('Only latest block tag is supported for this QRL local provider method')
}

function parseIncludeTransactions(value: unknown): boolean {
  if (value === undefined) {
    return false
  }
  if (typeof value !== 'boolean') {
    throw invalidParams('includeTransactions must be boolean')
  }
  return value
}

function expectParamCount(method: string, params: unknown[], count: number): void {
  if (params.length !== count) {
    throw invalidParams(`${method} expects ${count} params`)
  }
}

function expectParamRange(method: string, params: unknown[], min: number, max: number): void {
  if (params.length < min || params.length > max) {
    throw invalidParams(`${method} expects ${min}-${max} params`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidParams(message: string, data?: unknown): QRLProviderError {
  return new QRLProviderError(-32602, message, data)
}
