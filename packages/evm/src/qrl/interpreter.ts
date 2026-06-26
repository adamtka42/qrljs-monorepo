import { keccak_256 } from '@noble/hashes/sha3.js'
import type { qrl as stateQrl } from '@theqrl/statemanager'
import { qrl } from '@theqrl/util'

import { QRLVMError, QRLVMRevert } from './errors.ts'
import {
  QRL_CALL_CREATE_DEPTH,
  QRL_GAS,
  QRL_MAX_CODE_SIZE,
  QRL_MAX_INIT_CODE_SIZE,
  qrlBaseGas,
  qrlChildCallGas,
  qrlDynamicGas,
  qrlSLoadDynamicGas,
  qrlSStoreDynamicGas,
} from './gas.ts'
import { QRLMemory } from './memory.ts'
import { type QRLExecutionContext, QRLMessage } from './message.ts'
import { type QRLExecutionLog, type QRLExecutionResult } from './result.ts'
import { QRLStack } from './stack.ts'
import { QRLUint512 } from './uint512.ts'

export interface QRLWarmStorageAccess {
  address: qrl.QRLAddress
  key: Uint8Array
}

export interface QRLInterpreterOptions {
  stateManager: stateQrl.QRLStateManager
  context: QRLExecutionContext
  warmedAccounts?: Iterable<qrl.QRLAddress>
  warmedStorage?: Iterable<QRLWarmStorageAccess>
}

interface QRLNestedCallOptions {
  kind: 'call' | 'staticcall' | 'delegatecall'
  target: qrl.QRLAddress
  gasLimit: bigint
  value: bigint
  input: Uint8Array
  isStatic: boolean
  message: QRLMessage
}

interface QRLNestedCreateOptions {
  kind: 'create' | 'create2'
  value: bigint
  initCode: Uint8Array
  gasLimit: bigint
  salt?: Uint8Array
  message: QRLMessage
}

interface QRLNestedCreateResult {
  address: qrl.QRLAddress
  result: QRLExecutionResult
}

interface QRLGasState {
  accessedAccounts: Set<string>
  accessedStorage: Set<string>
  originalStorage: Map<string, Uint8Array>
  gasRefund: bigint
}

export class QRLInterpreter {
  private readonly stateManager: stateQrl.QRLStateManager
  private readonly context: QRLExecutionContext
  private readonly gasState: QRLGasState

  public constructor(options: QRLInterpreterOptions & { gasState?: QRLGasState }) {
    this.stateManager = options.stateManager
    this.context = options.context
    this.gasState = options.gasState ?? createGasState(options)
  }

