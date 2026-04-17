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

import type {
  Scenario,
  TimelineRow,
  Metrics,
  IncomeSource,
  WithdrawalEvent,
} from './types';
import { CadenceMultiplier } from './defaults';
import { calculateTax, getRMDAmount, calculateRothConversion } from './tax';
import {
  calculateWithdrawal,
  NEAR_ZERO_THRESHOLD,
  type GKState,
} from './withdrawal';
import { getLogger } from './logger';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Approximate birth year from current_age.
 * Used for RMD start-age determination. We use a fixed "current year" proxy
 * derived from the scenario (not wall-clock time) so results stay deterministic.
 */
function estimateBirthYear(currentAge: number): number {
  // Use 2025 as reference year (constant for determinism)
  return 2025 - currentAge;
}

/**
 * Compute desired spending for the readiness score denominator.
 * Only meaningful for "Fixed real-dollar amount"; for "Fixed %" we mirror
 * the actual withdrawal so the ratio is 1:1 (capped at 200 by spec).
 */
function computeDesiredSpending(
  scenario: Scenario,
  priorEndBalance: number,
  cpiIndex: number,
): number {
  const {
    withdrawal_method,
    withdrawal_pct,
    withdrawal_real_amount,
    withdrawal_frequency,
    withdrawal_strategy,
    fixed_withdrawal_pct,
  } = scenario;

  // Age-Banded has its own target (handled elsewhere), but for Standard / GK
  // the desired amount before capping is what matters.
  if (withdrawal_strategy === 'Age-Banded') {
    // For age-banded the "desired" equals the phase amount — we compute this
    // in the main loop where we know the age.
    return 0; // sentinel — caller overrides
  }

  // Fixed-Pct: the desired amount is simply pct * prior-year end balance.
  if (withdrawal_strategy === 'Fixed-Pct') {
    const pct = fixed_withdrawal_pct ?? 4;
    return Math.max(0, priorEndBalance * (pct / 100));
  }

  let desired: number;
  if (withdrawal_method === 'Fixed % of prior-year end balance') {
    desired = priorEndBalance * (withdrawal_pct / 100);
  } else {
    desired = withdrawal_real_amount * cpiIndex;
  }

  if (withdrawal_frequency === 'Monthly') {
    desired *= 12;
  }

  return desired;
}

// =============================================================================
// Main Projection
// =============================================================================

