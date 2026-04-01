import { ethers } from 'ethers';
import type { Call } from '../execution/smart-account.service';
import { config } from '../../config';
import ERC20ABI from '@xstocks/shared/abis/ERC20.json';

// Tydro exposes ERC-4626 interface (deposit/withdraw/balanceOf/convertToAssets)
const ERC4626_ABI = [
  'function deposit(uint256 assets, address receiver) external returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function convertToAssets(uint256 shares) external view returns (uint256)',
  'function maxWithdraw(address owner) external view returns (uint256)',
];

export class VaultService {
  private vaultIface = new ethers.Interface(ERC4626_ABI);
  private erc20Iface = new ethers.Interface(ERC20ABI);

  /** The Tydro vault address — uses aaveL2Pool config which is Tydro's ERC-4626 vault on Ink */
  private get vaultAddress(): string {
    return config.tydroVault || config.aaveL2Pool;
  }

  /**
   * Build calls to deposit USDC into Tydro (ERC-4626).
   * Approval goes to the vault address.
   */
  buildDepositCalls(usdcAmount: bigint, receiver: string): Call[] {
    return [
      // Approve USDC → Tydro vault
      {
        to: config.usdc,
        data: this.erc20Iface.encodeFunctionData('approve', [this.vaultAddress, usdcAmount]),
      },
      // Deposit USDC into Tydro (ERC-4626)
      {
        to: this.vaultAddress,
        data: this.vaultIface.encodeFunctionData('deposit', [usdcAmount, receiver]),
      },
    ];
  }

  /**
   * Build calls to withdraw USDC from Tydro (ERC-4626).
   * For full withdrawal, use maxWithdraw first then withdraw that amount,
   * or pass type(uint256).max to withdraw all via shares.
   */
  buildWithdrawCalls(usdcAmount: bigint, receiver: string): Call[] {
    // ERC-4626 withdraw(assets, receiver, owner) — owner = receiver for self-withdrawal
    return [
      {
        to: this.vaultAddress,
        data: this.vaultIface.encodeFunctionData('withdraw', [usdcAmount, receiver, receiver]),
      },
    ];
  }

  /**
   * Read vault balance for a user: shares → USDC value via convertToAssets.
   */
  async getVaultBalance(user: string): Promise<{ shares: bigint; assets: bigint }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const vault = new ethers.Contract(this.vaultAddress, ERC4626_ABI, provider);

    const shares: bigint = await vault.balanceOf(user);
    if (shares === 0n) {
      return { shares: 0n, assets: 0n };
    }
    const assets: bigint = await vault.convertToAssets(shares);
    return { shares, assets };
  }

  /**
   * Get the maximum withdrawable amount for a user.
   * Useful for "max" withdrawals to avoid rounding issues.
   */
  async getMaxWithdraw(user: string): Promise<bigint> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const vault = new ethers.Contract(this.vaultAddress, ERC4626_ABI, provider);
    return vault.maxWithdraw(user);
  }
}

export const vaultService = new VaultService();
