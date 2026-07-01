import type { QRLStateManager } from './stateManager.ts'

export interface QRLGenesisAccount {
  balance?: bigint | string
  nonce?: bigint | number
  code?: Uint8Array | string
  storage?: Record<string, Uint8Array | string>
}

export type QRLGenesisState = Record<string, QRLGenesisAccount>

export async function applyQRLGenesisState(
  stateManager: QRLStateManager,
  genesis: QRLGenesisState,
): Promise<void> {
  await stateManager.applyGenesisState(genesis)
}
