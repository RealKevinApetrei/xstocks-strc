import { query } from '../../db/pool';
import { config } from '../../config';
import { COW_MIN_SWAP_USDC } from '@xstocks/shared';
import { vaultService } from '../vault/vault.service';
import { cowSwapService } from '../cowswap/cowswap.service';
import { smartAccountService } from '../execution/smart-account.service';
import { approvalExecutor } from '../execution/executors/approval.executor';

interface GridStrategy {
  id: string;
  privy_id: string;
  trigger_price: number;
  num_trades: number;
  trade_interval_hours: number;
  dca_active: boolean;
  trades_executed: number;
  usdc_per_trade: string | null;
  dca_activated_at: Date | null;
  last_trade_at: Date | null;
  enabled: boolean;
}

export class GridExecutor {
  /**
   * Handle a price trigger from the Pyth polling loop.
   * Implements DCA/TWAP: when price drops below trigger, executes
   * trades spread over time at the configured interval.
   */
  async handlePriceTrigger(params: { price: number; timestamp: number }): Promise<void> {
    const { rows: strategies } = await query<GridStrategy>(
      `SELECT * FROM grid_strategies WHERE enabled = true`,
    );

    for (const strategy of strategies) {
      try {
        if (!strategy.dca_active) {
          // Not in DCA mode — check if we should activate
          if (params.price < strategy.trigger_price) {
            await this.activateDca(strategy, params.price);
          }
        } else {
          // DCA active — check if we should execute next trade
          await this.processDcaTick(strategy, params.price);
        }
      } catch (err) {
        console.error(`Grid DCA failed for strategy ${strategy.id}:`, err);
        await this.recordGridEvent(strategy, params.price, 'FAILED', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  }

  /**
   * Activate DCA: calculate per-trade amount and execute first trade immediately.
   * Enforces CoW $10 minimum per trade — reduces numTrades if needed.
   */
  private async activateDca(strategy: GridStrategy, currentPrice: number): Promise<void> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(strategy.privy_id);
    const vaultBalance = await vaultService.getVaultBalance(smartAccountAddr);

    if (vaultBalance.assets === 0n) {
      return; // No USDC to deploy — silently skip
    }

    // Enforce $10 minimum per trade: reduce num_trades if balance too low
    let effectiveNumTrades = strategy.num_trades;
    let usdcPerTrade = vaultBalance.assets / BigInt(effectiveNumTrades);

    while (usdcPerTrade < COW_MIN_SWAP_USDC && effectiveNumTrades > 1) {
      effectiveNumTrades--;
      usdcPerTrade = vaultBalance.assets / BigInt(effectiveNumTrades);
    }

    // If even 1 trade is below $10, total balance is too low
    if (usdcPerTrade < COW_MIN_SWAP_USDC) {
      await this.recordGridEvent(strategy, currentPrice, 'FAILED',
        `Vault balance $${(Number(vaultBalance.assets) / 1e6).toFixed(2)} below CoW $10 minimum`);
      return;
    }

    // Activate DCA state (use effective num_trades which may be lower than configured)
    await query(
      `UPDATE grid_strategies
       SET dca_active = true, dca_activated_at = NOW(), trades_executed = 0,
           usdc_per_trade = $2, num_trades = $3
       WHERE id = $1`,
      [strategy.id, usdcPerTrade.toString(), effectiveNumTrades],
    );

    console.log(`DCA activated: strategy ${strategy.id}, ${effectiveNumTrades} trades of $${(Number(usdcPerTrade) / 1e6).toFixed(2)} every ${strategy.trade_interval_hours}h`);

    // Execute first trade immediately
    await this.executeDcaTrade(strategy, currentPrice, usdcPerTrade);
  }

  /**
   * Process a DCA tick: check if it's time for the next trade.
   */
  private async processDcaTick(strategy: GridStrategy, currentPrice: number): Promise<void> {
    // All trades completed — deactivate
    if (strategy.trades_executed >= strategy.num_trades) {
      await query(
        `UPDATE grid_strategies SET dca_active = false WHERE id = $1`,
        [strategy.id],
      );
      console.log(`DCA completed: strategy ${strategy.id}, all ${strategy.num_trades} trades executed`);
      return;
    }

    // Only trade while price is below trigger
    if (currentPrice >= strategy.trigger_price) {
      return; // Price recovered — skip this tick
    }

    // Check interval: enough time since last trade?
    if (strategy.last_trade_at) {
      const elapsedMs = Date.now() - new Date(strategy.last_trade_at).getTime();
      const intervalMs = strategy.trade_interval_hours * 3600_000;
      if (elapsedMs < intervalMs) {
        return; // Not time yet
      }
    }

    // Execute next trade
    const usdcPerTrade = strategy.usdc_per_trade ? BigInt(strategy.usdc_per_trade) : 0n;
    if (usdcPerTrade === 0n) {
      await query(`UPDATE grid_strategies SET dca_active = false WHERE id = $1`, [strategy.id]);
      return;
    }

    await this.executeDcaTrade(strategy, currentPrice, usdcPerTrade);
  }

  /**
   * Execute a single DCA trade: withdraw from Tydro → CoW swap USDC→STRC.
   * STRC stays in the smart wallet.
   * Enforces CoW $10 minimum — deactivates DCA if balance too low.
   */
  private async executeDcaTrade(
    strategy: GridStrategy,
    triggerPrice: number,
    targetAmount: bigint,
  ): Promise<void> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(strategy.privy_id);

    // Check actual vault balance — may be less than target if user withdrew
    const vaultBalance = await vaultService.getVaultBalance(smartAccountAddr);
    let buyAmount = vaultBalance.assets < targetAmount ? vaultBalance.assets : targetAmount;

    // For the last trade, use remaining balance to avoid dust
    const remainingTrades = strategy.num_trades - strategy.trades_executed;
    if (remainingTrades === 1 && vaultBalance.assets > 0n && vaultBalance.assets >= COW_MIN_SWAP_USDC) {
      buyAmount = vaultBalance.assets; // Sweep remaining
    }

    // Enforce $10 CoW minimum
    if (buyAmount < COW_MIN_SWAP_USDC) {
      await query(`UPDATE grid_strategies SET dca_active = false WHERE id = $1`, [strategy.id]);
      await this.recordGridEvent(strategy, triggerPrice, 'FAILED',
        `Trade amount $${(Number(buyAmount) / 1e6).toFixed(2)} below CoW $10 minimum — DCA stopped`);
      return;
    }

    // Record grid event
    const { rows: [event] } = await query(
      `INSERT INTO grid_events (grid_strategy_id, privy_id, direction, trigger_price, amount_usdc, status)
       VALUES ($1, $2, 'grid_buy', $3, $4, 'IN_PROGRESS') RETURNING id`,
      [strategy.id, strategy.privy_id, triggerPrice, buyAmount.toString()],
    );

    try {
      // 1. Withdraw USDC from Tydro/Aave
      const withdrawCalls = vaultService.buildWithdrawCalls(buyAmount, smartAccountAddr);
      const withdrawHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, withdrawCalls);
      await smartAccountService.waitForReceipt(withdrawHash);

      // 2. Approve USDC for CoW VaultRelayer
      const approveCowCalls = approvalExecutor.buildApproveCalls({
        token: config.usdc, spender: config.cowVaultRelayer, amount: buyAmount,
      });
      const approveHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, approveCowCalls);
      await smartAccountService.waitForReceipt(approveHash);

      // 3. Get CoW quote and create presign order
      const quote = await cowSwapService.getQuote({
        sellToken: config.usdc, buyToken: config.strc,
        sellAmount: buyAmount, from: smartAccountAddr,
      });

      const orderUid = await cowSwapService.createOrder(quote, '');
      await query(`UPDATE grid_events SET cow_order_uid = $2 WHERE id = $1`, [event.id, orderUid]);

      // 4. On-chain pre-signature (required for smart wallet orders)
      const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
      const preSignHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, [preSignCall]);
      await smartAccountService.waitForReceipt(preSignHash);

