import { PrivyClient } from '@privy-io/server-auth';
import { config } from '../../config';

const privy = new PrivyClient(config.privyAppId, config.privyAppSecret);

export class SignerService {
  /**
   * Get or create an embedded wallet for a user.
   */
  async getWalletForUser(privyId: string): Promise<{ address: string; walletId: string }> {
    const user = await privy.getUser(privyId);
    const wallet = user.linkedAccounts.find(
      (a) => a.type === 'wallet' && a.walletClientType === 'privy',
    );
    if (!wallet || wallet.type !== 'wallet') {
      throw new Error(`No embedded wallet found for user ${privyId}`);
    }
    return { address: wallet.address, walletId: wallet.address };
  }

  /**
   * Sign a transaction using Privy's server wallet API (TEE key quorum).
   */
  async signTransaction(
    walletId: string,
    tx: { to: string; data: string; value?: string; chainId: number },
  ): Promise<string> {
    // TODO: Implement Privy server wallet signing
    // Uses privy.walletApi.ethereum.signTransaction(...)
    throw new Error('Not implemented — wire Privy wallet API');
  }

  /**
   * Sign EIP-712 typed data (needed for CoW Protocol orders).
   */
  async signTypedData(
    walletId: string,
    domain: Record<string, unknown>,
    types: Record<string, unknown>,
    value: Record<string, unknown>,
  ): Promise<string> {
    // TODO: Implement Privy server wallet EIP-712 signing
    // Uses privy.walletApi.ethereum.signTypedData(...)
    throw new Error('Not implemented — wire Privy wallet API');
  }
}

export const signerService = new SignerService();
