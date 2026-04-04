import type { Scenario, Metrics } from './types';
export interface SensitivityFactor {
    name: string;
    label: string;
    lowValue: number;
    highValue: number;
    lowTerminal: number;
    highTerminal: number;
    spread: number;
}
/**
 * Runs tornado-chart sensitivity analysis.
 *
 * For each of 7 key parameters, the scenario is cloned and the parameter is
 * adjusted +/- its delta.  A deterministic projection is run for each variant
 * and the terminal_real value is recorded.
 *
 * Results are sorted by spread (largest first) so the most impactful
 * parameters appear at the top of the tornado chart.
 *
 * Guards (from EDGE-CASE-REPORT):
 *   - retirement_age is clamped to (current_age, end_age)
 *   - All percentages are clamped >= 0
 *   - contrib_amount and current_balance are clamped >= 0
 *   - withdrawal_pct delta is skipped when withdrawal_strategy is Age-Banded
 */
export declare function runSensitivityAnalysis(scenario: Scenario, projectionFn: (s: Scenario) => {
    metrics: Metrics;
}): SensitivityFactor[];
//# sourceMappingURL=sensitivity.d.ts.map