  public async run(message: QRLMessage): Promise<QRLExecutionResult> {
    const stack = new QRLStack()
    const memory = new QRLMemory()
    const logs: QRLExecutionLog[] = []
    let returnData: Uint8Array<ArrayBufferLike> = new Uint8Array(message.returnData)
    const code = message.code
    const jumpdests = collectJumpdests(code)
    let pc = 0
    let gasUsed = 0n

    const gasRefundSnapshot = this.gasState.gasRefund
    await this.stateManager.checkpoint()
    try {
      while (pc < code.length) {
        const opcodePc = pc
        const opcode = code[pc++]
        gasUsed = consumeGas(gasUsed, message.gasLimit, qrlBaseGas(opcode))

        if (opcode >= 0x60 && opcode <= 0x9f) {
          const size = opcode - 0x5f
          stack.push(QRLUint512.fromBytes(readPadded(code, pc, size)))
          pc += size
          continue
        }

        if (opcode >= 0xa0 && opcode <= 0xaf) {
          stack.dup(opcode - 0x9f)
          continue
        }

        if (opcode >= 0xb0 && opcode <= 0xbf) {
          stack.swap(opcode - 0xaf)
          continue
        }

        switch (opcode) {
          case 0x00:
            await this.stateManager.commit()
            return success(
              stack,
              message.gasLimit,
              gasUsed,
              this.gasState.gasRefund,
              new Uint8Array(0),
              logs,
            )
          case 0x01:
            binary(stack, (a, b) => a.add(b))
            break
          case 0x02:
            binary(stack, (a, b) => a.mul(b))
            break
          case 0x03:
            binary(stack, (a, b) => a.sub(b))
            break
          case 0x04:
            binary(stack, (a, b) => a.div(b))
            break
          case 0x05:
            binary(stack, (a, b) => a.sdiv(b))
            break
          case 0x06:
            binary(stack, (a, b) => a.mod(b))
            break
          case 0x07:
            binary(stack, (a, b) => a.smod(b))
            break
          case 0x08:
            ternary(stack, (a, b, c) => a.addmod(b, c))
            break
          case 0x09:
            ternary(stack, (a, b, c) => a.mulmod(b, c))
            break
          case 0x0a: {
            const base = stack.pop()
            const exponent = stack.pop()
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              exponentByteLength: exponentByteLength(exponent),
            })
            stack.push(base.exp(exponent))
            break
          }
          case 0x0b: {
            const byteIndex = stack.pop()
            const value = stack.pop()
            stack.push(value.signExtend(byteIndex))
            break
          }
          case 0x10:
            binary(stack, (a, b) => a.lt(b))
            break
          case 0x11:
            binary(stack, (a, b) => a.gt(b))
            break
          case 0x12:
            binary(stack, (a, b) => a.slt(b))
            break
          case 0x13:
            binary(stack, (a, b) => a.sgt(b))
            break
          case 0x14:
            binary(stack, (a, b) => a.eq(b))
            break
          case 0x15:
            stack.push(stack.pop().isZero() ? QRLUint512.one() : QRLUint512.zero())
            break
          case 0x16:
            binary(stack, (a, b) => a.and(b))
            break
          case 0x17:
            binary(stack, (a, b) => a.or(b))
            break
          case 0x18:
            binary(stack, (a, b) => a.xor(b))
            break
          case 0x19:
            stack.push(stack.pop().not())
            break
          case 0x1a: {
            const index = stack.pop()
            const value = stack.pop()
            stack.push(value.byte(index))
            break
          }
          case 0x1b:
            binary(stack, (shift, value) => value.shl(shift))
            break
          case 0x1c:
            binary(stack, (shift, value) => value.shr(shift))
            break
          case 0x1d:
            binary(stack, (shift, value) => value.sar(shift))
            break
          case 0x20: {
            const offset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              hashSizeBytes: size,
              memoryTargetBytes: memoryTarget(offset, size),
            })
            stack.push(QRLUint512.fromBytes(keccak_256(memory.getCopy(offset, size))))
            break
          }
          case 0x30:
            pushAddress(stack, this.context.address)
            break
          case 0x31: {
            const address = qrl.QRLAddress.fromBytes(stack.pop().toBytes64())
            gasUsed = this.chargeAccountAccess(gasUsed, message.gasLimit, address)
            stack.push(QRLUint512.fromBigInt(await this.stateManager.getBalance(address)))
            break
          }
          case 0x32:
            pushAddress(stack, this.context.origin)
            break
          case 0x33:
            pushAddress(stack, message.caller)
            break
          case 0x34:
            stack.push(QRLUint512.fromBigInt(message.value))
            break
          case 0x35: {
            const offset = toSafeNumber(stack.pop())
            stack.push(QRLUint512.fromBytes(readPadded(message.data, offset, 64)))
            break
          }
          case 0x36:
            stack.push(QRLUint512.fromBigInt(BigInt(message.data.length)))
            break
          case 0x37: {
            const memOffset = toSafeNumber(stack.pop())
            const dataOffset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              copySizeBytes: size,
              memoryTargetBytes: memoryTarget(memOffset, size),
            })
            memory.set(memOffset, size, readPadded(message.data, dataOffset, size))
            break
          }
          case 0x38:
            stack.push(QRLUint512.fromBigInt(BigInt(code.length)))
            break
          case 0x39: {
            const memOffset = toSafeNumber(stack.pop())
            const codeOffset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              copySizeBytes: size,
              memoryTargetBytes: memoryTarget(memOffset, size),
            })
            memory.set(memOffset, size, readPadded(code, codeOffset, size))
            break
          }
          case 0x3a:
            stack.push(QRLUint512.fromBigInt(this.context.gasPrice))
            break
          case 0x3b: {
            const address = qrl.QRLAddress.fromBytes(stack.pop().toBytes64())
            gasUsed = this.chargeAccountAccess(gasUsed, message.gasLimit, address)
            stack.push(QRLUint512.fromBigInt(BigInt(await this.stateManager.getCodeSize(address))))
            break
          }
          case 0x3c: {
            const address = qrl.QRLAddress.fromBytes(stack.pop().toBytes64())
            const memOffset = toSafeNumber(stack.pop())
            const codeOffset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = this.chargeAccountAccess(gasUsed, message.gasLimit, address)
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              copySizeBytes: size,
              memoryTargetBytes: memoryTarget(memOffset, size),
            })
            memory.set(
              memOffset,
              size,
              readPadded(await this.stateManager.getCode(address), codeOffset, size),
            )
            break
          }
          case 0x3d:
            stack.push(QRLUint512.fromBigInt(BigInt(returnData.length)))
            break
          case 0x3e: {
            const memOffset = toSafeNumber(stack.pop())
            const dataOffset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              copySizeBytes: size,
              memoryTargetBytes: memoryTarget(memOffset, size),
            })
            memory.set(memOffset, size, readReturnData(returnData, dataOffset, size))
            break
          }
          case 0x3f: {
            const address = qrl.QRLAddress.fromBytes(stack.pop().toBytes64())
            gasUsed = this.chargeAccountAccess(gasUsed, message.gasLimit, address)
            const account = await this.stateManager.getAccount(address)
            stack.push(QRLUint512.fromBytes(account?.codeHash ?? new Uint8Array(32)))
            break
          }
          case 0x40: {
            const blockNumber = stack.pop().toBigInt()
            const hash = this.context.blockHashes.get(blockNumber) ?? new Uint8Array(32)
            stack.push(QRLUint512.fromBytes(hash))
            break
          }
          case 0x41:
            pushAddress(stack, this.context.coinbase)
            break
          case 0x42:
            stack.push(QRLUint512.fromBigInt(this.context.timestamp))
            break
          case 0x43:
            stack.push(QRLUint512.fromBigInt(this.context.blockNumber))
            break
          case 0x44:
            stack.push(QRLUint512.fromBigInt(this.context.prevRandao))
            break
          case 0x45:
            stack.push(QRLUint512.fromBigInt(this.context.gasLimit))
            break
          case 0x46:
            stack.push(QRLUint512.fromBigInt(this.context.chainId))
            break
          case 0x47:
            stack.push(QRLUint512.fromBigInt(await this.stateManager.getBalance(message.to)))
            break
          case 0x48:
            stack.push(QRLUint512.fromBigInt(this.context.baseFee))
            break
          case 0x50:
            stack.pop()
            break
          case 0x51: {
            const offset = toSafeNumber(stack.peek())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              memoryTargetBytes: memoryTarget(offset, 64),
            })
            stack.replaceTop(memory.getWord(offset))
            break
          }
          case 0x52: {
            const offset = toSafeNumber(stack.pop())
            const value = stack.pop()
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              memoryTargetBytes: memoryTarget(offset, 64),
            })
            memory.setWord(offset, value)
            break
          }
          case 0x53: {
            const offset = toSafeNumber(stack.pop())
            const value = stack.pop()
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              memoryTargetBytes: memoryTarget(offset, 1),
            })
            memory.setByte(offset, value)
            break
          }
          case 0x54: {
            const key = stack.peek().toBytes32()
            const accessKey = storageAccessKey(message.to, key)
            const warmAccess = this.gasState.accessedStorage.has(accessKey)
            gasUsed = consumeGas(gasUsed, message.gasLimit, qrlSLoadDynamicGas(warmAccess))
            this.gasState.accessedStorage.add(accessKey)
            stack.replaceTop(
              QRLUint512.fromBytes(await this.stateManager.getStorage(message.to, key)),
            )
            break
          }
          case 0x55: {
            if (message.isStatic) {
              throw new QRLVMError('QRL static execution cannot write storage')
            }
            const key = stack.pop().toBytes32()
            const value = stack.pop().toBytes64()
            const accessKey = storageAccessKey(message.to, key)
            const warmAccess = this.gasState.accessedStorage.has(accessKey)
            const current = await this.stateManager.getStorage(message.to, key)
            const original = await this.getOriginalStorage(message.to, key, accessKey, current)
            const { gasCost, refundDelta } = qrlSStoreDynamicGas({
              gasRemaining: gasRemaining(message.gasLimit, gasUsed),
              currentEqualsValue: equalBytes(current, value),
              originalEqualsCurrent: equalBytes(original, current),
              originalIsEmpty: isEmptyStorageValue(original),
              currentIsEmpty: isEmptyStorageValue(current),
              valueIsEmpty: isEmptyStorageValue(value),
              originalEqualsValue: equalBytes(original, value),
              warmAccess,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, gasCost)
            this.gasState.accessedStorage.add(accessKey)
            this.gasState.gasRefund += refundDelta
            await this.stateManager.putStorage(message.to, key, value)
            break
          }
          case 0x56: {
            const dest = toSafeNumber(stack.pop())
            assertJumpdest(jumpdests, dest)
            pc = dest
            break
          }
          case 0x57: {
            const dest = toSafeNumber(stack.pop())
            const condition = stack.pop()
            if (!condition.isZero()) {
              assertJumpdest(jumpdests, dest)
              pc = dest
            }
            break
          }
          case 0x58:
            stack.push(QRLUint512.fromBigInt(BigInt(opcodePc)))
            break
          case 0x59:
            stack.push(QRLUint512.fromBigInt(BigInt(memory.length())))
            break
          case 0x5a:
            stack.push(QRLUint512.fromBigInt(message.gasLimit - gasUsed))
            break
          case 0x5b:
            break
          case 0x5f:
            stack.push(QRLUint512.zero())
            break
          case 0xc0:
          case 0xc1:
          case 0xc2:
          case 0xc3:
          case 0xc4: {
            const topicCount = opcode - 0xc0
            const logRecord = popLog(stack, topicCount, message.to, message.isStatic)
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              logDataSizeBytes: logRecord.dataSize,
              logTopicCount: topicCount,
              memoryTargetBytes: memoryTarget(logRecord.offset, logRecord.dataSize),
            })
            logs.push({
              address: logRecord.address,
              topics: logRecord.topics,
              data: memory.getCopy(logRecord.offset, logRecord.dataSize),
            })
            break
          }
          case 0xf0: {
            const args = popCreateArgs(stack)
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              initCodeSizeBytes: args.size,
              memoryTargetBytes: memoryTarget(args.offset, args.size),
            })
            const childGasLimit = qrlChildCallGas(
              gasRemaining(message.gasLimit, gasUsed),
              0n,
              message.gasLimit,
            )
            const create = await this.runNestedCreate({
              kind: 'create',
              value: args.value,
              initCode: memory.getCopy(args.offset, args.size),
              gasLimit: childGasLimit,
              message,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, create.result.gasUsed)
            if (create.result.exceptionError === undefined) {
              returnData = new Uint8Array(0)
              pushAddress(stack, create.address)
            } else {
              returnData = create.result.returnValue
              stack.push(QRLUint512.zero())
            }
            break
          }
          case 0xf1: {
            const args = popCallArgs(stack)
            const warmAccess = this.isWarmAccount(args.target)
            const callGasCost = qrlDynamicGas(opcode, {
              memoryCurrentBytes: memory.length(),
              callInputOffset: args.inOffset,
              callInputSizeBytes: args.inSize,
              callOutputOffset: args.outOffset,
              callOutputSizeBytes: args.outSize,
              transfersValue: args.value !== 0n,
              createsAccount: args.value !== 0n && (await this.isEmptyAccount(args.target)),
              warmAccess,
            })
            let childGasLimit = qrlChildCallGas(
              gasRemaining(message.gasLimit, gasUsed),
              callGasCost,
              args.gasLimit,
            )
            if (args.value !== 0n) {
              childGasLimit += QRL_GAS.callStipend
            }
            gasUsed = consumeGas(gasUsed, message.gasLimit, callGasCost)
            this.markWarmAccount(args.target)
            const result = await this.runNestedCall({
              kind: 'call',
              target: args.target,
              gasLimit: childGasLimit,
              value: args.value,
              input: memory.getCopy(args.inOffset, args.inSize),
              isStatic: message.isStatic,
              message,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, result.gasUsed)
            returnData = copyCallReturnData(memory, args.outOffset, args.outSize, result)
            if (result.exceptionError === undefined) {
              logs.push(...(result.logs ?? []).map(copyExecutionLog))
            }
            stack.push(result.exceptionError === undefined ? QRLUint512.one() : QRLUint512.zero())
            break
          }
          case 0xf4: {
            const args = popStaticCallArgs(stack)
            const warmAccess = this.isWarmAccount(args.target)
            const callGasCost = qrlDynamicGas(opcode, {
              memoryCurrentBytes: memory.length(),
              callInputOffset: args.inOffset,
              callInputSizeBytes: args.inSize,
              callOutputOffset: args.outOffset,
              callOutputSizeBytes: args.outSize,
              warmAccess,
            })
            const childGasLimit = qrlChildCallGas(
              gasRemaining(message.gasLimit, gasUsed),
              callGasCost,
              args.gasLimit,
            )
            gasUsed = consumeGas(gasUsed, message.gasLimit, callGasCost)
            this.markWarmAccount(args.target)
            const result = await this.runNestedCall({
              kind: 'delegatecall',
              target: args.target,
              gasLimit: childGasLimit,
              value: message.value,
              input: memory.getCopy(args.inOffset, args.inSize),
              isStatic: message.isStatic,
              message,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, result.gasUsed)
            returnData = copyCallReturnData(memory, args.outOffset, args.outSize, result)
            if (result.exceptionError === undefined) {
              logs.push(...(result.logs ?? []).map(copyExecutionLog))
            }
            stack.push(result.exceptionError === undefined ? QRLUint512.one() : QRLUint512.zero())
            break
          }
          case 0xf5: {
            const args = popCreate2Args(stack)
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              initCodeSizeBytes: args.size,
              memoryTargetBytes: memoryTarget(args.offset, args.size),
            })
            const childGasLimit = qrlChildCallGas(
              gasRemaining(message.gasLimit, gasUsed),
              0n,
              message.gasLimit,
            )
            const create = await this.runNestedCreate({
              kind: 'create2',
              value: args.value,
              initCode: memory.getCopy(args.offset, args.size),
              gasLimit: childGasLimit,
              salt: args.salt,
              message,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, create.result.gasUsed)
            if (create.result.exceptionError === undefined) {
              returnData = new Uint8Array(0)
              pushAddress(stack, create.address)
            } else {
              returnData = create.result.returnValue
              stack.push(QRLUint512.zero())
            }
            break
          }
          case 0xfa: {
            const args = popStaticCallArgs(stack)
            const warmAccess = this.isWarmAccount(args.target)
            const callGasCost = qrlDynamicGas(opcode, {
              memoryCurrentBytes: memory.length(),
              callInputOffset: args.inOffset,
              callInputSizeBytes: args.inSize,
              callOutputOffset: args.outOffset,
              callOutputSizeBytes: args.outSize,
              warmAccess,
            })
            const childGasLimit = qrlChildCallGas(
              gasRemaining(message.gasLimit, gasUsed),
              callGasCost,
              args.gasLimit,
            )
            gasUsed = consumeGas(gasUsed, message.gasLimit, callGasCost)
            this.markWarmAccount(args.target)
            const result = await this.runNestedCall({
              kind: 'staticcall',
              target: args.target,
              gasLimit: childGasLimit,
              value: 0n,
              input: memory.getCopy(args.inOffset, args.inSize),
              isStatic: true,
              message,
            })
            gasUsed = consumeGas(gasUsed, message.gasLimit, result.gasUsed)
            returnData = copyCallReturnData(memory, args.outOffset, args.outSize, result)
            if (result.exceptionError === undefined) {
              logs.push(...(result.logs ?? []).map(copyExecutionLog))
            }
            stack.push(result.exceptionError === undefined ? QRLUint512.one() : QRLUint512.zero())
            break
          }
          case 0xf3: {
            const offset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              memoryTargetBytes: memoryTarget(offset, size),
            })
            const returnValue = memory.getCopy(offset, size)
            await this.stateManager.commit()
            return success(
              stack,
              message.gasLimit,
              gasUsed,
              this.gasState.gasRefund,
              new Uint8Array(returnValue),
              logs,
            )
          }
          case 0xfd: {
            const offset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            gasUsed = chargeDynamicGas(gasUsed, message.gasLimit, opcode, memory, {
              memoryTargetBytes: memoryTarget(offset, size),
            })
            throw new QRLVMRevert(memory.getCopy(offset, size))
          }
          case 0xfe:
            throw new QRLVMError('QRL invalid opcode')
          default:
            throw new QRLVMError(`Unsupported QRL opcode=0x${opcode.toString(16).padStart(2, '0')}`)
        }
      }

      await this.stateManager.commit()
      return success(
        stack,
        message.gasLimit,
        gasUsed,
        this.gasState.gasRefund,
        new Uint8Array(0),
        logs,
      )
    } catch (error) {
      await this.stateManager.revert()
      this.gasState.gasRefund = gasRefundSnapshot
      const exceptionError =
        error instanceof QRLVMError ? error : new QRLVMError((error as Error).message)
      const reverted = error instanceof QRLVMRevert
      return {
        returnValue: reverted ? error.returnValue : new Uint8Array(0),
        gasUsed: reverted ? gasUsed : message.gasLimit,
        gasRemaining: reverted ? gasRemaining(message.gasLimit, gasUsed) : 0n,
        gasRefund: reverted ? this.gasState.gasRefund : 0n,
        exceptionError,
        stack,
      }
    }
  }

  private chargeAccountAccess(gasUsed: bigint, gasLimit: bigint, address: qrl.QRLAddress): bigint {
    const warmAccess = this.isWarmAccount(address)
    this.markWarmAccount(address)
    if (warmAccess) {
      return gasUsed
    }
    return consumeGas(gasUsed, gasLimit, QRL_GAS.coldAccountAccess - QRL_GAS.warmStorageRead)
  }

  private isWarmAccount(address: qrl.QRLAddress): boolean {
    return this.gasState.accessedAccounts.has(address.toHex())
  }

  private markWarmAccount(address: qrl.QRLAddress): void {
    this.gasState.accessedAccounts.add(address.toHex())
  }

  private async isEmptyAccount(address: qrl.QRLAddress): Promise<boolean> {
    return (
      (await this.stateManager.getNonce(address)) === 0n &&
      (await this.stateManager.getBalance(address)) === 0n &&
      (await this.stateManager.getCodeSize(address)) === 0
    )
  }

  private async getOriginalStorage(
    address: qrl.QRLAddress,
    key: Uint8Array,
    accessKey: string,
    current: Uint8Array,
  ): Promise<Uint8Array> {
    const cached = this.gasState.originalStorage.get(accessKey)
    if (cached !== undefined) {
      return new Uint8Array(cached)
    }
    const original = new Uint8Array(current ?? (await this.stateManager.getStorage(address, key)))
    this.gasState.originalStorage.set(accessKey, original)
    return new Uint8Array(original)
  }

  private async runNestedCreate(options: QRLNestedCreateOptions): Promise<QRLNestedCreateResult> {
    if (options.initCode.length > QRL_MAX_INIT_CODE_SIZE) {
      return nestedCreateError(
        qrl.QRLAddress.zero(),
        options.gasLimit,
        'QRL init code size exceeds limit',
      )
    }
    if (options.message.depth >= QRL_CALL_CREATE_DEPTH) {
      return nestedCreateError(
        qrl.QRLAddress.zero(),
        options.gasLimit,
        'QRL call/create depth exceeded',
      )
    }
    if (options.message.isStatic) {
      throw new QRLVMError('QRL static execution cannot create contracts')
    }

    const creator = options.message.to
    const address =
      options.kind === 'create'
        ? qrl.createQRLContractAddress(creator, await this.stateManager.getNonce(creator))
        : qrl.createQRLContractAddress2(creator, options.salt!, keccak_256(options.initCode))
    const context: QRLExecutionContext = {
      ...this.context,
      caller: creator,
      address,
    }

    if (options.value !== 0n && (await this.stateManager.getBalance(creator)) < options.value) {
      return nestedCreateError(address, options.gasLimit, 'QRL account balance underflow')
    }

    await this.stateManager.incrementNonce(creator)
    if (
      (await this.stateManager.getNonce(address)) !== 0n ||
      (await this.stateManager.getCodeSize(address)) !== 0
    ) {
      return nestedCreateError(address, options.gasLimit, 'QRL contract address collision')
    }

    const gasRefundSnapshot = this.gasState.gasRefund
    await this.stateManager.checkpoint()
    try {
      await this.stateManager.setNonce(address, 1n)
      if (options.value !== 0n) {
        await this.stateManager.subBalance(creator, options.value)
        await this.stateManager.addBalance(address, options.value)
      }

      const result = await new QRLInterpreter({
        stateManager: this.stateManager,
        context,
        gasState: this.gasState,
      }).run(
        new QRLMessage({
          caller: creator,
          to: address,
          value: options.value,
          data: new Uint8Array(0),
          code: options.initCode,
          gasLimit: options.gasLimit,
          depth: options.message.depth + 1,
          isStatic: false,
        }),
      )

      if (result.exceptionError !== undefined) {
        await this.stateManager.revert()
        this.gasState.gasRefund = gasRefundSnapshot
        return { address, result }
      }

      if (!isValidDeployedCode(result.returnValue)) {
        await this.stateManager.revert()
        this.gasState.gasRefund = gasRefundSnapshot
        return {
          address,
          result: {
            ...result,
            gasRefund: gasRefundSnapshot,
            exceptionError: new QRLVMError('QRL invalid deployed code'),
          },
        }
      }

      await this.stateManager.putCode(address, result.returnValue)
      await this.stateManager.commit()
      return { address, result }
    } catch (error) {
      await this.stateManager.revert()
      this.gasState.gasRefund = gasRefundSnapshot
      return {
        address,
        result: {
          returnValue: new Uint8Array(0),
          gasUsed: options.gasLimit,
          gasRemaining: 0n,
          gasRefund: 0n,
          exceptionError:
            error instanceof QRLVMError ? error : new QRLVMError((error as Error).message),
        },
      }
    }
  }

  private async runNestedCall(options: QRLNestedCallOptions): Promise<QRLExecutionResult> {
    if (options.message.depth >= QRL_CALL_CREATE_DEPTH) {
      return nestedCallError(
        options.gasLimit,
        'QRL call/create depth exceeded',
        this.gasState.gasRefund,
      )
    }
    if (options.kind === 'call' && options.isStatic && options.value !== 0n) {
      throw new QRLVMError('QRL static execution cannot transfer value')
    }

    const isDelegateCall = options.kind === 'delegatecall'
    const address = isDelegateCall ? options.message.to : options.target
    const caller = isDelegateCall ? options.message.caller : options.message.to
    const code = await this.stateManager.getCode(options.target)
    const context: QRLExecutionContext = {
      ...this.context,
      caller,
      address,
    }

    const gasRefundSnapshot = this.gasState.gasRefund
    await this.stateManager.checkpoint()
    try {
      if (options.kind === 'call' && options.value !== 0n) {
        await this.stateManager.subBalance(options.message.to, options.value)
        await this.stateManager.addBalance(options.target, options.value)
      }

      const result = await new QRLInterpreter({
        stateManager: this.stateManager,
        context,
        gasState: this.gasState,
      }).run(
        new QRLMessage({
          caller,
          to: address,
          value: options.value,
          data: options.input,
          code,
          gasLimit: options.gasLimit,
          depth: options.message.depth + 1,
          isStatic: options.isStatic,
        }),
      )

      if (result.exceptionError !== undefined) {
        await this.stateManager.revert()
        this.gasState.gasRefund = gasRefundSnapshot
        return result
      }

      await this.stateManager.commit()
      return result
    } catch (error) {
      await this.stateManager.revert()
      this.gasState.gasRefund = gasRefundSnapshot
      return {
        returnValue: new Uint8Array(0),
        gasUsed: options.gasLimit,
        gasRemaining: 0n,
        gasRefund: 0n,
        exceptionError:
          error instanceof QRLVMError ? error : new QRLVMError((error as Error).message),
      }
    }
  }
}

