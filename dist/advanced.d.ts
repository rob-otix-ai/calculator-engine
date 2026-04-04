/**
 * Advanced Mode Cash Waterfall Engine
 *
 * Tracks individual financial items (cash, investments, properties, loans,
 * salary, pensions, etc.) separately with a cash account as the central
 * reservoir. Implements the 9-step cash waterfall per spec section 14.
 *
 * Resolution order per year:
 *   1. Income phase (salary, pension, SS, rental, cash yield)
 *   2. Mandatory debits (mortgages, loan interest/principal)
 *   3. Investment sales (single/staggered profit-taking)
 *   4. Liquidity events
 *   5. Contributions (pre-retirement)
 *   6. Withdrawal demand (post-retirement)
 *   7. Tax settlement
 *   8. Insolvency check
 *   9. Investment growth (per-item rates, fees, performance fees)
 */
import type { Scenario, TimelineRow, Metrics } from './types';
export declare function runAdvancedProjection(scenario: Scenario, overrideReturns?: number[]): {
    timeline: TimelineRow[];
    metrics: Metrics;
};
//# sourceMappingURL=advanced.d.ts.map