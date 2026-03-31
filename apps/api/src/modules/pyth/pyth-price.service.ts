import { ethers } from 'ethers';
import { config } from '../../config';
import { GRID_THRESHOLD_USD } from '@xstocks/shared';
import { gridExecutor } from '../grid/grid.executor';

/**
 * Pyth Network price service.
 *
 * Uses on-demand price updates:
 * - Before any execution (loop, unwind, grid-buy), call ensureFreshPrice()
 *   which fetches from Hermes and pushes to Pyth EVM contract on Ink
 * - Oracle adapter reads on-chain from the Pyth contract (view call, no gas)
 * - Background polling reads from Hermes for grid trigger checks (no gas)
 */

const PYTH_ABI = [
  'function updatePriceFeeds(bytes[] calldata updateData) external payable',
  'function getUpdateFee(bytes[] calldata updateData) external view returns (uint256)',
  'function getPriceUnsafe(bytes32 id) external view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime)',
];

const ORACLE_ABI = [
  'function getStrcxPrice() external view returns (uint256 price, uint256 timestamp)',
];

const HERMES_URL = 'https://hermes.pyth.network';

export interface StrcxPrice {
  price: number;
  priceRaw: bigint;
  timestamp: number;
  stale: boolean;
}

export class PythPriceService {
  private cachedPrice: StrcxPrice | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Get current STRCx/USD price.
   * Reads from Hermes API (no gas cost, always fresh).
   */
  async getPrice(): Promise<StrcxPrice> {
    if (this.cachedPrice && Date.now() / 1000 - this.cachedPrice.timestamp < 30) {
      return this.cachedPrice;
    }
    return this.fetchFromHermes();
  }

  /**
   * Ensure the on-chain Pyth price is fresh before execution.
   * Call this before any loop/unwind/grid-buy operation.
   * Fetches signed update from Hermes → pushes to Pyth contract on Ink.
   */
  async ensureFreshPrice(): Promise<void> {
    if (!config.pythContract || !config.pythPriceFeedId || !config.oracleUpdaterKey) {
      console.log('Pyth on-chain update not configured — using manual oracle mode');
      return;
    }

    try {
      // Check if on-chain price is fresh enough (< 5 min)
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);
      const pyth = new ethers.Contract(config.pythContract, PYTH_ABI, provider);

      try {
        const [, , , publishTime] = await pyth.getPriceUnsafe(config.pythPriceFeedId);
        const age = Math.floor(Date.now() / 1000) - Number(publishTime);
        if (age < 300) {
          console.log(`Pyth price is fresh (${age}s old) — no update needed`);
          return;
        }
      } catch {
        // Price not yet pushed — need to push
      }

      // Fetch signed update from Hermes
      const feedId = config.pythPriceFeedId.replace('0x', '');
      const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Hermes: ${response.status}`);

      const data = (await response.json()) as { binary: { data: string[] } };
      if (!data.binary?.data?.[0]) throw new Error('No update data from Hermes');

      const updateData = data.binary.data.map((d: string) => '0x' + d);

      // Push to Pyth contract
      const signer = new ethers.Wallet(config.oracleUpdaterKey, provider);
      const pythSigned = new ethers.Contract(config.pythContract, PYTH_ABI, signer);

      const fee = await pythSigned.getUpdateFee(updateData);
      const tx = await pythSigned.updatePriceFeeds(updateData, { value: fee });
      await tx.wait();
      console.log(`Pyth price pushed on-chain — tx: ${tx.hash}`);
    } catch (err) {
      console.error('Failed to push Pyth price on-chain:', err);
      // Non-fatal — oracle adapter may have manual fallback
    }
  }

  /**
   * Fetch price from Pyth Hermes REST API (no gas, no on-chain).
   */
  private async fetchFromHermes(): Promise<StrcxPrice> {
    if (!config.pythPriceFeedId) {
      return { price: 0, priceRaw: 0n, timestamp: 0, stale: true };
    }

    try {
      const feedId = config.pythPriceFeedId.replace('0x', '');
      const url = `${HERMES_URL}/v2/updates/price/latest?ids[]=${feedId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Hermes: ${response.status}`);

      const data = (await response.json()) as {
        parsed: Array<{ price: { price: string; expo: number; publish_time: number } }>;
      };

      if (!data.parsed?.[0]) throw new Error('No parsed data');

      const p = data.parsed[0].price;
      const priceUsd = parseInt(p.price) * Math.pow(10, p.expo);

      this.cachedPrice = {
        price: priceUsd,
        priceRaw: BigInt(Math.floor(priceUsd * 1e18)),
        timestamp: p.publish_time,
        stale: false,
      };
      return this.cachedPrice;
    } catch {
      return this.cachedPrice ?? { price: 0, priceRaw: 0n, timestamp: 0, stale: true };
    }
  }

  /**
   * Start background price polling for grid trigger checks.
   * No gas — reads from Hermes only.
   */
  start(): void {
    if (this.pollInterval) return;
    console.log('Pyth price service started — polling Hermes every 30s for grid triggers');

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

    // Initial price fetch
    this.getPrice().then(p => {
      if (p.price > 0) console.log(`Initial STRCx/USD: $${p.price.toFixed(2)}`);
    }).catch(console.error);
  }

  stop(): void {
    if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
  }
}

export const pythPriceService = new PythPriceService();
