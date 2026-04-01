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
   * Pass ethers.MaxUint256 for full withdrawal (all shares).
   */
  buildWithdrawCalls(usdcAmount: bigint, onBehalfOf: string, receiver: string): Call[] {
    // For max withdrawal, use shares instead of assets
    const isMax = usdcAmount === ethers.MaxUint256;
    return [
      {
        to: config.morpho,
        data: this.morphoIface.encodeFunctionData('withdraw', [
          this.getMarketParams(),
          isMax ? 0 : usdcAmount,  // assets (0 when withdrawing by shares)
          isMax ? ethers.MaxUint256 : 0, // shares (max when withdrawing all)
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
   */
  async getSupplyApy(): Promise<{ supplyApy: number | null; borrowApy: number | null; utilization: number; totalSupply: string; totalBorrow: string }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, [
      'function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
    ], provider);

    const mkt = await morpho.market(config.morphoMarketId);
    const totalSupply = BigInt(mkt[0]);
    const totalBorrow = BigInt(mkt[2]);
    const fee = BigInt(mkt[5]); // fee is in WAD (1e18 = 100%)

    const utilization = totalSupply > 0n
      ? Number(totalBorrow * 10000n / totalSupply) / 100
      : 0;

    if (!config.morphoIrm) {
      return { supplyApy: null, borrowApy: null, utilization, totalSupply: totalSupply.toString(), totalBorrow: totalBorrow.toString() };
    }

    try {
      const irm = new ethers.Contract(config.morphoIrm, [
        'function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)',
      ], provider);

      const marketParams = await new ethers.Contract(config.morpho, [
        'function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
      ], provider).idToMarketParams(config.morphoMarketId);

      const ratePerSecond = await irm.borrowRateView(
        [marketParams[0], marketParams[1], marketParams[2], marketParams[3], marketParams[4]],
        [mkt[0], mkt[1], mkt[2], mkt[3], mkt[4], mkt[5]],
      );

      const rateFloat = Number(ratePerSecond) / 1e18;
      const borrowApy = (Math.pow(1 + rateFloat, 365.25 * 86400) - 1) * 100;

      // Supply APY = borrow APY * utilization * (1 - fee)
      const feeRate = Number(fee) / 1e18;
      const supplyApy = borrowApy * (utilization / 100) * (1 - feeRate);

      return {
        supplyApy: Math.round(supplyApy * 100) / 100,
        borrowApy: Math.round(borrowApy * 100) / 100,
        utilization: Math.round(utilization * 100) / 100,
        totalSupply: totalSupply.toString(),
        totalBorrow: totalBorrow.toString(),
      };
    } catch {
      return { supplyApy: null, borrowApy: null, utilization, totalSupply: totalSupply.toString(), totalBorrow: totalBorrow.toString() };
    }
  }
}

export const lendService = new LendService();
