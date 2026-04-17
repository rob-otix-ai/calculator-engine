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
  runMonteCarloSimulation,
  runSensitivityAnalysis,
  findRequiredSavings,
  calculateFixedPctWithdrawal,
  buildReturnSampler,
  DEFAULT_ASSET_CLASSES,
  DEFAULT_CORRELATIONS,
  buildInflationSampler,
  buildLongevitySampler,
  computeRiskMetrics,
  INFLATION_PRESETS,
  // v0.5 exports
  resolveWeights,
  computeEfficientFrontier,
  optimizeSsClaiming,
  optimizePensionClaiming,
  optimizeAnnuityTiming,
  SSA_ADJUSTMENT_FACTORS,
  ANNUITY_RATE_TABLE,
} from '../../dist/index.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const v03Fixture = JSON.parse(
  readFileSync(join(__dirname, 'v03-fixture.json'), 'utf8'),
);

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
// Test 6: buildReturnSampler — seed determinism
// ---------------------------------------------------------------------------
console.log('\nTest 6: buildReturnSampler seed determinism');
{
  const sampler1 = buildReturnSampler(
    DEFAULT_ASSET_CLASSES,
    DEFAULT_CORRELATIONS,
    { kind: 'LogNormal' },
    12345,
  );
  const sampler2 = buildReturnSampler(
    DEFAULT_ASSET_CLASSES,
    DEFAULT_CORRELATIONS,
    { kind: 'LogNormal' },
    12345,
  );
  const draw1 = sampler1.sample(0);
  const draw2 = sampler2.sample(0);
  assert(
    draw1.us_equity === draw2.us_equity,
    `same seed => same us_equity draw (${draw1.us_equity})`,
  );
  assert(
    draw1.us_bond === draw2.us_bond,
    `same seed => same us_bond draw`,
  );

  // Different seed => different draw
  const sampler3 = buildReturnSampler(
    DEFAULT_ASSET_CLASSES,
    DEFAULT_CORRELATIONS,
    { kind: 'LogNormal' },
    99999,
  );
  const draw3 = sampler3.sample(0);
  assert(
    draw3.us_equity !== draw1.us_equity,
    'different seed => different draw',
  );
}

// ---------------------------------------------------------------------------
// Test 7: Cholesky on known PSD matrix
// ---------------------------------------------------------------------------
console.log('\nTest 7: Cholesky basic validity');
{
  // If buildReturnSampler doesn't throw, Cholesky succeeded on the
  // DEFAULT_CORRELATIONS matrix (a 5x5 PSD matrix).
  let threw = false;
  try {
    buildReturnSampler(
      DEFAULT_ASSET_CLASSES,
      DEFAULT_CORRELATIONS,
      { kind: 'LogNormal' },
      42,
    );
  } catch {
    threw = true;
  }
  assert(!threw, 'Cholesky succeeds on DEFAULT_CORRELATIONS (PSD)');

  // 2x2 identity matrix should also work
  const twoAssets = [
    { id: 'us_equity', name: 'A', expected_return_pct: 10, return_stdev_pct: 15, weight_pct: 50 },
    { id: 'us_bond', name: 'B', expected_return_pct: 5, return_stdev_pct: 5, weight_pct: 50 },
  ];
  const identityCorr = {
    ids: ['us_equity', 'us_bond'],
    values: [[1, 0], [0, 1]],
  };
  const s = buildReturnSampler(twoAssets, identityCorr, { kind: 'LogNormal' }, 1);
  const d = s.sample(0);
  assert(typeof d.us_equity === 'number' && isFinite(d.us_equity), 'identity corr produces finite draws');
}

// ---------------------------------------------------------------------------
// Test 8: buildInflationSampler — AR(1) mean-reversion
// ---------------------------------------------------------------------------
console.log('\nTest 8: AR(1) inflation mean-reversion');
{
  const process = {
    kind: 'AR1',
    long_run_mean_pct: 3.0,
    phi: 0.6,
    shock_stdev_pct: 1.5,
    initial_pct: 3.0,
  };
  const sampler = buildInflationSampler(process, 42);
  assert(sampler.kind === 'AR1', 'sampler kind is AR1');

  // Sample 500 years and check mean converges to long_run_mean
  let sum = 0;
  let prior = process.initial_pct / 100;
  const N = 500;
  for (let y = 0; y < N; y++) {
    const r = sampler.sample(y, prior);
    sum += r;
    prior = r;
  }
  const sampleMean = sum / N;
  const target = process.long_run_mean_pct / 100;
  const pctDiff = Math.abs(sampleMean - target) / target;
  assert(
    pctDiff < 0.15,
    `AR(1) 500-year mean ${(sampleMean * 100).toFixed(2)}% within 15% of ${process.long_run_mean_pct}%`,
  );
}

