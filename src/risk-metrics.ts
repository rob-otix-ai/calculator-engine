/**
 * Risk Metrics Module (ADR-033 / CONTRACT-018)
 *
 * Pure function computing VaR, CVaR, Sortino, drawdown and per-year
 * quantile trajectories from a completed MCResult.
 *
 * Invariants (from CONTRACT-018):
 *   - Pure: identical inputs -> identical outputs.
 *   - cvar_95 <= var_95 (and the analogous monotonicity at 99%). The MC
 *     convention expresses VaR as "quantile of the terminal-balance
 *     distribution", so "breach" means "below"; CVaR is the conditional
 *     mean *below* VaR, which is always <= VaR.
 *   - max_drawdown_pct in [0, 100].
 *   - p10 <= p50 <= p90 per year.
 *
 * The module does not import MCResult from monte-carlo.ts to avoid a
 * circular dependency; we describe the minimum shape we need via an inline
 * type and let monte-carlo.ts pass the richer value in.
 */

import type { Scenario, RiskMetrics } from './types';

// ===========================================================================
// Minimal MCResult-shape we rely on (decoupled to avoid circular imports)
// ===========================================================================

export interface MCRiskInputs {
  /** Real terminal balance per trial. */
  terminal_distribution: number[];
  /**
   * Per-trial year-by-year real balance paths. Shape: paths[trialIdx][yearIdx].
   * Paths may be different lengths (stochastic longevity terminates some
   * trials early); the utility functions tolerate ragged input.
   */
  real_balance_paths: number[][];
  /** Per-trial annualised realised portfolio return, decimal. */
  annualised_returns: number[];
}

// ===========================================================================
// Quantile helpers
// ===========================================================================

/** Sort-free safe percentile: expects `sorted` in ascending order. */
export function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0];
  if (p >= 1) return sorted[sorted.length - 1];
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ===========================================================================
// Drawdown utilities
// ===========================================================================

export interface DrawdownStats {
  /** Maximum peak-to-trough drop as a percentage of peak (0-100). */
  maxDrawdownPct: number;
  /** Years from trough back to prior peak; Infinity if not recovered. */
  recoveryYears: number;
}

/**
 * Peak-to-trough drawdown on a real balance path. The "worst drawdown" is the
 * deepest percentage drop from any prior peak.
 */
export function computeDrawdown(path: number[]): DrawdownStats {
  if (path.length === 0) return { maxDrawdownPct: 0, recoveryYears: Infinity };
  let peak = path[0];
  let peakIdx = 0;
  let worstDDPct = 0;
  let worstTroughIdx = 0;
  let worstPeakAtTrough = peak;
  for (let i = 0; i < path.length; i++) {
    if (path[i] > peak) {
      peak = path[i];
      peakIdx = i;
    }
    if (peak <= 0) continue;
    const ddPct = ((peak - path[i]) / peak) * 100;
    if (ddPct > worstDDPct) {
      worstDDPct = ddPct;
      worstTroughIdx = i;
      worstPeakAtTrough = peak;
    }
  }
  void peakIdx; // not reported directly
  let recoveryYears: number = Infinity;
  for (let j = worstTroughIdx + 1; j < path.length; j++) {
    if (path[j] >= worstPeakAtTrough) {
      recoveryYears = j - worstTroughIdx;
      break;
    }
  }
  return { maxDrawdownPct: worstDDPct, recoveryYears };
}

// ===========================================================================
// Sortino
// ===========================================================================

/**
 * Sortino ratio on realised annualised portfolio returns. Downside deviation
 * is the root-mean-square of shortfalls below the minimum-acceptable return
 * (MAR). We return NaN when downside deviation is zero (signalled by the
 * caller as "N/A"); ADR-033 permits either Infinity or NaN.
 */
export function computeSortino(
  returns: number[],
  mar: number,
): number {
  if (returns.length === 0) return NaN;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  let downsideSq = 0;
  let downsideCount = 0;
  for (const r of returns) {
    if (r < mar) {
      downsideSq += (mar - r) * (mar - r);
      downsideCount++;
    }
  }
  if (downsideCount === 0) return NaN;
  const downsideDev = Math.sqrt(downsideSq / returns.length);
  if (downsideDev === 0) return NaN;
  return (mean - mar) / downsideDev;
}

// ===========================================================================
// Main entry point
// ===========================================================================

