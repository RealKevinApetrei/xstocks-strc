/**
 * Fetches Aave USDC lending yield data.
 *
 * Uses DeFi Llama's public yield API for reliable historical and current rates.
 * Falls back to simulated data if the API is unavailable.
 */

// DeFi Llama yield API — free, no API key, reliable
const DEFILLAMA_POOLS_URL = 'https://yields.llama.fi/pools';

export interface AaveYieldData {
  currentSupplyApy: number;
  history: Array<{
    timestamp: string;
    supplyApy: number;
  }>;
}

export class AaveYieldService {
  private cache: AaveYieldData | null = null;
  private cacheTimestamp = 0;
  private readonly CACHE_TTL_MS = 300_000; // 5 min
  private poolId: string | null = null;

  /**
   * Get current and historical Aave USDC supply APY.
   */
  async getYieldData(days: number = 90): Promise<AaveYieldData> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const data = await this.fetchFromDefiLlama(days);
      this.cache = data;
      this.cacheTimestamp = now;
      return data;
    } catch (err) {
      console.error('Failed to fetch Aave yield data:', err);
      return this.getSimulatedData(days);
    }
  }

  /**
   * Find the Aave V3 USDC pool ID on DeFi Llama.
   */
  private async getPoolId(): Promise<string> {
    if (this.poolId) return this.poolId;

    const response = await fetch(DEFILLAMA_POOLS_URL);
    if (!response.ok) throw new Error(`DeFi Llama pools: ${response.status}`);

    const { data } = (await response.json()) as {
      data: Array<{ pool: string; project: string; symbol: string; chain: string; apy: number }>;
    };

    // Find Aave V3 USDC on Ethereum (primary benchmark)
    const pool = data.find(
      (p) => p.project === 'aave-v3' && p.symbol === 'USDC' && p.chain === 'Ethereum',
    ) ?? data.find(
      // Fallback: any Aave V3 USDC pool
      (p) => p.project === 'aave-v3' && p.symbol.includes('USDC'),
    );

    if (!pool) throw new Error('Aave V3 USDC pool not found on DeFi Llama');
    this.poolId = pool.pool;
    return pool.pool;
  }

  private async fetchFromDefiLlama(days: number): Promise<AaveYieldData> {
    const poolId = await this.getPoolId();
    const chartUrl = `https://yields.llama.fi/chart/${poolId}`;
    const response = await fetch(chartUrl);
    if (!response.ok) throw new Error(`DeFi Llama chart: ${response.status}`);

    const { data } = (await response.json()) as {
      data: Array<{ timestamp: string; apy: number; tvlUsd: number }>;
    };

    // Filter to requested time range
    const cutoffMs = Date.now() - days * 86400000;
    const filtered = data.filter((d) => new Date(d.timestamp).getTime() >= cutoffMs);

    const history = filtered.map((d) => ({
      timestamp: d.timestamp,
      supplyApy: d.apy,
    }));

    const currentSupplyApy = history.length > 0
      ? history[history.length - 1].supplyApy
      : 3.5;

    console.log(`Aave V3 USDC APY: ${currentSupplyApy.toFixed(2)}% (${history.length} data points from DeFi Llama)`);

    return { currentSupplyApy, history };
  }

  /**
   * Simulated Aave USDC yield data as fallback.
   */
  getSimulatedData(days: number): AaveYieldData {
    const now = Date.now();
    const baseApy = 3.5;
    const history = Array.from({ length: days }, (_, i) => ({
      timestamp: new Date(now - (days - 1 - i) * 86400000).toISOString(),
      supplyApy: baseApy + (Math.sin(i * 0.1) * 0.5) + (Math.random() - 0.5) * 0.3,
    }));

    return {
      currentSupplyApy: baseApy,
      history,
    };
  }
}

export const aaveYieldService = new AaveYieldService();
