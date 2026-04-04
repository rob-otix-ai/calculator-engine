/**
 * Monte Carlo Simulation Engine
 *
 * Deterministic, seeded PRNG-based Monte Carlo runner for retirement projections.
 * Generates randomized annual returns and delegates year-by-year calculation to
 * a caller-provided projection function, keeping MC fully decoupled from the
 * projection engine.
 */
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
export function runMonteCarloSimulation(scenario, projectionFn, options = {}) {
    var _a, _b, _c;
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
    const rng = new SeededRNG(seed);
    const startTime = Date.now();
    const numYears = scenario.end_age - scenario.current_age;
    const mean = scenario.nominal_return_pct / 100;
    const stdev = scenario.return_stdev_pct / 100;
    const distribution = scenario.return_distribution;
    // Storage for all runs
    const terminalRealValues = [];
    let noShortfallCount = 0;
    let truncated = false;
    let runsCompleted = 0;
    // Balance paths: balancePaths[runIndex][yearIndex] = end_balance_real
    // We store these to compute fan chart percentiles across runs per age.
    const balancePaths = [];
    for (let run = 0; run < runs; run++) {
        // Budget guard: check wall clock after each batch of 100 runs
        if (run > 0 && run % 100 === 0) {
            const elapsed = Date.now() - startTime;
            if (elapsed > budgetMs) {
                truncated = true;
                break;
            }
        }
        // Generate array of random annual returns (one per year)
        const annualReturns = [];
        for (let y = 0; y < numYears; y++) {
            annualReturns.push(generateReturn(rng, mean, stdev, distribution));
        }
        // Run projectionFn with randomized returns
        const { timeline, metrics } = projectionFn(scenario, annualReturns);
        // Record terminal real value
        terminalRealValues.push(metrics.terminal_real);
        // Record shortfall status
        if (metrics.first_shortfall_age === null) {
            noShortfallCount++;
        }
        // Store full balance path (end_balance_real per year) for fan chart
        const path = timeline.map((row) => row.end_balance_real);
        balancePaths.push(path);
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
        const pathLength = balancePaths[0].length;
        for (let yearIdx = 0; yearIdx < pathLength; yearIdx++) {
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
    return {
        probability_no_shortfall: probabilityNoShortfall,
        median_terminal: p50Terminal,
        p10_terminal: p10Terminal,
        p90_terminal: p90Terminal,
        fan_chart: fanChart,
        terminal_distribution: terminalRealValues,
        runs_completed: runsCompleted,
        truncated,
    };
}
