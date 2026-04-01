-- 003_orange_dot_vault.sql — Rework Buy the Dip → Orange Dot Vault (DCA/TWAP)

-- 1. Make loop_execution_id nullable (strategies no longer tied to loops)
ALTER TABLE grid_strategies ALTER COLUMN loop_execution_id DROP NOT NULL;

-- 2. Drop per-loop unique constraint, deduplicate, add per-user unique
ALTER TABLE grid_strategies DROP CONSTRAINT grid_strategies_privy_id_loop_execution_id_key;

-- Keep only the most recent strategy per user before adding the new constraint
DELETE FROM grid_strategies a USING grid_strategies b
  WHERE a.privy_id = b.privy_id AND a.created_at < b.created_at;

ALTER TABLE grid_strategies ADD CONSTRAINT grid_strategies_privy_id_key UNIQUE (privy_id);

-- 3. Rename threshold → trigger_price, set default to $95
ALTER TABLE grid_strategies RENAME COLUMN threshold TO trigger_price;
ALTER TABLE grid_strategies ALTER COLUMN trigger_price SET DEFAULT 95;
UPDATE grid_strategies SET trigger_price = 95;

-- 4. Add DCA/TWAP columns
ALTER TABLE grid_strategies ADD COLUMN num_trades INTEGER NOT NULL DEFAULT 4;
ALTER TABLE grid_strategies ADD COLUMN trade_interval_hours INTEGER NOT NULL DEFAULT 12;
ALTER TABLE grid_strategies ADD COLUMN dca_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE grid_strategies ADD COLUMN trades_executed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE grid_strategies ADD COLUMN usdc_per_trade NUMERIC;
ALTER TABLE grid_strategies ADD COLUMN dca_activated_at TIMESTAMPTZ;
ALTER TABLE grid_strategies ADD COLUMN last_trade_at TIMESTAMPTZ;