// ---------------------------------------------------------------------------
// Test 9: buildInflationSampler — Flat passthrough
// ---------------------------------------------------------------------------
console.log('\nTest 9: Flat inflation passthrough');
{
  const sampler = buildInflationSampler({ kind: 'Flat', rate_pct: 2.5 }, 42);
  assert(sampler.kind === 'Flat', 'sampler kind is Flat');
  assert(
    sampler.sample(0, 0) === 0.025,
    'Flat sampler returns configured rate',
  );
  assert(
    sampler.sample(99, 0.1) === 0.025,
    'Flat sampler ignores prior inflation',
  );
}

// ---------------------------------------------------------------------------
// Test 10: buildLongevitySampler — Gompertz median
// ---------------------------------------------------------------------------
console.log('\nTest 10: Gompertz longevity median');
{
  const modal = 88;
  const dispersion = 10;
  const sampler = buildLongevitySampler(
    { kind: 'Gompertz', modal_age: modal, dispersion },
    42,
  );
  assert(sampler.kind === 'Gompertz', 'sampler kind is Gompertz');

  const med = sampler.median(65);
  // Conditional median for a 65yo should be somewhere around 85-92
  assert(med > 80 && med < 100, `Gompertz median for age 65 is ${med.toFixed(1)} (in 80-100)`);

  // Unconditional median formula: modal + dispersion * ln(ln(2)) ≈ 88 + 10*(-0.366) ≈ 84.3
  // But conditional on age 65, it should be higher
  assert(med > 84, 'conditional median > unconditional median');
}

// ---------------------------------------------------------------------------
// Test 11: buildLongevitySampler — Fixed
// ---------------------------------------------------------------------------
console.log('\nTest 11: Fixed longevity');
{
  const sampler = buildLongevitySampler({ kind: 'Fixed', end_age: 95 }, 42);
  assert(sampler.kind === 'Fixed', 'sampler kind is Fixed');
  assert(sampler.sample(65) === 95, 'Fixed always returns end_age');
  assert(sampler.median(65) === 95, 'Fixed median is end_age');
  assert(sampler.survival(94, 65) === 1, 'survival at 94 is 1');
  assert(sampler.survival(96, 65) === 0, 'survival at 96 is 0');
}

// ---------------------------------------------------------------------------
// Test 12: computeRiskMetrics — CVaR <= VaR
// ---------------------------------------------------------------------------
console.log('\nTest 12: computeRiskMetrics invariants');
{
  // Build synthetic MC data
  const terminals = [];
  const paths = [];
  const returns = [];
  for (let i = 0; i < 300; i++) {
    const t = 500000 + (i - 150) * 5000 + Math.sin(i) * 100000;
    terminals.push(t);
    const path = [];
    for (let y = 0; y < 30; y++) {
      path.push(500000 + (y * 10000) + (i - 150) * 1000);
    }
    paths.push(path);
    returns.push(0.04 + (i - 150) * 0.001);
  }

  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 35,
    end_age: 65,
    current_balance: 500000,
  };

  const metrics = computeRiskMetrics(
    { terminal_distribution: terminals, real_balance_paths: paths, annualised_returns: returns },
    scenario,
  );

  assert(
    metrics.cvar_95_terminal_real <= metrics.var_95_terminal_real,
    `CVaR95 (${metrics.cvar_95_terminal_real.toFixed(0)}) <= VaR95 (${metrics.var_95_terminal_real.toFixed(0)})`,
  );
  assert(
    metrics.cvar_99_terminal_real <= metrics.var_99_terminal_real,
    `CVaR99 (${metrics.cvar_99_terminal_real.toFixed(0)}) <= VaR99 (${metrics.var_99_terminal_real.toFixed(0)})`,
  );
  assert(
    metrics.max_drawdown_pct >= 0 && metrics.max_drawdown_pct <= 100,
    `max_drawdown_pct in [0,100]: ${metrics.max_drawdown_pct.toFixed(2)}`,
  );

  // Per-year P10 <= P50 <= P90
  for (let y = 0; y < metrics.p10_year_by_year_balance_real.length; y++) {
    const p10 = metrics.p10_year_by_year_balance_real[y];
    const p50 = metrics.p50_year_by_year_balance_real[y];
    const p90 = metrics.p90_year_by_year_balance_real[y];
    if (p10 > p50 + 0.01 || p50 > p90 + 0.01) {
      assert(false, `P10 <= P50 <= P90 violated at year ${y}`);
      break;
    }
  }
  assert(true, 'P10 <= P50 <= P90 holds for all years');
}

