/**
 * Social Security, Pension, and Annuity Claiming Optimizers (ADR-036 / CONTRACT-019)
 *
 * Three grid-search optimizers that sweep over claiming ages and evaluate the
 * full scenario at each candidate to maximize a user-chosen metric.
 *
 * No new runtime dependencies.
 */
// ---------------------------------------------------------------------------
// Bundled Data — SSA Adjustment Factors (CONTRACT-019)
// ---------------------------------------------------------------------------
/**
 * SSA actuarial adjustment factors by claiming age.
 * FRA = 67 (1.00). Early claiming reduces; delayed credits increase.
 * Source: 2025 SSA published rates.
 */
export const SSA_ADJUSTMENT_FACTORS = {
    62: 0.70,
    63: 0.75,
    64: 0.80,
    65: 0.867,
    66: 0.933,
    67: 1.00,
    68: 1.08,
    69: 1.16,
    70: 1.24,
};
// ---------------------------------------------------------------------------
// Bundled Data — Annuity Rate Table (CONTRACT-019)
// ---------------------------------------------------------------------------
/**
 * Approximate annuity payout rates by age and sex.
 * Expressed as annual payout per $100,000 of purchase price.
 * Based on approximate UK/US published annuity rate snapshots (2025 vintage).
 */
export const ANNUITY_RATE_TABLE = [
    { age: 55, male: 5200, female: 4900 },
    { age: 56, male: 5300, female: 5000 },
    { age: 57, male: 5400, female: 5100 },
    { age: 58, male: 5500, female: 5200 },
    { age: 59, male: 5650, female: 5350 },
    { age: 60, male: 5800, female: 5500 },
    { age: 61, male: 5950, female: 5650 },
    { age: 62, male: 6100, female: 5800 },
    { age: 63, male: 6300, female: 6000 },
    { age: 64, male: 6500, female: 6200 },
    { age: 65, male: 6700, female: 6400 },
    { age: 66, male: 6950, female: 6600 },
    { age: 67, male: 7200, female: 6850 },
    { age: 68, male: 7450, female: 7100 },
    { age: 69, male: 7750, female: 7400 },
    { age: 70, male: 8050, female: 7700 },
    { age: 71, male: 8400, female: 8000 },
    { age: 72, male: 8750, female: 8350 },
    { age: 73, male: 9150, female: 8700 },
    { age: 74, male: 9550, female: 9100 },
    { age: 75, male: 10000, female: 9500 },
    { age: 76, male: 10500, female: 10000 },
    { age: 77, male: 11050, female: 10500 },
    { age: 78, male: 11650, female: 11050 },
    { age: 79, male: 12300, female: 11650 },
    { age: 80, male: 13000, female: 12300 },
    { age: 81, male: 13750, female: 13000 },
    { age: 82, male: 14550, female: 13750 },
    { age: 83, male: 15400, female: 14550 },
    { age: 84, male: 16300, female: 15400 },
    { age: 85, male: 17300, female: 16300 },
];
// ---------------------------------------------------------------------------
// Helper: evaluate a scenario with a given metric
// ---------------------------------------------------------------------------
function evaluateMetric(scenario, projFn, mcFn, metric, mcRuns, mcSeed) {
    if (metric === 'mc_success_pct' && mcFn) {
        const mc = mcFn(scenario, projFn, { runs: mcRuns, seed: mcSeed });
        return mc.probability_no_shortfall;
    }
    const { metrics } = projFn(scenario);
    return metrics.terminal_real;
}
// ---------------------------------------------------------------------------
// Helper: find SS income source index
// ---------------------------------------------------------------------------
function findIncomeSourceIndex(scenario, type) {
    return scenario.income_sources.findIndex((src) => src.enabled && src.type === type);
}
// ---------------------------------------------------------------------------
// Social Security Claiming Optimizer
// ---------------------------------------------------------------------------
/**
 * Grid search over ages 62-70 to find the optimal SS claiming age.
 * At each candidate age, clones the scenario, sets the SS income source's
 * start_age, adjusts the benefit amount by the SSA factor, and evaluates.
 */
