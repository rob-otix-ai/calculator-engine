/**
 * Deterministic Year-by-Year Projection Engine (Basic Mode)
 *
 * Computes a full retirement projection from current_age to end_age,
 * producing a TimelineRow per year and aggregate Metrics.
 *
 * The `overrideReturns` parameter allows Monte Carlo to inject randomized
 * annual returns — when provided, overrideReturns[yearIndex] is used
 * instead of nominal_return_pct / 100.
 */
import type { Scenario, TimelineRow, Metrics } from './types';
export declare function runProjection(scenario: Scenario, overrideReturns?: number[]): {
    timeline: TimelineRow[];
    metrics: Metrics;
};
//# sourceMappingURL=projection.d.ts.map