import { EthereumJSErrorWithoutCode, bytesToHex, hexToBytes, qrl } from '@ethereumjs/util'
import { keccak_256 } from '@noble/hashes/sha3.js'

import { QRLAccount, normalizeBalance, normalizeNonce } from './account.ts'
import { assertQRLStorageKey, assertQRLStorageValue, emptyQRLStorageValue } from './storage.ts'

import type { PrefixedHexString } from '@ethereumjs/util'
import type { QRLGenesisState } from './genesis.ts'

interface QRLStateLayer {
  accounts: Map<string, QRLAccount | undefined>
  code: Map<string, Uint8Array>
  storage: Map<string, Map<string, Uint8Array>>
}

export interface QRLStateManagerOptions {
  genesis?: QRLGenesisState
}

export class QRLStateManager {
  private readonly stack: QRLStateLayer[] = [emptyLayer()]

  public constructor(options: QRLStateManagerOptions = {}) {
    if (options.genesis !== undefined) {
      this.applyGenesisStateSync(options.genesis)
    }
  }

  public async applyGenesisState(genesis: QRLGenesisState): Promise<void> {
    this.applyGenesisStateSync(genesis)
  }

  public async getAccount(address: qrl.QRLAddress): Promise<QRLAccount | undefined> {
    return this.getAccountSync(address)?.clone()
  }

  public async putAccount(address: qrl.QRLAddress, account: QRLAccount): Promise<void> {
    this.putAccountSync(address, account)
  }

  public async deleteAccount(address: qrl.QRLAddress): Promise<void> {
    const key = addressKey(address)
    this.topLayer().accounts.set(key, undefined)
    this.topLayer().code.delete(key)
    this.topLayer().storage.delete(key)
  }

  public async accountExists(address: qrl.QRLAddress): Promise<boolean> {
    return this.getAccountSync(address) !== undefined
  }

  public async getNonce(address: qrl.QRLAddress): Promise<bigint> {
    return this.getAccountSync(address)?.nonce ?? 0n
  }

  public async setNonce(address: qrl.QRLAddress, nonce: bigint | number): Promise<void> {
    const account = this.getOrCreateAccount(address)
    this.putAccountSync(address, account.with({ nonce: normalizeNonce(nonce) }))
  }

  public async incrementNonce(address: qrl.QRLAddress): Promise<void> {
    const nonce = await this.getNonce(address)
    await this.setNonce(address, nonce + 1n)
  }

  public async getBalance(address: qrl.QRLAddress): Promise<bigint> {
    return this.getAccountSync(address)?.balance ?? 0n
  }

  public async setBalance(address: qrl.QRLAddress, balance: bigint): Promise<void> {
    const account = this.getOrCreateAccount(address)
    this.putAccountSync(address, account.with({ balance: normalizeBalance(balance) }))
  }

  public async addBalance(address: qrl.QRLAddress, amount: bigint): Promise<void> {
    const balance = normalizeBalance(amount)
    await this.setBalance(address, (await this.getBalance(address)) + balance)
  }

  public async subBalance(address: qrl.QRLAddress, amount: bigint): Promise<void> {
    const balance = normalizeBalance(amount)
    const current = await this.getBalance(address)
    if (balance > current) {
      throw EthereumJSErrorWithoutCode('QRL account balance underflow')
    }
    await this.setBalance(address, current - balance)
  }

  public async getCode(address: qrl.QRLAddress): Promise<Uint8Array> {
    return new Uint8Array(this.topLayer().code.get(addressKey(address)) ?? new Uint8Array(0))
  }

  public async putCode(address: qrl.QRLAddress, code: Uint8Array): Promise<void> {
    const key = addressKey(address)
    const codeCopy = new Uint8Array(code)
    this.topLayer().code.set(key, codeCopy)
    this.putAccountSync(
      address,
      this.getOrCreateAccount(address).with({ codeHash: keccak_256(codeCopy) }),
    )
  }

  public async getCodeSize(address: qrl.QRLAddress): Promise<number> {
    return (await this.getCode(address)).length
  }

  public async getStorage(address: qrl.QRLAddress, key: Uint8Array): Promise<Uint8Array> {
    assertQRLStorageKey(key)

    const accountStorage = this.topLayer().storage.get(addressKey(address))
    return new Uint8Array(accountStorage?.get(storageKey(key)) ?? emptyQRLStorageValue())
  }

  public async putStorage(
    address: qrl.QRLAddress,
    key: Uint8Array,
    value: Uint8Array,
  ): Promise<void> {
    assertQRLStorageKey(key)
    assertQRLStorageValue(value)

    const accountKey = addressKey(address)
    const top = this.topLayer()
    const accountStorage = top.storage.get(accountKey) ?? new Map<string, Uint8Array>()
    accountStorage.set(storageKey(key), new Uint8Array(value))
    top.storage.set(accountKey, accountStorage)

    if (this.getAccountSync(address) === undefined) {
      this.putAccountSync(address, QRLAccount.empty())
    }
  }