// ---------------------------------------------------------------------------
// Test 13: Backwards compat — v0.3 scenario deterministic projection
// ---------------------------------------------------------------------------
console.log('\nTest 13: v0.3 backwards compat — deterministic projection');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 30,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: false,
    black_swan_enabled: false,
  };

  const { metrics } = runProjection(scenario);
  const tolerance = 0.01; // 1 cent

  assert(
    Math.abs(metrics.terminal_real - v03Fixture.detRunMetrics.terminal_real) < tolerance,
    `det terminal_real matches fixture (${metrics.terminal_real.toFixed(2)} vs ${v03Fixture.detRunMetrics.terminal_real.toFixed(2)})`,
  );
  assert(
    Math.abs(metrics.terminal_nominal - v03Fixture.detRunMetrics.terminal_nominal) < tolerance,
    `det terminal_nominal matches fixture`,
  );
}

// ---------------------------------------------------------------------------
// Test 14: Backwards compat — v0.3 MC terminal values
// ---------------------------------------------------------------------------
console.log('\nTest 14: v0.3 backwards compat — MC terminal values');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 30,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: true,
    mc_runs: 500,
    black_swan_enabled: false,
  };

  const mc = runMonteCarloSimulation(scenario, runProjection, {
    runs: 500,
    seed: 42,
  });

  assert(mc.runs_completed === 500, `MC completed 500 runs`);
  assert(
    Math.abs(mc.probability_no_shortfall - v03Fixture.mc.probability_no_shortfall) < 0.01,
    `MC prob_no_shortfall matches fixture (${mc.probability_no_shortfall})`,
  );

  // Check first 5 terminal values match fixture
  const first5 = mc.terminal_distribution.slice(0, 5);
  let allMatch = true;
  for (let i = 0; i < 5; i++) {
    if (Math.abs(first5[i] - v03Fixture.mc.first5Terminals[i]) > 0.01) {
      allMatch = false;
      console.error(`    terminal[${i}] mismatch: got ${first5[i]}, expected ${v03Fixture.mc.first5Terminals[i]}`);
    }
  }
  assert(allMatch, 'first 5 MC terminals match v0.3 fixture (byte-identical legacy path)');
}

// ---------------------------------------------------------------------------
// Test 15: MC with multi-asset returns
// ---------------------------------------------------------------------------
console.log('\nTest 15: MC with multi-asset returns');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 60,
    retirement_age: 65,
    end_age: 85,
    current_balance: 1_000_000,
    contrib_amount: 0,
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: true,
    mc_runs: 200,
    black_swan_enabled: false,
    asset_classes: DEFAULT_ASSET_CLASSES,
    return_correlation_matrix: DEFAULT_CORRELATIONS,
    return_distribution_kind: 'LogNormal',
  };

  const mc = runMonteCarloSimulation(scenario, runProjection, {
    runs: 200,
    seed: 42,
  });

  assert(mc.runs_completed === 200, 'multi-asset MC completed 200 runs');
  assert(mc.fan_chart.length > 0, 'multi-asset MC produces fan chart');
  assert(
    mc.risk_metrics != null,
    'risk_metrics present when runs >= 200 and horizon >= 10',
  );
}

// ---------------------------------------------------------------------------
// Test 16: MC with AR(1) inflation
// ---------------------------------------------------------------------------
console.log('\nTest 16: MC with AR(1) inflation');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 55,
    retirement_age: 65,
    end_age: 85,
    current_balance: 1_000_000,
    contrib_amount: 0,
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: true,
    mc_runs: 200,
    black_swan_enabled: false,
    inflation_model: 'AR1',
    inflation_long_run_mean_pct: 3.0,
    inflation_ar1_phi: 0.6,
    inflation_shock_stdev_pct: 1.5,
    inflation_initial_pct: 2.5,
  };

  const mc = runMonteCarloSimulation(scenario, runProjection, {
    runs: 200,
    seed: 42,
  });

  assert(mc.runs_completed === 200, 'AR(1) MC completed 200 runs');
  assert(
    mc.inflation_fan_chart != null && mc.inflation_fan_chart.length > 0,
    'inflation_fan_chart present for AR(1)',
  );
}

