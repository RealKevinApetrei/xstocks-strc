-- 001_initial.sql — STRC Looping on Morpho

CREATE TYPE execution_status AS ENUM (
  'PENDING', 'IN_PROGRESS', 'COMPLETED', 'COMPLETED_PARTIAL', 'FAILED', 'CANCELLED'
);

CREATE TYPE execution_type AS ENUM (
  'LOOP', 'UNWIND', 'APPROVAL', 'SUPPLY', 'BORROW', 'REPAY', 'WITHDRAW', 'SWAP',
  'GRID_BUY', 'VAULT_DEPOSIT', 'VAULT_WITHDRAW'
);

CREATE TYPE iteration_step AS ENUM (
  'PENDING', 'APPROVING', 'WRAPPING', 'SUPPLYING', 'BORROWING', 'SWAPPING',
  'COMPLETED', 'FAILED'
);

-- Generic execution request tracking
CREATE TABLE execution_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  type execution_type NOT NULL,
  status execution_status NOT NULL DEFAULT 'PENDING',
  parent_id UUID REFERENCES execution_requests(id),
  smart_account_address TEXT NOT NULL,
  user_op_hash TEXT,
  tx_hash TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Loop-specific state
CREATE TABLE loop_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id UUID NOT NULL REFERENCES execution_requests(id),
  privy_id TEXT NOT NULL,
  strc_amount NUMERIC NOT NULL,
  target_leverage NUMERIC NOT NULL,
  effective_leverage NUMERIC,
  max_slippage_bps INTEGER NOT NULL DEFAULT 100,
  current_iteration INTEGER NOT NULL DEFAULT 0,
  health_factor NUMERIC,
  status execution_status NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-iteration detail
CREATE TABLE loop_iterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_execution_id UUID NOT NULL REFERENCES loop_executions(id),
  iteration_number INTEGER NOT NULL,
  step iteration_step NOT NULL DEFAULT 'PENDING',
  strc_deposited NUMERIC,
  wstrc_minted NUMERIC,
  usdc_borrowed NUMERIC,
  strc_received NUMERIC,
  actual_slippage_bps INTEGER,
  user_op_hash TEXT,
  cow_order_uid TEXT,
  health_factor_after NUMERIC,
  effective_leverage_after NUMERIC,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unwind tracking
CREATE TABLE unwind_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_request_id UUID NOT NULL REFERENCES execution_requests(id),
  loop_execution_id UUID NOT NULL REFERENCES loop_executions(id),
  privy_id TEXT NOT NULL,
  initial_debt_usdc NUMERIC NOT NULL,
  initial_collateral_wstrc NUMERIC NOT NULL,
  remaining_debt_usdc NUMERIC,
  remaining_collateral_wstrc NUMERIC,
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER,
  status execution_status NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Grid strategy configuration (per user per loop)
CREATE TABLE grid_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  loop_execution_id UUID NOT NULL REFERENCES loop_executions(id),
  threshold NUMERIC NOT NULL DEFAULT 103,
  grid_buy_pct NUMERIC NOT NULL,
  vault_address TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(privy_id, loop_execution_id)
);

-- Grid trigger events (audit trail)
CREATE TABLE grid_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grid_strategy_id UUID NOT NULL REFERENCES grid_strategies(id),
  privy_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'grid_buy' CHECK (direction IN ('grid_buy')),
  trigger_price NUMERIC NOT NULL,
  amount_usdc NUMERIC,
  amount_strc NUMERIC,
  cow_order_uid TEXT,
  execution_request_id UUID REFERENCES execution_requests(id),
  status execution_status NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Vault balance tracking
CREATE TABLE vault_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  vault_address TEXT NOT NULL,
  shares NUMERIC NOT NULL DEFAULT 0,
  last_known_assets NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(privy_id, vault_address)
);

-- Indexes
CREATE INDEX idx_exec_requests_privy ON execution_requests(privy_id);
CREATE INDEX idx_exec_requests_status ON execution_requests(status);
CREATE INDEX idx_exec_requests_parent ON execution_requests(parent_id);
CREATE INDEX idx_loop_exec_privy ON loop_executions(privy_id);
CREATE INDEX idx_loop_exec_status ON loop_executions(status);
CREATE INDEX idx_loop_iter_loop ON loop_iterations(loop_execution_id);
CREATE INDEX idx_unwind_loop ON unwind_executions(loop_execution_id);
CREATE INDEX idx_grid_strategies_privy ON grid_strategies(privy_id);
CREATE INDEX idx_grid_events_strategy ON grid_events(grid_strategy_id);
CREATE INDEX idx_vault_balances_privy ON vault_balances(privy_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_exec_requests_updated BEFORE UPDATE ON execution_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_loop_exec_updated BEFORE UPDATE ON loop_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_unwind_exec_updated BEFORE UPDATE ON unwind_executions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_grid_strategies_updated BEFORE UPDATE ON grid_strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_vault_balances_updated BEFORE UPDATE ON vault_balances FOR EACH ROW EXECUTE FUNCTION update_updated_at();
