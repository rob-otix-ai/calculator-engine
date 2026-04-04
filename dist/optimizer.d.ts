import type { Scenario, Metrics } from './types';
export interface OptimizerResult {
    retirementAge: number;
    terminalReal: number;
    survived: boolean;
    mcSuccessPct: number | null;
}
export interface OptimizerOutput {
    results: OptimizerResult[];
    earliestViableAge: number | null;
    minContribution: number | null;
}
export interface OptimizerOptions {
    /** MC success threshold percentage (default 90). */
    mcThreshold?: number;
}
/**
 * Finds the earliest viable retirement age by testing each candidate from
 * current_age + 1 to end_age - 1.
 *
 * For each candidate:
 *   - Runs a deterministic projection
 *   - Checks terminal_real >= desired_estate AND no shortfall
 *   - If mcFn provided: runs MC (capped at 300 runs externally) and checks
 *     success >= mcThreshold
 *
 * Also binary-searches for the minimum contribution amount at the earliest
 * viable age (within $1 tolerance).
 *
 * @param scenario     Base scenario
 * @param projectionFn Deterministic projection function
 * @param mcFn         Optional Monte Carlo function (should use 300 capped runs)
 * @param options      Optional { mcThreshold } (default 90)
 */
export declare function findEarliestRetirementAge(scenario: Scenario, projectionFn: (s: Scenario) => {
    metrics: Metrics;
}, mcFn?: (s: Scenario) => {
    probability_no_shortfall: number;
}, options?: OptimizerOptions): OptimizerOutput;
//# sourceMappingURL=optimizer.d.ts.map