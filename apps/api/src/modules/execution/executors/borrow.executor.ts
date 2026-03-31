import { ethers } from 'ethers';
import type { Call } from '../smart-account.service';
import { config } from '../../../config';
import MorphoABI from '@xstocks/shared/abis/MorphoBlue.json';

export interface MorphoPosition {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: number;
}

const ORACLE_ABI = ['function price() external view returns (uint256)'];
const LLTV = ethers.parseEther('0.8'); // 80%
const WAD = 10n ** 18n;
const ORACLE_PRICE_SCALE = 10n ** 36n;

export class BorrowExecutor {
  private iface = new ethers.Interface(MorphoABI);
  private cachedMarketParams: { oracle: string; irm: string } | null = null;

  /**
   * Resolve oracle and IRM addresses — from config or on-chain.
   */
  async resolveMarketParams(): Promise<{ oracle: string; irm: string }> {
    if (this.cachedMarketParams) return this.cachedMarketParams;

    if (config.morphoOracle && config.morphoIrm) {
      this.cachedMarketParams = { oracle: config.morphoOracle, irm: config.morphoIrm };
      return this.cachedMarketParams;
    }

    // Fallback: read from chain
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, MorphoABI, provider);
    const params = await morpho.idToMarketParams(config.morphoMarketId);
    this.cachedMarketParams = {
      oracle: params.oracle ?? params[2],
      irm: params.irm ?? params[3],
    };
    return this.cachedMarketParams;
  }

  private async getMarketParams() {
    const { oracle, irm } = await this.resolveMarketParams();
    return {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle,
      irm,
      lltv: LLTV,
    };
  }

  buildSupplyCollateralCalls(amount: bigint, onBehalf: string): Call[] {
    const mp = {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle: config.morphoOracle || ethers.ZeroAddress,
      irm: config.morphoIrm || ethers.ZeroAddress,
      lltv: LLTV,
    };
    const data = this.iface.encodeFunctionData('supplyCollateral', [
      Object.values(mp), amount, onBehalf, '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildBorrowCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const mp = {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle: config.morphoOracle || ethers.ZeroAddress,
      irm: config.morphoIrm || ethers.ZeroAddress,
      lltv: LLTV,
    };
    const data = this.iface.encodeFunctionData('borrow', [
      Object.values(mp), amount, 0, onBehalf, receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  buildRepayCalls(amount: bigint, onBehalf: string): Call[] {
    const mp = {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle: config.morphoOracle || ethers.ZeroAddress,
      irm: config.morphoIrm || ethers.ZeroAddress,
      lltv: LLTV,
    };
    const data = this.iface.encodeFunctionData('repay', [
      Object.values(mp), amount, 0, onBehalf, '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildWithdrawCollateralCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const mp = {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle: config.morphoOracle || ethers.ZeroAddress,
      irm: config.morphoIrm || ethers.ZeroAddress,
      lltv: LLTV,
    };
    const data = this.iface.encodeFunctionData('withdrawCollateral', [
      Object.values(mp), amount, onBehalf, receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  /**
   * Read current Morpho position for a user.
   * Converts borrow shares to assets using market data.
   */
  async getPosition(user: string): Promise<MorphoPosition> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, MorphoABI, provider);

    const [, borrowShares, collateral] = await morpho.position(config.morphoMarketId, user);
    const [, , totalBorrowAssets, totalBorrowShares] = await morpho.market(config.morphoMarketId);

    // Convert borrow shares to assets
    const borrowed = BigInt(totalBorrowShares) > 0n
      ? (BigInt(borrowShares) * BigInt(totalBorrowAssets)) / BigInt(totalBorrowShares)
      : 0n;

    const healthFactor = await this.calculateHealthFactor(BigInt(collateral), borrowed);

    return { collateral: BigInt(collateral), borrowed, healthFactor };
  }

  /**
   * Calculate health factor from collateral and borrowed amounts.
   * HF = (collateral * oraclePrice * lltv) / (borrowed * ORACLE_SCALE * WAD)
   */
  private async calculateHealthFactor(collateral: bigint, borrowed: bigint): Promise<number> {
    if (borrowed === 0n) return 999; // No debt = effectively infinite HF
    if (collateral === 0n) return 0;

    const { oracle: oracleAddr } = await this.resolveMarketParams();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const oracle = new ethers.Contract(oracleAddr, ORACLE_ABI, provider);
    const oraclePrice = BigInt(await oracle.price());

    const numerator = collateral * oraclePrice * LLTV;
    const denominator = borrowed * ORACLE_PRICE_SCALE * WAD;

    if (denominator === 0n) return 999;
    return Number((numerator * 10000n) / denominator) / 10000;
  }

  async getHealthFactor(user: string): Promise<number> {
    const position = await this.getPosition(user);
    return position.healthFactor;
  }

  /**
   * Calculate max safe borrow amount that keeps HF >= targetHF.
   */
  async calculateSafeBorrowAmount(
    newCollateralWstrc: bigint,
    currentPosition: MorphoPosition,
    targetHF: number = 1.5,
  ): Promise<bigint> {
    const { oracle: oracleAddr } = await this.resolveMarketParams();
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const oracle = new ethers.Contract(oracleAddr, ORACLE_ABI, provider);
    const oraclePrice = BigInt(await oracle.price());

    const totalCollateral = currentPosition.collateral + newCollateralWstrc;
    const targetHFScaled = BigInt(Math.floor(targetHF * 10000));

    // maxTotalBorrow = (totalCollateral * oraclePrice * LLTV * 10000) / (targetHF * ORACLE_SCALE * WAD)
    const maxTotalBorrow = (totalCollateral * oraclePrice * LLTV * 10000n) /
      (targetHFScaled * ORACLE_PRICE_SCALE * WAD);

    const maxNewBorrow = maxTotalBorrow > currentPosition.borrowed
      ? maxTotalBorrow - currentPosition.borrowed
      : 0n;

    return maxNewBorrow;
  }
}

export const borrowExecutor = new BorrowExecutor();
