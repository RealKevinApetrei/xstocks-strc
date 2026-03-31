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

  // Contracts (optional at startup — filled after deploy)
  strc: optional('STRC_ADDRESS', ''),
  wstrc: optional('WSTRC_ADDRESS', ''),
  morpho: optional('MORPHO_ADDRESS', ''),
  morphoMarketId: optional('MORPHO_MARKET_ID', ''),
  usdc: optional('USDC_ADDRESS', ''),
  usdcVault: optional('USDC_VAULT_ADDRESS', ''),
  tydroVault: optional('TYDRO_VAULT_ADDRESS', ''),

  // Morpho oracle & IRM (filled after market creation)
  morphoOracle: optional('MORPHO_ORACLE_ADDRESS', ''),
  morphoIrm: optional('MORPHO_IRM_ADDRESS', ''),

  // CoW Protocol
  cowApiUrl: optional('COW_API_URL', ''),
  cowSettlement: optional('COW_SETTLEMENT_ADDRESS', '0x9008d19f58aabd9ed0d60971565aa8510560ab41'),
  cowVaultRelayer: optional('COW_VAULT_RELAYER_ADDRESS', '0xc92e8bdf79f0507f65a392b0ab4667716bfe0110'),

  // Pyth
  pythWebhookSecret: optional('PYTH_WEBHOOK_SECRET', ''),
} as const;
