import { RLP } from '@ethereumjs/rlp'
import { EthereumJSErrorWithoutCode, qrl } from '@ethereumjs/util'
import { keccak_512 } from '@noble/hashes/sha3.js'

import type { Input } from '@ethereumjs/rlp'

const QRL_ADDRESS_DOMAIN = new TextEncoder().encode('QRL-ADDR-v1')
const UINT64_MAX = 2n ** 64n - 1n

export function createQRLContractAddress(sender: qrl.QRLAddress, nonce: bigint): qrl.QRLAddress {
  if (nonce < 0n || nonce > UINT64_MAX) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL contract nonce=${nonce.toString()}`)
  }
  const encoded = RLP.encode([sender.toBytes(), nonce] as Input)
  return qrl.QRLAddress.fromBytes(qrlAddressHash(encoded))
}

export function createQRLContractAddress2(
  sender: qrl.QRLAddress,
  salt64: Uint8Array,
  initCodeHash: Uint8Array,
): qrl.QRLAddress {
  if (salt64.length !== 64) {
    throw EthereumJSErrorWithoutCode(`Invalid QRL CREATE2 salt length=${salt64.length}`)
  }
  if (initCodeHash.length !== 32) {
    throw EthereumJSErrorWithoutCode(
      `Invalid QRL CREATE2 init code hash length=${initCodeHash.length}`,
    )
  }
  return qrl.QRLAddress.fromBytes(
    qrlAddressHash(new Uint8Array([0xff]), sender.toBytes(), salt64, initCodeHash),
  )
}

function qrlAddressHash(...parts: Uint8Array[]): Uint8Array {
  const hasher = keccak_512.create()
  hasher.update(QRL_ADDRESS_DOMAIN)
  for (const part of parts) {
    hasher.update(part)
  }
  return hasher.digest()
}