export function optimizeSsClaiming(scenario, projFn, mcFn, options) {
    var _a, _b, _c, _d;
    const metric = (_a = options === null || options === void 0 ? void 0 : options.metric) !== null && _a !== void 0 ? _a : 'terminal_real';
    const mcRuns = (_b = options === null || options === void 0 ? void 0 : options.mc_runs) !== null && _b !== void 0 ? _b : 200;
    const mcSeed = (_c = options === null || options === void 0 ? void 0 : options.mc_seed) !== null && _c !== void 0 ? _c : 42;
    const ssIdx = findIncomeSourceIndex(scenario, 'Social Security');
    if (ssIdx === -1) {
        // No SS source: return a degenerate result
        const val = evaluateMetric(scenario, projFn, mcFn, metric, mcRuns, mcSeed);
        return {
            optimal_age: 67,
            metric_at_optimal: val,
            sweep: [{ age: 67, metric_value: val }],
        };
    }
    const baseSsAmount = scenario.income_sources[ssIdx].amount;
    // Assume FRA amount is the base. We reverse-engineer: if the user set a
    // start_age and amount, we treat the stored amount as the FRA benefit.
    const fraAmount = baseSsAmount;
    const sweep = [];
    let bestAge = 62;
    let bestMetric = -Infinity;
    for (let age = 62; age <= 70; age++) {
        const factor = (_d = SSA_ADJUSTMENT_FACTORS[age]) !== null && _d !== void 0 ? _d : 1.0;
        const adjustedAmount = fraAmount * factor;
        // Clone scenario with modified SS source
        const clonedSources = scenario.income_sources.map((src, idx) => {
            if (idx === ssIdx) {
                return Object.assign(Object.assign({}, src), { start_age: age, amount: adjustedAmount });
            }
            return src;
        });
        const clonedScenario = Object.assign(Object.assign({}, scenario), { income_sources: clonedSources, ss_claiming_age: age });
        const val = evaluateMetric(clonedScenario, projFn, mcFn, metric, mcRuns, mcSeed);
        sweep.push({ age, metric_value: val });
        if (val > bestMetric) {
            bestMetric = val;
            bestAge = age;
        }
    }
    return {
        optimal_age: bestAge,
        metric_at_optimal: bestMetric,
        sweep,
    };
}
// ---------------------------------------------------------------------------
// Pension Claiming Optimizer
// ---------------------------------------------------------------------------
/**
 * Grid search over ages 55-75 to find the optimal pension claiming age.
 * Uses pension_early_factor_pct and pension_late_factor_pct from the scenario.
 */
export function optimizePensionClaiming(scenario, projFn, mcFn, options) {
    var _a, _b, _c, _d, _e;
    const metric = (_a = options === null || options === void 0 ? void 0 : options.metric) !== null && _a !== void 0 ? _a : 'terminal_real';
    const mcRuns = (_b = options === null || options === void 0 ? void 0 : options.mc_runs) !== null && _b !== void 0 ? _b : 200;
    const mcSeed = (_c = options === null || options === void 0 ? void 0 : options.mc_seed) !== null && _c !== void 0 ? _c : 42;
    const pensionIdx = findIncomeSourceIndex(scenario, 'Pension');
    if (pensionIdx === -1) {
        const val = evaluateMetric(scenario, projFn, mcFn, metric, mcRuns, mcSeed);
        return {
            optimal_age: scenario.retirement_age,
            metric_at_optimal: val,
            sweep: [{ age: scenario.retirement_age, metric_value: val }],
        };
    }
    const basePensionAmount = scenario.income_sources[pensionIdx].amount;
    const earlyFactor = ((_d = scenario.pension_early_factor_pct) !== null && _d !== void 0 ? _d : 3) / 100;
    const lateFactor = ((_e = scenario.pension_late_factor_pct) !== null && _e !== void 0 ? _e : 6) / 100;
    const nra = scenario.retirement_age; // Normal Retirement Age
    const sweep = [];
    let bestAge = 55;
    let bestMetric = -Infinity;
    for (let age = 55; age <= 75; age++) {
        let factor;
        if (age < nra) {
            factor = 1 - earlyFactor * (nra - age);
        }
        else if (age > nra) {
            factor = 1 + lateFactor * (age - nra);
        }
        else {
            factor = 1;
        }
        factor = Math.max(0, factor);
        const adjustedAmount = basePensionAmount * factor;
        const clonedSources = scenario.income_sources.map((src, idx) => {
            if (idx === pensionIdx) {
                return Object.assign(Object.assign({}, src), { start_age: age, amount: adjustedAmount });
            }
            return src;
        });
        const clonedScenario = Object.assign(Object.assign({}, scenario), { income_sources: clonedSources });
        const val = evaluateMetric(clonedScenario, projFn, mcFn, metric, mcRuns, mcSeed);
        sweep.push({ age, metric_value: val });
        if (val > bestMetric) {
            bestMetric = val;
            bestAge = age;
        }
    }
    return {
        optimal_age: bestAge,
        metric_at_optimal: bestMetric,
        sweep,
    };
}
// ---------------------------------------------------------------------------
// Annuity Timing Optimizer
// ---------------------------------------------------------------------------
/**
 * Lookup annuity rate for a given age and sex. Interpolates if age is between
 * table entries.
 */