      // 5. Wait for CoW fill
      const fill = await cowSwapService.waitForFill(orderUid);

      // STRC stays in smart wallet — no wrap/supply/borrow

      // 6. Update DCA state
      await query(
        `UPDATE grid_strategies
         SET trades_executed = trades_executed + 1, last_trade_at = NOW()
         WHERE id = $1`,
        [strategy.id],
      );

      // 7. Record success
      await query(
        `UPDATE grid_events SET status = 'COMPLETED', amount_strc = $2, completed_at = NOW() WHERE id = $1`,
        [event.id, fill.buyAmount.toString()],
      );

      const tradeNum = strategy.trades_executed + 1;
      console.log(`DCA trade ${tradeNum}/${strategy.num_trades}: strategy ${strategy.id}, $${(Number(buyAmount) / 1e6).toFixed(2)} USDC → ${(Number(fill.buyAmount) / 1e18).toFixed(4)} STRC`);
    } catch (err) {
      // Trade failed — mark event as FAILED but keep DCA active for retry on next tick
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await query(
        `UPDATE grid_events SET status = 'FAILED', error = $2, completed_at = NOW() WHERE id = $1`,
        [event.id, errorMsg.slice(0, 500)],
      );
      console.error(`DCA trade failed for strategy ${strategy.id}:`, errorMsg);
      // Don't rethrow — let DCA retry on next interval tick
    }
  }

  private async recordGridEvent(
    strategy: GridStrategy,
    triggerPrice: number,
    status: string,
    error: string,
  ): Promise<void> {
    await query(
      `INSERT INTO grid_events (grid_strategy_id, privy_id, direction, trigger_price, status, error)
       VALUES ($1, $2, 'grid_buy', $3, $4, $5)`,
      [strategy.id, strategy.privy_id, triggerPrice, status, error],
    );
  }
}

export const gridExecutor = new GridExecutor();
