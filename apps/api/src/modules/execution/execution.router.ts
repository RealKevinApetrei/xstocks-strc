import { Router, type Request, type Response } from 'express';
import { ethers } from 'ethers';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { loopExecutor } from './executors/loop.executor';
import { unwindExecutor } from './executors/unwind.executor';
import { borrowExecutor } from './executors/borrow.executor';
import { policyService, PolicyViolation } from './policy.service';
import { smartAccountService } from './smart-account.service';
import { vaultService } from '../vault/vault.service';
import { query } from '../../db/pool';
import { config } from '../../config';
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

// POST /api/execution/unwind — Unwind a position
executionRouter.post('/unwind', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { loopExecutionId } = req.body as StartUnwindRequest;
  const targetLeverage = (req.body as any).targetLeverage ?? 0;

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

// GET /api/positions/:address — Current Morpho position
executionRouter.get('/positions/:address', privyAuth, async (req: Request, res: Response) => {
  const address = req.params.address as string;
  const { privyId } = (req as AuthenticatedRequest).user;

  try {
    const position = await borrowExecutor.getPosition(address);
    const hasPosition = position.collateral > 0n || position.borrowed > 0n;

    // Check for active loop
    const { rows: [activeLoop] } = await query(
      `SELECT id, status FROM loop_executions WHERE privy_id = $1 AND status IN ('PENDING', 'IN_PROGRESS') LIMIT 1`,
      [privyId],
    );

    // Check for grid strategy
    const { rows: [gridStrategy] } = await query(
      `SELECT id, enabled FROM grid_strategies WHERE privy_id = $1 LIMIT 1`,
      [privyId],
    );

    // Vault balance
    let vaultBalance = null;
    try {
      const vb = await vaultService.getVaultBalance(address);
      vaultBalance = { shares: vb.shares.toString(), assets: vb.assets.toString() };
    } catch { /* vault not set up yet */ }

    // Read wSTRC exchange rate + convert collateral to STRC value
    let collateralStrc = '0';
    let exchangeRate = '0';
    let effectiveLeverage = 1;
    let liquidationPrice = 0;

    if (hasPosition) {
      try {
        const provider = new ethers.JsonRpcProvider(config.rpcUrl);
        const wstrcContract = new ethers.Contract(config.wstrc, wSTRCABI, provider);
        const rate: bigint = await wstrcContract.strcPerWstrc();
        const strcVal: bigint = await wstrcContract.wstrcToStrc(position.collateral);
        exchangeRate = rate.toString();
        collateralStrc = strcVal.toString();

        // Leverage from health factor: L = 1 / (1 - 1/HF)
        if (position.healthFactor > 1) {
          effectiveLeverage = 1 / (1 - 1 / position.healthFactor);
        }

        // Liquidation price: price at which HF = 1
        // liqPrice = borrowed / (collateral * lltv)  (simplified, units depend on oracle scale)
        if (position.collateral > 0n && position.borrowed > 0n) {
          liquidationPrice = Number(position.borrowed) / (Number(position.collateral) * 0.8);
        }
      } catch { /* contracts not deployed yet — use defaults */ }
    }

    res.json({
      address,
      hasPosition,
      position: hasPosition ? {
        collateralWstrc: position.collateral.toString(),
        collateralStrc,
        debtUsdc: position.borrowed.toString(),
        healthFactor: position.healthFactor,
        effectiveLeverage,
        liquidationPrice,
        exchangeRate,
      } : null,
      activeLoop: activeLoop ? { id: activeLoop.id, status: activeLoop.status } : null,
      gridStrategy: gridStrategy ? { id: gridStrategy.id, enabled: gridStrategy.enabled } : null,
      vaultBalance,
    });
  } catch {
    // No position or contracts not deployed yet
    res.json({ address, hasPosition: false, position: null, activeLoop: null, gridStrategy: null, vaultBalance: null });
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
      '5x': baseApy * 5 * 0.75,
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