function lookupAnnuityRate(age, sex) {
    const field = sex === 'F' ? 'female' : 'male';
    if (age <= ANNUITY_RATE_TABLE[0].age) {
        return ANNUITY_RATE_TABLE[0][field];
    }
    if (age >= ANNUITY_RATE_TABLE[ANNUITY_RATE_TABLE.length - 1].age) {
        return ANNUITY_RATE_TABLE[ANNUITY_RATE_TABLE.length - 1][field];
    }
    for (let i = 0; i < ANNUITY_RATE_TABLE.length - 1; i++) {
        if (age >= ANNUITY_RATE_TABLE[i].age && age < ANNUITY_RATE_TABLE[i + 1].age) {
            const t = (age - ANNUITY_RATE_TABLE[i].age) /
                (ANNUITY_RATE_TABLE[i + 1].age - ANNUITY_RATE_TABLE[i].age);
            return ANNUITY_RATE_TABLE[i][field] +
                t * (ANNUITY_RATE_TABLE[i + 1][field] - ANNUITY_RATE_TABLE[i][field]);
        }
    }
    return ANNUITY_RATE_TABLE[ANNUITY_RATE_TABLE.length - 1][field];
}
/**
 * Grid search over ages current_age to retirement_age to find the optimal
 * annuity purchase timing. At each candidate age, a portion of the portfolio
 * (annuity_purchase_pct) is used to buy an annuity at the rate for that age.
 */
export function optimizeAnnuityTiming(scenario, projFn, mcFn, options) {
    var _a, _b, _c, _d, _e, _f;
    const metric = (_a = options === null || options === void 0 ? void 0 : options.metric) !== null && _a !== void 0 ? _a : 'terminal_real';
    const mcRuns = (_b = options === null || options === void 0 ? void 0 : options.mc_runs) !== null && _b !== void 0 ? _b : 200;
    const mcSeed = (_c = options === null || options === void 0 ? void 0 : options.mc_seed) !== null && _c !== void 0 ? _c : 42;
    const purchasePct = ((_d = scenario.annuity_purchase_pct) !== null && _d !== void 0 ? _d : 0) / 100;
    const sex = (_e = scenario.sex) !== null && _e !== void 0 ? _e : 'Unspecified';
    if (purchasePct <= 0) {
        const val = evaluateMetric(scenario, projFn, mcFn, metric, mcRuns, mcSeed);
        return {
            optimal_age: scenario.current_age,
            metric_at_optimal: val,
            sweep: [{ age: scenario.current_age, metric_value: val }],
        };
    }
    const sweep = [];
    let bestAge = scenario.current_age;
    let bestMetric = -Infinity;
    for (let age = scenario.current_age; age <= scenario.retirement_age; age++) {
        // At the candidate age, assume the portfolio has grown to approximately
        // current_balance * (1 + nominal_return)^(age - current_age).
        // The purchase amount is purchasePct of that projected balance.
        const yearsToAge = age - scenario.current_age;
        const growthFactor = Math.pow(1 + scenario.nominal_return_pct / 100, yearsToAge);
        const projectedBalance = scenario.current_balance * growthFactor;
        const purchaseAmount = projectedBalance * purchasePct;
        // Annuity payout: rate per $100k of purchase
        const annuityRate = lookupAnnuityRate(age, sex);
        const annualPayout = (purchaseAmount / 100000) * annuityRate;
        // Clone scenario: reduce balance by purchase amount (via a liquidity
        // event debit at the purchase age), add an annuity income source.
        const newIncomeSources = [
            ...scenario.income_sources,
            {
                label: 'Annuity (optimizer)',
                type: 'Annuity',
                amount: annualPayout,
                frequency: 'Annual',
                start_age: age,
                end_age: scenario.end_age,
                inflation_adjusted: false,
                taxable: true,
                tax_rate: (_f = scenario.effective_tax_rate_pct) !== null && _f !== void 0 ? _f : 0,
                enabled: true,
            },
        ];
        const newLiquidityEvents = [
            ...scenario.liquidity_events,
            {
                type: 'Debit',
                label: 'Annuity purchase (optimizer)',
                start_age: age,
                end_age: age,
                amount: purchaseAmount,
                recurrence: 'One-Time',
                enabled: true,
                taxable: false,
                tax_rate: 0,
            },
        ];
        const clonedScenario = Object.assign(Object.assign({}, scenario), { income_sources: newIncomeSources, liquidity_events: newLiquidityEvents });
        const val = evaluateMetric(clonedScenario, projFn, mcFn, metric, mcRuns, mcSeed);
        sweep.push({ age, metric_value: val });
        if (val > bestMetric) {
            bestMetric = val;
            bestAge = age;
        }
    }
    return {
        optimal_age: bestAge,
        metric_at_optimal: bestMetric,
        sweep,
    };
}
