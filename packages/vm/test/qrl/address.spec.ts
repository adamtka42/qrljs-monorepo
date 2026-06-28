import { hexToBytes, qrl as utilQrl } from '@theqrl/util'
import { assert, describe, it } from 'vitest'

import { qrl } from '../../src/index.ts'

import type { PrefixedHexString } from '@theqrl/util'

const SENDER =
  'Q11111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111111'
const CREATE_0 =
  'Q5e25bC10C70aBA4Ed4850e7Ad40531442Ce6fb0199d2311e29d3a47045972ba348173FbF94c9Cd00B7634E0821D7A2668c4DD7c0f5fDC191fBB9C3854E824efa'
const CREATE_7 =
  'Q56FEd1044d936611e49f1102Ef83544A6B78cabD6765BA0eB1B6043c7B1b3A7591Ce6624F841C67363FAe157F65c6970D0ff8088B133f0d825Ac806A1cf5B33c'
const CREATE_2 =
  'Qe9bb23cc7Ed2ed20C19930bfB8145DdE27005112375Db1E15403C18Ee8d77F684AA5734470eE2b0a4f904Ba74B0693210d4974afa48E307b98C0eF6881584ddc'

describe('QRL contract address derivation', () => {
  it('matches go-qrl CreateAddress fixtures', () => {
    const sender = utilQrl.QRLAddress.fromString(SENDER)

    assert.isTrue(
      qrl.createQRLContractAddress(sender, 0n).equals(utilQrl.QRLAddress.fromString(CREATE_0)),
    )
    assert.isTrue(
      qrl.createQRLContractAddress(sender, 7n).equals(utilQrl.QRLAddress.fromString(CREATE_7)),
    )
  })

  it('matches go-qrl CreateAddress2 fixture', () => {
    const sender = utilQrl.QRLAddress.fromString(SENDER)
    const salt = hexToBytes(`0x${'22'.repeat(64)}` as PrefixedHexString)
    const initHash = hexToBytes(`0x${'33'.repeat(32)}` as PrefixedHexString)

    assert.isTrue(
      qrl
        .createQRLContractAddress2(sender, salt, initHash)
        .equals(utilQrl.QRLAddress.fromString(CREATE_2)),
    )
  })

  it('rejects invalid address derivation inputs', () => {
    const sender = utilQrl.QRLAddress.fromString(SENDER)

    assert.throws(() => qrl.createQRLContractAddress(sender, -1n))
    assert.throws(() => qrl.createQRLContractAddress(sender, 2n ** 64n))
    assert.throws(() =>
      qrl.createQRLContractAddress2(sender, new Uint8Array(63), new Uint8Array(32)),
    )
    assert.throws(() =>
      qrl.createQRLContractAddress2(sender, new Uint8Array(64), new Uint8Array(31)),
    )
  })
})
