import { ethers } from 'ethers';
import type { Call } from '../smart-account.service';
import { config } from '../../../config';
import { USDC_DUST } from '@xstocks/shared';
import MorphoABI from '@xstocks/shared/abis/MorphoBlue.json';

import { getProvider } from '../../../lib/provider';

export interface MorphoPosition {
  collateral: bigint;   // wSTRC collateral (raw, 18 decimals)
  borrowed: bigint;     // USDC debt in assets (6 decimals), rounded up
  borrowShares: bigint; // Raw borrow shares
  healthFactor: number; // HF with 4 decimal precision
}

export interface PositionValidation {
  safe: boolean;
  hf: number;
  leverage: number;
  liquidatable: boolean;
}

const ORACLE_ABI = ['function price() external view returns (uint256)'];
const WAD = 10n ** 18n;
const ORACLE_PRICE_SCALE = 10n ** 36n;

export class BorrowExecutor {
  private iface = new ethers.Interface(MorphoABI);

  /** LLTV from config — supports both decimal (0.86) and wei (860000000000000000) */
  private get lltv(): bigint {
    const raw = config.morphoLltv;
    return raw.includes('.') ? BigInt(Math.floor(parseFloat(raw) * 1e18)) : BigInt(raw);
  }

  /** Market params tuple for Morpho calldata encoding */
  private getMarketParamsTuple(): [string, string, string, string, bigint] {
    if (!config.morphoOracle || !config.morphoIrm) {
      throw new Error('Morpho oracle or IRM address not configured');
    }
    const tuple: [string, string, string, string, bigint] = [config.usdc, config.wstrc, config.morphoOracle, config.morphoIrm, this.lltv];
    console.log(`[MORPHO] Market params: loanToken=${tuple[0]}, collateral=${tuple[1]}, oracle=${tuple[2]}, irm=${tuple[3]}, lltv=${tuple[4]}`);
    return tuple;
  }

  // ── Calldata builders ────────────────────────────────

