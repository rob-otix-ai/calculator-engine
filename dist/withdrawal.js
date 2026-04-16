/**
 * Withdrawal Strategy Implementations
 *
 * Four strategies: Standard, Guyton-Klinger, Age-Banded, Fixed-Pct.
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
            // No event in the seed year — falls back to 'standard' in the dispatcher.
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
    let event;
    // Prosperity rule: balance grew enough that the rate dropped below threshold
    const prosperityBound = initialRate * (1 - gkProsperityThreshold / 100);
    if (currentRate < prosperityBound) {
        withdrawal = priorWithdrawal * 1.1;
        event = 'raise';
    }
    // Capital preservation rule: balance dropped enough that the rate exceeded threshold
    const preservationBound = initialRate * (1 + gkCapitalPreservationThreshold / 100);
    if (currentRate > preservationBound) {
        withdrawal = priorWithdrawal * 0.9;
        event = 'cut';
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
        event,
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
 *
 * Returns both the withdrawal amount and whether a band matched, so callers
 * can tag the resulting TimelineRow with a `band` withdrawal_event.
 */
export function calculateAgeBandedWithdrawal(params) {
    const { age, currentBalance, availableBalance, spendingPhases, cpiIndex } = params;
    // Find the first phase that covers this age
    const phase = spendingPhases.find((p) => age >= p.start_age && age <= p.end_age);
    if (!phase) {
        // Gap in spending phases — no withdrawal for this year
        const log = getLogger();
        log.warn('Age-Banded gap: no spending phase covers age', { age });
        return { withdrawal: 0, matched: false };
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
    return {
        withdrawal: Math.min(withdrawal, Math.max(0, availableBalance)),
        matched: true,
    };
}
// ---------------------------------------------------------------------------
// 4. Fixed-Pct Withdrawal (CONTRACT-016 / ADR-026)
// ---------------------------------------------------------------------------
/**
 * Calculate withdrawal using the Fixed-Pct strategy.
 *
 *   withdrawal = priorEndBalance * (fixed_withdrawal_pct / 100)
 *
 * Result is clamped to >= 0, and (if availableBalance is supplied) capped at
 * the available balance. Per CONTRACT-016 there is no event tag for this
 * strategy — the dispatcher will record `withdrawal_event = 'standard'`.
 */
export function calculateFixedPctWithdrawal(params) {
    const { fixed_withdrawal_pct, priorEndBalance, availableBalance } = params;
    const raw = priorEndBalance * (fixed_withdrawal_pct / 100);
    const clamped = Math.max(0, raw);
    if (availableBalance == null)
        return clamped;
    return Math.min(clamped, Math.max(0, availableBalance));
}
/**
 * Main withdrawal dispatcher.
 *
 * Routes to the correct strategy based on scenario.withdrawal_strategy, then
 * applies the near-zero depletion threshold ($100).
 *
 * Maps the new CONTRACT-016 Guyton-Klinger field names
 * (`guyton_guard_up_pct`, `guyton_guard_down_pct`, `guyton_cut_pct`,
 * `guyton_raise_pct`) onto the engine's existing `gk_*` internals when
 * supplied, falling back to the legacy values otherwise.
 */
export function calculateWithdrawal(scenario, state) {
    const { withdrawal_strategy, withdrawal_method, withdrawal_pct, withdrawal_real_amount, withdrawal_frequency, gk_ceiling_pct, gk_floor_pct, gk_prosperity_threshold, gk_capital_preservation_threshold, guyton_guard_up_pct, guyton_guard_down_pct, spending_phases, fixed_withdrawal_pct, } = scenario;
    const { age, currentBalance, priorEndBalance, availableBalance, cpiIndex, gkState } = state;
    // Check near-zero threshold before computing — if already depleted, no withdrawal
    if (currentBalance < NEAR_ZERO_THRESHOLD && currentBalance >= 0) {
        return {
            withdrawal: 0,
            gkState: gkState !== null && gkState !== void 0 ? gkState : undefined,
            effectivelyDepleted: true,
            event: 'standard',
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
    let event = 'standard';
    switch (withdrawal_strategy) {
        case 'Standard': {
            withdrawal = calculateStandardWithdrawal(standardParams);
            break;
        }
        case 'Guyton-Klinger': {
            // CONTRACT-016 → engine internal mapping. Prefer the new schema names
            // when supplied; fall back to legacy `gk_*` fields otherwise.
            const ceilingPct = guyton_guard_up_pct !== null && guyton_guard_up_pct !== void 0 ? guyton_guard_up_pct : gk_ceiling_pct;
            const floorPct = guyton_guard_down_pct !== null && guyton_guard_down_pct !== void 0 ? guyton_guard_down_pct : gk_floor_pct;
            // The "thresholds" already mean "guard band as a % of initial rate" in
            // the existing engine implementation — re-use guyton_guard_* when present
            // for both the hard limits and the trigger points so the behaviour stays
            // self-consistent with the new schema's semantics.
            const prosperityThreshold = guyton_guard_down_pct !== null && guyton_guard_down_pct !== void 0 ? guyton_guard_down_pct : gk_prosperity_threshold;
            const preservationThreshold = guyton_guard_up_pct !== null && guyton_guard_up_pct !== void 0 ? guyton_guard_up_pct : gk_capital_preservation_threshold;
            const gkResult = calculateGuytonKlingerWithdrawal({
                currentBalance,
                availableBalance,
                cpiIndex,
                gkState,
                standardParams,
                gkCeilingPct: ceilingPct,
                gkFloorPct: floorPct,
                gkProsperityThreshold: prosperityThreshold,
                gkCapitalPreservationThreshold: preservationThreshold,
            });
            withdrawal = gkResult.withdrawal;
            updatedGkState = gkResult.gkState;
            if (gkResult.event)
                event = gkResult.event;
            break;
        }
        case 'Age-Banded': {
            const banded = calculateAgeBandedWithdrawal({
                age,
                currentBalance,
                availableBalance,
                spendingPhases: spending_phases,
                cpiIndex,
            });
            withdrawal = banded.withdrawal;
            if (banded.matched)
                event = 'band';
            break;
        }
        case 'Fixed-Pct': {
            // Default to 4% (matches CONTRACT-016 schema default) when the field is
            // absent on a legacy scenario.
            withdrawal = calculateFixedPctWithdrawal({
                fixed_withdrawal_pct: fixed_withdrawal_pct !== null && fixed_withdrawal_pct !== void 0 ? fixed_withdrawal_pct : 4,
                priorEndBalance,
                availableBalance,
            });
            // Per CONTRACT-016 there is no event tag for Fixed-Pct → 'standard'.
            break;
        }
        default: {
            // Exhaustive check — TypeScript should catch this at compile time
            const _exhaustive = withdrawal_strategy;
            throw new Error(`Unknown withdrawal strategy: ${_exhaustive}`);
        }
    }
    const log = getLogger();
    log.debug('Withdrawal calculated', { strategy: withdrawal_strategy, amount: withdrawal, event });
    // Near-zero threshold: if balance after withdrawal would be below $100, treat as depleted
    const balanceAfterWithdrawal = availableBalance - withdrawal;
    const effectivelyDepleted = balanceAfterWithdrawal >= 0 && balanceAfterWithdrawal < NEAR_ZERO_THRESHOLD;
    return {
        withdrawal,
        gkState: updatedGkState,
        effectivelyDepleted,
        event,
    };
}
