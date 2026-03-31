import { PrivyClient } from '@privy-io/node';
import { config } from '../../config';

const privy = new PrivyClient({
  appId: config.privyAppId,
  appSecret: config.privyAppSecret,
});

function getAuthContext(userJwt?: string) {
  const ctx: {
    authorization_private_keys?: string[];
    user_jwts?: string[];
  } = {};

  if (config.privyAuthorizationPrivateKey) {
    ctx.authorization_private_keys = [config.privyAuthorizationPrivateKey];
  }

  if (userJwt) {
    ctx.user_jwts = [userJwt];
  }

  if (!ctx.authorization_private_keys && !ctx.user_jwts) {
    console.error('[SIGNER] No authorization keys or user JWT available');
    return undefined;
  }

  return ctx;
}

export class SignerService {
  // Store user JWTs for signing (set during auth middleware)
  private userTokens = new Map<string, string>();

  setUserToken(privyId: string, token: string) {
    this.userTokens.set(privyId, token);
  }

  getUserToken(privyId: string): string | undefined {
    return this.userTokens.get(privyId);
  }

  async getWalletForUser(privyId: string): Promise<{ address: string; walletId: string }> {
    const user = await (privy.users() as any)._get(privyId);
    const wallet = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.wallet_client_type === 'privy',
    );

    if (!wallet?.address) {
      throw new Error(`No embedded wallet found for user ${privyId}`);
    }

    const walletId = wallet.id ?? wallet.address;
    if (!walletId) throw new Error(`Wallet ID missing for user ${privyId}`);
    return { address: wallet.address, walletId };
  }

  async sendTransaction(
    walletId: string,
    tx: { to: string; data: string; value?: string; chainId: number },
    privyId?: string,
  ): Promise<string> {
    const userJwt = privyId ? this.getUserToken(privyId) : undefined;

    const result = await privy.wallets().rpc(walletId, {
      method: 'eth_sendTransaction',
      params: {
        transaction: {
          to: tx.to as `0x${string}`,
          data: tx.data as `0x${string}`,
          value: tx.value ? parseInt(tx.value, 10) : 0,
        },
      },
      caip2: `eip155:${tx.chainId}`,
      chain_type: 'ethereum',
      authorization_context: getAuthContext(userJwt),
    });

    const data = result.data as any;
    const hash = data.hash ?? data.transaction_hash;
    if (!hash) throw new Error(`Privy sendTransaction returned no hash: ${JSON.stringify(data)}`);
    return hash;
  }

  async signTypedData(
    walletId: string,
    domain: Record<string, unknown>,
    types: Record<string, Array<{ name: string; type: string }>>,
    primaryType: string,
    message: Record<string, unknown>,
    privyId?: string,
  ): Promise<string> {
    const userJwt = privyId ? this.getUserToken(privyId) : undefined;

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
      authorization_context: getAuthContext(userJwt),
    });

    const sig = (result.data as any).signature;
    if (!sig || typeof sig !== 'string') throw new Error('Privy signTypedData returned no signature');
    return sig;
  }
}

export const signerService = new SignerService();
