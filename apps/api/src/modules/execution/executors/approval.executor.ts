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
    const data = iface.encodeFunctionData('approve', [params.spender, params.amount]);

    return [{ to: params.token, data }];
  }
}

export const approvalExecutor = new ApprovalExecutor();
