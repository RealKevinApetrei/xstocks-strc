import { ethers } from 'ethers';
import { query } from '../../db/pool';
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

function toToken18(amount: number): bigint {
  return BigInt(Math.floor(amount * 1e18));
}

/**
 * Check on-chain ERC20 allowance.
 */
async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  const provider = getProvider();
  const contract = new ethers.Contract(token, ERC20_ABI, provider);
  return contract.allowance(owner, spender) as Promise<bigint>;
}

/**
 * Check on-chain ERC20 balance (18-decimal tokens).
 */
async function getTokenBalance18(token: string, owner: string): Promise<bigint> {
  const provider = getProvider();
  const contract = new ethers.Contract(token, ERC20_ABI, provider);
  return contract.balanceOf(owner) as Promise<bigint>;
}

// ─── Deposit ─────────────────────────────────────────────────────────────────

/**
 * Execute the USDC → basket split for a savings deposit.
 *
 * Flow:
 *  1. Approve USDC → CoW vault relayer (skip if already sufficient)
 *  2. Create presign CoW orders for STRC and T-Bill portions
 *  3. Smart wallet sends setPreSignature() for each order
 *
 * Uses CoW presign scheme — smart wallets can't sign EIP-712 where
 * signer ≠ owner, so we submit the order then authorise it on-chain.
 */
export async function executeBasketSplit(depositId: string): Promise<void> {
  const { rows: [deposit] } = await query(
    `SELECT * FROM savings_deposits WHERE id = $1`,
    [depositId],
  );
  if (!deposit) throw new Error(`Deposit not found: ${depositId}`);

  await query(`UPDATE savings_deposits SET status = 'EXECUTING' WHERE id = $1`, [depositId]);

  const { rows: [plan] } = await query(
    `SELECT smart_account_address FROM savings_plans WHERE privy_id = $1`,
    [deposit.privy_id],
  );

  const from: string = plan.smart_account_address;
  const strcAmount  = toUsdc(Number(deposit.strc_usdc_allocated));
  const tbillAmount = toUsdc(Number(deposit.tbill_usdc_allocated));
  const totalUsdc   = strcAmount + tbillAmount;

  try {
    const calls: Call[] = [];

    // ── 1. Approve USDC to CoW vault relayer if needed ──────────────────────
    const usdcAllowance = await getAllowance(config.usdc, from, config.cowVaultRelayer);
    if (usdcAllowance < totalUsdc) {
      console.log(`[Savings] Approving USDC → CoW vault relayer for deposit ${depositId}`);
      calls.push(...approvalExecutor.buildApproveCalls({
        token: config.usdc,
        spender: config.cowVaultRelayer,
        amount: ethers.MaxUint256,
      }));
    }

    // ── 2. Create CoW presign orders ─────────────────────────────────────────
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

    // ── 3. Send all calls from smart wallet in one batch ─────────────────────
    if (calls.length > 0) {
      await smartAccountService.sendBatchUserOp(deposit.privy_id, calls);
    }

    await query(
      `UPDATE savings_deposits
       SET strc_cow_order_uid = $1, tbill_cow_order_uid = $2,
           status = 'COMPLETED', executed_at = NOW()
       WHERE id = $3`,
      [strcOrderUid, tbillOrderUid, depositId],
    );

    await query(
      `UPDATE savings_plans
       SET total_deposited_usdc = total_deposited_usdc + $1
       WHERE privy_id = $2`,
      [deposit.usdc_amount, deposit.privy_id],
    );

    console.log(`[Savings] Deposit ${depositId} complete — STRC: ${strcOrderUid}, T-Bill: ${tbillOrderUid}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE savings_deposits SET status = 'FAILED', error = $1 WHERE id = $2`,
      [msg, depositId],
    );
    throw err;
  }
}

// ─── Withdrawal ───────────────────────────────────────────────────────────────

/**
 * Execute a withdrawal: sell STRC and/or T-Bill back to USDC via CoW Protocol.
 *
 * Flow:
 *  1. Read current on-chain STRC and T-Bill balances
 *  2. Calculate sell amounts proportional to withdrawal request
 *  3. Approve both tokens → CoW vault relayer if needed
 *  4. Create presign sell orders (STRC→USDC, TBILL→USDC)
 *  5. Smart wallet sends approvals + setPreSignature() calls
 *
 * @param privyId       - user
 * @param usdcAmount    - USD value to withdraw (used to calculate sell proportions)
 *                        pass 0 to withdraw 100% of both tokens
 */
