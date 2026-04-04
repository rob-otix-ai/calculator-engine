import type { Scenario, Metrics } from './types';
export interface BacktestPeriod {
    startYear: number;
    endYear: number;
    terminalReal: number;
    survived: boolean;
}
export interface BacktestResult {
    periods: BacktestPeriod[];
    successRate: number;
}
/**
 * Runs the scenario against historical Shiller data using rolling N-year windows.
 *
 * N = end_age - current_age (the full projection span).
 * For each starting year where N years of data are available, the projection
 * is run using historical real stock returns, and the terminal balance and
 * survival status are recorded.
 *
 * @param scenario   The base scenario (retirement_age, current_age, etc.)
 * @param projectionFn  A projection function that accepts a Scenario plus an
 *                      array of annual real returns and produces Metrics.
 * @returns  Array of BacktestPeriod results and the overall success rate (0-100).
 */
export declare function runHistoricalBacktest(scenario: Scenario, projectionFn: (s: Scenario, returns: number[]) => {
    metrics: Metrics;
}): BacktestResult;
//# sourceMappingURL=backtest.d.ts.map