import { PrivyClient } from '@privy-io/node';
import { config } from '../../config';

const privy = new PrivyClient({
  appId: config.privyAppId,
  appSecret: config.privyAppSecret,
});

// Store raw Privy access tokens per user (set during auth middleware)
const userTokenStore = new Map<string, string>();

export function storeUserToken(privyId: string, rawToken: string) {
  userTokenStore.set(privyId, rawToken);
}

function getAuthContext(privyId?: string) {
  const ctx: {
    authorization_private_keys?: string[];
    user_jwts?: string[];
  } = {};

  if (config.privyAuthorizationPrivateKey) {
    ctx.authorization_private_keys = [config.privyAuthorizationPrivateKey];
  }

  // Pass the user's raw Privy access token for user-owned embedded wallets
  if (privyId) {
    const jwt = userTokenStore.get(privyId);
    if (jwt) ctx.user_jwts = [jwt];
  }

  if (!ctx.authorization_private_keys && !ctx.user_jwts) {
    console.error('[SIGNER] No authorization keys or user JWT available');
    return undefined;
  }

  return ctx;
}

export class SignerService {
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
      authorization_context: getAuthContext(privyId),
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
      authorization_context: getAuthContext(privyId),
    });

    const sig = (result.data as any).signature;
    if (!sig || typeof sig !== 'string') throw new Error('Privy signTypedData returned no signature');
    return sig;
  }
}

export const signerService = new SignerService();