function createGasState(options: QRLInterpreterOptions): QRLGasState {
  const accessedAccounts = new Set<string>()
  for (const address of options.warmedAccounts ?? []) {
    accessedAccounts.add(address.toHex())
  }

  const accessedStorage = new Set<string>()
  for (const access of options.warmedStorage ?? []) {
    accessedStorage.add(storageAccessKey(access.address, access.key))
  }

  return {
    accessedAccounts,
    accessedStorage,
    originalStorage: new Map(),
    gasRefund: 0n,
  }
}

function nestedCallError(gasLimit: bigint, message: string, gasRefund: bigint): QRLExecutionResult {
  return {
    returnValue: new Uint8Array(0),
    gasUsed: 0n,
    gasRemaining: gasLimit,
    gasRefund,
    exceptionError: new QRLVMError(message),
  }
}

function nestedCreateError(
  address: qrl.QRLAddress,
  gasLimit: bigint,
  message: string,
): QRLNestedCreateResult {
  return {
    address,
    result: {
      returnValue: new Uint8Array(0),
      gasUsed: 0n,
      gasRemaining: gasLimit,
      gasRefund: 0n,
      exceptionError: new QRLVMError(message),
    },
  }
}

function success(
  stack: QRLStack,
  gasLimit: bigint,
  gasUsed: bigint,
  gasRefund: bigint,
  returnValue = new Uint8Array(0),
  logs: readonly QRLExecutionLog[] = [],
): QRLExecutionResult {
  return {
    returnValue,
    gasUsed,
    gasRemaining: gasRemaining(gasLimit, gasUsed),
    gasRefund,
    stack,
    logs: logs.map(copyExecutionLog),
  }
}