// ---------------------------------------------------------------------------
// Test 17: MC with Gompertz longevity
// ---------------------------------------------------------------------------
console.log('\nTest 17: MC with Gompertz longevity');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 60,
    retirement_age: 65,
    end_age: 100,
    current_balance: 1_000_000,
    contrib_amount: 0,
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: true,
    mc_runs: 200,
    black_swan_enabled: false,
    longevity_model: 'Gompertz',
    longevity_modal_age: 88,
    longevity_dispersion: 10,
  };

  const mc = runMonteCarloSimulation(scenario, runProjection, {
    runs: 200,
    seed: 42,
  });

  assert(mc.runs_completed === 200, 'Gompertz MC completed 200 runs');
  assert(
    mc.lifespan_distribution != null && mc.lifespan_distribution.length === 200,
    'lifespan_distribution has 200 entries',
  );
  // Median sampled death age should be plausible
  const sorted = [...mc.lifespan_distribution].sort((a, b) => a - b);
  const medianDeath = sorted[100];
  assert(
    medianDeath >= 80 && medianDeath <= 100,
    `median sampled death age ${medianDeath} is plausible (80-100)`,
  );
}

// ---------------------------------------------------------------------------
// Test 18: DEFAULT_ASSET_CLASSES weights sum to 100
// ---------------------------------------------------------------------------
console.log('\nTest 18: DEFAULT_ASSET_CLASSES');
{
  const totalWeight = DEFAULT_ASSET_CLASSES.reduce((s, a) => s + a.weight_pct, 0);
  assert(
    Math.abs(totalWeight - 100) < 1,
    `DEFAULT_ASSET_CLASSES weights sum to ~100 (${totalWeight})`,
  );
  assert(DEFAULT_ASSET_CLASSES.length === 5, '5 default asset classes');
}

// ---------------------------------------------------------------------------
// Test 19: INFLATION_PRESETS are exported
// ---------------------------------------------------------------------------
console.log('\nTest 19: INFLATION_PRESETS exported');
{
  assert(INFLATION_PRESETS != null, 'INFLATION_PRESETS is defined');
  assert(
    typeof INFLATION_PRESETS['US-CPI'] === 'object',
    'US-CPI preset exists',
  );
  assert(
    INFLATION_PRESETS['US-CPI'].phi > 0,
    'US-CPI has positive phi',
  );
}

// ---------------------------------------------------------------------------
// Test 20: Student-T sampler produces finite draws
// ---------------------------------------------------------------------------
console.log('\nTest 20: Student-T sampler');
{
  const sampler = buildReturnSampler(
    DEFAULT_ASSET_CLASSES,
    DEFAULT_CORRELATIONS,
    { kind: 'StudentT', dof: 5 },
    42,
  );
  const draw = sampler.sample(0);
  assert(isFinite(draw.us_equity), `Student-T us_equity is finite (${draw.us_equity.toFixed(4)})`);
  assert(isFinite(draw.us_bond), `Student-T us_bond is finite (${draw.us_bond.toFixed(4)})`);
}

// ---------------------------------------------------------------------------
// Test 21: Risk metrics on MC result
// ---------------------------------------------------------------------------
console.log('\nTest 21: risk_metrics on MC result');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 35,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: true,
    mc_runs: 200,
    black_swan_enabled: false,
  };

  const mc = runMonteCarloSimulation(scenario, runProjection, {
    runs: 200,
    seed: 42,
  });

  assert(mc.risk_metrics != null, 'risk_metrics attached for 200 runs, 55yr horizon');
  if (mc.risk_metrics) {
    assert(
      mc.risk_metrics.cvar_95_terminal_real <= mc.risk_metrics.var_95_terminal_real,
      'CVaR95 <= VaR95 on real MC',
    );
    assert(
      mc.risk_metrics.p10_year_by_year_balance_real.length > 0,
      'year-by-year balance trajectories populated',
    );
  }
}

