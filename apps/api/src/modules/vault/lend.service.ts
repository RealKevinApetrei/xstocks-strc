import { ethers } from 'ethers';
import type { Call } from '../execution/smart-account.service';
import { config } from '../../config';
import MorphoABI from '@xstocks/shared/abis/MorphoBlue.json';
import ERC20ABI from '@xstocks/shared/abis/ERC20.json';

const WAD = 10n ** 18n;

/**
 * Service for lending USDC to the Morpho market.
 * Lenders supply USDC and earn yield from borrowers (loopers).
 */
export class LendService {
  private morphoIface = new ethers.Interface(MorphoABI);
  private erc20Iface = new ethers.Interface(ERC20ABI);

  /** LLTV from config */
  private get lltv(): bigint {
    const raw = config.morphoLltv;
    return raw.includes('.') ? BigInt(Math.floor(parseFloat(raw) * 1e18)) : BigInt(raw);
  }

  /** Market params tuple for Morpho calldata */
  private getMarketParams(): [string, string, string, string, bigint] {
    return [config.usdc, config.wstrc, config.morphoOracle, config.morphoIrm, this.lltv];
  }

  /**
   * Build calls to supply (lend) USDC to Morpho.
   * Includes USDC approval to Morpho + supply call.
   */
  buildSupplyCalls(usdcAmount: bigint, onBehalfOf: string): Call[] {
    return [
      // Approve USDC to Morpho
      {
        to: config.usdc,
        data: this.erc20Iface.encodeFunctionData('approve', [config.morpho, usdcAmount]),
      },
      // Supply USDC as lender (assets, not shares)
      {
        to: config.morpho,
        data: this.morphoIface.encodeFunctionData('supply', [
          this.getMarketParams(), usdcAmount, 0, onBehalfOf, '0x',
        ]),
      },
    ];
  }

  /**
   * Build calls to withdraw (unlend) USDC from Morpho.
   * For partial: withdraw by assets. For max: withdraw by exact supply shares.
   */
  buildWithdrawByAssets(usdcAmount: bigint, onBehalfOf: string, receiver: string): Call[] {
    return [
      {
        to: config.morpho,
        data: this.morphoIface.encodeFunctionData('withdraw', [
          this.getMarketParams(),
          usdcAmount, // assets
          0,          // shares (0 = use assets)
          onBehalfOf,
          receiver,
        ]),
      },
    ];
  }

  /**
   * Build calls to withdraw ALL supplied USDC by passing exact supply shares.
   * Must read shares first to avoid MaxUint256 overflow in Morpho.
   */
  async buildWithdrawMaxCalls(onBehalfOf: string, receiver: string): Promise<Call[]> {
    const { supplyShares } = await this.getLendBalance(onBehalfOf);
    if (supplyShares === 0n) {
      throw new Error('No lending position to withdraw');
    }
    return [
      {
        to: config.morpho,
        data: this.morphoIface.encodeFunctionData('withdraw', [
          this.getMarketParams(),
          0,            // assets (0 = use shares)
          supplyShares, // exact shares to withdraw all
          onBehalfOf,
          receiver,
        ]),
      },
    ];
  }

  /**
   * Read the user's lending position: supply shares → USDC value.
   * Uses Morpho's position() to get supplyShares, then converts via market totals.
   */
  async getLendBalance(user: string): Promise<{ supplyShares: bigint; assets: bigint }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, MorphoABI, provider);

    // position() returns (supplyShares, borrowShares, collateral)
    const pos = await morpho.position(config.morphoMarketId, user);
    const supplyShares = BigInt(pos[0]);

    if (supplyShares === 0n) {
      return { supplyShares: 0n, assets: 0n };
    }

    // Convert shares to assets: assets = shares * totalSupplyAssets / totalSupplyShares
    const mkt = await morpho.market(config.morphoMarketId);
    const totalSupplyAssets = BigInt(mkt[0]);
    const totalSupplyShares = BigInt(mkt[1]);

    const assets = totalSupplyShares > 0n
      ? (supplyShares * totalSupplyAssets) / totalSupplyShares
      : 0n;

    return { supplyShares, assets };
  }

  /**
   * Get the current supply APY from the IRM.
   * supplyAPY = borrowAPY * utilization * (1 - fee)
   *
   * Morpho Blue IRM returns borrow rate per second (in WAD).
   * Market fee is in WAD (1e18 = 100%, max 25%).
   */
  async getSupplyApy(): Promise<{ supplyApy: number | null; borrowApy: number | null; utilization: number; totalSupply: string; totalBorrow: string }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, [
      'function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
    ], provider);

    const mkt = await morpho.market(config.morphoMarketId);
    const totalSupplyAssets = BigInt(mkt[0]);
    const totalBorrowAssets = BigInt(mkt[2]);
    const fee = BigInt(mkt[5]); // WAD: 0 = 0%, 0.1e18 = 10%, max 0.25e18 = 25%

    // Utilization as a decimal 0-1 (not percentage)
    const utilizationDecimal = totalSupplyAssets > 0n
      ? Number(totalBorrowAssets) / Number(totalSupplyAssets)
      : 0;
    const utilizationPct = utilizationDecimal * 100;

    if (!config.morphoIrm) {
      return { supplyApy: null, borrowApy: null, utilization: Math.round(utilizationPct * 100) / 100, totalSupply: totalSupplyAssets.toString(), totalBorrow: totalBorrowAssets.toString() };
    }

    try {
      const irm = new ethers.Contract(config.morphoIrm, [
        'function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)',
      ], provider);

      const marketParams = await new ethers.Contract(config.morpho, [
        'function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
      ], provider).idToMarketParams(config.morphoMarketId);

      const ratePerSecond: bigint = await irm.borrowRateView(
        [marketParams[0], marketParams[1], marketParams[2], marketParams[3], marketParams[4]],
        [mkt[0], mkt[1], mkt[2], mkt[3], mkt[4], mkt[5]],
      );

      // Convert rate per second → APY: (1 + r/1e18)^(seconds_per_year) - 1
      const rateFloat = Number(ratePerSecond) / 1e18;
      const secondsPerYear = 365.25 * 86400;
      const borrowApy = (Math.pow(1 + rateFloat, secondsPerYear) - 1) * 100;

      // Fee as decimal (0-0.25)
      const feeDecimal = Number(fee) / 1e18;

      // Supply APY = borrowAPY * utilization * (1 - protocolFee)
      const supplyApy = borrowApy * utilizationDecimal * (1 - feeDecimal);

      console.log(`[LEND-APY] borrowRate/s=${ratePerSecond}, borrowAPY=${borrowApy.toFixed(4)}%, util=${(utilizationDecimal * 100).toFixed(2)}%, fee=${(feeDecimal * 100).toFixed(1)}%, supplyAPY=${supplyApy.toFixed(4)}%`);

      return {
        supplyApy: Math.round(supplyApy * 10000) / 10000, // 4 decimal places to avoid rounding to 0
        borrowApy: Math.round(borrowApy * 100) / 100,
        utilization: Math.round(utilizationPct * 100) / 100,
        totalSupply: totalSupplyAssets.toString(),
        totalBorrow: totalBorrowAssets.toString(),
      };
    } catch (err) {
      console.error('[LEND-APY] IRM call failed:', err instanceof Error ? err.message : err);
      return { supplyApy: null, borrowApy: null, utilization: Math.round(utilizationPct * 100) / 100, totalSupply: totalSupplyAssets.toString(), totalBorrow: totalBorrowAssets.toString() };
    }
  }
}

export const lendService = new LendService();
