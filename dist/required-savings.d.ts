/**
 * findRequiredSavings — reverse solver for minimum required contribution.
 *
 * Implements CONTRACT-016 §"required-savings" and ADR-025.
 *
 * Bisects the `contrib_amount` field of a Scenario over [0, upperBound] to
 * find the minimum periodic contribution that makes the plan viable. The
 * iteration count is capped at 24 (per CONTRACT-016 / ADR-025), the internal
 * Monte Carlo runs are capped at 300, and the result shape matches DDD-009's
 * `SolverResult`.
 *
 * Success criterion (per ADR-025):
 *   - Deterministic: terminal_real >= scenario.desired_estate (default 0)
 *   - Monte Carlo:   when scenario.enable_mc and an mcFn is supplied, MC
 *                    `probability_no_shortfall` >= mcThreshold (default 90)
 */
import type { Scenario, Metrics } from './types';
export interface SolverResult {
    /** True when at least one candidate inside the search range satisfied the success criterion. */
    feasible: boolean;
    /** The solved contribution amount. Present iff `feasible` is true. */
    value?: number;
    /** True when bisection halted naturally (range narrowed to <= 1 unit). False when the iteration cap fired first. */
    converged: boolean;
    /** Number of bisection iterations actually executed. */
    iterations: number;
    /** Optional reason code when the search returns no solution. */
    reason?: 'plan_never_succeeds' | 'iteration_cap' | 'no_search_range';
    /** Last evaluated contribution amount (useful for "no solution" UX). */
    best_attempt?: number;
}
export interface FindRequiredSavingsOptions {
    /** Monte Carlo success threshold percentage (default 90). */
    mcThreshold?: number;
    /** Upper bound of the search range for `contrib_amount` (default 100_000 per cadence). */
    upperBound?: number;
}
/**
 * Find the minimum periodic contribution amount that makes the scenario
 * viable. See module header for full semantics.
 */
export declare function findRequiredSavings(scenario: Scenario, projFn: (s: Scenario) => {
    metrics: Metrics;
}, mcFn?: (s: Scenario) => {
    probability_no_shortfall: number;
}, options?: FindRequiredSavingsOptions): SolverResult;
//# sourceMappingURL=required-savings.d.ts.map