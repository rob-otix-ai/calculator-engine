/**
 * Withdrawal Strategy Implementations
 *
 * Three strategies: Standard, Guyton-Klinger, Age-Banded.
 * Dispatched via calculateWithdrawal() based on scenario.withdrawal_strategy.
 *
 * Edge cases handled:
 * - Near-zero threshold ($100): prevents asymptotic depletion with high withdrawal rates
 * - Age-Banded gaps: return 0, log warning
 * - Age-Banded overlaps: first-match wins (Array.find behavior)
 * - GK oscillation: bounded by floor/ceiling — no special handling needed
 * - RMD override: caller responsibility (if RMD > withdrawal, caller uses RMD)
 */
import type { Scenario, SpendingPhase } from './types';
/** Balance below this threshold is treated as depleted (prevents asymptotic depletion). */
export declare const NEAR_ZERO_THRESHOLD = 100;
export interface GKState {
    /** The withdrawal amount from the first retirement year (nominal). */
    initialWithdrawal: number;
    /** The initial withdrawal rate (withdrawal / balance * 100). */
    initialRate: number;
    /** The most recent withdrawal amount (nominal). */
    priorWithdrawal: number;
}
export interface StandardWithdrawalParams {
    withdrawalMethod: Scenario['withdrawal_method'];
    withdrawalPct: number;
    withdrawalRealAmount: number;
    withdrawalFrequency: Scenario['withdrawal_frequency'];
    priorEndBalance: number;
    availableBalance: number;
    cpiIndex: number;
}
export interface GuytonKlingerWithdrawalParams {
    currentBalance: number;
    availableBalance: number;
    cpiIndex: number;
    /** GK state from prior year, or null if this is the first retirement year. */
    gkState: GKState | null;
    /** Standard withdrawal params used to compute the first-year withdrawal. */
    standardParams: StandardWithdrawalParams;
    /** Guardrail configuration from the scenario. */
    gkCeilingPct: number;
    gkFloorPct: number;
    gkProsperityThreshold: number;
    gkCapitalPreservationThreshold: number;
}
export interface AgeBandedWithdrawalParams {
    age: number;
    currentBalance: number;
    availableBalance: number;
    spendingPhases: SpendingPhase[];
    cpiIndex: number;
}
/**
 * Calculate withdrawal using the Standard strategy.
 *
 * - "Fixed % of prior-year end balance": priorEndBalance * (withdrawal_pct / 100)
 * - "Fixed real-dollar amount": withdrawal_real_amount * cpiIndex
 *
 * Monthly frequency is annualized (multiply by 12).
 * Result is capped at available balance.
 */
export declare function calculateStandardWithdrawal(params: StandardWithdrawalParams): number;
/**
 * Calculate withdrawal using the Guyton-Klinger guardrail strategy.
 *
 * First retirement year: compute via standard calculation to set the initial
 * withdrawal and initial rate.
 *
 * Subsequent years:
 *   current_rate = priorWithdrawal / currentBalance * 100
 *
 *   Prosperity rule (balance grew, rate dropped):
 *     if current_rate < initialRate * (1 - prosperity_threshold/100):
 *       withdrawal = priorWithdrawal * 1.10  (increase 10%)
 *
 *   Capital preservation rule (balance dropped, rate rose):
 *     if current_rate > initialRate * (1 + preservation_threshold/100):
 *       withdrawal = priorWithdrawal * 0.90  (decrease 10%)
 *
 *   Else: withdrawal = priorWithdrawal (no change)
 *
 *   Hard limits:
 *     max = initialWithdrawal * (1 + ceiling_pct/100)
 *     min = initialWithdrawal * (1 - floor_pct/100)
 *     withdrawal = clamp(withdrawal, min, max)
 *
 * Capped at available balance.
 */
export declare function calculateGuytonKlingerWithdrawal(params: GuytonKlingerWithdrawalParams): {
    withdrawal: number;
    gkState: GKState;
};
/**
 * Calculate withdrawal using the Age-Banded strategy.
 *
 * Finds the first spending phase where start_age <= age <= end_age.
 * - If mode = 'percent': withdrawal = currentBalance * (amount / 100)
 * - If mode = 'amount': withdrawal = amount * cpiIndex (inflation-adjusted)
 *
 * If no phase covers the current age, returns 0 and logs a warning (gap).
 * If phases overlap, the first match wins (Array.find behavior).
 */
export declare function calculateAgeBandedWithdrawal(params: AgeBandedWithdrawalParams): number;
/** Parameters for the main dispatcher, combining scenario config and simulation state. */
export interface WithdrawalParams {
    /** The full scenario configuration. */
    scenario: Scenario;
    /** Current simulation state. */
    state: {
        age: number;
        currentBalance: number;
        priorEndBalance: number;
        availableBalance: number;
        cpiIndex: number;
        gkState: GKState | null;
    };
}
/** Result from the withdrawal dispatcher. */
export interface WithdrawalResult {
    /** The withdrawal amount for this year (capped at available balance). */
    withdrawal: number;
    /** Updated GK state (only present for Guyton-Klinger strategy). */
    gkState?: GKState;
    /** True if the balance is below the near-zero threshold post-withdrawal. */
    effectivelyDepleted: boolean;
}
/**
 * Main withdrawal dispatcher.
 *
 * Routes to the correct strategy based on scenario.withdrawal_strategy, then
 * applies the near-zero depletion threshold ($100).
 */
export declare function calculateWithdrawal(scenario: Scenario, state: WithdrawalParams['state']): WithdrawalResult;
//# sourceMappingURL=withdrawal.d.ts.map