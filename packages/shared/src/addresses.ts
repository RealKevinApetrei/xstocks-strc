/**
 * Contract addresses on Ink (chain ID 57073).
 */
export const ADDRESSES = {
  // Tokens
  STRC: process.env.STRC_ADDRESS ?? '',
  USDC: process.env.USDC_ADDRESS ?? '',

  // Our contracts
  WSTRC: process.env.WSTRC_ADDRESS ?? '',
  USDC_VAULT: process.env.USDC_VAULT_ADDRESS ?? '',

  // External protocols
  MORPHO: process.env.MORPHO_ADDRESS ?? '',
  TYDRO_VAULT: process.env.TYDRO_VAULT_ADDRESS ?? '',
  MORPHO_MARKET_ID: process.env.MORPHO_MARKET_ID ?? '',

  // CoW Protocol (deterministic across all EVM chains)
  COW_SETTLEMENT: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  COW_VAULT_RELAYER: '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110',
} as const;

export const CHAIN_ID = 57073;

// Leverage options (only these are allowed)
export const LEVERAGE_OPTIONS = [2, 3, 5] as const;
export const MAX_LEVERAGE = 5;

// Unwind targets (0 = full unwind to USDC, others = target leverage)
export const UNWIND_TARGETS = [0, 1, 2, 3, 5] as const;

// Grid strategy defaults
export const DEFAULT_GRID_HF_THRESHOLD = 1.5;

// CoW Protocol polling
export const COW_POLL_INTERVAL_MS = 30_000;
export const GRID_DEBOUNCE_MS = 300_000; // 5 minutes

// Dust thresholds (below this, amounts are too small to execute)
export const USDC_DUST = 1_000n; // 0.001 USDC (6 decimals)
export const STRC_DUST = 10n ** 14n; // 0.0001 STRC (18 decimals)

// CoW Protocol minimum swap amount ($10 per swap)
export const COW_MIN_SWAP_USDC = 10_000_000n; // $10 in 6-decimal USDC

// Minimum deposit per leverage level
// Each loop iteration needs >= $10 for CoW swap. With 86% LLTV:
// 2x: initial swap + ~2 iterations → min $20
// 3x: initial swap + ~4 iterations → min $30
// 5x: initial swap + ~8 iterations → min $50
export const MIN_DEPOSIT_USDC: Record<number, bigint> = {
  2: 20_000_000n,  // $20
  3: 30_000_000n,  // $30
  5: 50_000_000n,  // $50
};
