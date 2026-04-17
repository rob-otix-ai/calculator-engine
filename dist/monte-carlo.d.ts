/**
 * Monte Carlo Simulation Engine
 *
 * Deterministic, seeded PRNG-based Monte Carlo runner for retirement projections.
 * Generates randomized annual returns and delegates year-by-year calculation to
 * a caller-provided projection function, keeping MC fully decoupled from the
 * projection engine.
 */
import type { Scenario, TimelineRow, Metrics, FanChartRow, RiskMetrics } from './types';
export type ProjectionFn = (scenario: Scenario, overrideReturns?: number[]) => {
    timeline: TimelineRow[];
    metrics: Metrics;
};
export interface MCOptions {
    /** Number of simulation runs. Default 1000, validated 100-10000. */
    runs?: number;
    /** PRNG seed for reproducibility. Default 42. */
    seed?: number;
    /** Wall-clock budget in ms before aborting. Default 50000. */
    budgetMs?: number;
}
export interface MCResult {
    probability_no_shortfall: number;
    median_terminal: number;
    p10_terminal: number;
    p90_terminal: number;
    fan_chart: FanChartRow[];
    terminal_distribution: number[];
    runs_completed: number;
    truncated: boolean;
    /** v0.4: institutional risk metrics. Present when mc_runs >= 200 && horizon >= 10. */
    risk_metrics?: RiskMetrics;
    /** v0.4: per-age inflation fan chart. Present when inflation_model === 'AR1'. */
    inflation_fan_chart?: FanChartRow[];
    /** v0.4: histogram of sampled death ages. Present when longevity_model !== 'Fixed'. */
    lifespan_distribution?: number[];
}
export declare class SeededRNG {
    private state;
    constructor(seed?: number);
    /** Returns a uniform random number in [0, 1). Mulberry32 algorithm. */
    next(): number;
    /** Returns a standard normal random variate via Box-Muller transform. */
    gaussian(): number;
}
export declare function generateReturn(rng: SeededRNG, mean: number, stdev: number, distribution: 'log-normal' | 'normal'): number;
export declare function extractPercentile(sortedArray: number[], p: number): number;
export declare function runMonteCarloSimulation(scenario: Scenario, projectionFn: ProjectionFn, options?: MCOptions): MCResult;
//# sourceMappingURL=monte-carlo.d.ts.map