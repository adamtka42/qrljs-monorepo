import { EthereumJSErrorWithoutCode, qrl } from '@ethereumjs/util'

export interface QRLAccessTuple {
  address: qrl.QRLAddress
  storageKeys: Uint8Array[]
}

export type QRLAccessList = QRLAccessTuple[]

export function copyQRLAccessList(accessList: QRLAccessList): QRLAccessList {
  return accessList.map((tuple) => ({
    address: qrl.QRLAddress.fromBytes(tuple.address.toBytes()),
    storageKeys: tuple.storageKeys.map((key) => new Uint8Array(key)),
  }))
}

export function accessListToBytes(accessList: QRLAccessList): [Uint8Array, Uint8Array[]][] {
  return accessList.map((tuple) => [
    tuple.address.toBytes(),
    tuple.storageKeys.map((key) => new Uint8Array(key)),
  ])
}

export function accessListFromBytes(values: unknown[]): QRLAccessList {
  return values.map((tuple) => {
    if (!Array.isArray(tuple) || tuple.length !== 2 || !(tuple[0] instanceof Uint8Array)) {
      throw EthereumJSErrorWithoutCode('Invalid QRL access tuple')
    }
    const storageKeys = tuple[1]
    if (!Array.isArray(storageKeys)) {
      throw EthereumJSErrorWithoutCode('Invalid QRL access tuple storage keys')
    }
    return {
      address: qrl.QRLAddress.fromBytes(tuple[0]),
      storageKeys: storageKeys.map((key) => {
        if (!(key instanceof Uint8Array)) {
          throw EthereumJSErrorWithoutCode('Invalid QRL access tuple storage key')
        }
        return new Uint8Array(key)
      }),
    }
  })
}