function isValidDeployedCode(code: Uint8Array): boolean {
  return code.length <= QRL_MAX_CODE_SIZE && code[0] !== 0xef
}

function storageAccessKey(address: qrl.QRLAddress, key: Uint8Array): string {
  return address.toHex() + ':' + bytesToHex(key)
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false
    }
  }
  return true
}

function isEmptyStorageValue(value: Uint8Array): boolean {
  return value.every((byte) => byte === 0)
}

function chargeDynamicGas(
  gasUsed: bigint,
  gasLimit: bigint,
  opcode: number,
  memory: QRLMemory,
  options: Parameters<typeof qrlDynamicGas>[1],
): bigint {
  return consumeGas(
    gasUsed,
    gasLimit,
    qrlDynamicGas(opcode, {
      ...options,
      memoryCurrentBytes: memory.length(),
    }),
  )
}

function consumeGas(gasUsed: bigint, gasLimit: bigint, gasCost: bigint): bigint {
  const nextGasUsed = gasUsed + gasCost
  if (nextGasUsed > gasLimit) {
    throw new QRLVMError('QRL out of gas')
  }
  return nextGasUsed
}

function gasRemaining(gasLimit: bigint, gasUsed: bigint): bigint {
  return gasUsed > gasLimit ? 0n : gasLimit - gasUsed
}