  public async clearStorage(address: qrl.QRLAddress): Promise<void> {
    this.topLayer().storage.delete(addressKey(address))
  }

  public async checkpoint(): Promise<void> {
    this.stack.push(copyLayer(this.topLayer()))
  }

  public async commit(): Promise<void> {
    if (this.stack.length <= 1) {
      throw EthereumJSErrorWithoutCode('Cannot commit without an active QRL state checkpoint')
    }
    this.stack.splice(-2, 1)
  }

  public async revert(): Promise<void> {
    if (this.stack.length <= 1) {
      throw EthereumJSErrorWithoutCode('Cannot revert without an active QRL state checkpoint')
    }
    this.stack.pop()
  }

  public shallowCopy(): QRLStateManager {
    const copy = new QRLStateManager()
    copy.stack.length = 0
    for (const layer of this.stack) {
      copy.stack.push(copyLayer(layer))
    }
    return copy
  }

  private getAccountSync(address: qrl.QRLAddress): QRLAccount | undefined {
    return this.topLayer().accounts.get(addressKey(address))
  }

  private putAccountSync(address: qrl.QRLAddress, account: QRLAccount): void {
    this.topLayer().accounts.set(addressKey(address), account.clone())
  }

  private getOrCreateAccount(address: qrl.QRLAddress): QRLAccount {
    return this.getAccountSync(address) ?? QRLAccount.empty()
  }

  private topLayer(): QRLStateLayer {
    return this.stack[this.stack.length - 1]
  }

  private applyGenesisStateSync(genesis: QRLGenesisState): void {
    for (const [addressInput, account] of Object.entries(genesis)) {
      const address = qrl.QRLAddress.fromString(addressInput)
      const balance = account.balance === undefined ? 0n : parseGenesisBigInt(account.balance)
      const nonce = account.nonce ?? 0n

      this.putAccountSync(address, new QRLAccount({ balance, nonce }))

      if (account.code !== undefined) {
        const code = parseGenesisBytes(account.code)
        this.topLayer().code.set(addressKey(address), code)
        this.putAccountSync(
          address,
          this.getOrCreateAccount(address).with({ codeHash: keccak_256(code) }),
        )
      }

      for (const [key, value] of Object.entries(account.storage ?? {})) {
        const storageKeyBytes = parseGenesisBytes(key)
        const storageValueBytes = parseGenesisBytes(value)
        assertQRLStorageKey(storageKeyBytes)
        assertQRLStorageValue(storageValueBytes)

        const accountStorage =
          this.topLayer().storage.get(addressKey(address)) ?? new Map<string, Uint8Array>()
        accountStorage.set(storageKey(storageKeyBytes), storageValueBytes)
        this.topLayer().storage.set(addressKey(address), accountStorage)
      }
    }
  }
}

function emptyLayer(): QRLStateLayer {
  return {
    accounts: new Map(),
    code: new Map(),
    storage: new Map(),
  }
}

function copyLayer(layer: QRLStateLayer): QRLStateLayer {
  const storage = new Map<string, Map<string, Uint8Array>>()
  for (const [address, accountStorage] of layer.storage) {
    const storageCopy = new Map<string, Uint8Array>()
    for (const [key, value] of accountStorage) {
      storageCopy.set(key, new Uint8Array(value))
    }
    storage.set(address, storageCopy)
  }

  const code = new Map<string, Uint8Array>()
  for (const [address, value] of layer.code) {
    code.set(address, new Uint8Array(value))
  }

  const accounts = new Map<string, QRLAccount | undefined>()
  for (const [address, account] of layer.accounts) {
    accounts.set(address, account?.clone())
  }

  return { accounts, code, storage }
}

function addressKey(address: qrl.QRLAddress): string {
  return address.toHex()
}

function storageKey(key: Uint8Array): string {
  return bytesToHex(key)
}

function parseGenesisBigInt(value: bigint | string): bigint {
  if (typeof value === 'bigint') {
    return normalizeBalance(value)
  }
  if (/^0x[0-9a-fA-F]+$/.test(value)) {
    return normalizeBalance(BigInt(value))
  }
  if (/^[0-9]+$/.test(value)) {
    return normalizeBalance(BigInt(value))
  }
  throw EthereumJSErrorWithoutCode(`Invalid QRL genesis bigint=${value}`)
}

function parseGenesisBytes(value: Uint8Array | string): Uint8Array {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value)
  }
  if (!/^0x[0-9a-fA-F]*$/.test(value)) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL genesis hex bytes=${value}`)
  }
  return hexToBytes(value as PrefixedHexString)
}
