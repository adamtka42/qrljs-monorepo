import { assert, describe, it } from 'vitest'

import { bytesToHex, hexToBytes, qrl as qrlUtil } from '@theqrl/util'

import { qrl } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

describe('QRLDynamicFeeTransaction', () => {
  const ADDRESS =
    'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72'
  const ADDRESS_HEX = `0x${ADDRESS.slice(1)}` as PrefixedHexString

  function baseTxData(): qrl.QRLDynamicFeeTxData {
    return {
      chainId: 1n,
      nonce: 2n,
      gasTipCap: 3n,
      gasFeeCap: 7n,
      gasLimit: 21000n,
    }
  }

  it('constructs a contract creation transaction', () => {
    const tx = qrl.createQRLContractCreationTransaction({
      ...baseTxData(),
      value: 11n,
      data: new Uint8Array([1, 2, 3]),
    })

    assert.strictEqual(tx.type, qrl.QRL_DYNAMIC_FEE_TX_TYPE)
    assert.isTrue(tx.isContractCreation())
    assert.strictEqual(tx.to, undefined)
    assert.strictEqual(tx.value, 11n)
    assert.strictEqual(tx.gasPrice(), 7n)
    assert.strictEqual(tx.cost(), 7n * 21000n + 11n)
  })

  it('constructs a contract call transaction from a QRL string', () => {
    const tx = qrl.createQRLContractCallTransaction({
      ...baseTxData(),
      to: ADDRESS,
    })

    assert.isFalse(tx.isContractCreation())
    assert.strictEqual(tx.to?.toHex(), ADDRESS_HEX)
  })

  it('constructs a contract call transaction from QRLAddress and bytes', () => {
    const address = qrlUtil.QRLAddress.fromString(ADDRESS)
    const fromAddress = qrl.createQRLContractCallTransaction({
      ...baseTxData(),
      to: address,
    })
    const fromBytes = qrl.createQRLContractCallTransaction({
      ...baseTxData(),
      to: hexToBytes(ADDRESS_HEX),
    })

    assert.strictEqual(fromAddress.to?.toHex(), ADDRESS_HEX)
    assert.strictEqual(fromBytes.to?.toHex(), ADDRESS_HEX)
  })

  it('rejects invalid transaction fields', () => {
    assert.throws(() => qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), chainId: -1n }))
    assert.throws(() => qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), nonce: -1n }))
    assert.throws(() =>
      qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), nonce: Number.MAX_SAFE_INTEGER + 1 }),
    )
    assert.throws(() =>
      qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), gasFeeCap: 1n, gasTipCap: 2n }),
    )
    assert.throws(() =>
      qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), descriptor: new Uint8Array(2) }),
    )
    assert.throws(() =>
      qrl.createQRLDynamicFeeTransaction({ ...baseTxData(), to: `q${ADDRESS.slice(1)}` }),
    )
  })

  it('defaults optional fields', () => {
    const tx = qrl.createQRLDynamicFeeTransaction(baseTxData())

    assert.strictEqual(tx.value, 0n)
    assert.deepEqual(tx.data, new Uint8Array(0))
    assert.deepEqual(tx.accessList, [])
    assert.deepEqual(tx.descriptor, new Uint8Array(qrl.QRL_DESCRIPTOR_BYTES))
    assert.deepEqual(tx.extraParams, new Uint8Array(0))
    assert.deepEqual(tx.signature, new Uint8Array(0))
    assert.deepEqual(tx.publicKey, new Uint8Array(0))
  })

  it('defensively copies mutable inputs', () => {
    const data = new Uint8Array([1, 2, 3])
    const descriptor = new Uint8Array([1, 0, 0])
    const extraParams = new Uint8Array([4])
    const signature = new Uint8Array([5])
    const publicKey = new Uint8Array([6])
    const storageKey = new Uint8Array([7])
    const tx = qrl.createQRLDynamicFeeTransaction({
      ...baseTxData(),
      data,
      descriptor,
      extraParams,
      signature,
      publicKey,
      accessList: [
        {
          address: qrlUtil.QRLAddress.fromString(ADDRESS),
          storageKeys: [storageKey],
        },
      ],
    })

    data.fill(0)
    descriptor.fill(0)
    extraParams.fill(0)
    signature.fill(0)
    publicKey.fill(0)
    storageKey.fill(0)

    assert.strictEqual(bytesToHex(tx.data), '0x010203')
    assert.strictEqual(bytesToHex(tx.descriptor), '0x010000')
    assert.strictEqual(bytesToHex(tx.extraParams), '0x04')
    assert.strictEqual(bytesToHex(tx.signature), '0x05')
    assert.strictEqual(bytesToHex(tx.publicKey), '0x06')
    assert.strictEqual(bytesToHex(tx.accessList[0].storageKeys[0]), '0x07')
  })
})
