/**
 * Contract addresses on Ink (chain ID 57073).
 * Filled in after Person A deploys contracts.
 */
export const ADDRESSES = {
  // Tokens
  STRC: process.env.STRC_ADDRESS ?? '',
  USDC: process.env.USDC_ADDRESS ?? '',

  // Our contracts (deployed by Person A)
  WSTRC: process.env.WSTRC_ADDRESS ?? '',
  USDC_VAULT: process.env.USDC_VAULT_ADDRESS ?? '',

  // External protocols
  MORPHO: process.env.MORPHO_ADDRESS ?? '',
  TYDRO_VAULT: process.env.TYDRO_VAULT_ADDRESS ?? '',

  // Morpho market ID (computed after market creation)
  MORPHO_MARKET_ID: process.env.MORPHO_MARKET_ID ?? '',

  // CoW Protocol (deterministic across all EVM chains)
  COW_SETTLEMENT: '0x9008d19f58aabd9ed0d60971565aa8510560ab41',
  COW_VAULT_RELAYER: '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110',
} as const;

export const CHAIN_ID = 57073;
export const GRID_THRESHOLD_USD = 103;
export const MAX_LEVERAGE = 5;
export const MIN_LEVERAGE = 1.1;
export const MAX_SLIPPAGE_BPS = 500; // 5%
export const COW_POLL_INTERVAL_MS = 30_000;
export const COW_TIMEOUT_MS = 600_000; // 10 minutes
export const GRID_DEBOUNCE_MS = 300_000; // 5 minutes
