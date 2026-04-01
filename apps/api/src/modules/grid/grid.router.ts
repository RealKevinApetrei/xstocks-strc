import { Router, type Request, type Response } from 'express';
import { ethers } from 'ethers';
import { privyAuth, type AuthenticatedRequest } from '../../middleware/privyAuth';
import { gridExecutor } from './grid.executor';
import { pythPriceService } from '../pyth/pyth-price.service';
import { policyService, PolicyViolation } from '../execution/policy.service';
import { smartAccountService } from '../execution/smart-account.service';
import { vaultService } from '../vault/vault.service';
import { lendService } from '../vault/lend.service';
import { query } from '../../db/pool';
import { config } from '../../config';
import { DEFAULT_TRIGGER_PRICE } from '@xstocks/shared';
import type { CreateGridStrategyRequest, UpdateGridStrategyRequest, VaultDepositRequest, VaultWithdrawRequest } from '@xstocks/shared';

export const gridRouter = Router();

/** Map a DB row to the API response shape. */
function formatStrategy(s: any) {
  return {
    id: s.id,
    triggerPrice: Number(s.trigger_price),
    numTrades: s.num_trades,
    tradeIntervalHours: s.trade_interval_hours,
    dcaActive: s.dca_active,
    tradesExecuted: s.trades_executed,
    usdcPerTrade: s.usdc_per_trade?.toString() ?? null,
    lastTradeAt: s.last_trade_at?.toISOString() ?? null,
    enabled: s.enabled,
    createdAt: s.created_at.toISOString(),
  };
}

// GET /api/grid/strategy — Get current user's strategy (one per user)
gridRouter.get('/strategy', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { rows: [strategy] } = await query(
    `SELECT * FROM grid_strategies WHERE privy_id = $1`,
    [privyId],
  );
  if (!strategy) {
    res.status(404).json({ error: 'No strategy found' });
    return;
  }
  res.json(formatStrategy(strategy));
});

// POST /api/grid/strategy — Create grid strategy
gridRouter.post('/strategy', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { triggerPrice, numTrades, tradeIntervalHours } = req.body as CreateGridStrategyRequest;

  try {
    policyService.validateGridStrategy({ triggerPrice, numTrades, tradeIntervalHours });
  } catch (err) {
    if (err instanceof PolicyViolation) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  // Check no existing strategy for this user
  const { rows: existing } = await query(
    `SELECT id FROM grid_strategies WHERE privy_id = $1`,
    [privyId],
  );
  if (existing.length > 0) {
    res.status(409).json({ error: 'Strategy already exists. Use PUT to update.' });
    return;
  }

  const { rows: [strategy] } = await query(
    `INSERT INTO grid_strategies (privy_id, trigger_price, num_trades, trade_interval_hours, grid_buy_pct, vault_address, enabled)
     VALUES ($1, $2, $3, $4, 100, $5, true) RETURNING *`,
    [privyId, triggerPrice ?? DEFAULT_TRIGGER_PRICE, numTrades ?? 4, tradeIntervalHours ?? 12, config.aaveL2Pool],
  );

  res.status(201).json(formatStrategy(strategy));
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
  res.json(formatStrategy(strategy));
});

