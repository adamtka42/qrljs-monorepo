import { QRLJSErrorWithoutCode, equalsBytes } from '@ethereumjs/util'

import {
  QRL_EMPTY_CODE_HASH,
  QRL_EMPTY_ROOT_HASH,
  QRL_STATE_HASH_BYTES,
  QRL_STATE_NONCE_MAX,
} from './constants.ts'

export interface QRLAccountData {
  nonce?: bigint | number
  balance?: bigint
  storageRoot?: Uint8Array
  codeHash?: Uint8Array
}

export class QRLAccount {
  public readonly nonce: bigint
  public readonly balance: bigint

  private readonly _storageRoot: Uint8Array
  private readonly _codeHash: Uint8Array

  public constructor(data: QRLAccountData = {}) {
    const nonce = normalizeNonce(data.nonce ?? 0n)
    const balance = normalizeBalance(data.balance ?? 0n)
    const storageRoot = data.storageRoot ?? QRL_EMPTY_ROOT_HASH
    const codeHash = data.codeHash ?? QRL_EMPTY_CODE_HASH

    assertStateHash('storageRoot', storageRoot)
    assertStateHash('codeHash', codeHash)

    this.nonce = nonce
    this.balance = balance
    this._storageRoot = new Uint8Array(storageRoot)
    this._codeHash = new Uint8Array(codeHash)

    Object.freeze(this)
  }

  public static empty(): QRLAccount {
    return new QRLAccount()
  }

  public get storageRoot(): Uint8Array {
    return new Uint8Array(this._storageRoot)
  }

  public get codeHash(): Uint8Array {
    return new Uint8Array(this._codeHash)
  }

  public isEmpty(): boolean {
    return (
      this.nonce === 0n && this.balance === 0n && equalsBytes(this._codeHash, QRL_EMPTY_CODE_HASH)
    )
  }

  public clone(): QRLAccount {
    return new QRLAccount({
      nonce: this.nonce,
      balance: this.balance,
      storageRoot: this._storageRoot,
      codeHash: this._codeHash,
    })
  }

  public with(data: QRLAccountData): QRLAccount {
    return new QRLAccount({
      nonce: data.nonce ?? this.nonce,
      balance: data.balance ?? this.balance,
      storageRoot: data.storageRoot ?? this._storageRoot,
      codeHash: data.codeHash ?? this._codeHash,
    })
  }
}

export function normalizeNonce(nonce: bigint | number): bigint {
  const value = typeof nonce === 'number' ? BigInt(nonce) : nonce
  if (typeof value !== 'bigint' || value < 0n || value > QRL_STATE_NONCE_MAX) {
    throw QRLJSErrorWithoutCode(`Invalid QRL account nonce=${nonce.toString()}`)
  }
  return value
}

export function normalizeBalance(balance: bigint): bigint {
  if (typeof balance !== 'bigint' || balance < 0n) {
    throw QRLJSErrorWithoutCode(`Invalid QRL account balance=${balance.toString()}`)
  }
  return balance
}

function assertStateHash(name: string, value: Uint8Array): void {
  if (!(value instanceof Uint8Array)) {
    throw QRLJSErrorWithoutCode(`QRL account ${name} must be Uint8Array`)
  }
  if (value.length !== QRL_STATE_HASH_BYTES) {
    throw QRLJSErrorWithoutCode(`Invalid QRL account ${name} length=${value.length}`)
  }
}
