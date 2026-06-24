import type { qrl as stateQrl } from '@ethereumjs/statemanager'
import type { qrl } from '@ethereumjs/util'

import { QRLVMError, QRLVMRevert } from './errors.ts'
import { QRLMemory } from './memory.ts'
import type { QRLExecutionContext, QRLMessage } from './message.ts'
import { type QRLExecutionResult } from './result.ts'
import { QRLStack } from './stack.ts'
import { QRLUint512 } from './uint512.ts'

export interface QRLInterpreterOptions {
  stateManager: stateQrl.QRLStateManager
  context: QRLExecutionContext
}

export class QRLInterpreter {
  private readonly stateManager: stateQrl.QRLStateManager
  private readonly context: QRLExecutionContext

  public constructor(options: QRLInterpreterOptions) {
    this.stateManager = options.stateManager
    this.context = options.context
  }

  public async run(message: QRLMessage): Promise<QRLExecutionResult> {
    const stack = new QRLStack()
    const memory = new QRLMemory()
    const code = message.code
    const jumpdests = collectJumpdests(code)
    let pc = 0

    await this.stateManager.checkpoint()
    try {
      while (pc < code.length) {
        const opcodePc = pc
        const opcode = code[pc++]

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
            return success(stack, message.gasLimit)
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
          case 0x06:
            binary(stack, (a, b) => a.mod(b))
            break
          case 0x10:
            binary(stack, (a, b) => a.lt(b))
            break
          case 0x11:
            binary(stack, (a, b) => a.gt(b))
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
          case 0x30:
            pushAddress(stack, this.context.address)
            break
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
            memory.set(memOffset, size, readPadded(message.data, dataOffset, size))
            break
          }
          case 0x39: {
            const memOffset = toSafeNumber(stack.pop())
            const codeOffset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            memory.set(memOffset, size, readPadded(code, codeOffset, size))
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
          case 0x45:
            stack.push(QRLUint512.fromBigInt(this.context.gasLimit))
            break
          case 0x50:
            stack.pop()
            break
          case 0x51:
            stack.replaceTop(memory.getWord(toSafeNumber(stack.peek())))
            break
          case 0x52: {
            const offset = toSafeNumber(stack.pop())
            const value = stack.pop()
            memory.setWord(offset, value)
            break
          }
          case 0x53: {
            const offset = toSafeNumber(stack.pop())
            const value = stack.pop()
            memory.setByte(offset, value)
            break
          }
          case 0x54: {
            const key = stack.peek().toBytes32()
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
          case 0x5b:
            break
          case 0x5f:
            stack.push(QRLUint512.zero())
            break
          case 0xf3: {
            const offset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            const returnValue = memory.getCopy(offset, size)
            await this.stateManager.commit()
            return success(stack, message.gasLimit, new Uint8Array(returnValue))
          }
          case 0xfd: {
            const offset = toSafeNumber(stack.pop())
            const size = toSafeNumber(stack.pop())
            throw new QRLVMRevert(memory.getCopy(offset, size))
          }
          default:
            throw new QRLVMError(`Unsupported QRL opcode=0x${opcode.toString(16).padStart(2, '0')}`)
        }
      }

      await this.stateManager.commit()
      return success(stack, message.gasLimit)
    } catch (error) {
      await this.stateManager.revert()
      const exceptionError =
        error instanceof QRLVMError ? error : new QRLVMError((error as Error).message)
      return {
        returnValue: error instanceof QRLVMRevert ? error.returnValue : new Uint8Array(0),
        gasUsed: 0n,
        gasRemaining: message.gasLimit,
        exceptionError,
        stack,
      }
    }
  }
}

function success(
  stack: QRLStack,
  gasLimit: bigint,
  returnValue = new Uint8Array(0),
): QRLExecutionResult {
  return {
    returnValue,
    gasUsed: 0n,
    gasRemaining: gasLimit,
    stack,
  }
}

function binary(stack: QRLStack, op: (a: QRLUint512, b: QRLUint512) => QRLUint512): void {
  const a = stack.pop()
  const b = stack.pop()
  stack.push(op(a, b))
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
