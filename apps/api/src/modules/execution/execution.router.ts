import { Router, type Request, type Response } from 'express';
import { ethers } from 'ethers';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { loopExecutor } from './executors/loop.executor';
import { unwindExecutor } from './executors/unwind.executor';
import { borrowExecutor } from './executors/borrow.executor';
import { policyService, PolicyViolation } from './policy.service';
import { smartAccountService } from './smart-account.service';
import { vaultService } from '../vault/vault.service';
import { approvalExecutor } from './executors/approval.executor';
import { cowSwapService } from '../cowswap/cowswap.service';
import { query } from '../../db/pool';
import { config } from '../../config';
import { getProvider } from '../../lib/provider';
import type { StartLoopRequest, StartUnwindRequest } from '@xstocks/shared';
import wSTRCABI from '@xstocks/shared/abis/wSTRC.json';

export const executionRouter = Router();

// POST /api/execution/loop — Start a leveraged loop
executionRouter.post('/loop', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { strcAmount, targetLeverage } = req.body as StartLoopRequest;

  try {
    await policyService.validateLoop({
      privyId,
      usdcAmount: BigInt(strcAmount), // Frontend sends as strcAmount field (USDC amount)
      targetLeverage,
    });

    const loopId = await loopExecutor.startLoop({
      privyId,
      strcAmount: BigInt(strcAmount),
      targetLeverage,
      maxSlippageBps: 0, // CoW RFQ — no slippage
    });

    res.status(201).json({
      id: loopId,
      status: 'PENDING',
      strcAmount,
      targetLeverage,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof PolicyViolation) {
      res.status(err.message.includes('active loop') ? 409 : 400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

// POST /api/execution/close-strc — Swap STRC (+ wSTRC) balance to USDC via CoW presign
executionRouter.post('/close-strc', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;

  try {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    const provider = getProvider();

    // Check for wSTRC — unwrap + approve for CoW in one tx
    const wstrc = new ethers.Contract(config.wstrc, ['function balanceOf(address) view returns (uint256)'], provider);
    const wstrcBalance: bigint = await wstrc.balanceOf(smartAccountAddr);
    const strc = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
    const existingStrc: bigint = await strc.balanceOf(smartAccountAddr);

    if (wstrcBalance <= 0n && existingStrc <= 0n) {
      res.status(400).json({ error: 'No STRC or wSTRC balance to close' });
      return;
    }

    // Unwrap + approve in one batch (use max uint256 approval to avoid needing exact amount)
    const maxApproval = 2n ** 256n - 1n;
    const batchCalls: { to: string; data: string }[] = [];
    if (wstrcBalance > 0n) {
      console.log(`[CLOSE-STRC] Unwrapping ${Number(wstrcBalance) / 1e18} wSTRC`);
      const wstrcIface = new ethers.Interface(['function unwrap(uint256 amount)']);
      batchCalls.push({ to: config.wstrc, data: wstrcIface.encodeFunctionData('unwrap', [wstrcBalance]) });
    }
    batchCalls.push(...approvalExecutor.buildApproveCalls({
      token: config.strc, spender: config.cowVaultRelayer, amount: maxApproval,
    }));
    await smartAccountService.waitForReceipt(
      await smartAccountService.sendBatchUserOp(privyId, batchCalls),
    );

    // Read actual STRC balance after unwrap
    const strcBalance: bigint = await strc.balanceOf(smartAccountAddr);
    if (strcBalance <= 0n) {
      res.status(400).json({ error: 'No STRC balance after unwrap' });
      return;
    }

    const strcValueUsd = Number(strcBalance) / 1e18 * 100;
    if (strcValueUsd < 10) {
      res.status(400).json({ error: `STRC balance too small to swap (~$${strcValueUsd.toFixed(2)}). CoW Protocol requires at least ~$10 per trade.` });
      return;
    }

    console.log(`[CLOSE-STRC] Closing ${Number(strcBalance) / 1e18} STRC (~$${strcValueUsd.toFixed(2)}) for ${smartAccountAddr}`);

    // 2. Get CoW quote STRC → USDC
    const quote = await cowSwapService.getQuote({
      sellToken: config.strc, buyToken: config.usdc, sellAmount: strcBalance, from: smartAccountAddr,
    });

    // 3. Create order with presign
    const orderUid = await cowSwapService.createOrder(quote, '');

    // 4. Pre-sign on-chain
    const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
    const preSignHash = await smartAccountService.sendBatchUserOp(privyId, [preSignCall]);
    await smartAccountService.waitForReceipt(preSignHash);

    // 5. Wait for fill
    const fill = await cowSwapService.waitForFill(orderUid);

    res.json({
      success: true,
      strcSold: strcBalance.toString(),
      usdcReceived: fill.buyAmount.toString(),
      orderUid,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Close STRC failed: ${msg}` });
  }
});

// POST /api/execution/withdraw — Withdraw USDC from smart wallet to an external address
executionRouter.post('/withdraw', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount, to } = req.body as { amount: string; to: string };

  if (!amount || !to) {
    res.status(400).json({ error: 'Missing amount or destination address' });
    return;
  }

  const amountBn = BigInt(amount);
  if (amountBn <= 0n) {
    res.status(400).json({ error: 'Amount must be greater than 0' });
    return;
  }

  // Check balance
  const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
  const provider = getProvider();
  const usdc = new ethers.Contract(config.usdc, ['function balanceOf(address) view returns (uint256)'], provider);
  const balance: bigint = await usdc.balanceOf(smartAccountAddr);

  if (balance < amountBn) {
    const balFormatted = (Number(balance) / 1e6).toFixed(2);
    res.status(400).json({ error: `Insufficient balance. Available: $${balFormatted} USDC` });
    return;
  }

  try {
    // ERC20 transfer calldata
    const iface = new ethers.Interface(['function transfer(address to, uint256 amount) returns (bool)']);
    const data = iface.encodeFunctionData('transfer', [to, amountBn]);

    const txHash = await smartAccountService.sendBatchUserOp(privyId, [
      { to: config.usdc, data },
    ]);

    // UserOp submitted — don't wait for receipt (UserOp hashes differ from tx hashes)

    res.json({ txHash, success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: `Withdraw failed: ${msg}` });
  }
});

// POST /api/execution/unwind — Unwind a position
executionRouter.post('/unwind', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { loopExecutionId } = req.body as StartUnwindRequest;
  const targetLeverage = (req.body as any).targetLeverage ?? 0;

  // Clear stale loops and unwinds that are stuck (not actively running in memory)
  const { rows: stuckLoops } = await query(
    `SELECT id FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
    [privyId],
  );
  for (const sl of stuckLoops) {
    if (!loopExecutor.isActive(sl.id)) {
      await query(
        `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', error = 'Cleared stale loop before unwind' WHERE id = $1`,
        [sl.id],
      );
      console.log(`[UNWIND] Cleared stale loop ${sl.id}`);
    }
  }

  await query(
    `UPDATE unwind_executions SET status = 'FAILED', error = 'Cleared stale unwind'
     WHERE privy_id = $1 AND status = 'IN_PROGRESS'`,
    [privyId],
  );

  try {
    await policyService.validateUnwind({ privyId, targetLeverage });
  } catch (err) {
    if (err instanceof PolicyViolation) {
      res.status(err.message.includes('in progress') ? 409 : 400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Verify loop belongs to user
  const { rows: [loop] } = await query(
    `SELECT id, status FROM loop_executions WHERE id = $1 AND privy_id = $2`,
    [loopExecutionId, privyId],
  );
  if (!loop) {
    res.status(404).json({ error: 'Loop execution not found' });
    return;
  }

  const unwindId = await unwindExecutor.startUnwind({ privyId, loopExecutionId, targetLeverage });

  res.status(201).json({
    id: unwindId,
    loopExecutionId,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  });
});

// POST /api/execution/loop/:id/cancel — Cancel an active loop
executionRouter.post('/loop/:id/cancel', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;

  // Verify ownership
  const { rows: [loop] } = await query(
    `SELECT id, status FROM loop_executions WHERE id = $1 AND privy_id = $2`,
    [id, privyId],
  );
  if (!loop) {
    res.status(404).json({ error: 'Loop not found' });
    return;
  }
  if (loop.status !== 'IN_PROGRESS' && loop.status !== 'PENDING') {
    res.status(400).json({ error: `Loop is already ${loop.status}` });
    return;
  }

  // If actively running in memory, request graceful cancellation
  if (loopExecutor.requestCancel(id)) {
    res.json({ success: true, message: 'Cancellation requested — loop will stop after current step' });
    return;
  }

  // Not in memory (e.g. PENDING or server restarted) — mark directly
  await query(
    `UPDATE loop_executions SET status = 'COMPLETED_PARTIAL', error = 'Cancelled by user' WHERE id = $1`,
    [id],
  );
  res.json({ success: true, message: 'Loop cancelled' });
});

// GET /api/execution/loop/:id/status — Loop progress
executionRouter.get('/loop/:id/status', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;

  const { rows: [loop] } = await query(
    `SELECT * FROM loop_executions WHERE id = $1 AND privy_id = $2`,
    [id, privyId],
  );
  if (!loop) {
    res.status(404).json({ error: 'Loop not found' });
    return;
  }

  const { rows: iterations } = await query(
    `SELECT iteration_number as number, step as status, strc_deposited, usdc_borrowed,
            strc_received, actual_slippage_bps as slippage_bps, user_op_hash, cow_order_uid, completed_at
     FROM loop_iterations WHERE loop_execution_id = $1 ORDER BY iteration_number`,
    [id],
  );

  res.json({
    id: loop.id,
    status: loop.status,
    strcAmount: loop.strc_amount,
    targetLeverage: Number(loop.target_leverage),
    effectiveLeverage: loop.effective_leverage ? Number(loop.effective_leverage) : null,
    currentIteration: loop.current_iteration,
    totalIterations: loop.status === 'IN_PROGRESS' ? null : loop.current_iteration,
    healthFactor: loop.health_factor ? Number(loop.health_factor) : null,
    iterations: iterations.map((i: any) => ({
      number: i.number,
      status: i.status,
      strcDeposited: i.strc_deposited,
      usdcBorrowed: i.usdc_borrowed,
      strcReceived: i.strc_received,
      slippageBps: i.slippage_bps,
      userOpHash: i.user_op_hash,
      cowOrderUid: i.cow_order_uid,
      completedAt: i.completed_at?.toISOString() ?? null,
    })),
    error: loop.error,
    createdAt: loop.created_at.toISOString(),
    updatedAt: loop.updated_at.toISOString(),
  });
});

// GET /api/execution/unwind/:id/status — Unwind progress
executionRouter.get('/unwind/:id/status', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const id = req.params.id as string;

  const { rows: [unwind] } = await query(
    `SELECT * FROM unwind_executions WHERE id = $1 AND privy_id = $2`,
    [id, privyId],
  );
  if (!unwind) {
    res.status(404).json({ error: 'Unwind not found' });
    return;
  }

  const metadata = typeof unwind.metadata === 'string' ? JSON.parse(unwind.metadata) : (unwind.metadata ?? {});

  res.json({
    id: unwind.id,
    status: unwind.status,
    targetLeverage: metadata.targetLeverage ?? 0,
    currentStep: unwind.current_step ?? 0,
    initialDebtUsdc: unwind.initial_debt_usdc?.toString() ?? '0',
    remainingDebtUsdc: unwind.remaining_debt_usdc?.toString() ?? unwind.initial_debt_usdc?.toString() ?? '0',
    initialCollateralWstrc: unwind.initial_collateral_wstrc?.toString() ?? '0',
    remainingCollateralWstrc: unwind.remaining_collateral_wstrc?.toString() ?? unwind.initial_collateral_wstrc?.toString() ?? '0',
    error: unwind.error,
    createdAt: unwind.created_at.toISOString(),
    updatedAt: unwind.updated_at.toISOString(),
  });
});

// GET /api/positions/:address — Current Morpho position
executionRouter.get('/positions/:address', privyAuth, async (req: Request, res: Response) => {
  const address = req.params.address as string;
  const { privyId } = (req as AuthenticatedRequest).user;

  // Each section is independent — one failure shouldn't hide all other data

  // 1. Morpho position (may fail if RPC is down)
  let position: Awaited<ReturnType<typeof borrowExecutor.getPosition>> | null = null;
  let positionError: string | undefined;
  try {
    position = await borrowExecutor.getPosition(address);
  } catch (err) {
    positionError = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[POSITION] Morpho read failed for ${address}:`, positionError);
  }

  const hasPosition = position ? (position.collateral > 0n || position.borrowed > 0n) : false;

  // 2. Active loop/unwind (DB queries — reliable)
  let activeLoop: any = null;
  let activeUnwind: any = null;
  try {
    const { rows: [al] } = await query(
      `SELECT id, status FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') LIMIT 1`,
      [privyId],
    );
    activeLoop = al;
    const { rows: [au] } = await query(
      `SELECT id, status FROM unwind_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') LIMIT 1`,
      [privyId],
    );
    activeUnwind = au;
  } catch { /* ignore */ }

  // 3. Grid strategy
  let gridStrategy: any = null;
  try {
    const { rows: [gs] } = await query(
      `SELECT id, enabled, dca_active, trades_executed, num_trades FROM grid_strategies WHERE privy_id = $1 LIMIT 1`,
      [privyId],
    );
    gridStrategy = gs;
  } catch {
    try {
      const { rows: [gs] } = await query(
        `SELECT id, enabled FROM grid_strategies WHERE privy_id = $1 LIMIT 1`,
        [privyId],
      );
      gridStrategy = gs;
    } catch { /* ignore */ }
  }

  // 4. Vault balance
  let vaultBalance = null;
  try {
    const vb = await vaultService.getVaultBalance(address);
    vaultBalance = { shares: '0', assets: vb.assets.toString() };
  } catch { /* vault not set up yet */ }

  // 5. STRC + wSTRC balance in smart wallet
  let strcBalance: string | undefined;
  let wstrcBalance: string | undefined;
  try {
    const provider = getProvider();
    const strc = new ethers.Contract(config.strc, ['function balanceOf(address) view returns (uint256)'], provider);
    const bal: bigint = await strc.balanceOf(address);
    if (bal > 0n) strcBalance = bal.toString();

    const wstrc = new ethers.Contract(config.wstrc, ['function balanceOf(address) view returns (uint256)'], provider);
    const wbal: bigint = await wstrc.balanceOf(address);
    if (wbal > 0n) wstrcBalance = wbal.toString();
  } catch { /* ignore */ }

  // 6. Position details (exchange rate, leverage, liq price)
  let collateralStrc = '0';
  let exchangeRate = '0';
  let effectiveLeverage = 1;
  let liquidationPrice = 0;

  if (hasPosition && position) {
    try {
      const provider = getProvider();
      const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
      const rate: bigint = await wstrcContract.strcPerWstrc();
      const strcVal: bigint = await wstrcContract.wstrcToStrc(position.collateral);
      exchangeRate = rate.toString();
      collateralStrc = strcVal.toString();

      if (position.healthFactor > 1) {
        effectiveLeverage = borrowExecutor.calculateLeverage(position.healthFactor);
      }

      if (position.collateral > 0n && position.borrowed > 0n && strcVal > 0n) {
        const debtUsd = Number(position.borrowed) / 1e6;
        const collStrc = Number(strcVal) / 1e18;
        if (collStrc > 0) {
          liquidationPrice = debtUsd / (collStrc * 0.86);
        }
      }
    } catch { /* contracts not deployed yet — use defaults */ }
  }

  res.json({
    address,
    hasPosition,
    position: hasPosition && position ? {
      collateralWstrc: position.collateral.toString(),
      collateralStrc,
      debtUsdc: position.borrowed.toString(),
      healthFactor: position.healthFactor,
      effectiveLeverage,
      liquidationPrice,
      exchangeRate,
    } : null,
    activeLoop: activeLoop ? { id: activeLoop.id, status: activeLoop.status } : null,
    activeUnwind: activeUnwind ? { id: activeUnwind.id, status: activeUnwind.status } : null,
    gridStrategy: gridStrategy ? {
      id: gridStrategy.id,
      enabled: gridStrategy.enabled,
      dcaActive: gridStrategy.dca_active,
      tradesExecuted: gridStrategy.trades_executed,
      numTrades: gridStrategy.num_trades,
    } : null,
    vaultBalance,
    strcBalance,
    wstrcBalance,
    error: positionError,
  });
});

// GET /api/execution/market-rate — Live Morpho borrow rate (cached 60s)
let marketRateCache: { data: any; expiry: number } | null = null;
executionRouter.get('/market-rate', async (_req: Request, res: Response) => {
  if (marketRateCache && Date.now() < marketRateCache.expiry) {
    res.json(marketRateCache.data);
    return;
  }
  try {
    const provider = getProvider();
    const morpho = new ethers.Contract(config.morpho, wSTRCABI.length ? [
      'function market(bytes32 id) external view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
    ] : [], provider);

    const mkt = await morpho.market(config.morphoMarketId);
    const totalSupply = BigInt(mkt[0]);
    const totalBorrow = BigInt(mkt[2]);

    // Utilization = totalBorrow / totalSupply
    const utilization = totalSupply > 0n
      ? Number(totalBorrow * 10000n / totalSupply) / 100
      : 0;

    // Call IRM for exact borrow rate per second
    if (config.morphoIrm) {
      try {
        const irm = new ethers.Contract(config.morphoIrm, [
          'function borrowRateView((address loanToken, address collateralToken, address oracle, address irm, uint256 lltv) marketParams, (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee) market) external view returns (uint256)',
        ], provider);

        const marketParams = await new ethers.Contract(config.morpho, [
          'function idToMarketParams(bytes32 id) external view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
        ], provider).idToMarketParams(config.morphoMarketId);

        const ratePerSecond = await irm.borrowRateView(
          [marketParams[0], marketParams[1], marketParams[2], marketParams[3], marketParams[4]],
          [mkt[0], mkt[1], mkt[2], mkt[3], mkt[4], mkt[5]],
        );

        // Convert rate per second to APY: (1 + ratePerSecond / 1e18) ^ (365.25 * 86400) - 1
        const rateFloat = Number(ratePerSecond) / 1e18;
        const borrowApy = (Math.pow(1 + rateFloat, 365.25 * 86400) - 1) * 100;

        const result = {
          borrowApy: Math.round(borrowApy * 100) / 100,
          utilization: Math.round(utilization * 100) / 100,
          totalSupply: totalSupply.toString(),
          totalBorrow: totalBorrow.toString(),
        };
        marketRateCache = { data: result, expiry: Date.now() + 60_000 };
        res.json(result);
        return;
      } catch (irmErr) {
        console.error('[MARKET-RATE] IRM call failed:', irmErr instanceof Error ? irmErr.message : irmErr);
        // Fall through — return null APY so frontend shows "—" instead of "+0.00%"
      }
    }

    // IRM unavailable or call failed — return null APY with utilization data
    const result = {
      borrowApy: null as number | null,
      utilization: Math.round(utilization * 100) / 100,
      totalSupply: totalSupply.toString(),
      totalBorrow: totalBorrow.toString(),
    };
    marketRateCache = { data: result, expiry: Date.now() + 60_000 };
    res.json(result);
  } catch (err) {
    console.error('[MARKET-RATE] Error:', err instanceof Error ? err.message : err);
    res.json({ borrowApy: null, utilization: null, totalSupply: null, totalBorrow: null });
  }
});

// GET /api/apy/simulated — Simulated APY data
executionRouter.get('/apy/simulated', (_req: Request, res: Response) => {
  const baseApy = 8.5;
  const now = Date.now();
  const history = Array.from({ length: 30 }, (_, i) => ({
    timestamp: new Date(now - (29 - i) * 86400000).toISOString(),
    baseApy: baseApy + (Math.random() - 0.5) * 2,
    leveraged3xApy: (baseApy + (Math.random() - 0.5) * 2) * 3 * 0.85,
  }));

  res.json({
    currentApy: baseApy,
    leveragedApy: {
      '1x': baseApy,
      '2x': baseApy * 2 * 0.9,
      '3x': baseApy * 3 * 0.85,
      '3.5x': baseApy * 3.5 * 0.8,
    },
    history,
  });
});

// GET /api/execution/loops — Paginated loop history for a user
executionRouter.get('/loops', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const limit = Math.min(parseInt((req.query as any).limit ?? '20', 10), 100);
  const offset = parseInt((req.query as any).offset ?? '0', 10);

  const { rows } = await query(
    `SELECT l.id, l.strc_amount, l.target_leverage, l.effective_leverage, l.health_factor,
            l.current_iteration, l.status, l.error, l.created_at, l.updated_at
     FROM loop_executions l WHERE l.privy_id = $1
     ORDER BY l.created_at DESC LIMIT $2 OFFSET $3`,
    [privyId, limit, offset],
  );

  const { rows: [{ count }] } = await query(
    `SELECT COUNT(*) FROM loop_executions WHERE privy_id = $1`,
    [privyId],
  );

  res.json({
    loops: rows.map((r: any) => ({
      id: r.id,
      strcAmount: r.strc_amount,
      targetLeverage: Number(r.target_leverage),
      effectiveLeverage: r.effective_leverage ? Number(r.effective_leverage) : null,
      healthFactor: r.health_factor ? Number(r.health_factor) : null,
      iterations: r.current_iteration,
      status: r.status,
      error: r.error,
      createdAt: r.created_at.toISOString(),
      updatedAt: r.updated_at.toISOString(),
    })),
    total: parseInt(count, 10),
    limit,
    offset,
  });
});

// GET /api/apy/aave — Aave USDC lending yield data
executionRouter.get('/apy/aave', async (req: Request, res: Response) => {
  // Lazy import to avoid circular deps
  const mod = require('../aave/aave-yield.service');
  const days = parseInt((req.query.days as string) ?? '90', 10);
  const data = await mod.aaveYieldService.getYieldData(days);
  res.json(data);
});