function memoryTarget(offset: number, size: number): bigint {
  if (size === 0) {
    return 0n
  }
  return BigInt(offset) + BigInt(size)
}

function exponentByteLength(exponent: QRLUint512): number {
  const bytes = exponent.toBytes64()
  const firstNonZero = bytes.findIndex((byte) => byte !== 0)
  return firstNonZero === -1 ? 0 : bytes.length - firstNonZero
}

function binary(stack: QRLStack, op: (a: QRLUint512, b: QRLUint512) => QRLUint512): void {
  const a = stack.pop()
  const b = stack.pop()
  stack.push(op(a, b))
}

function ternary(
  stack: QRLStack,
  op: (a: QRLUint512, b: QRLUint512, c: QRLUint512) => QRLUint512,
): void {
  const a = stack.pop()
  const b = stack.pop()
  const c = stack.pop()
  stack.push(op(a, b, c))
}

function popCreateArgs(stack: QRLStack): {
  value: bigint
  offset: number
  size: number
} {
  return {
    value: stack.pop().toBigInt(),
    offset: toSafeNumber(stack.pop()),
    size: toSafeNumber(stack.pop()),
  }
}

function popCreate2Args(stack: QRLStack): {
  value: bigint
  offset: number
  size: number
  salt: Uint8Array
} {
  return {
    value: stack.pop().toBigInt(),
    offset: toSafeNumber(stack.pop()),
    size: toSafeNumber(stack.pop()),
    salt: stack.pop().toBytes64(),
  }
}

