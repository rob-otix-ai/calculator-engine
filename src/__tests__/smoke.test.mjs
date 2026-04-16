/**
 * v0.3 smoke tests — minimal assertion-based runner.
 *
 * Runs against the compiled dist/ output:
 *   node src/__tests__/smoke.test.mjs
 *
 * No Jest / Vitest dependency. Each assert() throws on failure.
 */

import {
  DEFAULT_SCENARIO,
  runProjection,
  runSensitivityAnalysis,
  findRequiredSavings,
  calculateFixedPctWithdrawal,
} from '../../dist/index.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log('  pass:', msg);
  } else {
    failed++;
    console.error('  FAIL:', msg);
  }
}

// ---------------------------------------------------------------------------
// Test 1: calculateFixedPctWithdrawal returns 4% of prior balance
// ---------------------------------------------------------------------------
console.log('\nTest 1: calculateFixedPctWithdrawal');
{
  const w = calculateFixedPctWithdrawal({
    fixed_withdrawal_pct: 4,
    priorEndBalance: 1_000_000,
  });
  assert(Math.abs(w - 40_000) < 0.01, '4% of $1M = $40,000');

  const zero = calculateFixedPctWithdrawal({
    fixed_withdrawal_pct: 4,
    priorEndBalance: 0,
  });
  assert(zero === 0, 'zero prior balance => zero withdrawal');

  const capped = calculateFixedPctWithdrawal({
    fixed_withdrawal_pct: 10,
    priorEndBalance: 1_000_000,
    availableBalance: 50_000,
  });
  assert(capped === 50_000, 'cap at availableBalance when supplied');

  const negativeClamped = calculateFixedPctWithdrawal({
    fixed_withdrawal_pct: 4,
    priorEndBalance: -1000,
  });
  assert(negativeClamped === 0, 'negative prior balance clamps to 0');
}

// ---------------------------------------------------------------------------
// Test 2: runProjection populates black_swan_loss correctly
// ---------------------------------------------------------------------------
console.log('\nTest 2: runProjection black_swan_loss');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 60,
    retirement_age: 65,
    end_age: 75,
    current_balance: 1_000_000,
    contrib_amount: 0,
    enable_mc: false,
    black_swan_enabled: true,
    black_swan_age: 70,
    black_swan_loss_pct: 50,
  };

  const { timeline } = runProjection(scenario);

  const shockRow = timeline.find((r) => r.age === 70);
  const nonShockRow = timeline.find((r) => r.age === 71);

  assert(shockRow != null, 'shock row exists at age 70');
  assert(
    shockRow.black_swan_loss > 0,
    `shock row has positive black_swan_loss (${shockRow.black_swan_loss.toFixed(0)})`,
  );
  assert(
    nonShockRow.black_swan_loss === 0,
    'non-shock row (age 71) has black_swan_loss === 0',
  );

  const positiveLossRows = timeline.filter((r) => r.black_swan_loss > 0);
  assert(
    positiveLossRows.length === 1,
    'exactly one row in the timeline has black_swan_loss > 0',
  );

  // All rows must have the new fields
  const allHaveFields = timeline.every(
    (r) =>
      typeof r.black_swan_loss === 'number' &&
      typeof r.withdrawal_event === 'string',
  );
  assert(allHaveFields, 'every row has black_swan_loss and withdrawal_event');
}

// ---------------------------------------------------------------------------
// Test 3: sensitivity wrapper does not apply black swan
// ---------------------------------------------------------------------------
console.log('\nTest 3: sensitivity wrapper disables black swan');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 60,
    retirement_age: 65,
    end_age: 75,
    current_balance: 1_000_000,
    enable_mc: false,
    black_swan_enabled: true,
    black_swan_age: 70,
    black_swan_loss_pct: 99,
  };

  let observedBlackSwanFlag = null;
  let observedShockRowsTotal = 0;

  const factors = runSensitivityAnalysis(scenario, (s) => {
    observedBlackSwanFlag = s.black_swan_enabled;
    const { timeline, metrics } = runProjection(s);
    observedShockRowsTotal += timeline.filter((r) => r.black_swan_loss > 0).length;
    return { metrics };
  });

  assert(
    observedBlackSwanFlag === false,
    'sensitivity always passes black_swan_enabled = false to projFn',
  );
  assert(
    observedShockRowsTotal === 0,
    'no projection produced a shock row during sensitivity',
  );
  assert(factors.length > 0, 'sensitivity returned at least one factor');
}

// ---------------------------------------------------------------------------
// Test 4: findRequiredSavings returns feasible answer for a typical scenario
// ---------------------------------------------------------------------------
console.log('\nTest 4: findRequiredSavings');
{
  // Scenario where zero contributions are clearly not enough but a moderate
  // annual contribution should suffice. We deliberately demand a non-trivial
  // desired_estate so that compound growth alone won't satisfy it.
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 30,
    retirement_age: 65,
    end_age: 90,
    current_balance: 10_000,
    contrib_amount: 0,
    contrib_cadence: 'Annual',
    nominal_return_pct: 6,
    inflation_pct: 2,
    fee_pct: 0.5,
    withdrawal_method: 'Fixed real-dollar amount',
    withdrawal_real_amount: 60_000,
    withdrawal_strategy: 'Standard',
    enable_mc: false,
    black_swan_enabled: false,
    desired_estate: 500_000,
  };

  const result = findRequiredSavings(scenario, runProjection);

  assert(result.feasible === true, 'a moderate plan is feasible');
  assert(typeof result.value === 'number', 'value is a number');
  assert(result.value > 0, `value > 0 (got ${result.value?.toFixed(2)})`);
  assert(
    result.iterations <= 24,
    `iterations <= 24 (got ${result.iterations})`,
  );
  assert(result.converged === true, 'converged within iteration cap');

  // Infeasible path: tiny upper bound, big spending demand → no solution
  const harsh = {
    ...scenario,
    withdrawal_real_amount: 500_000,
    desired_estate: 10_000_000,
  };
  const noSolution = findRequiredSavings(harsh, runProjection, undefined, {
    upperBound: 100,
  });
  assert(
    noSolution.feasible === false,
    'tiny upper bound + huge spending => infeasible',
  );
  assert(
    noSolution.reason === 'plan_never_succeeds',
    'reason flagged as plan_never_succeeds',
  );
  assert(
    noSolution.value === undefined,
    'value is undefined when not feasible',
  );
}

// ---------------------------------------------------------------------------
// Test 5: Fixed-Pct strategy can run end-to-end through runProjection
// ---------------------------------------------------------------------------
console.log('\nTest 5: Fixed-Pct strategy in runProjection');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 60,
    retirement_age: 65,
    end_age: 75,
    current_balance: 1_000_000,
    contrib_amount: 0,
    nominal_return_pct: 6,
    enable_mc: false,
    withdrawal_strategy: 'Fixed-Pct',
    fixed_withdrawal_pct: 5,
    black_swan_enabled: false,
  };

  const { timeline } = runProjection(scenario);
  const retirementRows = timeline.filter((r) => r.age >= 65);
  const allHaveWithdrawals = retirementRows.every((r) => r.withdrawals > 0);
  assert(
    allHaveWithdrawals,
    'every retirement-year row has a non-zero withdrawal',
  );
  const allStandardEvents = retirementRows.every(
    (r) => r.withdrawal_event === 'standard',
  );
  assert(
    allStandardEvents,
    'Fixed-Pct produces withdrawal_event = "standard" per CONTRACT-016',
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