export async function executeWithdrawal(params: {
  privyId: string;
  withdrawalId: string;
  usdcAmount: number;
  smartAccountAddress: string;
}): Promise<void> {
  const { privyId, withdrawalId, usdcAmount, smartAccountAddress: from } = params;

  await query(
    `UPDATE savings_withdrawals SET status = 'EXECUTING' WHERE id = $1`,
    [withdrawalId],
  );

  try {
    // ── 1. Read on-chain balances ────────────────────────────────────────────
    const [strcBalance, tbillBalance] = await Promise.all([
      getTokenBalance18(config.strc, from),
      config.tbillXstock ? getTokenBalance18(config.tbillXstock, from) : Promise.resolve(0n),
    ]);

    if (strcBalance === 0n && tbillBalance === 0n) {
      throw new Error('No STRC or T-Bill balance to withdraw');
    }

    // ── 2. Calculate sell amounts ────────────────────────────────────────────
    // If usdcAmount is 0 → full withdrawal of everything
    // Otherwise → sell proportionally based on requested USD value.
    // For simplicity we sell the full balance and let the user re-deposit the
    // remainder. A partial-sell ratio could be added later.
    const sellStrc  = strcBalance;
    const sellTbill = tbillBalance;

    const calls: Call[] = [];

    // ── 3. Approve tokens → CoW vault relayer ────────────────────────────────
    if (sellStrc > 0n) {
      const strcAllowance = await getAllowance(config.strc, from, config.cowVaultRelayer);
      if (strcAllowance < sellStrc) {
        calls.push(...approvalExecutor.buildApproveCalls({
          token: config.strc,
          spender: config.cowVaultRelayer,
          amount: ethers.MaxUint256,
        }));
      }
    }

    if (sellTbill > 0n && config.tbillXstock) {
      const tbillAllowance = await getAllowance(config.tbillXstock, from, config.cowVaultRelayer);
      if (tbillAllowance < sellTbill) {
        calls.push(...approvalExecutor.buildApproveCalls({
          token: config.tbillXstock,
          spender: config.cowVaultRelayer,
          amount: ethers.MaxUint256,
        }));
      }
    }

    // ── 4. Create CoW presign sell orders ────────────────────────────────────
    let strcOrderUid:  string | null = null;
    let tbillOrderUid: string | null = null;

    if (sellStrc > 0n) {
      const quote = await cowSwapService.getQuote({
        sellToken: config.strc,
        buyToken:  config.usdc,
        sellAmount: sellStrc,
        from,
      });
      strcOrderUid = await cowSwapService.createOrder(quote, '');
      calls.push(cowSwapService.buildPreSignatureCall(strcOrderUid));
    }

    if (sellTbill > 0n && config.tbillXstock) {
      const quote = await cowSwapService.getQuote({
        sellToken: config.tbillXstock,
        buyToken:  config.usdc,
        sellAmount: sellTbill,
        from,
      });
      tbillOrderUid = await cowSwapService.createOrder(quote, '');
      calls.push(cowSwapService.buildPreSignatureCall(tbillOrderUid));
    }

    // ── 5. Send all calls from smart wallet ──────────────────────────────────
    if (calls.length > 0) {
      await smartAccountService.sendBatchUserOp(privyId, calls);
    }

    await query(
      `UPDATE savings_withdrawals
       SET strc_cow_order_uid = $1, tbill_cow_order_uid = $2,
           status = 'COMPLETED', executed_at = NOW()
       WHERE id = $3`,
      [strcOrderUid, tbillOrderUid, withdrawalId],
    );

    // Reduce total deposited on plan
    await query(
      `UPDATE savings_plans
       SET total_deposited_usdc = GREATEST(0, total_deposited_usdc - $1)
       WHERE privy_id = $2`,
      [usdcAmount, privyId],
    );

    console.log(`[Savings] Withdrawal ${withdrawalId} complete — STRC: ${strcOrderUid}, T-Bill: ${tbillOrderUid}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(
      `UPDATE savings_withdrawals SET status = 'FAILED', error = $1 WHERE id = $2`,
      [msg, withdrawalId],
    );
    throw err;
  }
}

// ─── Monday queue ─────────────────────────────────────────────────────────────

export async function processQueuedDeposits(): Promise<void> {
  const { rows: queued } = await query(
    `SELECT id FROM savings_deposits WHERE queued_for_monday = true AND status = 'QUEUED'`,
  );

  console.log(`[Savings] Processing ${queued.length} queued deposits`);

  for (const row of queued) {
    try {
      await executeBasketSplit(row.id as string);
    } catch (err) {
      console.error(`[Savings] Failed to process deposit ${row.id}:`, err);
    }
  }
}
