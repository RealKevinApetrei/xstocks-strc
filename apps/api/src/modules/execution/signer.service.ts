import { PrivyClient } from '@privy-io/node';
import { config } from '../../config';

const privy = new PrivyClient({
  appId: config.privyAppId,
  appSecret: config.privyAppSecret,
});

export class SignerService {
  /**
   * Get the embedded wallet for a user.
   */
  async getWalletForUser(privyId: string): Promise<{ address: string; walletId: string }> {
    // Use the low-level API (inherited from Users base class)
    const user = await (privy.users() as any)._get(privyId);
    const wallet = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.wallet_client_type === 'privy',
    );

    if (!wallet) {
      throw new Error(`No embedded wallet found for user ${privyId}`);
    }

    const walletId = wallet.id ?? wallet.address;
    return { address: wallet.address, walletId };
  }

  /**
   * Send a transaction via Privy server wallet RPC.
   */
  async sendTransaction(
    walletId: string,
    tx: { to: string; data: string; value?: string; chainId: number },
  ): Promise<string> {
    const result = await privy.wallets().rpc(walletId, {
      method: 'eth_sendTransaction',
      params: {
        transaction: {
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value ? Number(tx.value) : 0,
        },
      },
      caip2: `eip155:${tx.chainId}`,
      chain_type: 'ethereum',
    });

    const data = result.data as any;
    return data.hash ?? data.transaction_hash;
  }

  /**
   * Sign EIP-712 typed data (needed for CoW Protocol orders).
   */
  async signTypedData(
    walletId: string,
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    primaryType: string,
    message: Record<string, unknown>,
  ): Promise<string> {
    const result = await privy.wallets().rpc(walletId, {
      method: 'eth_signTypedData_v4',
      params: {
        typed_data: {
          domain,
          types,
          primary_type: primaryType,
          message,
        },
      },
      chain_type: 'ethereum',
    });

    return (result.data as any).signature;
  }
}

export const signerService = new SignerService();