// ---------------------------------------------------------------------------
// Test 22 (new): Gompertz sampler determinism
// ---------------------------------------------------------------------------
console.log('\nTest 22: Gompertz sampler determinism');
{
  const s1 = buildLongevitySampler({ kind: 'Gompertz', modal_age: 88, dispersion: 10 }, 42);
  const s2 = buildLongevitySampler({ kind: 'Gompertz', modal_age: 88, dispersion: 10 }, 42);
  assert(s1.sample(65) === s2.sample(65), 'same seed => same Gompertz sample');
}

// ===========================================================================
// v0.5 — Optimization Suite Tests (CONTRACT-019)
// ===========================================================================

// ---------------------------------------------------------------------------
// Test 23: resolveWeights — no glide path returns static weights
// ---------------------------------------------------------------------------
console.log('\nTest 23: resolveWeights — no glide path');
{
  const weights = resolveWeights(40, DEFAULT_ASSET_CLASSES, []);
  assert(weights.us_equity === 60, 'static us_equity weight = 60');
  assert(weights.us_bond === 20, 'static us_bond weight = 20');
}

// ---------------------------------------------------------------------------
// Test 24: resolveWeights — before first step uses initial weights
// ---------------------------------------------------------------------------
console.log('\nTest 24: resolveWeights — before first step');
{
  const glidePath = [
    { age: 50, weights: { us_equity: 50, us_bond: 50 } },
    { age: 70, weights: { us_equity: 30, us_bond: 70 } },
  ];
  const weights = resolveWeights(40, DEFAULT_ASSET_CLASSES, glidePath);
  assert(weights.us_equity === 60, 'before first step: uses initial us_equity');
}

// ---------------------------------------------------------------------------
// Test 25: resolveWeights — exact step age
// ---------------------------------------------------------------------------
console.log('\nTest 25: resolveWeights — exact step age');
{
  const glidePath = [
    { age: 50, weights: { us_equity: 50, us_bond: 50 } },
    { age: 70, weights: { us_equity: 30, us_bond: 70 } },
  ];
  const weights = resolveWeights(50, DEFAULT_ASSET_CLASSES, glidePath);
  assert(weights.us_equity === 50, 'at step age 50: us_equity = 50');
  assert(weights.us_bond === 50, 'at step age 50: us_bond = 50');
}

// ---------------------------------------------------------------------------
// Test 26: resolveWeights — interpolation between steps
// ---------------------------------------------------------------------------
console.log('\nTest 26: resolveWeights — linear interpolation');
{
  const glidePath = [
    { age: 50, weights: { us_equity: 80, us_bond: 20 } },
    { age: 70, weights: { us_equity: 40, us_bond: 60 } },
  ];
  const weights = resolveWeights(60, DEFAULT_ASSET_CLASSES, glidePath);
  // Midpoint: 80 + 0.5*(40-80) = 60
  assert(Math.abs(weights.us_equity - 60) < 0.01, `interpolated us_equity = 60 (got ${weights.us_equity})`);
  assert(Math.abs(weights.us_bond - 40) < 0.01, `interpolated us_bond = 40 (got ${weights.us_bond})`);
}

// ---------------------------------------------------------------------------
// Test 27: resolveWeights — after last step
// ---------------------------------------------------------------------------
console.log('\nTest 27: resolveWeights — after last step');
{
  const glidePath = [
    { age: 50, weights: { us_equity: 80, us_bond: 20 } },
    { age: 60, weights: { us_equity: 40, us_bond: 60 } },
  ];
  const weights = resolveWeights(80, DEFAULT_ASSET_CLASSES, glidePath);
  assert(weights.us_equity === 40, 'after last step: us_equity = 40');
  assert(weights.us_bond === 60, 'after last step: us_bond = 60');
}

// ---------------------------------------------------------------------------
// Test 28: SSA_ADJUSTMENT_FACTORS correctness
// ---------------------------------------------------------------------------
console.log('\nTest 28: SSA_ADJUSTMENT_FACTORS');
{
  assert(SSA_ADJUSTMENT_FACTORS[62] === 0.70, 'SSA factor age 62 = 0.70');
  assert(SSA_ADJUSTMENT_FACTORS[67] === 1.00, 'SSA factor age 67 = 1.00 (FRA)');
  assert(SSA_ADJUSTMENT_FACTORS[70] === 1.24, 'SSA factor age 70 = 1.24');
  assert(SSA_ADJUSTMENT_FACTORS[65] === 0.867, 'SSA factor age 65 = 0.867');
  assert(SSA_ADJUSTMENT_FACTORS[68] === 1.08, 'SSA factor age 68 = 1.08');
  // All 9 ages present
  const ssAges = Object.keys(SSA_ADJUSTMENT_FACTORS).map(Number);
  assert(ssAges.length === 9, `SSA table has 9 entries (got ${ssAges.length})`);
}

