import { computeMinDepositUsd, usdToUsdc6, LEVERAGE_TARGET_HF } from './loop-minimums';

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
// Max achievable: ~3.53x at HF=1.2, ~4.58x at HF=1.1
export const LEVERAGE_OPTIONS = [2, 3, 3.5] as const;
export const MAX_LEVERAGE = 3.5;

// Unwind targets (0 = full unwind to USDC, others = target leverage)
export const UNWIND_TARGETS = [0, 1, 2, 3, 3.5] as const;

// Orange Dot Vault / DCA strategy defaults
export const DEFAULT_TRIGGER_PRICE = 95;
export const DCA_TRADE_OPTIONS = [2, 4, 6, 10] as const;
export const DCA_INTERVAL_OPTIONS = [6, 12, 24] as const;

// Aave V3 / Tydro (Ink chain)
export const AAVE_L2_POOL = '0x7F6036c2A9244E766F9CcD8dE78D8f79F80e5408';
export const AAVE_AUSDC_TOKEN = '0x70A38B0c90441e991346B7A0Cd98C8528dD1c234';

// CoW Protocol polling
export const COW_POLL_INTERVAL_MS = 30_000;
export const GRID_DEBOUNCE_MS = 300_000; // 5 minutes

// Dust thresholds (below this, amounts are too small to execute)
export const USDC_DUST = 1_000n; // 0.001 USDC (6 decimals)
export const STRC_DUST = 10n ** 14n; // 0.0001 STRC (18 decimals)

// CoW Protocol minimum swap amount ($10 per swap)
export const COW_MIN_SWAP_USDC = 10_000_000n; // $10 in 6-decimal USDC

// Minimum deposit per leverage level — ensures every iteration borrow >= $10
// Computed via simulation: borrow_k = D·(LLTV/targetHF)^k, last borrow = min(that, remaining)
// Per-leverage targetHF: 2x/3x → 1.2, 3.5x → 1.1
export const MIN_DEPOSIT_USDC: Record<number, bigint> = {
  2: usdToUsdc6(computeMinDepositUsd(2, 0.86, LEVERAGE_TARGET_HF[2]).minDepositUsd),     // $36 (2 iters, HF=1.2)
  3: usdToUsdc6(computeMinDepositUsd(3, 0.86, LEVERAGE_TARGET_HF[3]).minDepositUsd),     // $73 (5 iters, HF=1.2)
  3.5: usdToUsdc6(computeMinDepositUsd(3.5, 0.86, LEVERAGE_TARGET_HF[3.5]).minDepositUsd), // $40 (5 iters, HF=1.1)
};
