import { QRLVMError } from './errors.ts'
import { QRL_WORD_BYTES } from './uint512.ts'

export const QRL_GAS = {
  quickStep: 2n,
  fastestStep: 3n,
  fastStep: 5n,
  midStep: 8n,
  slowStep: 10n,
  extStep: 20n,
  warmStorageRead: 100n,
  coldAccountAccess: 2600n,
  coldSload: 2100n,
  callValueTransfer: 9000n,
  callStipend: 2300n,
  callNewAccount: 25000n,
  create: 32000n,
  create2: 32000n,
  createData: 200n,
  copy: 3n,
  exp: 10n,
  expByte: 50n,
  initCodeWord: 2n,
  jumpdest: 1n,
  keccak256: 30n,
  keccak256Word: 6n,
  log: 375n,
  logData: 8n,
  logTopic: 375n,
  memory: 3n,
  quadCoeffDiv: 512n,
  sloadEip2200: 800n,
  sstoreSentryEip2200: 2300n,
  sstoreSetEip2200: 20000n,
  sstoreResetEip2200: 5000n,
  sstoreClearsScheduleRefundEip2200: 15000n,
  sstoreClearsScheduleRefundEip3529: 4800n,
} as const

export const QRL_MAX_MEMORY_GAS_SIZE = 0x1fffffffe0n
export const QRL_CALL_CREATE_DEPTH = 1024
export const QRL_MAX_CODE_SIZE = 24576
export const QRL_MAX_INIT_CODE_SIZE = 49152

export interface QRLDynamicGasOptions {
  memoryCurrentBytes?: bigint | number
  memoryTargetBytes?: bigint | number
  copySizeBytes?: bigint | number
  hashSizeBytes?: bigint | number
  logDataSizeBytes?: bigint | number
  logTopicCount?: bigint | number
  initCodeSizeBytes?: bigint | number
  exponentByteLength?: bigint | number
  callInputOffset?: bigint | number
  callInputSizeBytes?: bigint | number
  callOutputOffset?: bigint | number
  callOutputSizeBytes?: bigint | number
  transfersValue?: boolean
  createsAccount?: boolean
  warmAccess?: boolean
}

export function qrlBaseGas(opcode: number): bigint {
  if (!Number.isInteger(opcode) || opcode < 0 || opcode > 0xff) {
    throw new QRLVMError('Unsupported QRL opcode=' + opcode)
  }

  if (opcode >= 0x60 && opcode <= 0x9f) {
    return QRL_GAS.fastestStep
  }
  if (opcode >= 0xa0 && opcode <= 0xaf) {
    return QRL_GAS.fastestStep
  }
  if (opcode >= 0xb0 && opcode <= 0xbf) {
    return QRL_GAS.fastestStep
  }
  if (opcode >= 0xc0 && opcode <= 0xc4) {
    return 0n
  }

  switch (opcode) {
    case 0x00:
    case 0xf3:
    case 0xfd:
      return 0n
    case 0x01:
    case 0x03:
    case 0x10:
    case 0x11:
    case 0x12:
    case 0x13:
    case 0x14:
    case 0x15:
    case 0x16:
    case 0x17:
    case 0x18:
    case 0x19:
    case 0x1a:
    case 0x1b:
    case 0x1c:
    case 0x1d:
    case 0x35:
    case 0x37:
    case 0x39:
    case 0x3e:
    case 0x51:
    case 0x52:
    case 0x53:
      return QRL_GAS.fastestStep

    case 0x02:
    case 0x04:
    case 0x05:
    case 0x06:
    case 0x07:
    case 0x0b:
    case 0x47:
      return QRL_GAS.fastStep

    case 0x08:
    case 0x09:
    case 0x56:
      return QRL_GAS.midStep

    case 0x57:
      return QRL_GAS.slowStep

    case 0x20:
      return QRL_GAS.keccak256

    case 0x31:
    case 0x3b:
    case 0x3c:
    case 0x3f:
    case 0xf1:
    case 0xf4:
    case 0xfa:
      return QRL_GAS.warmStorageRead

    case 0x40:
      return QRL_GAS.extStep

    case 0x30:
    case 0x32:
    case 0x33:
    case 0x34:
    case 0x36:
    case 0x38:
    case 0x3a:
    case 0x3d:
    case 0x41:
    case 0x42:
    case 0x43:
    case 0x44:
    case 0x45:
    case 0x46:
    case 0x48:
    case 0x50:
    case 0x58:
    case 0x59:
    case 0x5a:
    case 0x5f:
      return QRL_GAS.quickStep

    case 0x5b:
      return QRL_GAS.jumpdest

    case 0x0a:
    case 0x54:
    case 0x55:
      return 0n

    case 0xf0:
      return QRL_GAS.create

    case 0xf5:
      return QRL_GAS.create2

    default:
      throw new QRLVMError('Unsupported QRL opcode=0x' + opcode.toString(16))
  }
}

