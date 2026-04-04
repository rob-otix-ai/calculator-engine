import type { Scenario, Metrics } from './types';
export interface HeatmapCell {
    retirementAge: number;
    annualSpending: number;
    viable: boolean;
    terminalReal: number;
}
export interface HeatmapOptions {
    /** [min, max] retirement age range. Defaults to [current_age+1, end_age-1]. */
    retirementAgeRange?: [number, number];
    /** [min, max] annual spending range. Defaults to [10_000, 120_000]. */
    spendingRange?: [number, number];
    /** Number of steps on each axis. Defaults to 10. */
    steps?: number;
}
/**
 * Generates a 2D grid of retirement_age x annual_spending cells.
 *
 * For each combination, the scenario is adjusted and a deterministic projection
 * is run.  Each cell records whether the scenario is viable (no shortfall and
 * terminal_real >= desired_estate) along with the terminal_real value.
 *
 * The spending adjustment modifies:
 *   - withdrawal_pct (when using "Fixed % of prior-year end balance")
 *   - withdrawal_real_amount (when using "Fixed real-dollar amount")
 *
 * For percentage-based withdrawal, the spending value is treated as a dollar
 * amount and the withdrawal_real_amount is set (method switched to fixed-dollar)
 * so the heatmap consistently represents dollar-denominated spending levels.
 *
 * @param scenario      Base scenario
 * @param projectionFn  Deterministic projection function
 * @param options       Optional axis ranges and step count
 */
export declare function generateHeatmap(scenario: Scenario, projectionFn: (s: Scenario) => {
    metrics: Metrics;
}, options?: HeatmapOptions): HeatmapCell[];
//# sourceMappingURL=heatmap.d.ts.map