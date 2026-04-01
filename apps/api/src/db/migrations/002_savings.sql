-- 002_savings.sql — Spreads Savings Club

CREATE TYPE savings_tier AS ENUM ('BRONZE', 'SILVER', 'GOLD');
CREATE TYPE savings_deposit_status AS ENUM ('PENDING', 'QUEUED', 'EXECUTING', 'COMPLETED', 'FAILED');
CREATE TYPE redemption_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- User savings plan (one per user)
CREATE TABLE savings_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL UNIQUE,
  smart_account_address TEXT NOT NULL,
  monthly_target_usdc NUMERIC NOT NULL DEFAULT 100,
  strc_pct INTEGER NOT NULL DEFAULT 70 CHECK (strc_pct BETWEEN 0 AND 100),
  tbill_pct INTEGER GENERATED ALWAYS AS (100 - strc_pct) STORED,
  tier savings_tier NOT NULL DEFAULT 'BRONZE',
  streak_months INTEGER NOT NULL DEFAULT 0,
  total_deposited_usdc NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Each USDC deposit event
CREATE TABLE savings_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  usdc_amount NUMERIC NOT NULL,
  strc_pct INTEGER NOT NULL,
  strc_usdc_allocated NUMERIC NOT NULL,
  tbill_usdc_allocated NUMERIC NOT NULL,
  strc_cow_order_uid TEXT,
  tbill_cow_order_uid TEXT,
  queued_for_monday BOOLEAN NOT NULL DEFAULT false,
  status savings_deposit_status NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

-- Periodic yield snapshots (taken on deposit + periodic cron)
CREATE TABLE savings_yield_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  strc_balance NUMERIC NOT NULL DEFAULT 0,
  tbill_balance NUMERIC NOT NULL DEFAULT 0,
  strc_price_usd NUMERIC,
  tbill_price_usd NUMERIC,
  portfolio_value_usd NUMERIC NOT NULL DEFAULT 0,
  total_deposited_usd NUMERIC NOT NULL DEFAULT 0,
  yield_to_date_usd NUMERIC GENERATED ALWAYS AS (portfolio_value_usd - total_deposited_usd) STORED,
  snapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Accumulated rewards + redemption history
CREATE TABLE savings_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  yield_usd NUMERIC NOT NULL,
  reward_usd NUMERIC NOT NULL,
  bitrefill_product_id TEXT,
  bitrefill_product_name TEXT,
  redemption_status redemption_status NOT NULL DEFAULT 'PENDING',
  bitrefill_order_id TEXT,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Monthly streak tracking
CREATE TABLE savings_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  deposited_usdc NUMERIC NOT NULL DEFAULT 0,
  target_usdc NUMERIC NOT NULL,
  goal_met BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(privy_id, year, month)
);

-- Withdrawals
CREATE TYPE savings_withdrawal_status AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED');

CREATE TABLE savings_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  privy_id TEXT NOT NULL,
  usdc_amount NUMERIC NOT NULL,
  strc_cow_order_uid TEXT,
  tbill_cow_order_uid TEXT,
  status savings_withdrawal_status NOT NULL DEFAULT 'PENDING',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_savings_plans_privy ON savings_plans(privy_id);
CREATE INDEX idx_savings_deposits_privy ON savings_deposits(privy_id);
CREATE INDEX idx_savings_deposits_status ON savings_deposits(status);
CREATE INDEX idx_savings_deposits_queued ON savings_deposits(queued_for_monday) WHERE queued_for_monday = true AND status = 'QUEUED';
CREATE INDEX idx_savings_snapshots_privy ON savings_yield_snapshots(privy_id);
CREATE INDEX idx_savings_rewards_privy ON savings_rewards(privy_id);
CREATE INDEX idx_savings_withdrawals_privy ON savings_withdrawals(privy_id);
CREATE INDEX idx_savings_streaks_privy ON savings_streaks(privy_id);

-- Updated_at triggers
CREATE TRIGGER tr_savings_plans_updated BEFORE UPDATE ON savings_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_savings_streaks_updated BEFORE UPDATE ON savings_streaks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