export function qrlWordGas(sizeBytes: bigint | number): bigint {
  const size = toNonNegativeBigInt(sizeBytes, 'sizeBytes')
  if (size === 0n) {
    return 0n
  }
  return (size + BigInt(QRL_WORD_BYTES) - 1n) / BigInt(QRL_WORD_BYTES)
}

export function qrlMemoryTotalGas(sizeBytes: bigint | number): bigint {
  const size = toNonNegativeBigInt(sizeBytes, 'sizeBytes')
  if (size === 0n) {
    return 0n
  }
  if (size > QRL_MAX_MEMORY_GAS_SIZE) {
    throw new QRLVMError('QRL memory gas size overflow: ' + size.toString())
  }

  const words = qrlWordGas(size)
  return words * QRL_GAS.memory + (words * words) / QRL_GAS.quadCoeffDiv
}

export function qrlMemoryExpansionGas(
  currentBytes: bigint | number,
  targetBytes: bigint | number,
): bigint {
  const current = toNonNegativeBigInt(currentBytes, 'currentBytes')
  const target = toNonNegativeBigInt(targetBytes, 'targetBytes')
  if (target <= current) {
    return 0n
  }
  return qrlMemoryTotalGas(target) - qrlMemoryTotalGas(current)
}

export function qrlCopyGas(sizeBytes: bigint | number): bigint {
  return qrlWordGas(sizeBytes) * QRL_GAS.copy
}

export function qrlKeccak256DynamicGas(sizeBytes: bigint | number): bigint {
  return qrlWordGas(sizeBytes) * QRL_GAS.keccak256Word
}

export function qrlLogDynamicGas(
  topicCount: bigint | number,
  dataSizeBytes: bigint | number,
): bigint {
  const topics = toNonNegativeBigInt(topicCount, 'topicCount')
  const dataSize = toNonNegativeBigInt(dataSizeBytes, 'dataSizeBytes')
  return QRL_GAS.log + topics * QRL_GAS.logTopic + dataSize * QRL_GAS.logData
}

export function qrlCreateInitCodeGas(sizeBytes: bigint | number): bigint {
  return qrlWordGas(sizeBytes) * QRL_GAS.initCodeWord
}

export function qrlCreate2InitCodeGas(sizeBytes: bigint | number): bigint {
  return qrlCreateInitCodeGas(sizeBytes) + qrlKeccak256DynamicGas(sizeBytes)
}

export function qrlExpDynamicGas(exponentByteLength: bigint | number): bigint {
  return (
    QRL_GAS.exp + toNonNegativeBigInt(exponentByteLength, 'exponentByteLength') * QRL_GAS.expByte
  )
}

export interface QRLSStoreDynamicGasOptions {
  gasRemaining: bigint
  currentEqualsValue: boolean
  originalEqualsCurrent: boolean
  originalIsEmpty: boolean
  currentIsEmpty: boolean
  valueIsEmpty: boolean
  originalEqualsValue: boolean
  warmAccess: boolean
}

export interface QRLSStoreDynamicGasResult {
  gasCost: bigint
  refundDelta: bigint
}

export function qrlSLoadDynamicGas(warmAccess: boolean): bigint {
  return warmAccess ? QRL_GAS.warmStorageRead : QRL_GAS.coldSload
}

export function qrlSStoreDynamicGas(
  options: QRLSStoreDynamicGasOptions,
): QRLSStoreDynamicGasResult {
  if (options.gasRemaining <= QRL_GAS.sstoreSentryEip2200) {
    throw new QRLVMError('QRL SSTORE sentry gas not met')
  }

  const accessCost = options.warmAccess ? 0n : QRL_GAS.coldSload
  if (options.currentEqualsValue) {
    return { gasCost: accessCost + QRL_GAS.warmStorageRead, refundDelta: 0n }
  }

  if (options.originalEqualsCurrent) {
    if (options.originalIsEmpty) {
      return { gasCost: accessCost + QRL_GAS.sstoreSetEip2200, refundDelta: 0n }
    }
    return {
      gasCost: accessCost + (QRL_GAS.sstoreResetEip2200 - QRL_GAS.coldSload),
      refundDelta: options.valueIsEmpty ? QRL_GAS.sstoreClearsScheduleRefundEip3529 : 0n,
    }
  }

  let refundDelta = 0n
  if (!options.originalIsEmpty) {
    if (options.currentIsEmpty) {
      refundDelta -= QRL_GAS.sstoreClearsScheduleRefundEip3529
    } else if (options.valueIsEmpty) {
      refundDelta += QRL_GAS.sstoreClearsScheduleRefundEip3529
    }
  }
  if (options.originalEqualsValue) {
    if (options.originalIsEmpty) {
      refundDelta += QRL_GAS.sstoreSetEip2200 - QRL_GAS.warmStorageRead
    } else {
      refundDelta += QRL_GAS.sstoreResetEip2200 - QRL_GAS.coldSload - QRL_GAS.warmStorageRead
    }
  }

  return { gasCost: accessCost + QRL_GAS.warmStorageRead, refundDelta }
}