// PUT /api/grid/strategy/:id
gridRouter.put('/strategy/:id', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { triggerPrice, numTrades, tradeIntervalHours, enabled } = req.body as UpdateGridStrategyRequest;

  try {
    policyService.validateGridStrategy({ triggerPrice, numTrades, tradeIntervalHours });
  } catch (err) {
    if (err instanceof PolicyViolation) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 1;

  if (triggerPrice !== undefined) {
    updates.push(`trigger_price = $${paramIdx++}`);
    values.push(triggerPrice);
  }
  if (numTrades !== undefined) {
    updates.push(`num_trades = $${paramIdx++}`);
    values.push(numTrades);
  }
  if (tradeIntervalHours !== undefined) {
    updates.push(`trade_interval_hours = $${paramIdx++}`);
    values.push(tradeIntervalHours);
  }
  if (enabled !== undefined) {
    updates.push(`enabled = $${paramIdx++}`);
    values.push(enabled);
    // If disabling, also deactivate DCA
    if (!enabled) {
      updates.push(`dca_active = false`);
    }
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

  res.json(formatStrategy(strategy));
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
    res.json({ history, count: history.length, source: 'yahoo-finance' });
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

  try {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    const calls = vaultService.buildDepositCalls(BigInt(amount), smartAccountAddr);
    // Approve first, wait for it to land, then supply
    await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [calls[0]]));
    const userOpHash = await smartAccountService.sendBatchUserOp(privyId, [calls[1]]);
    const receipt = await smartAccountService.waitForReceipt(userOpHash);
    res.status(201).json({ txHash: receipt.txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[VAULT] Deposit failed:', msg);
    res.status(400).json({ error: `Vault deposit failed: ${msg}` });
  }
});

// POST /api/vault/withdraw
gridRouter.post('/vault/withdraw', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount } = req.body as VaultWithdrawRequest;

  try {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    // For max withdrawal, read maxWithdraw from ERC-4626 to avoid revert
    const withdrawAmount = amount === 'max'
      ? await vaultService.getMaxWithdraw(smartAccountAddr)
      : BigInt(amount);
    if (withdrawAmount === 0n) {
      res.status(400).json({ error: 'Nothing to withdraw' });
      return;
    }
    const calls = vaultService.buildWithdrawCalls(withdrawAmount, smartAccountAddr);
    const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
    const receipt = await smartAccountService.waitForReceipt(userOpHash);
    res.status(201).json({ txHash: receipt.txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[VAULT] Withdraw failed:', msg);
    res.status(400).json({ error: `Vault withdraw failed: ${msg}` });
  }
});

// GET /api/vault/balance/:address
gridRouter.get('/vault/balance/:address', privyAuth, async (req: Request, res: Response) => {
  const balance = await vaultService.getVaultBalance(req.params.address as string);
  res.json({
    shares: balance.shares.toString(),
    assets: balance.assets.toString(),
    yieldEarned: '0', // TODO: Track deposits to calculate yield
  });
});

// ============================================
// Lend USDC Vault routes (Morpho supply side)
// ============================================

// POST /api/lend/deposit — Supply USDC to Morpho as a lender
gridRouter.post('/lend/deposit', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount } = req.body as { amount: string };

  try {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    const calls = lendService.buildSupplyCalls(BigInt(amount), smartAccountAddr);
    // Approve first, wait for it to land, then supply
    await smartAccountService.waitForReceipt(await smartAccountService.sendBatchUserOp(privyId, [calls[0]]));
    const userOpHash = await smartAccountService.sendBatchUserOp(privyId, [calls[1]]);
    const receipt = await smartAccountService.waitForReceipt(userOpHash);
    res.status(201).json({ txHash: receipt.txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[LEND] Deposit failed:', msg);
    res.status(400).json({ error: `Lend deposit failed: ${msg}` });
  }
});

// POST /api/lend/withdraw — Withdraw USDC from Morpho lending position
gridRouter.post('/lend/withdraw', privyAuth, async (req: Request, res: Response) => {
  const { privyId } = (req as AuthenticatedRequest).user;
  const { amount } = req.body as { amount: string };

  try {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(privyId);
    // Max withdrawal reads exact supply shares to avoid Morpho arithmetic overflow
    const calls = amount === 'max'
      ? await lendService.buildWithdrawMaxCalls(smartAccountAddr, smartAccountAddr)
      : lendService.buildWithdrawByAssets(BigInt(amount), smartAccountAddr, smartAccountAddr);
    const userOpHash = await smartAccountService.sendBatchUserOp(privyId, calls);
    const receipt = await smartAccountService.waitForReceipt(userOpHash);
    res.status(201).json({ txHash: receipt.txHash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[LEND] Withdraw failed:', msg);
    res.status(400).json({ error: `Lend withdraw failed: ${msg}` });
  }
});

// GET /api/lend/balance/:address — Lending position balance
gridRouter.get('/lend/balance/:address', privyAuth, async (req: Request, res: Response) => {
  const balance = await lendService.getLendBalance(req.params.address as string);
  res.json({
    supplyShares: balance.supplyShares.toString(),
    assets: balance.assets.toString(),
  });
});

// GET /api/lend/apy — Live supply APY from Morpho IRM
gridRouter.get('/lend/apy', async (_req: Request, res: Response) => {
  try {
    const data = await lendService.getSupplyApy();
    res.json(data);
  } catch (err) {
    console.error('[LEND-APY] Error:', err);
    res.json({ supplyApy: null, borrowApy: null, utilization: null, totalSupply: null, totalBorrow: null });
  }
});
