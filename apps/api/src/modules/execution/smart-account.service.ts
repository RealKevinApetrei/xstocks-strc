import { config } from '../../config';

export interface Call {
  to: string;
  data: string;
  value?: bigint;
}

export class SmartAccountService {
  /**
   * Get the Kernel smart account address for a Privy user.
   */
  async getSmartAccountAddress(privyId: string): Promise<string> {
    // TODO: Resolve Privy user → Kernel smart account address
    // Privy's embedded wallets can act as smart accounts with Kernel
    throw new Error('Not implemented — wire Privy smart account resolution');
  }

  /**
   * Send a batched UserOperation (multiple calls in one tx).
   * Steps 1-5 of the loop are batched here.
   */
  async sendBatchUserOp(privyId: string, calls: Call[]): Promise<string> {
    // TODO: Build UserOp from calls, sign via Privy, submit to bundler
    // 1. Encode calls into Kernel's executeBatch calldata
    // 2. Sign with Privy server wallet
    // 3. Submit to bundler endpoint
    // 4. Return UserOp hash
    throw new Error('Not implemented — wire Kernel batch UserOp');
  }

  /**
   * Wait for a UserOperation receipt (tx confirmed on-chain).
   */
  async waitForReceipt(userOpHash: string): Promise<{ txHash: string; success: boolean }> {
    // TODO: Poll bundler for UserOp receipt
    throw new Error('Not implemented — wire bundler receipt polling');
  }
}

export const smartAccountService = new SmartAccountService();
