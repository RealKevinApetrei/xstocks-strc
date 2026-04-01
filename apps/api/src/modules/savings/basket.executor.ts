import { ethers } from 'ethers';
import { getProvider } from '../../lib/provider';
import { cowSwapService } from '../cowswap/cowswap.service';
import { smartAccountService } from '../execution/smart-account.service';
import { approvalExecutor } from '../execution/executors/approval.executor';
import { config } from '../../config';
import type { Call } from '../execution/smart-account.service';

const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
];

function toUsdc(amount: number): bigint {
  return BigInt(Math.floor(amount * 1_000_000));
}

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  const contract = new ethers.Contract(token, ERC20_ABI, getProvider());
  return contract.allowance(owner, spender) as Promise<bigint>;
}

async function getTokenBalance(token: string, owner: string): Promise<bigint> {
  const contract = new ethers.Contract(token, ERC20_ABI, getProvider());
  return contract.balanceOf(owner) as Promise<bigint>;
}

/**
 * Deposit: split USDC 50/50 into STRC + T-Bill via CoW Protocol.
 *
 * 1. Approve USDC → CoW vault relayer if needed
 * 2. Create presign CoW orders for each leg
 * 3. Smart wallet sends setPreSignature() calls
 */
export async function executeBasketSplit(params: {
  privyId: string;
  smartAccountAddress: string;
  usdcAmount: number;
}): Promise<{ strcOrderUid: string | null; tbillOrderUid: string | null }> {
  const { privyId, smartAccountAddress: from, usdcAmount } = params;

  const strcAmount  = toUsdc(usdcAmount * 0.5);
  const tbillAmount = toUsdc(usdcAmount * 0.5);
  const totalUsdc   = strcAmount + tbillAmount;

  const calls: Call[] = [];

  // Approve USDC to CoW vault relayer if needed
  const usdcAllowance = await getAllowance(config.usdc, from, config.cowVaultRelayer);
  if (usdcAllowance < totalUsdc) {
    calls.push(...approvalExecutor.buildApproveCalls({
      token: config.usdc,
      spender: config.cowVaultRelayer,
      amount: ethers.MaxUint256,
    }));
  }

  let strcOrderUid:  string | null = null;
  let tbillOrderUid: string | null = null;

  if (strcAmount > 0n) {
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc,
      buyToken:  config.strc,
      sellAmount: strcAmount,
      from,
    });
    strcOrderUid = await cowSwapService.createOrder(quote, '');
    calls.push(cowSwapService.buildPreSignatureCall(strcOrderUid));
  }

  if (tbillAmount > 0n && config.tbillXstock) {
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc,
      buyToken:  config.tbillXstock,
      sellAmount: tbillAmount,
      from,
    });
    tbillOrderUid = await cowSwapService.createOrder(quote, '');
    calls.push(cowSwapService.buildPreSignatureCall(tbillOrderUid));
  }

  if (calls.length > 0) {
    await smartAccountService.sendBatchUserOp(privyId, calls);
  }

  console.log(`[Savings] Deposit executed — STRC: ${strcOrderUid}, T-Bill: ${tbillOrderUid}`);
  return { strcOrderUid, tbillOrderUid };
}

/**
 * Withdraw: sell all STRC + T-Bill back to USDC via CoW Protocol.
 *
 * 1. Read on-chain balances
 * 2. Approve tokens → CoW vault relayer if needed
 * 3. Create presign sell orders
 * 4. Smart wallet sends setPreSignature() calls
 */
export async function executeWithdrawal(params: {
  privyId: string;
  smartAccountAddress: string;
}): Promise<{ strcOrderUid: string | null; tbillOrderUid: string | null }> {
  const { privyId, smartAccountAddress: from } = params;

  const [strcBalance, tbillBalance] = await Promise.all([
    getTokenBalance(config.strc, from),
    config.tbillXstock ? getTokenBalance(config.tbillXstock, from) : Promise.resolve(0n),
  ]);

  if (strcBalance === 0n && tbillBalance === 0n) {
    throw new Error('No STRC or T-Bill balance to withdraw');
  }

  const calls: Call[] = [];

  if (strcBalance > 0n) {
    const allowance = await getAllowance(config.strc, from, config.cowVaultRelayer);
    if (allowance < strcBalance) {
      calls.push(...approvalExecutor.buildApproveCalls({
        token: config.strc,
        spender: config.cowVaultRelayer,
        amount: ethers.MaxUint256,
      }));
    }
  }

  if (tbillBalance > 0n && config.tbillXstock) {
    const allowance = await getAllowance(config.tbillXstock, from, config.cowVaultRelayer);
    if (allowance < tbillBalance) {
      calls.push(...approvalExecutor.buildApproveCalls({
        token: config.tbillXstock,
        spender: config.cowVaultRelayer,
        amount: ethers.MaxUint256,
      }));
    }
  }

  let strcOrderUid:  string | null = null;
  let tbillOrderUid: string | null = null;

  if (strcBalance > 0n) {
    const quote = await cowSwapService.getQuote({
      sellToken: config.strc,
      buyToken:  config.usdc,
      sellAmount: strcBalance,
      from,
    });
    strcOrderUid = await cowSwapService.createOrder(quote, '');
    calls.push(cowSwapService.buildPreSignatureCall(strcOrderUid));
  }

  if (tbillBalance > 0n && config.tbillXstock) {
    const quote = await cowSwapService.getQuote({
      sellToken: config.tbillXstock,
      buyToken:  config.usdc,
      sellAmount: tbillBalance,
      from,
    });
    tbillOrderUid = await cowSwapService.createOrder(quote, '');
    calls.push(cowSwapService.buildPreSignatureCall(tbillOrderUid));
  }

  if (calls.length > 0) {
    await smartAccountService.sendBatchUserOp(privyId, calls);
  }

  console.log(`[Savings] Withdrawal executed — STRC: ${strcOrderUid}, T-Bill: ${tbillOrderUid}`);
  return { strcOrderUid, tbillOrderUid };
}
