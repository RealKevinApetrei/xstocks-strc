/**
 * Compute minimum deposit for leveraged loops, ensuring every borrow
 * iteration meets CoW Protocol's $10 minimum swap requirement.
 *
 * Model: each loop iteration borrows ≈ D·q^k where
 *   q = LLTV / targetHF   (borrow ratio per iteration)
 *   D = initial deposit (USD)
 *   k = iteration number (1-indexed)
 *
 * The last iteration is capped by remaining debt to reach target leverage.
 * Uses 0% slippage for conservative bounds (slippage only increases the
 * remaining-debt chunk, making borrows easier — not harder).
 *
 * Max achievable leverage = 1 / (1 - q).  If target exceeds this,
 * the leverage is unreachable with the given LLTV and targetHF.
 */

export interface MinDepositResult {
  /** Minimum deposit in whole USD (rounded up) */
  minDepositUsd: number;
  /** Whether the target leverage is achievable with these parameters */
  achievable: boolean;
  /** Number of borrow iterations needed */
  iterations: number;
}

/**
 * Compute the minimum deposit (USD) for a target leverage level.
 *
 * @param targetLeverage - 2, 3, 5, etc.
 * @param lltv           - Liquidation LTV as decimal (default 0.86)
 * @param targetHF       - Health factor maintained during loops (default 1.2)
 * @param maxIterations  - Max loop iterations (default 10)
 * @param cowMinUsd      - CoW Protocol minimum swap in USD (default 10)
 */
export function computeMinDepositUsd(
  targetLeverage: number,
  lltv: number = 0.86,
  targetHF: number = 1.2,
  maxIterations: number = 10,
  cowMinUsd: number = 10,
): MinDepositResult {
  const q = lltv / targetHF;
  const maxLeverage = 1 / (1 - q);

  if (targetLeverage >= maxLeverage) {
    return { minDepositUsd: Infinity, achievable: false, iterations: maxIterations };
  }

  // Binary search for the minimum deposit D where all borrows >= cowMinUsd
  let lo = cowMinUsd;
  let hi = 100_000;

  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (simulateLoop(mid, targetLeverage - 1, q, cowMinUsd, maxIterations).valid) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const minDeposit = Math.ceil(hi);
  const result = simulateLoop(minDeposit, targetLeverage - 1, q, cowMinUsd, maxIterations);
  return {
    minDepositUsd: minDeposit,
    achievable: true,
    iterations: result.iterations,
  };
}

/**
 * Maximum leverage achievable with given LLTV and target health factor.
 * leverage_max = 1 / (1 - LLTV / targetHF)
 */
export function getMaxLeverage(lltv: number = 0.86, targetHF: number = 1.2): number {
  const q = lltv / targetHF;
  return 1 / (1 - q);
}

/** Convert a USD amount to 6-decimal USDC bigint */
export function usdToUsdc6(usd: number): bigint {
  return BigInt(usd) * 1_000_000n;
}

// ── Internal simulation ───────────────────────────────

function simulateLoop(
  deposit: number,
  targetDebtRatio: number,
  q: number,
  minBorrow: number,
  maxIterations: number,
): { valid: boolean; iterations: number } {
  const targetDebt = deposit * targetDebtRatio;
  let debt = 0;
  let iterations = 0;

  for (let k = 1; k <= maxIterations; k++) {
    const borrowHF = deposit * Math.pow(q, k);
    const remaining = targetDebt - debt;

    if (remaining < 0.01) break; // target reached

    const borrow = Math.min(borrowHF, remaining);
    if (borrow < minBorrow) return { valid: false, iterations: k - 1 };

    debt += borrow;
    iterations = k;

    if (debt >= targetDebt - 0.01) break;
  }

  // Must actually reach the target debt
  if (debt < targetDebt - 0.5) return { valid: false, iterations };
  return { valid: true, iterations };
}
