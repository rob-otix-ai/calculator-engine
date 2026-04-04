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
import { getLogger } from './logger';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Balance below this threshold is treated as depleted (prevents asymptotic depletion). */
export const NEAR_ZERO_THRESHOLD = 100;
// ---------------------------------------------------------------------------
// 1. Standard Withdrawal
// ---------------------------------------------------------------------------
/**
 * Calculate withdrawal using the Standard strategy.
 *
 * - "Fixed % of prior-year end balance": priorEndBalance * (withdrawal_pct / 100)
 * - "Fixed real-dollar amount": withdrawal_real_amount * cpiIndex
 *
 * Monthly frequency is annualized (multiply by 12).
 * Result is capped at available balance.
 */
export function calculateStandardWithdrawal(params) {
    const { withdrawalMethod, withdrawalPct, withdrawalRealAmount, withdrawalFrequency, priorEndBalance, availableBalance, cpiIndex, } = params;
    let withdrawal;
    if (withdrawalMethod === 'Fixed % of prior-year end balance') {
        withdrawal = priorEndBalance * (withdrawalPct / 100);
    }
    else {
        // Fixed real-dollar amount, inflation-adjusted
        withdrawal = withdrawalRealAmount * cpiIndex;
    }
    // Frequency conversion: if the amount is expressed as monthly, annualize it
    if (withdrawalFrequency === 'Monthly') {
        withdrawal *= 12;
    }
    // Cap at available balance
    return Math.min(withdrawal, Math.max(0, availableBalance));
}
// ---------------------------------------------------------------------------
// 2. Guyton-Klinger Withdrawal
// ---------------------------------------------------------------------------
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
export function calculateGuytonKlingerWithdrawal(params) {
    const { currentBalance, availableBalance, gkState, standardParams, gkCeilingPct, gkFloorPct, gkProsperityThreshold, gkCapitalPreservationThreshold, } = params;
    // --- First retirement year: initialize GK state ---
    if (gkState === null) {
        const firstWithdrawal = calculateStandardWithdrawal(standardParams);
        // Guard against zero balance (division by zero for initial rate)
        const initialRate = currentBalance > 0 ? (firstWithdrawal / currentBalance) * 100 : 0;
        const cappedWithdrawal = Math.min(firstWithdrawal, Math.max(0, availableBalance));
        return {
            withdrawal: cappedWithdrawal,
            gkState: {
                initialWithdrawal: firstWithdrawal,
                initialRate,
                priorWithdrawal: cappedWithdrawal,
            },
        };
    }
    // --- Subsequent years ---
    const { initialWithdrawal, initialRate, priorWithdrawal } = gkState;
    // Guard: if balance is zero or near-zero, no meaningful withdrawal
    if (currentBalance <= 0) {
        return {
            withdrawal: 0,
            gkState: {
                initialWithdrawal,
                initialRate,
                priorWithdrawal: 0,
            },
        };
    }
    const currentRate = (priorWithdrawal / currentBalance) * 100;
    let withdrawal = priorWithdrawal;
    // Prosperity rule: balance grew enough that the rate dropped below threshold
    const prosperityBound = initialRate * (1 - gkProsperityThreshold / 100);
    if (currentRate < prosperityBound) {
        withdrawal = priorWithdrawal * 1.1;
    }
    // Capital preservation rule: balance dropped enough that the rate exceeded threshold
    const preservationBound = initialRate * (1 + gkCapitalPreservationThreshold / 100);
    if (currentRate > preservationBound) {
        withdrawal = priorWithdrawal * 0.9;
    }
    // Hard limits (ceiling and floor relative to initial withdrawal)
    const maxWithdrawal = initialWithdrawal * (1 + gkCeilingPct / 100);
    const minWithdrawal = initialWithdrawal * (1 - gkFloorPct / 100);
    withdrawal = Math.max(minWithdrawal, Math.min(maxWithdrawal, withdrawal));
    // Cap at available balance
    const cappedWithdrawal = Math.min(withdrawal, Math.max(0, availableBalance));
    return {
        withdrawal: cappedWithdrawal,
        gkState: {
            initialWithdrawal,
            initialRate,
            priorWithdrawal: cappedWithdrawal,
        },
    };
}
// ---------------------------------------------------------------------------
// 3. Age-Banded Withdrawal
// ---------------------------------------------------------------------------
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
export function calculateAgeBandedWithdrawal(params) {
    const { age, currentBalance, availableBalance, spendingPhases, cpiIndex } = params;
    // Find the first phase that covers this age
    const phase = spendingPhases.find((p) => age >= p.start_age && age <= p.end_age);
    if (!phase) {
        // Gap in spending phases — no withdrawal for this year
        const log = getLogger();
        log.warn('Age-Banded gap: no spending phase covers age', { age });
        return 0;
    }
    let withdrawal;
    if (phase.mode === 'percent') {
        withdrawal = currentBalance * (phase.amount / 100);
    }
    else {
        // mode === 'amount': fixed real-dollar amount, inflation-adjusted
        withdrawal = phase.amount * cpiIndex;
    }
    // Cap at available balance
    return Math.min(withdrawal, Math.max(0, availableBalance));
}
/**
 * Main withdrawal dispatcher.
 *
 * Routes to the correct strategy based on scenario.withdrawal_strategy, then
 * applies the near-zero depletion threshold ($100).
 */
