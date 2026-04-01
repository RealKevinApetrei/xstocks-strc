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

    for (const call of calls) {
      if (!call.to || call.to === ethers.ZeroAddress) throw new Error(`Invalid call target: ${call.to}`);
      if (!call.data || call.data.length < 10) throw new Error(`Invalid call data for ${call.to}`);
    }

    const wallet = await signerService.getWalletForUser(privyId);

    // Privy wraps each eth_sendTransaction in execute() — no native batch support.
    // executeBatch via self-call fails (Kernel rejects nested execute→executeBatch).
    // Send calls sequentially with a short delay for on-chain propagation.
    let lastHash = '';
    for (let i = 0; i < calls.length; i++) {
      lastHash = await signerService.sendTransaction(wallet.walletId, {
        to: calls[i].to,
        data: calls[i].data,
        value: calls[i].value?.toString(),
        chainId: config.chainId,
      });
      if (i < calls.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    return lastHash;
  }

  async waitForReceipt(txHash: string): Promise<{ txHash: string; success: boolean }> {
    if (!txHash) throw new Error('No transaction hash provided');

    const provider = getProvider();
    // Short timeout: Privy returns UserOp hashes which won't resolve via
    // getTransactionReceipt. Try briefly in case it's a real tx hash,
    // then proceed — the on-chain state checks in the loop executor
    // catch any actual failures.
    const timeoutMs = 15_000;
    const start = Date.now();

    console.log(`[TX] Waiting for receipt: ${txHash.slice(0, 10)}...`);

    let delay = 1000;
    while (Date.now() - start < timeoutMs) {
      try {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt) {
          const success = receipt.status === 1;
          console.log(`[TX] ${txHash.slice(0, 10)}... ${success ? 'confirmed' : 'reverted'} (block ${receipt.blockNumber})`);
          if (!success) throw new Error(`Transaction reverted: ${txHash}`);
          return { txHash, success };
        }
      } catch (err) {
        // getTransactionReceipt may throw for UserOp hashes that aren't
        // standard tx hashes — fall through to retry
        if (err instanceof Error && err.message.includes('reverted')) throw err;
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay + 1000, 3000);
    }

    // UserOp hash or slow RPC — proceed (loop executor verifies on-chain state)
    console.log(`[TX] ${txHash.slice(0, 10)}... no receipt after ${timeoutMs / 1000}s — proceeding`);
    return { txHash, success: true };
  }
}

export const smartAccountService = new SmartAccountService();
