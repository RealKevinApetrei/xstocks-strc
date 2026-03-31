import { ethers } from 'ethers';
import { config } from '../../config';
import { GRID_THRESHOLD_USD } from '@xstocks/shared';
import { gridExecutor } from '../grid/grid.executor';

/**
 * Pyth Network price service.
 * - Fetches STRCx/USD from Pyth Hermes REST API
 * - Submits price updates to Pyth EVM contract on Ink
 * - Polls every 30s for grid trigger checks
 * - Updates on-chain every 5 minutes
 */

const PYTH_ABI = [
  'function updatePriceFeeds(bytes[] calldata updateData) external payable',
  'function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)',
];

const ORACLE_ABI = [
  'function getStrcxPrice() external view returns (uint256 price, uint256 timestamp)',
];

export interface StrcxPrice {
  price: number;
  priceRaw: bigint;
  timestamp: number;
  stale: boolean;
}

export class PythPriceService {
  private cachedPrice: StrcxPrice | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  async getPrice(): Promise<StrcxPrice> {
    if (this.cachedPrice && Date.now() / 1000 - this.cachedPrice.timestamp < 60) {
      return this.cachedPrice;
    }

    try {
      if (config.morphoOracle) {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const oracle = new ethers.Contract(config.morphoOracle, ORACLE_ABI, provider);
        const [priceRaw, timestamp]: [bigint, bigint] = await oracle.getStrcxPrice();

        this.cachedPrice = {
          price: Number(priceRaw) / 1e18,
          priceRaw,
          timestamp: Number(timestamp),
          stale: Math.floor(Date.now() / 1000) - Number(timestamp) > 3600,
        };
        return this.cachedPrice;
      }
    } catch { /* fallback to Hermes */ }

    return this.fetchFromHermes();
  }

  private async fetchFromHermes(): Promise<StrcxPrice> {
    if (!config.pythPriceFeedId) {
      return { price: 0, priceRaw: 0n, timestamp: 0, stale: true };
    }

    const feedId = config.pythPriceFeedId.replace('0x', '');
    const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${feedId}`;
    const response = await fetch(url);

    if (!response.ok) {
      return this.cachedPrice ?? { price: 0, priceRaw: 0n, timestamp: 0, stale: true };
    }

    const data = (await response.json()) as {
      parsed: Array<{ price: { price: string; expo: number; publish_time: number } }>;
    };

    if (!data.parsed?.[0]) {
      return this.cachedPrice ?? { price: 0, priceRaw: 0n, timestamp: 0, stale: true };
    }

    const p = data.parsed[0].price;
    const priceUsd = parseInt(p.price) * Math.pow(10, p.expo);

    this.cachedPrice = {
      price: priceUsd,
      priceRaw: BigInt(Math.floor(priceUsd * 1e18)),
      timestamp: p.publish_time,
      stale: false,
    };
    return this.cachedPrice;
  }

  async updateOnChainPrice(): Promise<void> {
    if (!config.pythContract || !config.pythPriceFeedId || !config.oracleUpdaterKey) {
      console.log('Pyth on-chain update not configured — skipping');
      return;
    }

    try {
      const feedId = config.pythPriceFeedId.replace('0x', '');
      const url = `${config.pythHermesUrl}/v2/updates/price/latest?ids[]=${feedId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Hermes: ${response.status}`);

      const data = (await response.json()) as { binary: { data: string[] } };
      if (!data.binary?.data?.[0]) return;

      const updateData = data.binary.data.map((d: string) => '0x' + d);
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const signer = new ethers.Wallet(config.oracleUpdaterKey, provider);
      const pythContract = new ethers.Contract(config.pythContract, PYTH_ABI, signer);

      const fee = await pythContract.getUpdateFee(updateData);
      const tx = await pythContract.updatePriceFeeds(updateData, { value: fee });
      await tx.wait();
      console.log(`Pyth price updated on-chain — tx: ${tx.hash}`);
      this.cachedPrice = null;
    } catch (err) {
      console.error('Pyth on-chain update failed:', err);
    }
  }

  start(): void {
    if (this.pollInterval) return;
    console.log('Pyth price service started — polling every 30s, on-chain update every 5m');

    this.pollInterval = setInterval(async () => {
      try {
        const price = await this.getPrice();
        if (price.price > 0 && price.price < GRID_THRESHOLD_USD && !price.stale) {
          console.log(`Grid trigger: STRCx $${price.price.toFixed(2)} < $${GRID_THRESHOLD_USD}`);
          await gridExecutor.handlePriceTrigger({ price: price.price, timestamp: price.timestamp });
        }
      } catch (err) {
        console.error('Price poll error:', err);
      }
    }, 30_000);

    setInterval(() => this.updateOnChainPrice(), 300_000);
    this.updateOnChainPrice().catch(console.error);
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }
}

export const pythPriceService = new PythPriceService();
