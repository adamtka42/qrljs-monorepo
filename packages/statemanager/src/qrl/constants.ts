import { hexToBytes } from '@theqrl/util'

import type { PrefixedHexString } from '@theqrl/util'

export const QRL_STATE_NONCE_MAX = 2n ** 64n - 1n
export const QRL_STORAGE_KEY_BYTES = 32
export const QRL_STORAGE_VALUE_BYTES = 64
export const QRL_STATE_HASH_BYTES = 32

export const QRL_EMPTY_ROOT_HASH = hexToBytes(
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421' as PrefixedHexString,
)

export const QRL_EMPTY_CODE_HASH = hexToBytes(
  '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470' as PrefixedHexString,
)