function popCallArgs(stack: QRLStack): {
  gasLimit: bigint
  target: qrl.QRLAddress
  value: bigint
  inOffset: number
  inSize: number
  outOffset: number
  outSize: number
} {
  return {
    gasLimit: stack.pop().toBigInt(),
    target: qrl.QRLAddress.fromBytes(stack.pop().toBytes64()),
    value: stack.pop().toBigInt(),
    inOffset: toSafeNumber(stack.pop()),
    inSize: toSafeNumber(stack.pop()),
    outOffset: toSafeNumber(stack.pop()),
    outSize: toSafeNumber(stack.pop()),
  }
}

function popStaticCallArgs(stack: QRLStack): {
  gasLimit: bigint
  target: qrl.QRLAddress
  inOffset: number
  inSize: number
  outOffset: number
  outSize: number
} {
  return {
    gasLimit: stack.pop().toBigInt(),
    target: qrl.QRLAddress.fromBytes(stack.pop().toBytes64()),
    inOffset: toSafeNumber(stack.pop()),
    inSize: toSafeNumber(stack.pop()),
    outOffset: toSafeNumber(stack.pop()),
    outSize: toSafeNumber(stack.pop()),
  }
}

function copyCallReturnData(
  memory: QRLMemory,
  outOffset: number,
  outSize: number,
  result: QRLExecutionResult,
): Uint8Array {
  const returnData = new Uint8Array(result.returnValue)
  const copySize = Math.min(outSize, returnData.length)
  if (copySize > 0) {
    memory.set(outOffset, copySize, returnData.subarray(0, copySize))
  }
  return returnData
}

