# xStocks — STRC Leveraged Looping on Morpho

## Project
Leveraged looping tool for STRC on Morpho (Ink chain 57073) with automated buy-the-dip strategy via Pyth price feeds. Users deposit USDC into a Privy Kernel smart wallet, which is used to loop (wrap STRC → supply → borrow → swap → repeat) for 2x/3x/5x leverage.

## Architecture
- **Frontend**: Next.js App Router (`apps/web/`) → Vercel
- **Backend**: Express 5 + TypeScript (`apps/api/`) → Railway
- **Contracts**: Foundry (`packages/contracts/`) → Ink (57073)
- **Shared**: Types + ABIs (`packages/shared/`)
- **Database**: Supabase (PostgreSQL)
- **Auth**: Privy (embedded + Kernel smart wallets, gas sponsored)
- **Oracle**: Pyth Network (STRC/USD price feeds)
- **Swaps**: CoW Protocol (async order book)

## Workflow Rules
- **Always cross-check GitHub Issues** before and after implementing features. Close issues that are done, update issues that have changed scope, and reference issue numbers in commits.
- **Always use PRs** for non-trivial changes. Reference the relevant GitHub issue(s) in the PR description.
- **Keep GitHub Issues up to date** — when scope changes (e.g., Chainlink → Pyth), update the issue title and body to reflect current state.
- **Commit messages** should reference issue numbers where applicable (e.g., "Fix #8: position API calculations").

## Commands
- `npm run dev` — run all apps (turbo)
- `npm run build` — build all
- `npm run db:migrate` — run Supabase migrations
- `forge test` — run contract tests (from packages/contracts/)
- `forge test -vvv` — verbose contract tests

## Key Conventions
- All user-facing amounts in USDC (not STRC)
- Only 2x, 3x, 5x leverage options
- Dollar valuations everywhere via Pyth pricing
- No flash loans (xStocks RFQ constraint) — multi-step unwind
- Grid threshold fixed at $103 for hackathon
- Dark theme, monospace for numbers
