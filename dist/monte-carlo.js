/**
 * Monte Carlo Simulation Engine
 *
 * Deterministic, seeded PRNG-based Monte Carlo runner for retirement projections.
 * Generates randomized annual returns and delegates year-by-year calculation to
 * a caller-provided projection function, keeping MC fully decoupled from the
 * projection engine.
 */
import { getLogger } from './logger.js';
import { buildReturnSampler, DEFAULT_CORRELATIONS } from './return-sampler.js';
import { buildInflationSampler } from './inflation-sampler.js';
import { buildLongevitySampler } from './longevity-sampler.js';
import { computeRiskMetrics } from './risk-metrics.js';
import { resolveWeights } from './glide-path.js';
// ---------------------------------------------------------------------------
// SeededRNG — Deterministic PRNG (mulberry32)
// ---------------------------------------------------------------------------
export class SeededRNG {
    constructor(seed = 42) {
        this.state = seed;
    }
    /** Returns a uniform random number in [0, 1). Mulberry32 algorithm. */
    next() {
        this.state |= 0;
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** Returns a standard normal random variate via Box-Muller transform. */
    gaussian() {
        let u1 = this.next();
        const u2 = this.next();
        // CRITICAL GUARD: clamp u1 to [1e-10, 1) to prevent ln(0) = -Infinity
        u1 = Math.max(u1, 1e-10);
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return z0;
    }
}
// ---------------------------------------------------------------------------
// generateReturn — Single random annual return
// ---------------------------------------------------------------------------
export function generateReturn(rng, mean, stdev, distribution) {
    const z = rng.gaussian();
    if (distribution === 'log-normal') {
        // Log-normal return generation per spec:
        //   σ_ln = sqrt(ln(1 + (stdev / (1 + mean))²))
        //   μ_ln = ln(1 + mean) - σ_ln² / 2
        //   return exp(μ_ln + σ_ln * z) - 1
        const ratio = stdev / (1 + mean);
        const sigmaLn = Math.sqrt(Math.log(1 + ratio * ratio));
        const muLn = Math.log(1 + mean) - (sigmaLn * sigmaLn) / 2;
        return Math.exp(muLn + sigmaLn * z) - 1;
    }
    // Normal distribution
    let result = mean + stdev * z;
    // CRITICAL GUARD: clamp return to >= -1.0 (can't lose more than 100%)
    if (result < -1.0) {
        result = -1.0;
    }
    return result;
}
// ---------------------------------------------------------------------------
// extractPercentile — Safe percentile extraction
// ---------------------------------------------------------------------------
export function extractPercentile(sortedArray, p) {
    if (sortedArray.length === 0)
        return 0;
    const index = Math.floor(p * sortedArray.length);
    // Clamp index to valid range
    return sortedArray[Math.min(index, sortedArray.length - 1)];
}
// ---------------------------------------------------------------------------
// runMonteCarloSimulation — Main MC runner
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Helpers — resolve v0.4 sampler configuration from optional Scenario fields
// ---------------------------------------------------------------------------
function resolveReturnProcess(scenario) {
    var _a, _b, _c;
    const kind = (_a = scenario.return_distribution_kind) !== null && _a !== void 0 ? _a : 'LogNormal';
    if (kind === 'StudentT') {
        return { kind: 'StudentT', dof: (_b = scenario.return_distribution_dof) !== null && _b !== void 0 ? _b : 5 };
    }
    if (kind === 'Bootstrap') {
        return { kind: 'Bootstrap', window: (_c = scenario.bootstrap_window) !== null && _c !== void 0 ? _c : [1926, 2024] };
    }
    return { kind: 'LogNormal' };
}
function resolveInflationProcess(scenario) {
    var _a, _b, _c, _d;
    if (scenario.inflation_model === 'AR1') {
        return {
            kind: 'AR1',
            long_run_mean_pct: (_a = scenario.inflation_long_run_mean_pct) !== null && _a !== void 0 ? _a : scenario.inflation_pct,
            phi: (_b = scenario.inflation_ar1_phi) !== null && _b !== void 0 ? _b : 0.6,
            shock_stdev_pct: (_c = scenario.inflation_shock_stdev_pct) !== null && _c !== void 0 ? _c : 1.5,
            initial_pct: (_d = scenario.inflation_initial_pct) !== null && _d !== void 0 ? _d : scenario.inflation_pct,
        };
    }
    return { kind: 'Flat', rate_pct: scenario.inflation_pct };
}
function resolveLongevityModel(scenario) {
    var _a, _b, _c, _d;
    if (scenario.longevity_model === 'Gompertz') {
        return {
            kind: 'Gompertz',
            modal_age: (_a = scenario.longevity_modal_age) !== null && _a !== void 0 ? _a : 88,
            dispersion: (_b = scenario.longevity_dispersion) !== null && _b !== void 0 ? _b : 10,
            sex: scenario.sex,
        };
    }
    if (scenario.longevity_model === 'Cohort') {
        return {
            kind: 'Cohort',
            country: (_c = scenario.longevity_cohort_country) !== null && _c !== void 0 ? _c : 'US',
            sex: (_d = scenario.sex) !== null && _d !== void 0 ? _d : 'Unspecified',
            birth_year: new Date().getFullYear() - scenario.current_age,
        };
    }
    return { kind: 'Fixed', end_age: scenario.end_age };
}
// ---------------------------------------------------------------------------
// runMonteCarloSimulation — Main MC runner
// ---------------------------------------------------------------------------
export function runMonteCarloSimulation(scenario, projectionFn, options = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const runs = (_a = options.runs) !== null && _a !== void 0 ? _a : 1000;
    const seed = (_b = options.seed) !== null && _b !== void 0 ? _b : 42;
    const budgetMs = (_c = options.budgetMs) !== null && _c !== void 0 ? _c : 50000;
    // Validation: mc_runs must be 0 (disabled) or >= 100. Reject 1-99.
    if (runs === 0) {
        return {
            probability_no_shortfall: 0,
            median_terminal: 0,
            p10_terminal: 0,
            p90_terminal: 0,
            fan_chart: [],
            terminal_distribution: [],
            runs_completed: 0,
            truncated: false,
        };
    }
    if (runs < 100 || runs > 10000) {
        throw new Error(`mc_runs must be 0 (disabled) or between 100 and 10000. Got: ${runs}`);
    }
    const log = getLogger();
    log.info('Starting Monte Carlo', { runs, seed, distribution: scenario.return_distribution });
    const rng = new SeededRNG(seed);
    const startTime = Date.now();
    const baseNumYears = scenario.end_age - scenario.current_age;
    const mean = scenario.nominal_return_pct / 100;
    const stdev = scenario.return_stdev_pct / 100;
    const distribution = scenario.return_distribution;
    // -----------------------------------------------------------------------
    // v0.4: resolve stochastic sampler configuration
    // -----------------------------------------------------------------------
    const assetClasses = (_d = scenario.asset_classes) !== null && _d !== void 0 ? _d : [];
    const useMultiAsset = assetClasses.length > 0;
    const inflationModel = (_e = scenario.inflation_model) !== null && _e !== void 0 ? _e : 'Flat';
    const useAR1Inflation = inflationModel === 'AR1';
    const longevityModelKind = (_f = scenario.longevity_model) !== null && _f !== void 0 ? _f : 'Fixed';
    const useStochasticLongevity = longevityModelKind !== 'Fixed';
    // Build longevity sampler (if non-Fixed)
    const longevitySampler = useStochasticLongevity
        ? buildLongevitySampler(resolveLongevityModel(scenario), seed)
        : null;
    // Build inflation sampler (if AR1)
    const inflationProcess = resolveInflationProcess(scenario);
    // Storage for all runs
    const terminalRealValues = [];
    let noShortfallCount = 0;
    let truncated = false;
    let runsCompleted = 0;
    // Balance paths: balancePaths[runIndex][yearIndex] = end_balance_real
    const balancePaths = [];
    // v0.4: additional collectors for risk metrics and stochastic outputs
    const annualisedReturns = [];
    const sampledDeathAges = [];
    const inflationPaths = [];
    for (let run = 0; run < runs; run++) {
        // Budget guard: check wall clock after each batch of 100 runs
        if (run > 0 && run % 100 === 0) {
            const elapsed = Date.now() - startTime;
            if (elapsed > budgetMs) {
                truncated = true;
                log.warn('Monte Carlo truncated due to budget', { runsCompleted: run, elapsed, budgetMs });
                break;
            }
        }
        // Determine whether this trial needs stochastic sub-samplers. When
        // running in pure v0.3 legacy mode (no multi-asset, no AR1, no
        // stochastic longevity), we must NOT consume the master RNG for a
        // trial seed — doing so would break byte-identical output with v0.3.
        const needsTrialSeed = useMultiAsset || useAR1Inflation || useStochasticLongevity;
        const trialSeed = needsTrialSeed
            ? Math.floor(rng.next() * 0x7fffffff)
            : 0;
        // v0.4: sample death age for this trial
        let trialEndAge = scenario.end_age;
        if (longevitySampler) {
            const deathAge = longevitySampler.sample(scenario.current_age);
            trialEndAge = Math.min(deathAge, scenario.end_age);
            sampledDeathAges.push(deathAge);
        }
        const numYears = trialEndAge - scenario.current_age;
        if (numYears <= 0) {
            // Degenerate: already past death age
            terminalRealValues.push(scenario.current_balance);
            balancePaths.push([scenario.current_balance]);
            annualisedReturns.push(0);
            if (useAR1Inflation)
                inflationPaths.push([]);
            runsCompleted = run + 1;
            continue;
        }
        // v0.4: build per-trial return sampler if multi-asset
        const returnSampler = useMultiAsset
            ? buildReturnSampler(assetClasses, (_g = scenario.return_correlation_matrix) !== null && _g !== void 0 ? _g : DEFAULT_CORRELATIONS, resolveReturnProcess(scenario), trialSeed)
            : null;
        // v0.4: build per-trial inflation sampler if AR1
        const inflationSampler = useAR1Inflation
            ? buildInflationSampler(inflationProcess, trialSeed)
            : null;
        // Generate array of random annual returns (one per year)
        const annualReturns = [];
        const trialInflationPath = [];
        let priorInflation = useAR1Inflation
            ? inflationProcess.initial_pct / 100
            : scenario.inflation_pct / 100;
        // v0.5: resolve glide-path configuration for this trial
        const glidePath = (_h = scenario.glide_path) !== null && _h !== void 0 ? _h : [];
        const useGlidePath = glidePath.length > 0;
        if (returnSampler) {
            // Multi-asset path: weighted portfolio return per year
            for (let y = 0; y < numYears; y++) {
                const assetReturns = returnSampler.sample(y);
                let portfolioReturn = 0;
                // v0.5: use glide-path-interpolated weights when available
                if (useGlidePath) {
                    const yearAge = scenario.current_age + y;
                    const weights = resolveWeights(yearAge, assetClasses, glidePath);
                    for (const ac of assetClasses) {
                        const w = ((_j = weights[ac.id]) !== null && _j !== void 0 ? _j : ac.weight_pct) / 100;
                        portfolioReturn += w * ((_k = assetReturns[ac.id]) !== null && _k !== void 0 ? _k : 0);
                    }
                }
                else {
                    for (const ac of assetClasses) {
                        portfolioReturn += (ac.weight_pct / 100) * ((_l = assetReturns[ac.id]) !== null && _l !== void 0 ? _l : 0);
                    }
                }
                annualReturns.push(portfolioReturn);
                if (inflationSampler) {
                    const inflRate = inflationSampler.sample(y, priorInflation);
                    trialInflationPath.push(inflRate);
                    priorInflation = inflRate;
                }
            }
        }
        else {
            // Legacy single-asset path: uses the master RNG directly for
            // byte-identical output with v0.3
            for (let y = 0; y < numYears; y++) {
                annualReturns.push(generateReturn(rng, mean, stdev, distribution));
                if (inflationSampler) {
                    const inflRate = inflationSampler.sample(y, priorInflation);
                    trialInflationPath.push(inflRate);
                    priorInflation = inflRate;
                }
            }
        }
        if (useAR1Inflation)
            inflationPaths.push(trialInflationPath);
        // Build a modified scenario clone for this trial if needed
        let trialScenario = scenario;
        if (trialEndAge !== scenario.end_age) {
            trialScenario = Object.assign(Object.assign({}, scenario), { end_age: trialEndAge });
        }
        // Run projectionFn with randomized returns
        const { timeline, metrics } = projectionFn(trialScenario, annualReturns);
        // Record terminal real value
        terminalRealValues.push(metrics.terminal_real);
        // Record shortfall status
        if (metrics.first_shortfall_age === null) {
            noShortfallCount++;
        }
        // Store full balance path (end_balance_real per year) for fan chart
        const path = timeline.map((row) => row.end_balance_real);
        balancePaths.push(path);
        // Annualised return for this trial (geometric)
        if (numYears > 0 && scenario.current_balance > 0 && metrics.terminal_real > 0) {
            const ratio = metrics.terminal_real / scenario.current_balance;
            annualisedReturns.push(Math.pow(ratio, 1 / numYears) - 1);
        }
        else {
            annualisedReturns.push(0);
        }
        runsCompleted = run + 1;
    }
    // -----------------------------------------------------------------------
    // Extract percentiles from terminal values
    // -----------------------------------------------------------------------
    const sortedTerminals = [...terminalRealValues].sort((a, b) => a - b);
    const p10Terminal = extractPercentile(sortedTerminals, 0.10);
    const p50Terminal = extractPercentile(sortedTerminals, 0.50);
    const p90Terminal = extractPercentile(sortedTerminals, 0.90);
    // -----------------------------------------------------------------------
    // Build fan chart: for each age, extract percentiles across all runs
    // -----------------------------------------------------------------------
    const fanChart = [];
    if (balancePaths.length > 0 && balancePaths[0].length > 0) {
        const maxPathLen = balancePaths.reduce((m, p) => Math.max(m, p.length), 0);
        for (let yearIdx = 0; yearIdx < maxPathLen; yearIdx++) {
            // Collect balances at this year across all completed runs
            const balancesAtYear = [];
            for (let r = 0; r < runsCompleted; r++) {
                if (yearIdx < balancePaths[r].length) {
                    balancesAtYear.push(balancePaths[r][yearIdx]);
                }
            }
            balancesAtYear.sort((a, b) => a - b);
            fanChart.push({
                age: scenario.current_age + yearIdx + 1,
                p10: extractPercentile(balancesAtYear, 0.10),
                p25: extractPercentile(balancesAtYear, 0.25),
                p50: extractPercentile(balancesAtYear, 0.50),
                p75: extractPercentile(balancesAtYear, 0.75),
                p90: extractPercentile(balancesAtYear, 0.90),
            });
        }
    }
    // -----------------------------------------------------------------------
    // Compute probability of no shortfall
    // -----------------------------------------------------------------------
    const probabilityNoShortfall = runsCompleted > 0 ? (noShortfallCount / runsCompleted) * 100 : 0;
    log.info('Monte Carlo complete', {
        runsCompleted,
        successProbability: probabilityNoShortfall,
        medianTerminal: p50Terminal,
        truncated,
    });
    const result = {
        probability_no_shortfall: probabilityNoShortfall,
        median_terminal: p50Terminal,
        p10_terminal: p10Terminal,
        p90_terminal: p90Terminal,
        fan_chart: fanChart,
        terminal_distribution: terminalRealValues,
        runs_completed: runsCompleted,
        truncated,
    };
    // -----------------------------------------------------------------------
    // v0.4: attach risk metrics when we have enough data
    // -----------------------------------------------------------------------
    const horizon = scenario.end_age - scenario.current_age;
    if (runsCompleted >= 200 && horizon >= 10) {
        const riskInputs = {
            terminal_distribution: terminalRealValues,
            real_balance_paths: balancePaths,
            annualised_returns: annualisedReturns,
        };
        result.risk_metrics = computeRiskMetrics(riskInputs, scenario);
    }
    // -----------------------------------------------------------------------
    // v0.4: build inflation fan chart when AR(1) inflation is active
    // -----------------------------------------------------------------------
    if (useAR1Inflation && inflationPaths.length > 0) {
        const inflFanChart = [];
        const maxLen = inflationPaths.reduce((m, p) => Math.max(m, p.length), 0);
        for (let yr = 0; yr < maxLen; yr++) {
            const vals = [];
            for (const path of inflationPaths) {
                if (yr < path.length)
                    vals.push(path[yr]);
            }
            vals.sort((a, b) => a - b);
            inflFanChart.push({
                age: scenario.current_age + yr + 1,
                p10: extractPercentile(vals, 0.10),
                p25: extractPercentile(vals, 0.25),
                p50: extractPercentile(vals, 0.50),
                p75: extractPercentile(vals, 0.75),
                p90: extractPercentile(vals, 0.90),
            });
        }
        result.inflation_fan_chart = inflFanChart;
    }
    // -----------------------------------------------------------------------
    // v0.4: lifespan distribution when stochastic longevity is active
    // -----------------------------------------------------------------------
    if (useStochasticLongevity && sampledDeathAges.length > 0) {
        result.lifespan_distribution = sampledDeathAges;
    }
    return result;
}
