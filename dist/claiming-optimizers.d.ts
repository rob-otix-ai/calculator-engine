/**
 * Social Security, Pension, and Annuity Claiming Optimizers (ADR-036 / CONTRACT-019)
 *
 * Three grid-search optimizers that sweep over claiming ages and evaluate the
 * full scenario at each candidate to maximize a user-chosen metric.
 *
 * No new runtime dependencies.
 */
import type { Scenario, TimelineRow, Metrics, ClaimingOptimizerResult } from './types';
export type ProjectionFn = (scenario: Scenario, overrideReturns?: number[]) => {
    timeline: TimelineRow[];
    metrics: Metrics;
};
export type MonteCarloFn = (scenario: Scenario, projFn: ProjectionFn, options?: {
    runs?: number;
    seed?: number;
    budgetMs?: number;
}) => {
    probability_no_shortfall: number;
    median_terminal: number;
    terminal_distribution: number[];
    runs_completed: number;
};
export interface ClaimingOptimizerOptions {
    metric?: 'terminal_real' | 'mc_success_pct';
    mc_runs?: number;
    mc_seed?: number;
}
/**
 * SSA actuarial adjustment factors by claiming age.
 * FRA = 67 (1.00). Early claiming reduces; delayed credits increase.
 * Source: 2025 SSA published rates.
 */
export declare const SSA_ADJUSTMENT_FACTORS: Record<number, number>;
/**
 * Approximate annuity payout rates by age and sex.
 * Expressed as annual payout per $100,000 of purchase price.
 * Based on approximate UK/US published annuity rate snapshots (2025 vintage).
 */
export declare const ANNUITY_RATE_TABLE: Array<{
    age: number;
    male: number;
    female: number;
}>;
/**
 * Grid search over ages 62-70 to find the optimal SS claiming age.
 * At each candidate age, clones the scenario, sets the SS income source's
 * start_age, adjusts the benefit amount by the SSA factor, and evaluates.
 */
export declare function optimizeSsClaiming(scenario: Scenario, projFn: ProjectionFn, mcFn?: MonteCarloFn, options?: ClaimingOptimizerOptions): ClaimingOptimizerResult;
/**
 * Grid search over ages 55-75 to find the optimal pension claiming age.
 * Uses pension_early_factor_pct and pension_late_factor_pct from the scenario.
 */
export declare function optimizePensionClaiming(scenario: Scenario, projFn: ProjectionFn, mcFn?: MonteCarloFn, options?: ClaimingOptimizerOptions): ClaimingOptimizerResult;
/**
 * Grid search over ages current_age to retirement_age to find the optimal
 * annuity purchase timing. At each candidate age, a portion of the portfolio
 * (annuity_purchase_pct) is used to buy an annuity at the rate for that age.
 */
export declare function optimizeAnnuityTiming(scenario: Scenario, projFn: ProjectionFn, mcFn?: MonteCarloFn, options?: ClaimingOptimizerOptions): ClaimingOptimizerResult;
//# sourceMappingURL=claiming-optimizers.d.ts.map