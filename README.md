# Stretch by Spreads

**Live on Ink Mainnet** (Chain ID 57073)

Leveraged yield, automated trading, and structured savings on tokenised equities. Built on [STRC by xStocks](https://xstocks.ink) on the [Ink](https://inkonchain.com) L2.

---

## What is Stretch?

An ecosystem of products that enrich what you can do with STRC (tokenised S&P 500 exposure on Ink).

| Product | Description | Status |
|---------|-------------|--------|
| **Leveraged Looping** | 2x/3x/3.5x leverage on STRC via Morpho Blue | Live |
| **Orange Dot Vault** | Auto buy-the-dip DCA when STRC price drops | Live |
| **Lend USDC** | Earn yield by supplying USDC to Morpho borrowers | Live |
| **Stretch Your Savings** | 50/50 STRC + T-Bill split with gift card rewards | Live |
| **BTC Hedging Vault** | OTM put spreads via Derive for downside protection | Coming Soon |

---

## Architecture

```
                           Ink Mainnet (57073)
                    ┌──────────────────────────────┐
                    │                              │
  User (Privy)      │   Morpho Blue    CoW Protocol│
  ┌──────────┐      │   ┌─────────┐   ┌──────────┐│
  │ Smart    │──tx──│──>│ Supply  │   │ Swap     ││
  │ Wallet   │      │   │ Borrow  │   │ (presign)││
  │ (Kernel) │      │   └─────────┘   └──────────┘│
  └──────────┘      │                              │
       │            │   Tydro/Aave    Pyth Oracle  │
       │            │   ┌─────────┐   ┌──────────┐│
    Privy Gas       │   │ USDC    │   │ STRC/USD ││
    Sponsorship     │   │ Yield   │   │ Hermes   ││
                    │   └─────────┘   └──────────┘│
                    └──────────────────────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
        ┌─────────┐     ┌──────────┐      ┌──────────┐
        │ Express │     │ Next.js  │      │ Supabase │
        │ API     │     │ Frontend │      │ Postgres │
        │ Railway │     │ Vercel   │      │          │
        └─────────┘     └──────────┘      └──────────┘
```

### Protocol Integrations

| Protocol | Role | Details |
|----------|------|---------|
| **Morpho Blue** | Lending & borrowing | Isolated market: wSTRC collateral / USDC debt, 86% LLTV |
| **CoW Protocol** | Swap execution | Intent-based, MEV-protected. Smart wallet presign flow |
| **Pyth Network** | Price oracle | STRC/USD feed via Hermes (off-chain) + on-chain oracle for Morpho |
| **Privy** | Auth & wallets | Embedded EOA + Kernel smart wallet, gas sponsored |
| **Tydro (Aave V3)** | USDC yield vault | Orange Dot Vault deposits earn yield while waiting for dip |
| **Derive** | BTC options | Decentralised options for hedging vault (coming soon) |

---

## Leveraged Looping

Deposit USDC, get up to **3.5x leveraged exposure** to STRC with **~46% APY** (at 0.89% borrow rate).

### How it works

```
USDC ──> CoW Swap ──> STRC ──> Wrap ──> wSTRC ──> Supply to Morpho
                                                        │
                                    Borrow USDC <───────┘
                                        │
                                   CoW Swap ──> STRC ──> (repeat)
```

Each iteration borrows `D * (LLTV / targetHF)^k` USDC. The loop stops when target leverage is reached.

### Leverage tiers

| Leverage | Target HF | Min Deposit | Iterations | Max APY |
|----------|-----------|-------------|------------|---------|
| 2x | 1.2 | $36 | 2 | ~24.7% |
| 3x | 1.2 | $73 | 5 | ~38.7% |
| 3.5x | 1.1 | $40 | 5 | ~46.3% |

Minimum deposits are computed via binary search simulation ensuring every borrow iteration >= $10 (CoW Protocol minimum).

### Unwinding

Multi-step reverse: repay USDC debt -> withdraw wSTRC -> unwrap -> sell STRC via CoW -> repay more debt -> repeat until target leverage reached.

---

## Orange Dot Vault

Automated buy-the-dip strategy. USDC sits in Tydro (Aave V3) earning yield until STRC price drops below a trigger.

### DCA execution flow

```
Every 30s: Pyth price poll
  │
  ├── Price < trigger ($95 default)?
  │     ├── Activate DCA
  │     ├── Calculate trades: vault_balance / num_trades
  │     └── Execute first trade immediately
  │
  └── DCA active?
        ├── Enough time since last trade?
        │     └── Yes: Withdraw from Tydro → CoW swap USDC→STRC
        └── All trades done? → Deactivate
```

- **Configurable**: 2/4/6/10 trades, 6/12/24h intervals
- **CoW minimum enforced**: $10 per trade, reduces trade count if needed
- **STRC stays in wallet** — not auto-looped

---

## Lend USDC

Supply USDC to the Morpho market as a lender. Earn yield from borrowers (loopers).

```
Supply APY = Borrow APY * Utilization * (1 - Protocol Fee)
```

Live rate from Morpho's IRM (Interest Rate Model) contract.

---

## Stretch Your Savings

Deposit USDC → auto-split 50/50 into STRC + Invesco T-Bill via CoW Protocol.

- **Market hours aware**: Queues deposits for Monday if markets closed (Fri 8pm UTC – Sunday)
- **Live balances**: On-chain reads of STRC + T-Bill token balances
- **Gift card rewards**: Yield redeemable as Amazon, Netflix, Spotify, Starbucks gift cards (Bitrefill)

---

## BTC Hedging Vault (Coming Soon)

Automated downside protection using decentralised BTC options via Derive Protocol.

| Parameter | Value |
|-----------|-------|
| Strategy | OTM Put Spreads |
| Strike | 10-15% out of the money |
| Expiry | Monthly rolling |
| Cost | ~6% APY (~0.5%/month) |
| Protection | Up to 25% downside |

Reduces delta exposure from BTC-correlated STRC drawdowns during volatility events.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| **Backend** | Express 5, TypeScript, Node.js |
| **Database** | PostgreSQL via Supabase |
| **Auth** | Privy (embedded + Kernel smart wallets, gas sponsored) |
| **Web3** | ethers 6, viem 2, wagmi 2 |
| **Monorepo** | Turborepo |
| **Deploy** | Vercel (frontend), Railway (API) |

---

## Project Structure

```
xstocks-src/
├── apps/
│   ├── api/                    # Express backend (Railway)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── execution/  # Loop, unwind, positions, borrow
│   │   │   │   ├── grid/       # Orange Dot Vault, DCA, vault routes
│   │   │   │   ├── savings/    # Savings Club, Bitrefill
│   │   │   │   ├── cowswap/    # CoW Protocol integration
│   │   │   │   ├── pyth/       # Price feeds (Hermes polling)
│   │   │   │   └── vault/      # Tydro/Aave V3 service
│   │   │   └── db/migrations/  # PostgreSQL migrations
│   │   └── package.json
│   └── web/                    # Next.js frontend (Vercel)
│       ├── src/
│       │   ├── app/dashboard/  # Loop, vaults, savings, portfolio
│       │   ├── components/     # UI components
│       │   └── hooks/          # Balance, price, position hooks
│       └── package.json
├── packages/
│   ├── shared/                 # Types, ABIs, addresses, leverage math
│   ├── contracts/              # Foundry (wSTRC, Morpho market setup)
│   └── tsconfig/               # Shared TypeScript config
└── turbo.json
```

---

## API Endpoints

### Execution
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/execution/loop` | Start leveraged loop |
| POST | `/api/execution/unwind` | Unwind position |
| POST | `/api/execution/loop/:id/cancel` | Cancel active loop |
| GET | `/api/execution/loop/:id/status` | Loop progress |
| GET | `/api/execution/unwind/:id/status` | Unwind progress |
| GET | `/api/positions/:address` | Morpho position |
| GET | `/api/execution/market-rate` | Live borrow APY |
| POST | `/api/execution/close-strc` | Sell STRC/wSTRC to USDC |
| POST | `/api/execution/withdraw` | Withdraw USDC to wallet |

### Vaults & Lending
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/vault/deposit` | Deposit to Tydro |
| POST | `/api/vault/withdraw` | Withdraw from Tydro |
| POST | `/api/lend/deposit` | Supply USDC to Morpho |
| POST | `/api/lend/withdraw` | Withdraw from Morpho |
| GET | `/api/lend/apy` | Supply/borrow APY |

### Savings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/savings/deposit` | Deposit (50/50 split) |
| POST | `/api/savings/withdraw` | Sell all holdings |
| GET | `/api/savings/portfolio` | Live balances |
| GET | `/api/savings/catalog` | Gift card catalog |
| POST | `/api/savings/redeem` | Redeem gift card |

### Pricing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/grid/price` | STRC/USD (Pyth) |
| GET | `/api/grid/price/history` | Historical prices |
| GET | `/api/grid/price/stream` | SSE live stream |

---

## Safety & Limits

| Parameter | Value |
|-----------|-------|
| Max loop iterations | 10 |
| Max unwind steps | 20 |
| Loop target HF | 1.2 (2x/3x), 1.1 (3.5x) |
| Emergency HF | 1.05 |
| CoW min swap | $10 |
| TX timeout | 15s (UserOp receipt) |
| CoW fill timeout | 600s |
| RPC retry | 3 attempts, exponential backoff |

All view calls (balanceOf, position, oracle price) retry 3x with 2s/4s/6s backoff to handle intermittent Ink RPC failures.

---

## Quick Start

```bash
# Install
npm install

# Run all apps (turbo)
npm run dev

# Build
npm run build

# Run DB migrations
npm run db:migrate

# Contract tests
cd packages/contracts && forge test -vvv
```

### Environment Variables

See `apps/api/.env.example` for the full list. Critical vars:

```
DATABASE_URL=             # Supabase PostgreSQL
SUPABASE_URL=             # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=
PRIVY_APP_ID=             # Privy auth
PRIVY_APP_SECRET=
RPC_URL=                  # Ink mainnet RPC
STRC_ADDRESS=             # STRC token on Ink
WSTRC_ADDRESS=            # Wrapped STRC
USDC_ADDRESS=             # USDC on Ink
MORPHO_ADDRESS=           # Morpho Blue deployment
MORPHO_MARKET_ID=         # wSTRC/USDC market
MORPHO_ORACLE_ADDRESS=    # Pyth-based oracle
MORPHO_IRM_ADDRESS=       # Interest rate model
COW_API_URL=              # CoW Protocol API (Ink)
PYTH_PRICE_FEED_ID=       # STRC/USD feed ID
```

---

## Links

- **App**: [stretch.spreads.fi](https://stretch.spreads.fi)
- **Pitch**: [stretch.spreads.fi/pitch](https://stretch.spreads.fi/pitch)
- **X**: [@spreads_fi](https://x.com/spreads_fi)
- **Telegram**: [t.me/spreads_fi](https://t.me/spreads_fi)

---

Built by [Spreads](https://spreads.fi) on [Ink](https://inkonchain.com) for the xStocks ecosystem.
