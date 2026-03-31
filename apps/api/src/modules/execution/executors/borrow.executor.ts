import { ethers } from 'ethers';
import type { Call } from '../smart-account.service';
import { config } from '../../../config';
import MorphoABI from '@xstocks/shared/abis/MorphoBlue.json';

export interface MorphoPosition {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: number;
}

export class BorrowExecutor {
  private iface = new ethers.Interface(MorphoABI);

  private getMarketParams() {
    return {
      loanToken: config.usdc,
      collateralToken: config.wstrc,
      oracle: '', // TODO: Fill after deploy
      irm: '',    // TODO: Fill after deploy
      lltv: ethers.parseEther('0.8'), // 80%
    };
  }

  buildSupplyCollateralCalls(amount: bigint, onBehalf: string): Call[] {
    const data = this.iface.encodeFunctionData('supplyCollateral', [
      Object.values(this.getMarketParams()),
      amount,
      onBehalf,
      '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildBorrowCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const data = this.iface.encodeFunctionData('borrow', [
      Object.values(this.getMarketParams()),
      amount,
      0, // shares = 0, use assets
      onBehalf,
      receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  buildRepayCalls(amount: bigint, onBehalf: string): Call[] {
    const data = this.iface.encodeFunctionData('repay', [
      Object.values(this.getMarketParams()),
      amount,
      0, // shares = 0, use assets
      onBehalf,
      '0x',
    ]);
    return [{ to: config.morpho, data }];
  }

  buildWithdrawCollateralCalls(amount: bigint, onBehalf: string, receiver: string): Call[] {
    const data = this.iface.encodeFunctionData('withdrawCollateral', [
      Object.values(this.getMarketParams()),
      amount,
      onBehalf,
      receiver,
    ]);
    return [{ to: config.morpho, data }];
  }

  /**
   * Read current Morpho position for a user (view call).
   */
  async getPosition(user: string): Promise<MorphoPosition> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const morpho = new ethers.Contract(config.morpho, MorphoABI, provider);

    const [, borrowShares, collateral] = await morpho.position(config.morphoMarketId, user);

    // TODO: Convert shares to assets using market data
    // TODO: Calculate health factor from oracle price + LLTV

    return {
      collateral: BigInt(collateral),
      borrowed: BigInt(borrowShares), // TODO: Convert to assets
      healthFactor: 0, // TODO: Calculate
    };
  }

  /**
   * Calculate current health factor for a position.
   */
  async getHealthFactor(user: string): Promise<number> {
    const position = await this.getPosition(user);
    // TODO: HF = (collateral * oracle_price * LLTV) / borrowed
    return position.healthFactor;
  }
}

export const borrowExecutor = new BorrowExecutor();