export function calculateWithdrawal(scenario, state) {
    const { withdrawal_strategy, withdrawal_method, withdrawal_pct, withdrawal_real_amount, withdrawal_frequency, gk_ceiling_pct, gk_floor_pct, gk_prosperity_threshold, gk_capital_preservation_threshold, spending_phases, } = scenario;
    const { age, currentBalance, priorEndBalance, availableBalance, cpiIndex, gkState } = state;
    // Check near-zero threshold before computing — if already depleted, no withdrawal
    if (currentBalance < NEAR_ZERO_THRESHOLD && currentBalance >= 0) {
        return {
            withdrawal: 0,
            gkState: gkState !== null && gkState !== void 0 ? gkState : undefined,
            effectivelyDepleted: true,
        };
    }
    const standardParams = {
        withdrawalMethod: withdrawal_method,
        withdrawalPct: withdrawal_pct,
        withdrawalRealAmount: withdrawal_real_amount,
        withdrawalFrequency: withdrawal_frequency,
        priorEndBalance,
        availableBalance,
        cpiIndex,
    };
    let withdrawal;
    let updatedGkState;
    switch (withdrawal_strategy) {
        case 'Standard': {
            withdrawal = calculateStandardWithdrawal(standardParams);
            break;
        }
        case 'Guyton-Klinger': {
            const gkResult = calculateGuytonKlingerWithdrawal({
                currentBalance,
                availableBalance,
                cpiIndex,
                gkState,
                standardParams,
                gkCeilingPct: gk_ceiling_pct,
                gkFloorPct: gk_floor_pct,
                gkProsperityThreshold: gk_prosperity_threshold,
                gkCapitalPreservationThreshold: gk_capital_preservation_threshold,
            });
            withdrawal = gkResult.withdrawal;
            updatedGkState = gkResult.gkState;
            break;
        }
        case 'Age-Banded': {
            withdrawal = calculateAgeBandedWithdrawal({
                age,
                currentBalance,
                availableBalance,
                spendingPhases: spending_phases,
                cpiIndex,
            });
            break;
        }
        default: {
            // Exhaustive check — TypeScript should catch this at compile time
            const _exhaustive = withdrawal_strategy;
            throw new Error(`Unknown withdrawal strategy: ${_exhaustive}`);
        }
    }
    const log = getLogger();
    log.debug('Withdrawal calculated', { strategy: withdrawal_strategy, amount: withdrawal });
    // Near-zero threshold: if balance after withdrawal would be below $100, treat as depleted
    const balanceAfterWithdrawal = availableBalance - withdrawal;
    const effectivelyDepleted = balanceAfterWithdrawal >= 0 && balanceAfterWithdrawal < NEAR_ZERO_THRESHOLD;
    return {
        withdrawal,
        gkState: updatedGkState,
        effectivelyDepleted,
    };
}
