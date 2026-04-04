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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Balance below this threshold is treated as depleted (prevents asymptotic depletion). */
export const NEAR_ZERO_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Guyton-Klinger State
// ---------------------------------------------------------------------------

export interface GKState {
  /** The withdrawal amount from the first retirement year (nominal). */
  initialWithdrawal: number;
  /** The initial withdrawal rate (withdrawal / balance * 100). */
  initialRate: number;
  /** The most recent withdrawal amount (nominal). */
  priorWithdrawal: number;
}

// ---------------------------------------------------------------------------
// Standard Withdrawal Parameters
// ---------------------------------------------------------------------------

export interface StandardWithdrawalParams {
  withdrawalMethod: Scenario['withdrawal_method'];
  withdrawalPct: number;
  withdrawalRealAmount: number;
  withdrawalFrequency: Scenario['withdrawal_frequency'];
  priorEndBalance: number;
  availableBalance: number;
  cpiIndex: number;
}

// ---------------------------------------------------------------------------
// Guyton-Klinger Withdrawal Parameters
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Age-Banded Withdrawal Parameters
// ---------------------------------------------------------------------------

export interface AgeBandedWithdrawalParams {
  age: number;
  currentBalance: number;
  availableBalance: number;
  spendingPhases: SpendingPhase[];
  cpiIndex: number;
}

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
export function calculateStandardWithdrawal(
  params: StandardWithdrawalParams,
): number {
  const {
    withdrawalMethod,
    withdrawalPct,
    withdrawalRealAmount,
    withdrawalFrequency,
    priorEndBalance,
    availableBalance,
    cpiIndex,
  } = params;

  let withdrawal: number;

  if (withdrawalMethod === 'Fixed % of prior-year end balance') {
    withdrawal = priorEndBalance * (withdrawalPct / 100);
  } else {
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
export function calculateGuytonKlingerWithdrawal(
  params: GuytonKlingerWithdrawalParams,
): { withdrawal: number; gkState: GKState } {
  const {
    currentBalance,
    availableBalance,
    gkState,
    standardParams,
    gkCeilingPct,
    gkFloorPct,
    gkProsperityThreshold,
    gkCapitalPreservationThreshold,
  } = params;

  // --- First retirement year: initialize GK state ---
  if (gkState === null) {
    const firstWithdrawal = calculateStandardWithdrawal(standardParams);

    // Guard against zero balance (division by zero for initial rate)
    const initialRate =
      currentBalance > 0 ? (firstWithdrawal / currentBalance) * 100 : 0;

    const cappedWithdrawal = Math.min(
      firstWithdrawal,
      Math.max(0, availableBalance),
    );

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
  const preservationBound =
    initialRate * (1 + gkCapitalPreservationThreshold / 100);
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
export function calculateAgeBandedWithdrawal(
  params: AgeBandedWithdrawalParams,
): number {
  const { age, currentBalance, availableBalance, spendingPhases, cpiIndex } =
    params;

  // Find the first phase that covers this age
  const phase = spendingPhases.find(
    (p) => age >= p.start_age && age <= p.end_age,
  );

  if (!phase) {
    // Gap in spending phases — no withdrawal for this year
    console.warn(
      `[withdrawal] Age-Banded: no spending phase covers age ${age}. Withdrawal defaults to $0. ` +
        `Check for gaps in spending phase definitions.`,
    );
    return 0;
  }

  let withdrawal: number;

  if (phase.mode === 'percent') {
    withdrawal = currentBalance * (phase.amount / 100);
  } else {
    // mode === 'amount': fixed real-dollar amount, inflation-adjusted
    withdrawal = phase.amount * cpiIndex;
  }

  // Cap at available balance
  return Math.min(withdrawal, Math.max(0, availableBalance));
}

// ---------------------------------------------------------------------------
// 4. Main Dispatcher
// ---------------------------------------------------------------------------

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
export function calculateWithdrawal(
  scenario: Scenario,
  state: WithdrawalParams['state'],
): WithdrawalResult {
  const {
    withdrawal_strategy,
    withdrawal_method,
    withdrawal_pct,
    withdrawal_real_amount,
    withdrawal_frequency,
    gk_ceiling_pct,
    gk_floor_pct,
    gk_prosperity_threshold,
    gk_capital_preservation_threshold,
    spending_phases,
  } = scenario;

  const { age, currentBalance, priorEndBalance, availableBalance, cpiIndex, gkState } =
    state;

  // Check near-zero threshold before computing — if already depleted, no withdrawal
  if (currentBalance < NEAR_ZERO_THRESHOLD && currentBalance >= 0) {
    return {
      withdrawal: 0,
      gkState: gkState ?? undefined,
      effectivelyDepleted: true,
    };
  }

  const standardParams: StandardWithdrawalParams = {
    withdrawalMethod: withdrawal_method,
    withdrawalPct: withdrawal_pct,
    withdrawalRealAmount: withdrawal_real_amount,
    withdrawalFrequency: withdrawal_frequency,
    priorEndBalance,
    availableBalance,
    cpiIndex,
  };

  let withdrawal: number;
  let updatedGkState: GKState | undefined;

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
      const _exhaustive: never = withdrawal_strategy;
      throw new Error(`Unknown withdrawal strategy: ${_exhaustive}`);
    }
  }

  // Near-zero threshold: if balance after withdrawal would be below $100, treat as depleted
  const balanceAfterWithdrawal = availableBalance - withdrawal;
  const effectivelyDepleted =
    balanceAfterWithdrawal >= 0 && balanceAfterWithdrawal < NEAR_ZERO_THRESHOLD;

  return {
    withdrawal,
    gkState: updatedGkState,
    effectivelyDepleted,
  };
}
