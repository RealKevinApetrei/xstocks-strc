import { PrivyClient } from '@privy-io/node';
import { ethers } from 'ethers';
import { config } from '../../config';
import { getProvider } from '../../lib/provider';
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

const KERNEL_ABI = new ethers.Interface([
  'function executeBatch((address to, uint256 value, bytes data)[] calls)',
]);

const ADDRESS_CACHE_TTL_MS = 300_000; // 5 minutes

export class SmartAccountService {
  private addressCache = new Map<string, { address: string; expiry: number }>();

  async getSmartAccountAddress(privyId: string): Promise<string> {
    const cached = this.addressCache.get(privyId);
    if (cached && Date.now() < cached.expiry) return cached.address;

    const user = await (privy.users() as any)._get(privyId);

    const smartWallet = user.linked_accounts.find((a: any) => a.type === 'smart_wallet');
    if (smartWallet?.address) {
      this.addressCache.set(privyId, { address: smartWallet.address, expiry: Date.now() + ADDRESS_CACHE_TTL_MS });
      return smartWallet.address;
    }

    const embedded = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.wallet_client_type === 'privy',
    );
    if (embedded?.address) {
      this.addressCache.set(privyId, { address: embedded.address, expiry: Date.now() + ADDRESS_CACHE_TTL_MS });
      return embedded.address;
    }

    throw new Error(`No smart account found for user ${privyId}`);
  }

  async sendBatchUserOp(privyId: string, calls: Call[]): Promise<string> {
    if (calls.length === 0) throw new Error('No calls to batch');

    // Validate all calls have valid addresses and data
    for (const call of calls) {
      if (!call.to || call.to === ethers.ZeroAddress) throw new Error(`Invalid call target: ${call.to}`);
      if (!call.data || call.data.length < 10) throw new Error(`Invalid call data for ${call.to}`);
    }

    // Use embedded wallet ID for RPC — Privy routes through smart wallet
    // when smart wallets are enabled (gas sponsorship handled automatically)
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

    const batchCalldata = KERNEL_ABI.encodeFunctionData('executeBatch', [
      calls.map((c) => ({ to: c.to, value: c.value ?? 0n, data: c.data })),
    ]);

    return signerService.sendTransaction(wallet.walletId, {
      to: smartAccountAddr,
      data: batchCalldata,
      chainId: config.chainId,
    });
  }

  async waitForReceipt(txHash: string): Promise<{ txHash: string; success: boolean }> {
    if (!txHash) throw new Error('No transaction hash provided');

    const provider = getProvider();

    // UserOp was accepted by Privy's bundler — wait briefly then assume success.
    // Standard RPCs don't support eth_getUserOperationReceipt.
    console.log(`[TX] UserOp ${txHash.slice(0, 10)}... waiting for confirmation...`);

    // Try regular tx receipt lookup a few times (bundler may submit as regular tx)
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 3_000));
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          console.log(`[TX] UserOp ${txHash.slice(0, 10)}... found as tx in ${((attempt + 1) * 3)}s, success=${receipt.status === 1}`);
          return { txHash, success: receipt.status === 1 };
        }
      } catch {
        // Not found yet
      }
    }

    // Privy accepted the UserOp — assume success after 18s
    console.log(`[TX] UserOp ${txHash.slice(0, 10)}... assumed success (Privy bundler accepted)`);
    return { txHash, success: true };
  }
}

export const smartAccountService = new SmartAccountService();