// ---------------------------------------------------------------------------
// Test 29: ANNUITY_RATE_TABLE coverage
// ---------------------------------------------------------------------------
console.log('\nTest 29: ANNUITY_RATE_TABLE');
{
  assert(ANNUITY_RATE_TABLE.length === 31, `annuity table has 31 entries (ages 55-85, got ${ANNUITY_RATE_TABLE.length})`);
  assert(ANNUITY_RATE_TABLE[0].age === 55, 'first entry age 55');
  assert(ANNUITY_RATE_TABLE[30].age === 85, 'last entry age 85');
  // Male rates should increase with age
  for (let i = 1; i < ANNUITY_RATE_TABLE.length; i++) {
    assert(
      ANNUITY_RATE_TABLE[i].male >= ANNUITY_RATE_TABLE[i - 1].male,
      `male rate non-decreasing at age ${ANNUITY_RATE_TABLE[i].age}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 30: computeEfficientFrontier — basic 2-asset
// ---------------------------------------------------------------------------
console.log('\nTest 30: computeEfficientFrontier — 2 assets');
{
  const assets = [
    { id: 'us_equity', name: 'Equity', expected_return_pct: 10, return_stdev_pct: 17, weight_pct: 60 },
    { id: 'us_bond', name: 'Bond', expected_return_pct: 4, return_stdev_pct: 6, weight_pct: 40 },
  ];
  const corr = { ids: ['us_equity', 'us_bond'], values: [[1, 0.1], [0.1, 1]] };
  const result = computeEfficientFrontier(assets, corr, 2);

  assert(result.frontier.length === 20, `frontier has 20 points (got ${result.frontier.length})`);
  assert(result.current_portfolio != null, 'current_portfolio defined');
  assert(result.max_sharpe != null, 'max_sharpe defined');
  assert(result.min_variance != null, 'min_variance defined');
  assert(typeof result.distance_to_frontier_pct === 'number', 'distance_to_frontier_pct is number');
}

// ---------------------------------------------------------------------------
// Test 31: computeEfficientFrontier — frontier is ordered
// ---------------------------------------------------------------------------
console.log('\nTest 31: computeEfficientFrontier — ordered frontier');
{
  const result = computeEfficientFrontier(DEFAULT_ASSET_CLASSES, DEFAULT_CORRELATIONS, 3);
  // Expected return should be non-decreasing along the frontier
  let ordered = true;
  for (let i = 1; i < result.frontier.length; i++) {
    if (result.frontier[i].expected_return_pct < result.frontier[i - 1].expected_return_pct - 0.01) {
      ordered = false;
      break;
    }
  }
  assert(ordered, 'frontier points are ordered by increasing expected return');
}

// ---------------------------------------------------------------------------
// Test 32: computeEfficientFrontier — all weights non-negative and sum ~100
// ---------------------------------------------------------------------------
console.log('\nTest 32: computeEfficientFrontier — weight constraints');
{
  const result = computeEfficientFrontier(DEFAULT_ASSET_CLASSES, DEFAULT_CORRELATIONS, 3);
  let allValid = true;
  for (const fp of result.frontier) {
    const wSum = Object.values(fp.weights).reduce((s, w) => s + w, 0);
    const allNonNeg = Object.values(fp.weights).every(w => w >= -0.01);
    if (Math.abs(wSum - 100) > 2 || !allNonNeg) {
      allValid = false;
      break;
    }
  }
  assert(allValid, 'all frontier points: weights >= 0, sum ~100');
}

// ---------------------------------------------------------------------------
// Test 33: computeEfficientFrontier — single asset
// ---------------------------------------------------------------------------
console.log('\nTest 33: computeEfficientFrontier — single asset');
{
  const single = [{ id: 'cash', name: 'Cash', expected_return_pct: 3, return_stdev_pct: 1, weight_pct: 100 }];
  const corr = { ids: ['cash'], values: [[1]] };
  const result = computeEfficientFrontier(single, corr, 2);
  assert(result.frontier.length === 20, 'single-asset frontier has 20 points');
  assert(result.frontier[0].expected_return_pct === 3, 'single-asset return = 3');
  assert(result.distance_to_frontier_pct === 0, 'single-asset distance = 0');
}

// ---------------------------------------------------------------------------
// Test 34: optimizeSsClaiming — sweep completeness
// ---------------------------------------------------------------------------
console.log('\nTest 34: optimizeSsClaiming — sweep completeness');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 55,
    retirement_age: 67,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 6,
    inflation_pct: 2,
    fee_pct: 0.5,
    black_swan_enabled: false,
    withdrawal_method: 'Fixed real-dollar amount',
    withdrawal_real_amount: 40_000,
    withdrawal_strategy: 'Standard',
    income_sources: [
      {
        label: 'Social Security',
        type: 'Social Security',
        amount: 2000,
        frequency: 'Monthly',
        start_age: 67,
        end_age: 90,
        inflation_adjusted: true,
        taxable: true,
        tax_rate: 15,
        enabled: true,
      },
    ],
  };

  const result = optimizeSsClaiming(scenario, runProjection);
  assert(result.sweep.length === 9, `SS sweep has 9 entries (62-70, got ${result.sweep.length})`);
  assert(result.optimal_age >= 62 && result.optimal_age <= 70, `optimal age in [62,70]: ${result.optimal_age}`);
  assert(result.metric_at_optimal > 0, 'metric at optimal > 0');
}

// ---------------------------------------------------------------------------
// Test 35: optimizeSsClaiming — no SS source
// ---------------------------------------------------------------------------
console.log('\nTest 35: optimizeSsClaiming — no SS source');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 55,
    retirement_age: 65,
    end_age: 85,
    current_balance: 500_000,
    income_sources: [],
    black_swan_enabled: false,
  };
  const result = optimizeSsClaiming(scenario, runProjection);
  assert(result.sweep.length >= 1, 'no SS source: returns at least 1 sweep entry');
  assert(result.optimal_age === 67, 'no SS source: default optimal age = 67');
}

// ---------------------------------------------------------------------------
// Test 36: optimizePensionClaiming — sweep completeness
// ---------------------------------------------------------------------------
console.log('\nTest 36: optimizePensionClaiming');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 50,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 6,
    inflation_pct: 2,
    fee_pct: 0.5,
    black_swan_enabled: false,
    withdrawal_method: 'Fixed real-dollar amount',
    withdrawal_real_amount: 40_000,
    withdrawal_strategy: 'Standard',
    pension_early_factor_pct: 3,
    pension_late_factor_pct: 6,
    income_sources: [
      {
        label: 'DB Pension',
        type: 'Pension',
        amount: 20_000,
        frequency: 'Annual',
        start_age: 65,
        end_age: 90,
        inflation_adjusted: false,
        taxable: true,
        tax_rate: 20,
        enabled: true,
      },
    ],
  };

  const result = optimizePensionClaiming(scenario, runProjection);
  assert(result.sweep.length === 21, `pension sweep has 21 entries (55-75, got ${result.sweep.length})`);
  assert(result.optimal_age >= 55 && result.optimal_age <= 75, `pension optimal age in [55,75]: ${result.optimal_age}`);
}

// ---------------------------------------------------------------------------
// Test 37: optimizeAnnuityTiming — zero purchase pct
// ---------------------------------------------------------------------------
console.log('\nTest 37: optimizeAnnuityTiming — zero purchase pct');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 50,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    annuity_purchase_pct: 0,
    black_swan_enabled: false,
  };
  const result = optimizeAnnuityTiming(scenario, runProjection);
  assert(result.sweep.length === 1, 'zero pct: only 1 sweep entry');
}

// ---------------------------------------------------------------------------
// Test 38: optimizeAnnuityTiming — with purchase pct
// ---------------------------------------------------------------------------
console.log('\nTest 38: optimizeAnnuityTiming — with purchase pct');
{
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 50,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 6,
    inflation_pct: 2,
    fee_pct: 0.5,
    black_swan_enabled: false,
    withdrawal_method: 'Fixed real-dollar amount',
    withdrawal_real_amount: 30_000,
    withdrawal_strategy: 'Standard',
    annuity_purchase_pct: 25,
    income_sources: [],
  };
  const result = optimizeAnnuityTiming(scenario, runProjection);
  assert(result.sweep.length === 16, `annuity sweep has 16 entries (50-65, got ${result.sweep.length})`);
  assert(result.optimal_age >= 50 && result.optimal_age <= 65, `annuity optimal age in [50,65]: ${result.optimal_age}`);
  assert(result.metric_at_optimal !== 0, 'metric at optimal is not zero');
}

// ---------------------------------------------------------------------------
// Test 39: Glide path in deterministic projection — backwards compat
// ---------------------------------------------------------------------------
console.log('\nTest 39: Glide path backwards compat');
{
  // Same scenario as Test 13 but with empty glide_path — must be identical
  const scenario = {
    ...DEFAULT_SCENARIO,
    current_age: 30,
    retirement_age: 65,
    end_age: 90,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 7,
    return_stdev_pct: 12,
    return_distribution: 'log-normal',
    inflation_pct: 2.5,
    fee_pct: 0.5,
    enable_mc: false,
    black_swan_enabled: false,
    glide_path: [],
  };

  const { metrics } = runProjection(scenario);
  const tolerance = 0.01;
  assert(
    Math.abs(metrics.terminal_real - v03Fixture.detRunMetrics.terminal_real) < tolerance,
    `empty glide_path: terminal_real matches v0.3 fixture`,
  );
}

// ---------------------------------------------------------------------------
// Test 40: Glide path affects projection output
// ---------------------------------------------------------------------------
console.log('\nTest 40: Glide path changes projection');
{
  const baseScenario = {
    ...DEFAULT_SCENARIO,
    current_age: 40,
    retirement_age: 65,
    end_age: 85,
    current_balance: 500_000,
    contrib_amount: 10_000,
    contrib_cadence: 'Annual',
    nominal_return_pct: 7,
    inflation_pct: 2,
    fee_pct: 0.5,
    enable_mc: false,
    black_swan_enabled: false,
    asset_classes: [
      { id: 'us_equity', name: 'Equity', expected_return_pct: 10, return_stdev_pct: 17, weight_pct: 80 },
      { id: 'us_bond', name: 'Bond', expected_return_pct: 4, return_stdev_pct: 6, weight_pct: 20 },
    ],
    return_correlation_matrix: { ids: ['us_equity', 'us_bond'], values: [[1, 0.1], [0.1, 1]] },
  };

  const { metrics: metricsNoGlide } = runProjection({ ...baseScenario, glide_path: [] });
  const { metrics: metricsWithGlide } = runProjection({
    ...baseScenario,
    glide_path: [
      { age: 40, weights: { us_equity: 80, us_bond: 20 } },
      { age: 70, weights: { us_equity: 30, us_bond: 70 } },
    ],
  });

  // The glide path de-risks over time, so terminal should differ
  assert(
    Math.abs(metricsNoGlide.terminal_real - metricsWithGlide.terminal_real) > 1,
    `glide path changes terminal_real (no-glide: ${metricsNoGlide.terminal_real.toFixed(0)}, with-glide: ${metricsWithGlide.terminal_real.toFixed(0)})`,
  );
}

// ---------------------------------------------------------------------------
// Test 41: computeEfficientFrontier — max_sharpe has highest Sharpe
// ---------------------------------------------------------------------------
console.log('\nTest 41: max_sharpe has highest Sharpe ratio');
{
  const result = computeEfficientFrontier(DEFAULT_ASSET_CLASSES, DEFAULT_CORRELATIONS, 3);
  const maxSharpe = Math.max(...result.frontier.map(fp => fp.sharpe_ratio));
  assert(
    result.max_sharpe.sharpe_ratio === maxSharpe,
    `max_sharpe.sharpe_ratio (${result.max_sharpe.sharpe_ratio}) equals max across frontier (${maxSharpe})`,
  );
}

// ---------------------------------------------------------------------------
// Test 42: computeEfficientFrontier — min_variance has lowest stdev
// ---------------------------------------------------------------------------
console.log('\nTest 42: min_variance has lowest stdev');
{
  const result = computeEfficientFrontier(DEFAULT_ASSET_CLASSES, DEFAULT_CORRELATIONS, 3);
  const minStdev = Math.min(...result.frontier.map(fp => fp.portfolio_stdev_pct));
  assert(
    result.min_variance.portfolio_stdev_pct === minStdev,
    `min_variance stdev (${result.min_variance.portfolio_stdev_pct}) equals min across frontier (${minStdev})`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  process.exit(1);
}
