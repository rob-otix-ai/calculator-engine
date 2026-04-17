/**
 * findRequiredSavings — reverse solver for minimum required contribution.
 *
 * Implements CONTRACT-016 §"required-savings" and ADR-025.
 *
 * Bisects the `contrib_amount` field of a Scenario over [0, upperBound] to
 * find the minimum periodic contribution that makes the plan viable. The
 * iteration count is capped at 24 (per CONTRACT-016 / ADR-025), the internal
 * Monte Carlo runs are capped at 300, and the result shape matches DDD-009's
 * `SolverResult`.
 *
 * Success criterion (per ADR-025):
 *   - Deterministic: terminal_real >= scenario.desired_estate (default 0)
 *   - Monte Carlo:   when scenario.enable_mc and an mcFn is supplied, MC
 *                    `probability_no_shortfall` >= mcThreshold (default 90)
 */
import { getLogger } from './logger.js';
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const MAX_ITERATIONS = 24; // CONTRACT-016 invariant: bisection_iteration_cap
const MAX_MC_RUNS = 300; // CONTRACT-016 invariant: mc_runs_capped
function cloneScenario(s) {
    return JSON.parse(JSON.stringify(s));
}
/**
 * Evaluate whether a candidate contribution amount makes the plan viable.
 */
function evaluate(scenario, contrib, projFn, mcFn, mcThreshold) {
    var _a;
    const candidate = cloneScenario(scenario);
    candidate.contrib_amount = contrib;
    // Cap MC runs inside the solver per CONTRACT-016.
    if (candidate.mc_runs && candidate.mc_runs > MAX_MC_RUNS) {
        candidate.mc_runs = MAX_MC_RUNS;
    }
    const proj = projFn(candidate);
    const desired = (_a = scenario.desired_estate) !== null && _a !== void 0 ? _a : 0;
    const useMc = typeof mcFn === 'function' && Boolean(scenario.enable_mc);
    if (useMc && mcFn) {
        const mc = mcFn(candidate);
        return mc.probability_no_shortfall >= mcThreshold;
    }
    return proj.metrics.terminal_real >= desired;
}
// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------
/**
 * Find the minimum periodic contribution amount that makes the scenario
 * viable. See module header for full semantics.
 */
export function findRequiredSavings(scenario, projFn, mcFn, options) {
    var _a, _b;
    const log = getLogger();
    const mcThreshold = (_a = options === null || options === void 0 ? void 0 : options.mcThreshold) !== null && _a !== void 0 ? _a : 90;
    const upperBound = (_b = options === null || options === void 0 ? void 0 : options.upperBound) !== null && _b !== void 0 ? _b : 100000;
    if (upperBound <= 0) {
        return {
            feasible: false,
            converged: true,
            iterations: 0,
            reason: 'no_search_range',
        };
    }
    log.info('findRequiredSavings: starting', {
        upperBound,
        mcThreshold,
        mcEnabled: mcFn != null && scenario.enable_mc === true,
    });
    let iterations = 0;
    // First, check if the upper bound itself is feasible. If not, no solution
    // exists within the search range.
    const upperFeasible = evaluate(scenario, upperBound, projFn, mcFn, mcThreshold);
    iterations++;
    if (!upperFeasible) {
        log.warn('findRequiredSavings: upper bound infeasible', { upperBound });
        return {
            feasible: false,
            converged: true,
            iterations,
            reason: 'plan_never_succeeds',
            best_attempt: upperBound,
        };
    }
    // Then, check if zero contribution is already enough.
    const zeroFeasible = evaluate(scenario, 0, projFn, mcFn, mcThreshold);
    iterations++;
    if (zeroFeasible) {
        log.info('findRequiredSavings: zero contribution suffices');
        return {
            feasible: true,
            value: 0,
            converged: true,
            iterations,
            best_attempt: 0,
        };
    }
    // Bisect between 0 and upperBound.
    let lo = 0;
    let hi = upperBound;
    let lastFeasible = upperBound;
    let cappedOut = false;
    while (hi - lo > 1) {
        if (iterations >= MAX_ITERATIONS) {
            cappedOut = true;
            break;
        }
        const mid = (lo + hi) / 2;
        const ok = evaluate(scenario, mid, projFn, mcFn, mcThreshold);
        iterations++;
        if (ok) {
            lastFeasible = mid;
            hi = mid;
        }
        else {
            lo = mid;
        }
    }
    log.info('findRequiredSavings: complete', {
        iterations,
        value: lastFeasible,
        cappedOut,
    });
    return {
        feasible: true,
        value: lastFeasible,
        converged: !cappedOut,
        iterations,
        reason: cappedOut ? 'iteration_cap' : undefined,
        best_attempt: lastFeasible,
    };
}
