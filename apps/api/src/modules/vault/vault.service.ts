import { ethers } from 'ethers';
import type { Call } from '../execution/smart-account.service';
import { config } from '../../config';
import USDCVaultABI from '@xstocks/shared/abis/USDCVault.json';
import ERC20ABI from '@xstocks/shared/abis/ERC20.json';

export class VaultService {
  private vaultIface = new ethers.Interface(USDCVaultABI);
  private erc20Iface = new ethers.Interface(ERC20ABI);

  /**
   * Build calls to deposit USDC into the vault (→ Tydro for yield).
   * Includes USDC approval + vault deposit.
   */
  buildDepositCalls(usdcAmount: bigint, receiver: string): Call[] {
    return [
      // Approve USDC → vault
      {
        to: config.usdc,
        data: this.erc20Iface.encodeFunctionData('approve', [config.usdcVault, usdcAmount]),
      },
      // Deposit into vault
      {
        to: config.usdcVault,
        data: this.vaultIface.encodeFunctionData('deposit', [usdcAmount, receiver]),
      },
    ];
  }

  /**
   * Build calls to withdraw USDC from vault (← Tydro).
   */
  buildWithdrawCalls(usdcAmount: bigint, receiver: string, owner: string): Call[] {
    return [
      {
        to: config.usdcVault,
        data: this.vaultIface.encodeFunctionData('withdraw', [usdcAmount, receiver, owner]),
      },
    ];
  }

  /**
   * Read vault balance for a user (shares + equivalent assets).
   */
  async getVaultBalance(user: string): Promise<{ shares: bigint; assets: bigint }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const vault = new ethers.Contract(config.usdcVault, USDCVaultABI, provider);

    const shares: bigint = await vault.balanceOf(user);
    const assets: bigint = shares > 0n ? await vault.convertToAssets(shares) : 0n;

    return { shares, assets };
  }

  /**
   * Get total assets in the vault (all users combined).
   */
  async getTotalAssets(): Promise<bigint> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const vault = new ethers.Contract(config.usdcVault, USDCVaultABI, provider);
    return vault.totalAssets();
  }
}

export const vaultService = new VaultService();
