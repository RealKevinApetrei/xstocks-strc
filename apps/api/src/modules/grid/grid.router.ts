import { Router, type Request, type Response } from 'express';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { chainlinkWebhookAuth } from '../../middleware/chainlinkAuth';
import { gridExecutor } from './grid.executor';
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
     VALUES ($1, $2, 103, $3, $4, true) RETURNING *`,
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

// POST /api/grid/trigger — Chainlink CRE webhook
gridRouter.post('/trigger', chainlinkWebhookAuth, async (req: Request, res: Response) => {
  const { price, timestamp } = req.body;
  console.log(`Grid trigger received: price=$${price}, timestamp=${timestamp}`);

  // Process in background
  gridExecutor.handlePriceTrigger({ price, timestamp }).catch((err) => {
    console.error('Grid trigger processing failed:', err);
  });

  res.json({ acknowledged: true });
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
