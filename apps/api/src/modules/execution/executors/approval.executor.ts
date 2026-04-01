import { ethers } from 'ethers';
import type { Call } from '../smart-account.service';

const ERC20_ABI = ['function approve(address spender, uint256 amount) external returns (bool)'];

export class ApprovalExecutor {
  /**
   * Build approve() calls for batching into a UserOp.
   */
  buildApproveCalls(params: {
    token: string;
    spender: string;
    amount: bigint;
  }): Call[] {
    const iface = new ethers.Interface(ERC20_ABI);
    // Always approve max to avoid stale allowance issues between separate UserOps
    const MAX_UINT256 = 2n ** 256n - 1n;
    const data = iface.encodeFunctionData('approve', [params.spender, MAX_UINT256]);

    return [{ to: params.token, data }];
  }
}

export const approvalExecutor = new ApprovalExecutor();
