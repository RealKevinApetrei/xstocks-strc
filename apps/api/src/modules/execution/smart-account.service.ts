import { PrivyClient } from '@privy-io/node';
import { ethers } from 'ethers';
import { config } from '../../config';
import { signerService } from './signer.service';

export interface Call {
  to: string;
  data: string;
  value?: bigint;
}

const privy = new PrivyClient({
  appId: config.privyAppId,
  appSecret: config.privyAppSecret,
});

// Kernel smart account executeBatch ABI
const KERNEL_ABI = new ethers.Interface([
  'function executeBatch((address to, uint256 value, bytes data)[] calls)',
]);

export class SmartAccountService {
  private addressCache = new Map<string, string>();

  /**
   * Get the Kernel smart account address for a Privy user.
   */
  async getSmartAccountAddress(privyId: string): Promise<string> {
    const cached = this.addressCache.get(privyId);
    if (cached) return cached;

    // Use low-level API (inherited from Users base class)
    const user = await (privy.users() as any)._get(privyId);

    const smartWallet = user.linked_accounts.find((a: any) => a.type === 'smart_wallet');
    if (smartWallet?.address) {
      this.addressCache.set(privyId, smartWallet.address);
      return smartWallet.address;
    }

    const embedded = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.wallet_client_type === 'privy',
    );
    if (embedded?.address) {
      this.addressCache.set(privyId, embedded.address);
      return embedded.address;
    }

    throw new Error(`No smart account found for user ${privyId}`);
  }

  /**
   * Send a batched UserOperation (multiple calls in one tx).
   */
  async sendBatchUserOp(privyId: string, calls: Call[]): Promise<string> {
    if (calls.length === 0) throw new Error('No calls to batch');

    const wallet = await signerService.getWalletForUser(privyId);
    const smartAccountAddr = await this.getSmartAccountAddress(privyId);

    if (calls.length === 1) {
      return signerService.sendTransaction(wallet.walletId, {
        to: calls[0].to,
        data: calls[0].data,
        value: calls[0].value?.toString(),
        chainId: config.chainId,
      });
    }

    // Multiple calls — encode into Kernel executeBatch
    const batchCalldata = KERNEL_ABI.encodeFunctionData('executeBatch', [
      calls.map((c) => ({
        to: c.to,
        value: c.value ?? 0n,
        data: c.data,
      })),
    ]);

    return signerService.sendTransaction(wallet.walletId, {
      to: smartAccountAddr,
      data: batchCalldata,
      chainId: config.chainId,
    });
  }

  /**
   * Wait for a transaction receipt.
   */
  async waitForReceipt(txHash: string): Promise<{ txHash: string; success: boolean }> {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const receipt = await provider.waitForTransaction(txHash, 1, 120_000);
    return { txHash, success: receipt !== null && receipt.status === 1 };
  }
}

export const smartAccountService = new SmartAccountService();
