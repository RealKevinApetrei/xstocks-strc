import { ethers } from 'ethers';
import { config } from '../config';

let _provider: ethers.JsonRpcProvider | null = null;

/**
 * Singleton JSON-RPC provider. Reuses one connection to avoid
 * creating new providers (each calls eth_chainId on init).
 */
export function getProvider(): ethers.JsonRpcProvider {
  if (!_provider) {
    _provider = new ethers.JsonRpcProvider(config.rpcUrl, undefined, {
      staticNetwork: ethers.Network.from(config.chainId),
    });
  }
  return _provider;
}

/**
 * Retry a view call up to `retries` times with exponential backoff.
 * Ink RPC intermittently returns CALL_EXCEPTION for eth_call from Railway.
 */
export async function retryCall<T>(fn: () => Promise<T>, retries = 3, label = 'view call'): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[RPC] ${label} attempt ${attempt}/${retries} failed, retrying in ${attempt * 2}s...`);
      await new Promise(r => setTimeout(r, attempt * 2000));
    }
  }
  throw new Error('retryCall: unreachable');
}
