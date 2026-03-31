import { query } from '../../db/pool';
import { config } from '../../config';
import { GRID_DEBOUNCE_MS, GRID_THRESHOLD_USD, MAX_LEVERAGE } from '@xstocks/shared';
import { vaultService } from '../vault/vault.service';
import { cowSwapService } from '../cowswap/cowswap.service';
import { smartAccountService } from '../execution/smart-account.service';
import { signerService } from '../execution/signer.service';
import { approvalExecutor } from '../execution/executors/approval.executor';
import { borrowExecutor } from '../execution/executors/borrow.executor';
import { ethers } from 'ethers';
import wSTRCABI from '@xstocks/shared/src/abis/wSTRC.json';

interface GridStrategy {
  id: string;
  privy_id: string;
  loop_execution_id: string;
  threshold: number;
  grid_buy_pct: number;
  vault_address: string;
  enabled: boolean;
}

export class GridExecutor {
  /**
   * Handle a Pyth price trigger.
   * Called when STRC price drops below $103.
   */
  async handlePriceTrigger(params: { price: number; timestamp: number }): Promise<void> {
    if (params.price >= GRID_THRESHOLD_USD) {
      console.log(`Price $${params.price} >= $${GRID_THRESHOLD_USD}, no action`);
      return;
    }

    // Find all enabled grid strategies
    const { rows: strategies } = await query<GridStrategy>(
      `SELECT * FROM grid_strategies WHERE enabled = true`,
    );

    for (const strategy of strategies) {
      try {
        await this.executeGridBuy(strategy, params.price);
      } catch (err) {
        console.error(`Grid buy failed for strategy ${strategy.id}:`, err);
        await this.recordGridEvent(strategy, params.price, 'FAILED', err instanceof Error ? err.message : 'Unknown error');
      }
    }
  }

  /**
   * Buy the dip: withdraw USDC from vault → swap to STRC → loop it.
   */
  private async executeGridBuy(strategy: GridStrategy, triggerPrice: number): Promise<void> {
    // Debounce: skip if last event was < 5 minutes ago
    const { rows: recentEvents } = await query(
      `SELECT id FROM grid_events
       WHERE grid_strategy_id = $1 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [strategy.id],
    );
    if (recentEvents.length > 0) {
      console.log(`Debounce: skipping grid buy for strategy ${strategy.id}`);
      return;
    }

    // Check loop is still active
    const { rows: [loop] } = await query(
      `SELECT status FROM loop_executions WHERE id = $1`,
      [strategy.loop_execution_id],
    );
    if (!loop || !['COMPLETED', 'COMPLETED_PARTIAL'].includes(loop.status)) {
      console.log(`Loop ${strategy.loop_execution_id} not in a valid state for grid buy`);
      return;
    }

    const smartAccountAddr = await smartAccountService.getSmartAccountAddress(strategy.privy_id);

    // Check vault balance
    const vaultBalance = await vaultService.getVaultBalance(smartAccountAddr);
    if (vaultBalance.assets === 0n) {
      await this.recordGridEvent(strategy, triggerPrice, 'FAILED', 'Vault empty — no USDC to deploy');
      return;
    }

    // Calculate buy amount (% of vault)
    const buyAmountUsdc = (vaultBalance.assets * BigInt(strategy.grid_buy_pct)) / 100n;
    if (buyAmountUsdc === 0n) {
      await this.recordGridEvent(strategy, triggerPrice, 'FAILED', 'Buy amount rounds to 0');
      return;
    }

    // Check leverage cap before buying
    const position = await borrowExecutor.getPosition(smartAccountAddr);
    const currentLeverage = position.collateral > 0n
      ? Number(position.collateral) / (Number(position.collateral) - Number(position.borrowed))
      : 1;
    if (currentLeverage >= MAX_LEVERAGE) {
      await this.recordGridEvent(strategy, triggerPrice, 'FAILED', 'Max leverage reached');
      return;
    }

    // Create grid event record
    const { rows: [event] } = await query(
      `INSERT INTO grid_events (grid_strategy_id, privy_id, direction, trigger_price, amount_usdc, status)
       VALUES ($1, $2, 'grid_buy', $3, $4, 'IN_PROGRESS') RETURNING id`,
      [strategy.id, strategy.privy_id, triggerPrice, buyAmountUsdc.toString()],
    );

    // 1. Withdraw USDC from vault
    const withdrawCalls = vaultService.buildWithdrawCalls(buyAmountUsdc, smartAccountAddr, smartAccountAddr);
    await smartAccountService.sendBatchUserOp(strategy.privy_id, withdrawCalls);

    // 2. Swap USDC → STRC via CoW
    const quote = await cowSwapService.getQuote({
      sellToken: config.usdc,
      buyToken: config.strc,
      sellAmount: buyAmountUsdc,
      from: smartAccountAddr,
    });

    const wallet = await signerService.getWalletForUser(strategy.privy_id);
    const signature = await signerService.signTypedData(
      wallet.walletId,
      quote.domain,
      quote.types,
      quote.order,
    );

    const orderUid = await cowSwapService.createOrder(quote, signature);
    await query(`UPDATE grid_events SET cow_order_uid = $2 WHERE id = $1`, [event.id, orderUid]);

    const fill = await cowSwapService.waitForFill(orderUid);

    // 3. Loop it: wrap → supply → borrow
    const wstrcIface = new ethers.Interface(wSTRCABI);
    const loopCalls = [
      ...approvalExecutor.buildApproveCalls({ token: config.strc, spender: config.wstrc, amount: fill.buyAmount }),
      { to: config.wstrc, data: wstrcIface.encodeFunctionData('wrap', [fill.buyAmount]) },
      ...approvalExecutor.buildApproveCalls({ token: config.wstrc, spender: config.morpho, amount: ethers.MaxUint256 }),
      // TODO: Add supplyCollateral + borrow calls with calculated amounts
    ];
    await smartAccountService.sendBatchUserOp(strategy.privy_id, loopCalls);

    // Record success
    await query(
      `UPDATE grid_events SET status = 'COMPLETED', amount_strc = $2, completed_at = NOW() WHERE id = $1`,
      [event.id, fill.buyAmount.toString()],
    );
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