export interface QRLCallDynamicGasOptions {
  memoryCurrentBytes: bigint | number
  inputOffset: bigint | number
  inputSizeBytes: bigint | number
  outputOffset: bigint | number
  outputSizeBytes: bigint | number
  transfersValue?: boolean
  createsAccount?: boolean
  warmAccess?: boolean
}

export function qrlCallDynamicGas(options: QRLCallDynamicGasOptions): bigint {
  let gas = qrlMemoryExpansionGas(
    options.memoryCurrentBytes,
    maxMemoryTarget(
      options.inputOffset,
      options.inputSizeBytes,
      options.outputOffset,
      options.outputSizeBytes,
    ),
  )
  if (options.warmAccess === false) {
    gas += QRL_GAS.coldAccountAccess - QRL_GAS.warmStorageRead
  }
  if (options.transfersValue === true) {
    gas += QRL_GAS.callValueTransfer
    if (options.createsAccount === true) {
      gas += QRL_GAS.callNewAccount
    }
  }
  return gas
}

export function qrlChildCallGas(
  availableGas: bigint,
  baseGas: bigint,
  requestedGas: bigint,
): bigint {
  if (baseGas > availableGas) {
    throw new QRLVMError('QRL out of gas')
  }
  const allocatableGas = availableGas - baseGas
  const eip150Gas = allocatableGas - allocatableGas / 64n
  return requestedGas < eip150Gas ? requestedGas : eip150Gas
}

function maxMemoryTarget(
  firstOffset: bigint | number,
  firstSize: bigint | number,
  secondOffset: bigint | number,
  secondSize: bigint | number,
): bigint {
  const first = memoryTarget(firstOffset, firstSize, 'first')
  const second = memoryTarget(secondOffset, secondSize, 'second')
  return first > second ? first : second
}

function memoryTarget(
  offsetInput: bigint | number,
  sizeInput: bigint | number,
  name: string,
): bigint {
  const offset = toNonNegativeBigInt(offsetInput, name + 'Offset')
  const size = toNonNegativeBigInt(sizeInput, name + 'Size')
  return size === 0n ? 0n : offset + size
}

export function qrlDynamicGas(opcode: number, options: QRLDynamicGasOptions = {}): bigint {
  const memoryGas = qrlMemoryExpansionGas(
    options.memoryCurrentBytes ?? 0n,
    options.memoryTargetBytes ?? 0n,
  )

  switch (opcode) {
    case 0x20:
      return memoryGas + qrlKeccak256DynamicGas(options.hashSizeBytes ?? 0n)
    case 0x37:
    case 0x39:
    case 0x3c:
    case 0x3e:
      return memoryGas + qrlCopyGas(options.copySizeBytes ?? 0n)
    case 0x0a:
      return qrlExpDynamicGas(options.exponentByteLength ?? 0n)
    case 0xc0:
    case 0xc1:
    case 0xc2:
    case 0xc3:
    case 0xc4:
      return (
        memoryGas +
        qrlLogDynamicGas(
          options.logTopicCount ?? BigInt(opcode - 0xc0),
          options.logDataSizeBytes ?? 0n,
        )
      )
    case 0xf0:
      return memoryGas + qrlCreateInitCodeGas(options.initCodeSizeBytes ?? 0n)
    case 0xf5:
      return memoryGas + qrlCreate2InitCodeGas(options.initCodeSizeBytes ?? 0n)
    case 0xf1:
      return qrlCallDynamicGas({
        memoryCurrentBytes: options.memoryCurrentBytes ?? 0n,
        inputOffset: options.callInputOffset ?? 0n,
        inputSizeBytes: options.callInputSizeBytes ?? 0n,
        outputOffset: options.callOutputOffset ?? 0n,
        outputSizeBytes: options.callOutputSizeBytes ?? 0n,
        transfersValue: options.transfersValue,
        createsAccount: options.createsAccount,
        warmAccess: options.warmAccess,
      })
    case 0xf4:
    case 0xfa:
      return qrlCallDynamicGas({
        memoryCurrentBytes: options.memoryCurrentBytes ?? 0n,
        inputOffset: options.callInputOffset ?? 0n,
        inputSizeBytes: options.callInputSizeBytes ?? 0n,
        outputOffset: options.callOutputOffset ?? 0n,
        outputSizeBytes: options.callOutputSizeBytes ?? 0n,
        warmAccess: options.warmAccess,
      })
    default:
      return memoryGas
  }
}

function toNonNegativeBigInt(value: bigint | number, name: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new QRLVMError('Invalid QRL gas ' + name + '=' + value)
    }
    return BigInt(value)
  }
  if (value < 0n) {
    throw new QRLVMError('Invalid QRL gas ' + name + '=' + value.toString())
  }
  return value
}
