import { ethers } from 'ethers';
import type { Call } from '../execution/smart-account.service';
import { config } from '../../config';
import AaveL2PoolABI from '@xstocks/shared/abis/AaveL2Pool.json';
import ERC20ABI from '@xstocks/shared/abis/ERC20.json';

export class VaultService {
  private poolIface = new ethers.Interface(AaveL2PoolABI);
  private erc20Iface = new ethers.Interface(ERC20ABI);

  /** Aave L2Pool address on Ink (Tydro) */
  private get pool(): string {
    return config.aaveL2Pool;
  }

  /** aUSDC token address — balance represents supplied USDC + yield */
  private get aToken(): string {
    return config.aaveAUsdcToken;
  }

  /**
   * Build the approval call for USDC → L2Pool (max approval, only needed once).
   */
  buildApproveCall(): Call {
    return {
      to: config.usdc,
      data: this.erc20Iface.encodeFunctionData('approve', [this.pool, ethers.MaxUint256]),
    };
  }

  /**
   * Build the supply call to deposit USDC into Aave V3 / Tydro.
   */
  buildSupplyCall(usdcAmount: bigint, onBehalfOf: string): Call {
    return {
      to: this.pool,
      data: this.poolIface.encodeFunctionData('supply', [config.usdc, usdcAmount, onBehalfOf, 0]),
    };
  }

  /**
   * Build calls to withdraw USDC from Aave V3 / Tydro.
   * For full withdrawal, pass the actual aToken balance (not MaxUint256).
   */
  buildWithdrawCalls(usdcAmount: bigint, to: string): Call[] {
    return [
      {
        to: this.pool,
        data: this.poolIface.encodeFunctionData('withdraw', [config.usdc, usdcAmount, to]),
      },
    ];
  }

  /**
   * Read vault balance for a user via aToken balanceOf.
   * aToken is 1:1 with USDC and includes accrued yield.
   */
  async getVaultBalance(user: string): Promise<{ shares: bigint; assets: bigint }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const aToken = new ethers.Contract(this.aToken, ERC20ABI, provider);
    const balance: bigint = await aToken.balanceOf(user);
    return { shares: 0n, assets: balance };
  }

  /**
   * Get the max withdrawable amount (= aToken balance, since it's 1:1 with USDC).
   */
  async getMaxWithdraw(user: string): Promise<bigint> {
    const { assets } = await this.getVaultBalance(user);
    return assets;
  }
}

export const vaultService = new VaultService();
