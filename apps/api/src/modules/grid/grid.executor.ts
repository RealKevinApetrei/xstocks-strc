import { ethers } from 'ethers';
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
   */
  private async activateDca(strategy: GridStrategy, currentPrice: number): Promise<void> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(strategy.privy_id);
    const vaultBalance = await vaultService.getVaultBalance(smartAccountAddr);

    if (vaultBalance.assets === 0n) {
      return; // No USDC to deploy — silently skip
    }

    const usdcPerTrade = vaultBalance.assets / BigInt(strategy.num_trades);
    if (usdcPerTrade < COW_MIN_SWAP_USDC) {
      await this.recordGridEvent(strategy, currentPrice, 'FAILED', `Per-trade amount $${Number(usdcPerTrade) / 1e6} below CoW $10 minimum`);
      return;
    }

    // Activate DCA state
    await query(
      `UPDATE grid_strategies
       SET dca_active = true, dca_activated_at = NOW(), trades_executed = 0,
           usdc_per_trade = $2
       WHERE id = $1`,
      [strategy.id, usdcPerTrade.toString()],
    );

    console.log(`DCA activated: strategy ${strategy.id}, ${strategy.num_trades} trades of $${Number(usdcPerTrade) / 1e6} every ${strategy.trade_interval_hours}h`);

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
   */
  private async executeDcaTrade(
    strategy: GridStrategy,
    triggerPrice: number,
    targetAmount: bigint,
  ): Promise<void> {
    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(strategy.privy_id);

    // Check actual vault balance — may be less than target if user withdrew
    const vaultBalance = await vaultService.getVaultBalance(smartAccountAddr);
    const buyAmount = vaultBalance.assets < targetAmount ? vaultBalance.assets : targetAmount;

    if (buyAmount < COW_MIN_SWAP_USDC) {
      // Not enough for CoW minimum — deactivate DCA
      await query(`UPDATE grid_strategies SET dca_active = false WHERE id = $1`, [strategy.id]);
      await this.recordGridEvent(strategy, triggerPrice, 'FAILED', 'Remaining balance below CoW $10 minimum');
      return;
    }

    // Record grid event
    const { rows: [event] } = await query(
      `INSERT INTO grid_events (grid_strategy_id, privy_id, direction, trigger_price, amount_usdc, status)
       VALUES ($1, $2, 'grid_buy', $3, $4, 'IN_PROGRESS') RETURNING id`,
      [strategy.id, strategy.privy_id, triggerPrice, buyAmount.toString()],
    );

    // 1. Withdraw USDC from Tydro/Aave
    const withdrawCalls = vaultService.buildWithdrawCalls(buyAmount, smartAccountAddr);
    const withdrawHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, withdrawCalls);
    await smartAccountService.waitForReceipt(withdrawHash);

    // 2. Approve USDC for CoW + swap USDC → STRC
    const approveCowCalls = approvalExecutor.buildApproveCalls({
      token: config.usdc, spender: config.cowVaultRelayer, amount: buyAmount,
    });
    const approveHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, approveCowCalls);
    await smartAccountService.waitForReceipt(approveHash);

    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc, buyToken: config.strc,
      sellAmount: buyAmount, from: smartAccountAddr,
    });

    // Presign scheme: submit order, then sign on-chain via setPreSignature
    const orderUid = await cowSwapService.createOrder(quote, '');
    await query(`UPDATE grid_events SET cow_order_uid = $2 WHERE id = $1`, [event.id, orderUid]);

    // On-chain pre-signature (required for smart wallet orders)
    const preSignCall = cowSwapService.buildPreSignatureCall(orderUid);
    const preSignHash = await smartAccountService.sendBatchUserOp(strategy.privy_id, [preSignCall]);
    await smartAccountService.waitForReceipt(preSignHash);

    const fill = await cowSwapService.waitForFill(orderUid);

    // STRC stays in smart wallet — no wrap/supply/borrow

    // 3. Update DCA state
    await query(
      `UPDATE grid_strategies
       SET trades_executed = trades_executed + 1, last_trade_at = NOW()
       WHERE id = $1`,
      [strategy.id],
    );

    // 4. Record success
    await query(
      `UPDATE grid_events SET status = 'COMPLETED', amount_strc = $2, completed_at = NOW() WHERE id = $1`,
      [event.id, fill.buyAmount.toString()],
    );

    const tradeNum = strategy.trades_executed + 1;
    console.log(`DCA trade ${tradeNum}/${strategy.num_trades} completed: strategy ${strategy.id}, $${Number(buyAmount) / 1e6} USDC → ${Number(fill.buyAmount) / 1e18} STRC`);
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