function popLog(
  stack: QRLStack,
  topicCount: number,
  address: qrl.QRLAddress,
  isStatic: boolean,
): QRLExecutionLog & { offset: number; dataSize: number } {
  if (isStatic) {
    throw new QRLVMError('QRL static execution cannot emit logs')
  }
  const offset = toSafeNumber(stack.pop())
  const dataSize = toSafeNumber(stack.pop())
  const topics: Uint8Array[] = []
  for (let i = 0; i < topicCount; i++) {
    topics.push(stack.pop().toBytes64())
  }
  return {
    address: qrl.QRLAddress.fromBytes(address.toBytes()),
    topics,
    data: new Uint8Array(0),
    offset,
    dataSize,
  }
}

function copyExecutionLog(log: QRLExecutionLog): QRLExecutionLog {
  return {
    address: qrl.QRLAddress.fromBytes(log.address.toBytes()),
    topics: log.topics.map((topic) => new Uint8Array(topic)),
    data: new Uint8Array(log.data),
  }
}

function pushAddress(stack: QRLStack, address: qrl.QRLAddress): void {
  stack.push(QRLUint512.fromBytes(address.toBytes()))
}

function toSafeNumber(value: QRLUint512): number {
  const bigint = value.toBigInt()
  if (bigint > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new QRLVMError(`QRL value exceeds safe JS integer=${bigint.toString()}`)
  }
  return Number(bigint)
}

function readPadded(source: Uint8Array, offset: number, size: number): Uint8Array {
  const out = new Uint8Array(size)
  if (offset < source.length) {
    out.set(source.subarray(offset, offset + size))
  }
  return out
}

function readReturnData(
  source: Uint8Array<ArrayBufferLike>,
  offset: number,
  size: number,
): Uint8Array {
  if (offset + size > source.length) {
    throw new QRLVMError(
      `QRL return data copy out of bounds offset=${offset} size=${size} length=${source.length}`,
    )
  }
  return new Uint8Array(source.subarray(offset, offset + size))
}

function collectJumpdests(code: Uint8Array): Set<number> {
  const jumpdests = new Set<number>()
  for (let pc = 0; pc < code.length; pc++) {
    const opcode = code[pc]
    if (opcode === 0x5b) {
      jumpdests.add(pc)
    } else if (opcode >= 0x60 && opcode <= 0x9f) {
      pc += opcode - 0x5f
    }
  }
  return jumpdests
}

function assertJumpdest(jumpdests: Set<number>, dest: number): void {
  if (!jumpdests.has(dest)) {
    throw new QRLVMError(`Invalid QRL jump destination=${dest}`)
  }
}
