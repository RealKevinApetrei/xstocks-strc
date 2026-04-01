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
