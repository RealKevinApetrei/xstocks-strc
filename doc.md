
tinko

STRC Looping on Morpho — Technical Spec
Edit


STRC Looping on Morpho — Technical Spec
Overview
We're building a looping tool for the STRC asset on Morpho (Ink chain, 57073). STRC is a rebasing token, so we need a wrapper contract to make it compatible with Morpho. Users supply wrapped STRC as collateral, borrow USDC, swap back to STRC via CoW Protocol, and repeat — achieving up to 3-5x leveraged exposure.

Architecture
Wrapper Contract (wSTRC)
STRC is rebasing, meaning balances change over time. Morpho requires standard ERC-20 behavior. We need a wSTRC wrapper contract that:

Accepts STRC deposits and mints wSTRC at the current exchange rate (similar to wstETH)
Maintains an internal exchange rate: wSTRC_amount = STRC_amount / exchangeRate
Allows unwrapping: burn wSTRC, receive STRC at current rate
Is view-callable for oracle integration (exposes strcPerWstrc() or equivalent)
This is the only new smart contract. Deploy to Ink (57073).

Morpho Market
Collateral: wSTRC
Loan asset: USDC
Market: Curated by us
Oracle: We have good oracle infrastructure — wire a wSTRC/USDC feed that accounts for the wrapper exchange rate
LLTV: Set appropriately for the volatility profile of STRC (governs max safe leverage)
Loop Flow (Single Iteration)
1. approve(STRC → wSTRC wrapper)
2. wrap(STRC → wSTRC)
3. approve(wSTRC → Morpho)
4. supplyCollateral(wSTRC)
5. borrow(USDC)
6. swap(USDC → STRC) via CoW Protocol
7. repeat from step 1
Steps 1-5 can be batched into a single UserOperation via the smart wallet
Step 6 is async (CoW off-chain order book) — poll for fill, then trigger next iteration
Cap at 3-5x leverage (enforce server-side based on loop count and health factor)
Unwind Flow
Reverse the loop: repay USDC debt → withdraw wSTRC → unwrap to STRC. Use flash loans for atomic unwind in a single transaction to avoid liquidation risk during multi-step unwind.

Tech Stack — Use What We Already Have
This project has the full pipeline for server-side wallet execution. Use the same stack, do not introduce new libraries or patterns.

Layer	Existing Module	Path
Auth	Privy JWT + embedded wallets	src/middleware/privyAuth.ts
Server signer	Privy Wallet API (TEE key quorum) — signs txs and EIP-712 data	src/modules/execution/signer.service.ts
Smart accounts	Kernel (ZeroDev) — batch UserOperations	src/modules/execution/smart-account.service.ts
Swaps	CoW Protocol — smart slippage, partner fees, quote caching, async order fill	src/modules/cowswap/cowswap.service.ts
Morpho ops	Borrow executor — supplyCollateral, borrow, repay, withdrawCollateral	src/modules/execution/executors/borrow.executor.ts
ERC-20 approvals	Approval executor	src/modules/execution/executors/approval.executor.ts
Tx tracking	execution_requests table, full status lifecycle	src/modules/execution/execution.router.ts
Policy	Contract allowlists + daily spend limits	src/modules/execution/policy.service.ts
Framework	Express 5 + TypeScript + ethers.js v6 + PostgreSQL	package.json
Key dependencies (already in package.json)
@privy-io/server-auth — Privy auth + wallet API
ethers v6 — contract interactions, calldata encoding
@zerodev/sdk + permissionless — smart account / UserOp batching
pg — PostgreSQL
What Needs to Be Built
1. wSTRC Wrapper Contract
Solidity
Exchange-rate based wrap/unwrap (wstETH pattern)
Deploy to Ink (57073)
Expose strcPerWstrc() for oracle consumption
2. Morpho Market Configuration
Create curated wSTRC/USDC market
Configure oracle adapter that reads wSTRC exchange rate
Set LLTV and other risk parameters
3. Loop Executor
New file: src/modules/execution/executors/loop.executor.ts
Orchestrates the multi-step loop, reusing existing executors (approval, borrow, swap)
Manages iteration state — tracks which iteration we're on, waits for CoW fill between iterations
Enforces max leverage cap (3-5x) server-side
Batch steps 1-5 into single UserOperation where possible
4. REST Endpoints
POST /api/execution/loop — start loop (params: STRC amount, target leverage)
POST /api/execution/unwind — unwind position (flash loan atomic unwind)
GET /api/execution/loop/:id/status — loop progress (current iteration, health factor, effective leverage)
5. Database
Track loop state in execution_requests or a new loop_executions table
Link individual iteration txs back to the parent loop request
Implementation Notes
Health factor checks: Before each iteration, query Morpho for current health factor. Stop looping if adding more collateral + debt would push below safe threshold.
Slippage compounding: Each swap iteration incurs slippage. Account for this when calculating achievable leverage — the effective leverage will be slightly less than theoretical.
CoW order polling: The swap executor already polls CoW for order status. Between loop iterations, wait for fill confirmation before proceeding.
Gas optimization: Batch as many steps as possible into single UserOperations. The smart account service already supports this via batch_executions.
Error recovery: If a loop fails mid-iteration, the position is partially leveraged but safe. Expose the current state so the user can choose to continue or unwind.
Last changed by 
 
tinko·Follow
0
9
Add a comment
Published on  HackMD
