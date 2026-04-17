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
/** Sort-free safe percentile: expects `sorted` in ascending order. */
export declare function quantile(sorted: number[], p: number): number;
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
export declare function computeDrawdown(path: number[]): DrawdownStats;
/**
 * Sortino ratio on realised annualised portfolio returns. Downside deviation
 * is the root-mean-square of shortfalls below the minimum-acceptable return
 * (MAR). We return NaN when downside deviation is zero (signalled by the
 * caller as "N/A"); ADR-033 permits either Infinity or NaN.
 */
export declare function computeSortino(returns: number[], mar: number): number;
/**
 * Compute the full RiskMetrics record from a completed Monte Carlo result.
 *
 * Scenario provides:
 *   - risk_free_rate_pct (default 3.5) — used as both the Sortino MAR and
 *     the risk-free baseline for the VaR/CVaR return-space expression.
 *   - current_age / end_age — span used to compound VaR from terminal space
 *     back into an annual return.
 */
export declare function computeRiskMetrics(inputs: MCRiskInputs, scenario: Scenario): RiskMetrics;
//# sourceMappingURL=risk-metrics.d.ts.map