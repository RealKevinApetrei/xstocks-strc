import { Router, type Request, type Response } from 'express';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { gridExecutor } from './grid.executor';
import { pythPriceService } from '../pyth/pyth-price.service';
import { policyService, PolicyViolation } from '../execution/policy.service';
import { smartAccountService } from '../execution/smart-account.service';
import { vaultService } from '../vault/vault.service';
import { query } from '../../db/pool';
import { config } from '../../config';
import type { CreateGridStrategyRequest, UpdateGridStrategyRequest, VaultDepositRequest, VaultWithdrawRequest } from '@xstocks/shared';

export const gridRouter = Router();

// POST /api/grid/strategy — Create grid strategy
gridRouter.post('/strategy', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { loopExecutionId, gridBuyPct } = req.body as CreateGridStrategyRequest;

  try {
    policyService.validateGridStrategy({ gridBuyPct });
  } catch (err) {
    if (err instanceof PolicyViolation) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Check loop exists
  const { rows: [loop] } = await query(
    `SELECT id FROM loop_executions WHERE id = $1 AND privy_id = $2`,
    [loopExecutionId, privyId],
  );
  if (!loop) {
    res.status(404).json({ error: 'Loop execution not found' });
    return;
  }

  // Check no existing strategy
  const { rows: existing } = await query(
    `SELECT id FROM grid_strategies WHERE privy_id = $1 AND loop_execution_id = $2`,
    [privyId, loopExecutionId],
  );
  if (existing.length > 0) {
    res.status(409).json({ error: 'Grid strategy already exists for this loop' });
    return;
  }

  const { rows: [strategy] } = await query(
    `INSERT INTO grid_strategies (privy_id, loop_execution_id, threshold, grid_buy_pct, vault_address, enabled)
     VALUES ($1, $2, 1.5, $3, $4, true) RETURNING *`,
    [privyId, loopExecutionId, gridBuyPct, config.usdcVault],
  );

  res.status(201).json({
    id: strategy.id,
    loopExecutionId: strategy.loop_execution_id,
    threshold: Number(strategy.threshold),
    gridBuyPct: Number(strategy.grid_buy_pct),
    enabled: strategy.enabled,
    createdAt: strategy.created_at.toISOString(),
  });
});

// GET /api/grid/strategy/:id
gridRouter.get('/strategy/:id', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { rows: [strategy] } = await query(
    `SELECT * FROM grid_strategies WHERE id = $1 AND privy_id = $2`,
    [req.params.id as string, privyId],
  );
  if (!strategy) {
    res.status(404).json({ error: 'Strategy not found' });
    return;
  }
  res.json({
    id: strategy.id,
    loopExecutionId: strategy.loop_execution_id,
    threshold: Number(strategy.threshold),
    gridBuyPct: Number(strategy.grid_buy_pct),
    enabled: strategy.enabled,
    createdAt: strategy.created_at.toISOString(),
  });
});

// PUT /api/grid/strategy/:id
gridRouter.put('/strategy/:id', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { gridBuyPct, enabled } = req.body as UpdateGridStrategyRequest;

  if (gridBuyPct !== undefined) {
    policyService.validateGridStrategy({ gridBuyPct });
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (gridBuyPct !== undefined) {
    updates.push(`grid_buy_pct = $${paramIdx++}`);
    values.push(gridBuyPct);
  }
  if (enabled !== undefined) {
    updates.push(`enabled = $${paramIdx++}`);
    values.push(enabled);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  values.push(req.params.id as string, privyId);
  const { rows: [strategy] } = await query(
    `UPDATE grid_strategies SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND privy_id = $${paramIdx} RETURNING *`,
    values,
  );

  if (!strategy) {
    res.status(404).json({ error: 'Strategy not found' });
    return;
  }

  res.json({
    id: strategy.id,
    loopExecutionId: strategy.loop_execution_id,
    threshold: Number(strategy.threshold),
    gridBuyPct: Number(strategy.grid_buy_pct),
    enabled: strategy.enabled,
    createdAt: strategy.created_at.toISOString(),
  });
});

// GET /api/grid/events/:strategyId
gridRouter.get('/events/:strategyId', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { rows: events } = await query(
    `SELECT * FROM grid_events WHERE grid_strategy_id = $1 AND privy_id = $2 ORDER BY created_at DESC`,
    [req.params.strategyId as string, privyId],
  );

  res.json({
    events: events.map((e: any) => ({
      id: e.id,
      type: e.direction,
      triggerPrice: Number(e.trigger_price),
      amountUsdc: e.amount_usdc,
      amountStrc: e.amount_strc,
      status: e.status,
      cowOrderUid: e.cow_order_uid,
      error: e.error,
      createdAt: e.created_at.toISOString(),
    })),
  });
});

// GET /api/grid/price — Current STRCx/USD price from Pyth Hermes
gridRouter.get('/price', async (_req: Request, res: Response) => {
  try {
    const price = await pythPriceService.getPrice();
    res.json({
      price: price.price,
      timestamp: price.timestamp,
      stale: price.stale,
      source: 'pyth-hermes',
    });
  } catch {
    res.json({ price: 0, timestamp: 0, stale: true, source: 'unavailable' });
  }
});

// GET /api/grid/price/history — Price history for charts
// ?hours=24 for recent polling data, ?days=90 for historical from Pyth Benchmarks
gridRouter.get('/price/history', async (req: Request, res: Response) => {
  const days = Number(req.query.days) || 0;
  if (days > 0) {
    const history = await pythPriceService.getHistoricalPrices(Math.min(days, 365));
    res.json({ history, count: history.length, source: 'pyth-benchmarks' });
    return;
  }
  const hours = Math.min(Number(req.query.hours) || 24, 24);
  const history = pythPriceService.getPriceHistory(hours);
  res.json({ history, count: history.length, source: 'pyth-hermes-poll' });
});

// GET /api/grid/price/stream — SSE stream of live prices
gridRouter.get('/price/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  res.write(':ok\n\n');
  pythPriceService.addSseClient(res);
  req.on('close', () => res.end());
});

// ============================================
// Vault routes (co-located with grid)
// ============================================

// POST /api/vault/deposit
gridRouter.post('/vault/deposit', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount } = req.body as VaultDepositRequest;

  const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
  const calls = vaultService.buildDepositCalls(BigInt(amount), smartAccountAddr);
  const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
  const receipt = await smartAccountService.waitForReceipt(userOpHash);

  res.status(201).json({ txHash: receipt.txHash });
});

// POST /api/vault/withdraw
gridRouter.post('/vault/withdraw', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount } = req.body as VaultWithdrawRequest;

  const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
  const calls = vaultService.buildWithdrawCalls(BigInt(amount), smartAccountAddr, smartAccountAddr);
  const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
  const receipt = await smartAccountService.waitForReceipt(userOpHash);

  res.status(201).json({ txHash: receipt.txHash });
});

// GET /api/vault/balance/:address
gridRouter.get('/vault/balance/:address', privyAuth, async (req: Request, res: Response) => {
  const balance = await vaultService.getVaultBalance(req.params.address as string);
  // TODO: Calculate yield earned (assets - total deposited)
  res.json({
    shares: balance.shares.toString(),
    assets: balance.assets.toString(),
    yieldEarned: '0', // TODO: Track deposits to calculate yield
  });
});