  buildSupplyCollateralCalls(amount: bigint, onBehalf: string): Call[] {
    const data = this.iface.encodeFunctionData('supplyCollateral', [
      this.getMarketParamsTuple(), amount, onBehalf, '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildBorrowCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const data = this.iface.encodeFunctionData('borrow', [
      this.getMarketParamsTuple(), amount, 0, onBehalf, receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  buildRepayCalls(amount: bigint, onBehalf: string, useShares: boolean = false, shares: bigint = 0n): Call[] {
    // When useShares=true, repay by shares (exact debt closure). Otherwise repay by assets.
    const data = this.iface.encodeFunctionData('repay', [
      this.getMarketParamsTuple(),
      useShares ? 0 : amount,   // assets (0 when using shares)
      useShares ? shares : 0,    // shares (0 when using assets)
      onBehalf,
      '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildWithdrawCollateralCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const data = this.iface.encodeFunctionData('withdrawCollateral', [
      this.getMarketParamsTuple(), amount, onBehalf, receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  // ── Position reads ───────────────────────────────────

  /**
   * Read current Morpho position for a user.
   * Borrow shares are converted to assets (rounded UP for safety).
   */
  async getPosition(user: string): Promise<MorphoPosition> {
    const provider = getProvider();
    const morpho = new ethers.Contract(config.morpho, MorphoABI, provider);

    const posResult = await morpho.position(config.morphoMarketId, user);
    const borrowShares = BigInt(posResult[1]);
    const collateral = BigInt(posResult[2]);

    const mktResult = await morpho.market(config.morphoMarketId);
    const totalBorrowAssets = BigInt(mktResult[2]);
    const totalBorrowShares = BigInt(mktResult[3]);

    // Convert shares → assets, round UP (user owes at least this much)
    const borrowed = totalBorrowShares > 0n
      ? (borrowShares * totalBorrowAssets + totalBorrowShares - 1n) / totalBorrowShares
      : 0n;

    // Read oracle price once for HF calculation
    const oraclePrice = await this.readOraclePrice(provider);
    const healthFactor = this.computeHF(collateral, borrowed, oraclePrice);

    return { collateral, borrowed, borrowShares, healthFactor };
  }

  /**
   * Validate position safety.
   */
  async validatePosition(user: string): Promise<PositionValidation> {
    const pos = await this.getPosition(user);
    const leverage = this.calculateLeverage(pos.healthFactor);
    return {
      safe: pos.healthFactor > config.emergencyHF,
      hf: pos.healthFactor,
      leverage,
      liquidatable: pos.healthFactor <= 1.0 && pos.borrowed > 0n,
    };
  }

  async getHealthFactor(user: string): Promise<number> {
    const pos = await this.getPosition(user);
    return pos.healthFactor;
  }

  // ── Borrow calculation ───────────────────────────────

  /**
   * Calculate max USDC to borrow while keeping HF >= targetHF.
   * Returns 0 if no safe borrow possible. Returns > USDC_DUST or 0.
   */
  async calculateSafeBorrowAmount(
    newCollateralWstrc: bigint,
    currentPosition: MorphoPosition,
    targetHF: number = config.loopTargetHF,
  ): Promise<bigint> {
    const provider = getProvider();
    const oraclePrice = await this.readOraclePrice(provider);

    if (oraclePrice === 0n) {
      throw new Error('Oracle price is zero — cannot calculate safe borrow');
    }

    const totalCollateral = currentPosition.collateral + newCollateralWstrc;

    // targetHF scaled to avoid floating point: multiply by 1e18
    const targetHFWad = BigInt(Math.round(targetHF * 1e18));

    // maxTotalBorrow = (totalCollateral * oraclePrice * lltv) / (targetHF * ORACLE_SCALE * WAD)
    // But targetHF is in WAD, so:
    // maxTotalBorrow = (totalCollateral * oraclePrice * lltv) / (targetHFWad * ORACLE_SCALE)
    const numerator = totalCollateral * oraclePrice * this.lltv;
    const denominator = targetHFWad * ORACLE_PRICE_SCALE;

    if (denominator === 0n) return 0n;

    const maxTotalBorrow = numerator / denominator;
    const maxNewBorrow = maxTotalBorrow > currentPosition.borrowed
      ? maxTotalBorrow - currentPosition.borrowed
      : 0n;

    // Below dust threshold → not worth borrowing
    return maxNewBorrow > USDC_DUST ? maxNewBorrow : 0n;
  }

  // ── Leverage calculation ─────────────────────────────

  /**
   * Calculate effective leverage from health factor.
   * leverage = 1 / (1 - lltv/HF)
   * Uses actual LLTV (86%) not hardcoded.
   */
  calculateLeverage(hf: number): number {
    if (hf <= 0 || hf >= 999) return 1;
    const lltvDecimal = Number(this.lltv) / 1e18;
    if (hf <= lltvDecimal) return 999; // At or past liquidation
    const lev = 1 / (1 - lltvDecimal / hf);
    return Math.min(Math.max(lev, 1), 100); // Clamp 1-100
  }

  // ── Internal helpers ─────────────────────────────────

  private async readOraclePrice(provider: ethers.JsonRpcProvider): Promise<bigint> {
    if (!config.morphoOracle) throw new Error('Oracle address not configured');
    const oracle = new ethers.Contract(config.morphoOracle, ORACLE_ABI, provider);
    const price = BigInt(await oracle.price());
    if (price <= 0n) throw new Error(`Oracle returned invalid price: ${price}`);
    return price;
  }

  private computeHF(collateral: bigint, borrowed: bigint, oraclePrice: bigint): number {
    if (borrowed === 0n) return 999;
    if (collateral === 0n) return 0;

    const numerator = collateral * oraclePrice * this.lltv;
    const denominator = borrowed * ORACLE_PRICE_SCALE * WAD;

    if (denominator === 0n) return 999;

    // 4 decimal precision
    return Number((numerator * 10000n) / denominator) / 10000;
  }
}

export const borrowExecutor = new BorrowExecutor();