export function runProjection(
  scenario: Scenario,
  overrideReturns?: number[],
): { timeline: TimelineRow[]; metrics: Metrics } {
  const {
    current_age,
    retirement_age,
    end_age,
    current_balance,
    contrib_amount,
    contrib_cadence,
    contrib_increase_pct,
    nominal_return_pct,
    inflation_pct,
    inflation_enabled,
    fee_pct,
    perf_fee_pct,
    enable_taxes,
    effective_tax_rate_pct,
    tax_jurisdiction,
    tax_config,
    tax_deferred_pct,
    planning_mode,
    partner_current_age,
    partner_income_sources,
    income_sources,
    liquidity_events,
    // assets — not used in basic-mode projection (estate_pct is advanced-mode only)
    black_swan_enabled,
    black_swan_age,
    black_swan_loss_pct,
    spending_phases,
    withdrawal_strategy,
  } = scenario;

  const log = getLogger();
  log.info('Starting projection', {
    currentAge: current_age,
    retirementAge: retirement_age,
    endAge: end_age,
    detailMode: scenario.detail_mode,
  });

  const timeline: TimelineRow[] = [];

  // -------------------------------------------------------------------------
  // v0.4: resolve inflation rate and effective return for the deterministic
  // projection. Back-compat: when these new fields are absent, we fall back
  // to the existing `inflation_pct` / `nominal_return_pct` so the v0.3
  // behaviour is byte-identical.
  // -------------------------------------------------------------------------
  const inflationModel = scenario.inflation_model ?? 'Flat';
  const effectiveInflationPct =
    inflationModel === 'AR1'
      ? scenario.inflation_long_run_mean_pct ?? inflation_pct
      : inflation_pct;

  const assetClasses = scenario.asset_classes ?? [];
  const multiAsset = assetClasses.length > 0;
  // Weighted-mean expected return across the asset classes, in decimal.
  const weightedMeanReturn = multiAsset
    ? assetClasses.reduce(
        (acc, ac) => acc + (ac.weight_pct / 100) * (ac.expected_return_pct / 100),
        0,
      )
    : nominal_return_pct / 100;

  // Running state
  let prevEndBalance = current_balance;
  let cpiIndex = 1.0;
  let firstShortfallAge: number | null = null;
  let gkState: GKState | null = null;

  // Accumulators for Metrics
  let totalContributions = 0;
  let totalWithdrawals = 0;
  let totalFees = 0;
  let totalTaxes = 0;
  let totalDesiredSpending = 0;
  let totalActualWithdrawals = 0;

  const birthYear = estimateBirthYear(current_age);
  const partnerAgeOffset =
    planning_mode === 'Couple' && partner_current_age != null
      ? partner_current_age - current_age
      : 0;

  // High-water mark for performance fee
  let highWaterMark = current_balance;

  for (let age = current_age; age <= end_age; age++) {
    const yearIndex = age - current_age;
    const startBalance = yearIndex === 0 ? current_balance : prevEndBalance;

    // Update CPI index (starts at 1.0 for year 0)
    if (yearIndex > 0 && inflation_enabled) {
      cpiIndex *= 1 + effectiveInflationPct / 100;
    }

    // ------------------------------------------------------------------
    // 1. CONTRIBUTIONS (pre-retirement only)
    // ------------------------------------------------------------------
    let contributions = 0;
    if (age < retirement_age) {
      const baseContrib = contrib_amount * CadenceMultiplier[contrib_cadence];
      contributions =
        baseContrib * Math.pow(1 + contrib_increase_pct / 100, yearIndex);
    }

    // ------------------------------------------------------------------
    // 2. INCOME SOURCES
    // ------------------------------------------------------------------
    let netIncome = 0;
    let totalIncomeTaxes = 0;

    const processIncomeSource = (
      source: IncomeSource,
      effectiveAge: number,
    ) => {
      if (!source.enabled) return;
      if (effectiveAge < source.start_age || effectiveAge > source.end_age)
        return;

      let annual =
        source.amount * (source.frequency === 'Monthly' ? 12 : 1);

      if (source.inflation_adjusted) {
        annual *= cpiIndex;
      }

      let incomeTax = 0;
      if (source.taxable) {
        incomeTax = annual * (source.tax_rate / 100);
      }

      netIncome += annual - incomeTax;
      totalIncomeTaxes += incomeTax;
    };

    // Primary income sources
    for (const src of income_sources) {
      processIncomeSource(src, age);
    }

    // Partner income sources (Couple mode)
    if (planning_mode === 'Couple') {
      const partnerAge = age + partnerAgeOffset;
      for (const src of partner_income_sources) {
        processIncomeSource(src, partnerAge);
      }
    }

    // ------------------------------------------------------------------
    // 3. LIQUIDITY EVENTS
    // ------------------------------------------------------------------
    let liquidityNet = 0;
    let liquidityEventTaxes = 0;

    for (const event of liquidity_events) {
      if (!event.enabled) continue;

      let fires = false;
      if (event.recurrence === 'One-Time') {
        fires = age === event.start_age;
      } else {
        fires = age >= event.start_age && age <= event.end_age;
      }

      if (!fires) continue;

      let eventAmount = event.amount;
      if (event.recurrence === 'Monthly') {
        eventAmount *= 12;
      }

      if (event.type === 'Credit') {
        liquidityNet += eventAmount;
      } else {
        liquidityNet -= eventAmount;
      }

      if (event.taxable) {
        const eventTax = eventAmount * (event.tax_rate / 100);
        liquidityEventTaxes += eventTax;
      }
    }

    // ------------------------------------------------------------------
    // 4. RMD (US only, if enabled)
    // ------------------------------------------------------------------
    let rmdAmount = 0;
    if (
      tax_jurisdiction === 'US' &&
      tax_config?.enable_rmd
    ) {
      const taxDeferredBalance = startBalance * (tax_deferred_pct / 100);
      rmdAmount = getRMDAmount(age, taxDeferredBalance, birthYear);
    }

    // ------------------------------------------------------------------
    // 5. ROTH CONVERSIONS (US only, if enabled)
    // ------------------------------------------------------------------
    let rothAmount = 0;
    if (
      tax_jurisdiction === 'US' &&
      tax_config
    ) {
      rothAmount = calculateRothConversion(age, tax_config);
    }

    // ------------------------------------------------------------------
    // 6. WITHDRAWALS (post-retirement only)
    // ------------------------------------------------------------------
    let withdrawal = 0;
    let desiredSpending = 0;
    let shortfallWithdrawals = 0;
    let withdrawalEvent: WithdrawalEvent = 'standard';

    if (age >= retirement_age) {
      // Available balance for withdrawal cap
      const availableBalance = Math.max(
        0,
        startBalance + contributions + netIncome + liquidityNet,
      );

      const priorEndBalance = yearIndex === 0 ? current_balance : prevEndBalance;

      // Compute desired spending (before capping)
      desiredSpending = computeDesiredSpending(scenario, priorEndBalance, cpiIndex);

      // Override for Age-Banded: compute the uncapped phase amount
      if (withdrawal_strategy === 'Age-Banded') {
        const phase = spending_phases.find(
          (p) => age >= p.start_age && age <= p.end_age,
        );
        if (phase) {
          desiredSpending =
            phase.mode === 'percent'
              ? startBalance * (phase.amount / 100)
              : phase.amount * cpiIndex;
        } else {
          desiredSpending = 0;
        }
      }

      // Call withdrawal calculator
      const wResult = calculateWithdrawal(scenario, {
        age,
        currentBalance: startBalance,
        priorEndBalance,
        availableBalance,
        cpiIndex,
        gkState,
      });

      withdrawal = wResult.withdrawal;
      withdrawalEvent = wResult.event;
      if (wResult.gkState) {
        gkState = wResult.gkState;
      }

      // RMD override: if RMD exceeds calculated withdrawal, use RMD
      if (rmdAmount > withdrawal) {
        desiredSpending = Math.max(desiredSpending, rmdAmount);
        withdrawal = Math.min(rmdAmount, availableBalance);
      }

      // Cap at available balance
      withdrawal = Math.min(withdrawal, availableBalance);

      // Track shortfall
      shortfallWithdrawals = Math.max(0, desiredSpending - withdrawal);

      // Near-zero depletion: if post-withdrawal balance < $100, drain fully
      if (wResult.effectivelyDepleted) {
        withdrawal = Math.min(availableBalance, withdrawal);
      }
    }

    // ------------------------------------------------------------------
    // 7. FEES
    // ------------------------------------------------------------------
    const managementFee = startBalance * (fee_pct / 100);

    // Gross gain for performance fee (before fees, using the year's return rate).
    // v0.4: in multi-asset mode without an override, we use the weighted-mean
    // expected return so deterministic output remains consistent with the MC
    // mean path.
    const returnRate =
      overrideReturns?.[yearIndex] ?? weightedMeanReturn;
    const grossGain = startBalance * returnRate;

    let perfFee = 0;
    if (perf_fee_pct > 0 && grossGain > 0) {
      // High-water mark: only charge perf fee on gains above the mark
      const currentValue = startBalance + grossGain;
      if (currentValue > highWaterMark) {
        perfFee = (currentValue - highWaterMark) * (perf_fee_pct / 100);
        highWaterMark = currentValue;
      }
    }

    const fees = managementFee + perfFee;

    // ------------------------------------------------------------------
    // 8. TAXES
    // ------------------------------------------------------------------
    let taxes = 0;
    if (enable_taxes) {
      const taxableWithdrawal = age >= retirement_age ? withdrawal : 0;
      const totalTaxableIncome =
        taxableWithdrawal + rothAmount + liquidityEventTaxes;

      if (tax_config && tax_jurisdiction !== 'Custom') {
        taxes = calculateTax(totalTaxableIncome, tax_config, tax_jurisdiction);
      } else {
        // Custom / fallback: flat effective rate
        taxes = totalTaxableIncome * (effective_tax_rate_pct / 100);
      }
    }

    // Income taxes are tracked separately and already deducted from netIncome
    // Add liquidity event taxes to the total taxes column
    taxes += liquidityEventTaxes;

    // ------------------------------------------------------------------
    // 9. GROWTH
    // ------------------------------------------------------------------
    const netFlows =
      contributions + netIncome + liquidityNet - withdrawal - fees - taxes;

    let growth: number;
    let blackSwanLoss = 0;

    // ------------------------------------------------------------------
    // 10. BLACK SWAN
    // ------------------------------------------------------------------
    if (black_swan_enabled && age === black_swan_age) {
      // Override growth with the loss
      blackSwanLoss = startBalance * (black_swan_loss_pct / 100);
      growth = -blackSwanLoss;
      log.warn('Black swan event triggered', { age, lossPct: black_swan_loss_pct });
    } else {
      // Mid-year cash flow assumption:
      // growth = startBalance * return + netFlows * return * 0.5
      const effectiveReturn =
        overrideReturns?.[yearIndex] ?? nominal_return_pct / 100;
      growth =
        startBalance * effectiveReturn + netFlows * effectiveReturn * 0.5;
    }

    // ------------------------------------------------------------------
    // 11. END BALANCE
    // ------------------------------------------------------------------
    let endBalance = startBalance + netFlows + growth;

    // Track shortfall before flooring
    if (endBalance < 0 && age >= retirement_age && firstShortfallAge === null) {
      firstShortfallAge = age;
      log.warn('First shortfall detected', { age, endBalance });
    }

    // Near-zero depletion threshold (edge case: asymptotic drain)
    if (
      endBalance >= 0 &&
      endBalance < NEAR_ZERO_THRESHOLD &&
      age >= retirement_age &&
      firstShortfallAge === null
    ) {
      firstShortfallAge = age;
      log.warn('Near-zero depletion shortfall', { age, endBalance });
    }

    // Floor at 0 in basic mode
    endBalance = Math.max(endBalance, 0);

    const endBalanceReal = cpiIndex > 0 ? endBalance / cpiIndex : endBalance;

    // ------------------------------------------------------------------
    // Build TimelineRow
    // ------------------------------------------------------------------
    const row: TimelineRow = {
      age,
      start_balance_nominal: startBalance,
      contributions,
      liquidity_net: liquidityNet,
      income: netIncome,
      withdrawals: withdrawal,
      desired_spending: desiredSpending,
      fees,
      taxes,
      income_taxes: totalIncomeTaxes,
      growth,
      end_balance_nominal: endBalance,
      cpi_index: cpiIndex,
      end_balance_real: endBalanceReal,
      // Basic mode: these advanced-mode fields default to simple values
      end_cash_nominal: 0,
      end_debt_nominal: 0,
      end_investments_nominal: endBalance,
      end_liquid_nominal: endBalance,
      end_illiquid_nominal: 0,
      loan_interest: 0,
      loan_principal_repaid: 0,
      mortgage_paid: 0,
      cash_yield: 0,
      insolvency: false,
      shortfall_mandatory: 0,
      shortfall_contributions: 0,
      shortfall_withdrawals: shortfallWithdrawals,
      black_swan_loss: blackSwanLoss,
      withdrawal_event: withdrawalEvent,
      // v0.4 additions — single-asset deterministic projection: realised
      // inflation is the configured flat rate (or 0 when inflation is off);
      // asset_returns is null because we are not in multi-asset mode.
      inflation_this_year: inflation_enabled ? inflation_pct / 100 : 0,
      asset_returns: null,
    };

    log.debug('Year end', { age, end_balance: endBalance });

    timeline.push(row);

    // Update running state for next year
    prevEndBalance = endBalance;

    // Update high-water mark based on end balance
    if (endBalance > highWaterMark) {
      highWaterMark = endBalance;
    }

    // Accumulate Metrics
    totalContributions += contributions;
    totalWithdrawals += withdrawal;
    totalFees += fees;
    totalTaxes += taxes + totalIncomeTaxes;
    if (age >= retirement_age) {
      totalDesiredSpending += desiredSpending;
      totalActualWithdrawals += withdrawal;
    }
  }

  // ====================================================================
  // Compute Metrics
  // ====================================================================
  const lastRow = timeline[timeline.length - 1];
  const terminalNominal = lastRow?.end_balance_nominal ?? 0;
  const terminalReal = lastRow?.end_balance_real ?? 0;

  // Readiness score: ratio of actual to desired spending, capped at 200
  let readinessScore: number;
  if (totalDesiredSpending > 0) {
    readinessScore = Math.min(
      200,
      (totalActualWithdrawals / totalDesiredSpending) * 100,
    );
  } else {
    // No desired spending (e.g. no retirement years, or 0 withdrawal target)
    readinessScore = 100;
  }

  // Estate value: terminal balance + projected asset values with estate earmark
  // Note: In basic mode, Asset does not carry estate_pct (that lives on
  // FinancialItem in advanced mode). For basic mode, estate_value = terminal.
  // Advanced mode integration will add per-item estate earmarking later.
  const estateValue = terminalNominal;

  const metrics: Metrics = {
    terminal_nominal: terminalNominal,
    terminal_real: terminalReal,
    first_shortfall_age: firstShortfallAge,
    readiness_score: readinessScore,
    total_contributions: totalContributions,
    total_withdrawals: totalWithdrawals,
    total_fees: totalFees,
    total_taxes: totalTaxes,
    estate_value: estateValue,
  };

  log.info('Projection complete', {
    terminalReal,
    terminalNominal,
    shortfallAge: firstShortfallAge,
    years: timeline.length,
  });

  return { timeline, metrics };
}