/**
 * Compute the full RiskMetrics record from a completed Monte Carlo result.
 *
 * Scenario provides:
 *   - risk_free_rate_pct (default 3.5) — used as both the Sortino MAR and
 *     the risk-free baseline for the VaR/CVaR return-space expression.
 *   - current_age / end_age — span used to compound VaR from terminal space
 *     back into an annual return.
 */
export function computeRiskMetrics(
  inputs: MCRiskInputs,
  scenario: Scenario,
): RiskMetrics {
  const { terminal_distribution, real_balance_paths, annualised_returns } = inputs;
  const mar = (scenario.risk_free_rate_pct ?? 3.5) / 100;

  const sortedTerminals = [...terminal_distribution].sort((a, b) => a - b);
  const var95 = quantile(sortedTerminals, 0.05);
  const var99 = quantile(sortedTerminals, 0.01);

  // CVaR: mean of the worst-k% tail. For CVaR-95 the "worst 5%" is the
  // bottom 5% of the sorted terminal distribution.
  const n = sortedTerminals.length;
  const tail95Count = Math.max(1, Math.ceil(n * 0.05));
  const tail99Count = Math.max(1, Math.ceil(n * 0.01));
  const cvar95 =
    sortedTerminals.slice(0, tail95Count).reduce((a, b) => a + b, 0) / tail95Count;
  const cvar99 =
    sortedTerminals.slice(0, tail99Count).reduce((a, b) => a + b, 0) / tail99Count;

  // VaR expressed as an annualised real return, starting from current_balance.
  // If we can't sensibly invert (non-positive terminal or starting balance),
  // leave the field as 0 — callers should prefer the terminal-balance form
  // in that case. Horizon uses years (end_age - current_age).
  const years = Math.max(1, scenario.end_age - scenario.current_age);
  const startingBalance = Math.max(1, scenario.current_balance);
  let var95ReturnPct = 0;
  if (var95 > 0 && startingBalance > 0) {
    const ratio = var95 / startingBalance;
    var95ReturnPct = (Math.pow(ratio, 1 / years) - 1) * 100;
  }

  // Sortino
  const sortino = computeSortino(annualised_returns, mar);

  // Drawdowns per trial
  const drawdowns = real_balance_paths.map(computeDrawdown);
  const maxDD = drawdowns.reduce(
    (acc, dd) => (dd.maxDrawdownPct > acc.maxDrawdownPct ? dd : acc),
    { maxDrawdownPct: 0, recoveryYears: Infinity },
  );
  const sortedDDPct = drawdowns.map((dd) => dd.maxDrawdownPct).sort((a, b) => a - b);
  const medianDDPct = quantile(sortedDDPct, 0.5);
  // Recovery: median across trials (Infinity treated as end-of-list — if
  // >=50% of trials never recovered, the median is Infinity).
  const recoveryYears = drawdowns
    .map((dd) => dd.recoveryYears)
    .sort((a, b) => a - b);
  const medianRecovery =
    recoveryYears.length === 0
      ? Infinity
      : recoveryYears[Math.floor(recoveryYears.length / 2)];

  // Per-year P10 / P50 / P90 balance trajectories. We collect all trials'
  // values at each year index; trials that terminated early contribute only
  // to the years they actually spanned, which is the right reporting shape.
  const maxLen = real_balance_paths.reduce(
    (m, p) => Math.max(m, p.length),
    0,
  );
  const p10Path: number[] = [];
  const p50Path: number[] = [];
  const p90Path: number[] = [];
  for (let yr = 0; yr < maxLen; yr++) {
    const ys: number[] = [];
    for (const p of real_balance_paths) {
      if (yr < p.length) ys.push(p[yr]);
    }
    ys.sort((a, b) => a - b);
    p10Path.push(quantile(ys, 0.1));
    p50Path.push(quantile(ys, 0.5));
    p90Path.push(quantile(ys, 0.9));
  }

  return {
    var_95_terminal_real: var95,
    var_99_terminal_real: var99,
    cvar_95_terminal_real: cvar95,
    cvar_99_terminal_real: cvar99,
    var_95_return_pct: var95ReturnPct,
    sortino_ratio: sortino,
    max_drawdown_pct: maxDD.maxDrawdownPct,
    max_drawdown_recovery_years: maxDD.recoveryYears,
    median_drawdown_pct: medianDDPct,
    median_drawdown_recovery_years: medianRecovery,
    p10_year_by_year_balance_real: p10Path,
    p50_year_by_year_balance_real: p50Path,
    p90_year_by_year_balance_real: p90Path,
  };
}
