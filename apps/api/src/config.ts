function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3001'), 10),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),

  // Database (Supabase)
  databaseUrl: required('DATABASE_URL'),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  // Privy
  privyAppId: required('PRIVY_APP_ID'),
  privyAppSecret: required('PRIVY_APP_SECRET'),

  // Chain
  rpcUrl: required('RPC_URL'),
  chainId: parseInt(optional('CHAIN_ID', '57073'), 10),

  // Core contracts (required for execution)
  strc: optional('STRC_ADDRESS', ''),
  wstrc: optional('WSTRC_ADDRESS', ''),
  morpho: optional('MORPHO_ADDRESS', ''),
  morphoMarketId: optional('MORPHO_MARKET_ID', ''),
  usdc: optional('USDC_ADDRESS', ''),

  // Optional contracts (vault features)
  usdcVault: optional('USDC_VAULT_ADDRESS', ''),
  tydroVault: optional('TYDRO_VAULT_ADDRESS', ''),

  // Morpho market params
  morphoOracle: optional('MORPHO_ORACLE_ADDRESS', ''),
  morphoIrm: optional('MORPHO_IRM_ADDRESS', ''),
  morphoLltv: optional('MORPHO_LLTV', '860000000000000000'), // 86% = 0.86e18

  // CoW Protocol
  cowApiUrl: optional('COW_API_URL', ''),
  cowSettlement: optional('COW_SETTLEMENT_ADDRESS', '0x9008d19f58aabd9ed0d60971565aa8510560ab41'),
  cowVaultRelayer: optional('COW_VAULT_RELAYER_ADDRESS', '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110'),

  // Pyth Network
  pythHermesUrl: optional('PYTH_HERMES_URL', 'https://hermes.pyth.network'),
  pythPriceFeedId: optional('PYTH_PRICE_FEED_ID', ''),
  pythContract: optional('PYTH_CONTRACT_ADDRESS', ''),

  // Oracle updater
  oracleUpdaterKey: optional('ORACLE_UPDATER_PRIVATE_KEY', ''),

  // Execution safety limits
  maxLoopIterations: parseInt(optional('MAX_LOOP_ITERATIONS', '10'), 10),
  maxUnwindSteps: parseInt(optional('MAX_UNWIND_STEPS', '20'), 10),
  loopTargetHF: parseFloat(optional('LOOP_TARGET_HF', '1.2')),
  unwindMinHF: parseFloat(optional('UNWIND_MIN_HF', '1.3')),
  emergencyHF: parseFloat(optional('EMERGENCY_HF', '1.05')),
  txTimeoutMs: parseInt(optional('TX_TIMEOUT_MS', '120000'), 10),
  cowTimeoutMs: parseInt(optional('COW_TIMEOUT_MS', '600000'), 10),
  maxSingleLoopUsdc: optional('MAX_SINGLE_LOOP_USDC', '1000000000000'), // 1M USDC (6 decimals)
} as const;

/**
 * Validate critical config at startup.
 * Call this before starting the server.
 */
export function validateConfig(): void {
  const critical = [
    ['MORPHO_ADDRESS', config.morpho],
    ['MORPHO_MARKET_ID', config.morphoMarketId],
    ['MORPHO_ORACLE_ADDRESS', config.morphoOracle],
    ['MORPHO_IRM_ADDRESS', config.morphoIrm],
    ['STRC_ADDRESS', config.strc],
    ['WSTRC_ADDRESS', config.wstrc],
    ['USDC_ADDRESS', config.usdc],
    ['COW_API_URL', config.cowApiUrl],
  ] as const;

  const missing = critical.filter(([, val]) => !val).map(([name]) => name);

  if (missing.length > 0) {
    console.warn(`[CONFIG] Missing contract addresses (execution disabled): ${missing.join(', ')}`);
  }

  // Validate LLTV is reasonable (50-95%)
  // Support both decimal (0.86) and wei (860000000000000000) formats
  const lltvRaw = config.morphoLltv;
  const lltv = lltvRaw.includes('.') ? BigInt(Math.floor(parseFloat(lltvRaw) * 1e18)) : BigInt(lltvRaw);
  if (lltv < 500000000000000000n || lltv > 950000000000000000n) {
    throw new Error(`MORPHO_LLTV out of range: ${config.morphoLltv}. Expected 0.5e18 to 0.95e18`);
  }

  // Validate safety limits
  if (config.loopTargetHF < 1.05 || config.loopTargetHF > 3.0) {
    throw new Error(`LOOP_TARGET_HF out of range: ${config.loopTargetHF}. Expected 1.05 to 3.0`);
  }
  if (config.emergencyHF < 1.0 || config.emergencyHF > config.loopTargetHF) {
    throw new Error(`EMERGENCY_HF out of range: ${config.emergencyHF}. Must be >= 1.0 and < LOOP_TARGET_HF`);
  }
  if (config.unwindMinHF < 1.05 || config.unwindMinHF > 3.0) {
    throw new Error(`UNWIND_MIN_HF out of range: ${config.unwindMinHF}. Expected 1.05 to 3.0`);
  }
}

/**
 * Check if execution is enabled (all critical addresses configured).
 */
export function isExecutionEnabled(): boolean {
  return !!(config.morpho && config.morphoMarketId && config.morphoOracle &&
    config.morphoIrm && config.strc && config.wstrc && config.usdc && config.cowApiUrl);
}
