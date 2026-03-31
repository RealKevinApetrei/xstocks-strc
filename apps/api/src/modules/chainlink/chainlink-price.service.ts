import { ethers } from 'ethers';
import { config } from '../../config';
import { GRID_THRESHOLD_USD } from '@xstocks/shared';
import { gridExecutor } from '../grid/grid.executor';

const ORACLE_ABI = [
  'function getStrcxPrice() external view returns (uint256 price, uint256 timestamp)',
  'function updatePriceFromChainlink(bytes calldata signedReport) external',
  'function strcxPriceUsd() external view returns (uint256)',
  'function lastPriceUpdate() external view returns (uint256)',
];

const CHAINLINK_STREAM_ID = '0x000a968f79058f73e24ba7d546882160d440634412e5ac2dc491f58bea5bea38';

export interface StrcxPrice {
  price: number;       // USD price (human readable)
  priceRaw: bigint;    // 18 decimal raw price
  timestamp: number;   // Unix timestamp of last update
  stale: boolean;      // Whether the price is older than threshold
}

export class ChainlinkPriceService {
  private cachedPrice: StrcxPrice | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Read the current STRCx/USD price from the oracle adapter contract.
   */
  async getPrice(): Promise<StrcxPrice> {
    if (this.cachedPrice && Date.now() / 1000 - this.cachedPrice.timestamp < 60) {
      return this.cachedPrice;
    }

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const oracle = new ethers.Contract(config.morphoOracle, ORACLE_ABI, provider);

    const [priceRaw, timestamp]: [bigint, bigint] = await oracle.getStrcxPrice();
    const priceUsd = Number(priceRaw) / 1e18;
    const now = Math.floor(Date.now() / 1000);

    this.cachedPrice = {
      price: priceUsd,
      priceRaw,
      timestamp: Number(timestamp),
      stale: now - Number(timestamp) > 3600, // Stale if > 1 hour
    };

    return this.cachedPrice;
  }

  /**
   * Fetch a signed report from Chainlink Data Streams API and update the oracle on-chain.
   * Called periodically by the price update loop.
   */
  async updateOraclePrice(): Promise<void> {
    if (!config.chainlinkApiUrl || !config.chainlinkApiKey) {
      console.log('Chainlink API not configured — skipping oracle update');
      return;
    }

    try {
      // 1. Fetch latest signed report from Chainlink Data Streams API
      const report = await this.fetchSignedReport();
      if (!report) {
        console.log('No fresh Chainlink report available');
        return;
      }

      // 2. Submit to oracle adapter on-chain
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const signer = new ethers.Wallet(config.oracleUpdaterKey, provider);
      const oracle = new ethers.Contract(config.morphoOracle, ORACLE_ABI, signer);

      const tx = await oracle.updatePriceFromChainlink(report);
      await tx.wait();

      console.log(`Oracle price updated — tx: ${tx.hash}`);

      // Refresh cache
      this.cachedPrice = null;
    } catch (err) {
      console.error('Failed to update oracle price:', err);
    }
  }

  /**
   * Fetch a signed report from Chainlink Data Streams REST API.
   */
  private async fetchSignedReport(): Promise<string | null> {
    const url = `${config.chainlinkApiUrl}/api/v1/reports/latest?feedID=${CHAINLINK_STREAM_ID}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': config.chainlinkApiKey,
        'X-Authorization-Timestamp': Math.floor(Date.now() / 1000).toString(),
      },
    });

    if (!response.ok) {
      console.error(`Chainlink API error: ${response.status} ${await response.text()}`);
      return null;
    }

    const data = (await response.json()) as { report: { fullReport: string } };
    return data.report.fullReport;
  }

  /**
   * Start the price polling loop.
   * - Updates oracle on-chain every 5 minutes
   * - Checks grid trigger threshold every 30 seconds
   */
  start(): void {
    if (this.pollInterval) return;

    console.log('Chainlink price service started — polling every 30s, oracle update every 5m');

    // Price check + grid trigger every 30s
    this.pollInterval = setInterval(async () => {
      try {
        const price = await this.getPrice();
        console.log(`STRCx/USD: $${price.price.toFixed(2)} (${price.stale ? 'STALE' : 'fresh'})`);

        // Grid trigger: check if price dropped below threshold
        if (price.price < GRID_THRESHOLD_USD && !price.stale) {
          console.log(`Grid trigger: STRCx $${price.price} < $${GRID_THRESHOLD_USD}`);
          await gridExecutor.handlePriceTrigger({
            price: price.price,
            timestamp: price.timestamp,
          });
        }
      } catch (err) {
        console.error('Price poll error:', err);
      }
    }, 30_000);

    // Oracle on-chain update every 5 minutes
    setInterval(async () => {
      await this.updateOraclePrice();
    }, 300_000);

    // Initial update
    this.updateOraclePrice().catch(console.error);
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}

export const chainlinkPriceService = new ChainlinkPriceService();
