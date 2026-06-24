import { assert, describe, it } from 'vitest'

import { bytesToHex } from '@ethereumjs/util'

import { qrl } from '../../src/index.ts'

describe('QRLTransaction', () => {
  const ADDRESS =
    'Qd5812f6cf4a0f645aa620cd57319a0ed649dd8f5519a9dde7770ae5b0e49e547985f35eb972a2a07041561aa39c65a3991478f9b1e6749e05277dcf58a9a8b72'

  function txData(overrides: Partial<qrl.QRLDynamicFeeTxData> = {}): qrl.QRLDynamicFeeTxData {
    return {
      chainId: 1n,
      nonce: 2n,
      gasTipCap: 3n,
      gasFeeCap: 7n,
      gasLimit: 21000n,
      to: ADDRESS,
      value: 11n,
      data: new Uint8Array([1, 2, 3]),
      descriptor: new Uint8Array([1, 0, 0]),
      extraParams: new Uint8Array([4]),
      signature: new Uint8Array([5]),
      publicKey: new Uint8Array([6]),
      ...overrides,
    }
  }

  it('serializes and deserializes a QRL dynamic fee transaction', () => {
    const tx = qrl.createQRLDynamicFeeTransaction(txData())
    const serialized = tx.serialize()
    const decoded = qrl.QRLDynamicFeeTransaction.fromSerialized(serialized)

    assert.strictEqual(serialized[0], qrl.QRL_DYNAMIC_FEE_TX_TYPE)
    assert.strictEqual(decoded.chainId, tx.chainId)
    assert.strictEqual(decoded.nonce, tx.nonce)
    assert.strictEqual(decoded.gasTipCap, tx.gasTipCap)
    assert.strictEqual(decoded.gasFeeCap, tx.gasFeeCap)
    assert.strictEqual(decoded.gasLimit, tx.gasLimit)
    assert.strictEqual(decoded.to?.toHex(), tx.to?.toHex())
    assert.strictEqual(decoded.value, tx.value)
    assert.strictEqual(bytesToHex(decoded.data), bytesToHex(tx.data))
    assert.strictEqual(bytesToHex(decoded.descriptor), bytesToHex(tx.descriptor))
    assert.strictEqual(bytesToHex(decoded.extraParams), bytesToHex(tx.extraParams))
    assert.strictEqual(bytesToHex(decoded.signature), bytesToHex(tx.signature))
    assert.strictEqual(bytesToHex(decoded.publicKey), bytesToHex(tx.publicKey))
  })

  it('wraps dynamic fee transactions', () => {
    const tx = qrl.QRLTransaction.fromDynamicFee(txData())
    const decoded = qrl.QRLTransaction.fromSerialized(tx.serialize())

    assert.strictEqual(tx.type(), qrl.QRL_DYNAMIC_FEE_TX_TYPE)
    assert.strictEqual(decoded.type(), tx.type())
    assert.strictEqual(decoded.chainId(), tx.chainId())
    assert.strictEqual(decoded.nonce(), tx.nonce())
    assert.strictEqual(decoded.to()?.toHex(), tx.to()?.toHex())
    assert.strictEqual(decoded.gasPrice(), tx.gasPrice())
    assert.strictEqual(decoded.cost(), tx.cost())
    assert.isFalse(decoded.isContractCreation())
  })

  it('keeps transaction hash stable', () => {
    const tx = qrl.createQRLDynamicFeeTransaction(txData())

    assert.strictEqual(bytesToHex(tx.hash()), bytesToHex(tx.hash()))
    assert.strictEqual(tx.hash().length, 32)
  })

  it('uses descriptor and extraParams in the signing hash', () => {
    const tx = qrl.createQRLDynamicFeeTransaction(txData())
    const changedDescriptor = qrl.createQRLDynamicFeeTransaction(
      txData({ descriptor: new Uint8Array([2, 0, 0]) }),
    )
    const changedExtraParams = qrl.createQRLDynamicFeeTransaction(
      txData({ extraParams: new Uint8Array([9]) }),
    )

    assert.notStrictEqual(
      bytesToHex(tx.getMessageToSign()),
      bytesToHex(changedDescriptor.getMessageToSign()),
    )
    assert.notStrictEqual(
      bytesToHex(tx.getMessageToSign()),
      bytesToHex(changedExtraParams.getMessageToSign()),
    )
  })

  it('does not include signature or public key in the signing hash', () => {
    const tx = qrl.createQRLDynamicFeeTransaction(txData())
    const changedAuth = qrl.createQRLDynamicFeeTransaction(
      txData({
        signature: new Uint8Array([9, 9]),
        publicKey: new Uint8Array([8, 8]),
      }),
    )

    assert.strictEqual(
      bytesToHex(tx.getMessageToSign()),
      bytesToHex(changedAuth.getMessageToSign()),
    )
    assert.notStrictEqual(bytesToHex(tx.hash()), bytesToHex(changedAuth.hash()))
  })

  it('rejects unsupported serialized transaction types', () => {
    assert.throws(() => qrl.QRLDynamicFeeTransaction.fromSerialized(new Uint8Array([1, 2, 3])))
    assert.throws(() => qrl.QRLTransaction.fromSerialized(new Uint8Array([1, 2, 3])))
  })
})
