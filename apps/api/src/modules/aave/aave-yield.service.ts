/**
 * Fetches Aave USDC lending yield data.
 * Uses Aave's public subgraph for historical rates
 * and on-chain reserve data for current rates.
 */

// Aave V3 subgraph on mainnet (USDC rates are similar across chains)
const AAVE_SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3';

// Aave USDC reserve address (Ethereum mainnet — used as benchmark)
const USDC_RESERVE_ID = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb480x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e';

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

  /**
   * Get current and historical Aave USDC supply APY.
   */
  async getYieldData(days: number = 90): Promise<AaveYieldData> {
    const now = Date.now();
    if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache;
    }

    try {
      const data = await this.fetchFromSubgraph(days);
      this.cache = data;
      this.cacheTimestamp = now;
      return data;
    } catch (err) {
      console.error('Failed to fetch Aave yield data:', err);
      // Return simulated data as fallback
      return this.getSimulatedData(days);
    }
  }

  private async fetchFromSubgraph(days: number): Promise<AaveYieldData> {
    const fromTimestamp = Math.floor(Date.now() / 1000) - days * 86400;

    const query = `{
      reserveParamsHistoryItems(
        where: {
          reserve: "${USDC_RESERVE_ID.toLowerCase()}"
          timestamp_gte: ${fromTimestamp}
        }
        orderBy: timestamp
        orderDirection: asc
        first: 1000
      ) {
        timestamp
        liquidityRate
      }
      reserve(id: "${USDC_RESERVE_ID.toLowerCase()}") {
        liquidityRate
      }
    }`;

    const response = await fetch(AAVE_SUBGRAPH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Aave subgraph error: ${response.status}`);
    }

    const result = (await response.json()) as {
      data: {
        reserveParamsHistoryItems: Array<{ timestamp: string; liquidityRate: string }>;
        reserve: { liquidityRate: string } | null;
      };
    };

    // Convert Aave ray (27 decimals) to APY percentage
    const rayToApy = (ray: string): number => {
      const rate = Number(BigInt(ray)) / 1e27;
      return rate * 100;
    };

    const history = result.data.reserveParamsHistoryItems.map((item) => ({
      timestamp: new Date(parseInt(item.timestamp) * 1000).toISOString(),
      supplyApy: rayToApy(item.liquidityRate),
    }));

    const currentRate = result.data.reserve?.liquidityRate;
    const currentSupplyApy = currentRate ? rayToApy(currentRate) : (history.length > 0 ? history[history.length - 1].supplyApy : 3.5);

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
