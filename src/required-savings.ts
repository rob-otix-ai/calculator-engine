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

import type { Scenario, Metrics } from './types';
import { getLogger } from './logger';

// ---------------------------------------------------------------------------
// Public types (SolverResult shape per CONTRACT-016 / DDD-009)
// ---------------------------------------------------------------------------

export interface SolverResult {
  /** True when at least one candidate inside the search range satisfied the success criterion. */
  feasible: boolean;
  /** The solved contribution amount. Present iff `feasible` is true. */
  value?: number;
  /** True when bisection halted naturally (range narrowed to <= 1 unit). False when the iteration cap fired first. */
  converged: boolean;
  /** Number of bisection iterations actually executed. */
  iterations: number;
  /** Optional reason code when the search returns no solution. */
  reason?: 'plan_never_succeeds' | 'iteration_cap' | 'no_search_range';
  /** Last evaluated contribution amount (useful for "no solution" UX). */
  best_attempt?: number;
}

export interface FindRequiredSavingsOptions {
  /** Monte Carlo success threshold percentage (default 90). */
  mcThreshold?: number;
  /** Upper bound of the search range for `contrib_amount` (default 100_000 per cadence). */
  upperBound?: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MAX_ITERATIONS = 24; // CONTRACT-016 invariant: bisection_iteration_cap
const MAX_MC_RUNS = 300; // CONTRACT-016 invariant: mc_runs_capped

function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}

/**
 * Evaluate whether a candidate contribution amount makes the plan viable.
 */
function evaluate(
  scenario: Scenario,
  contrib: number,
  projFn: (s: Scenario) => { metrics: Metrics },
  mcFn: ((s: Scenario) => { probability_no_shortfall: number }) | undefined,
  mcThreshold: number,
): boolean {
  const candidate = cloneScenario(scenario);
  candidate.contrib_amount = contrib;

  // Cap MC runs inside the solver per CONTRACT-016.
  if (candidate.mc_runs && candidate.mc_runs > MAX_MC_RUNS) {
    candidate.mc_runs = MAX_MC_RUNS;
  }

  const proj = projFn(candidate);
  const desired = scenario.desired_estate ?? 0;

  const useMc =
    typeof mcFn === 'function' && Boolean(scenario.enable_mc);

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
export function findRequiredSavings(
  scenario: Scenario,
  projFn: (s: Scenario) => { metrics: Metrics },
  mcFn?: (s: Scenario) => { probability_no_shortfall: number },
  options?: FindRequiredSavingsOptions,
): SolverResult {
  const log = getLogger();
  const mcThreshold = options?.mcThreshold ?? 90;
  const upperBound = options?.upperBound ?? 100_000;

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
  const upperFeasible = evaluate(
    scenario,
    upperBound,
    projFn,
    mcFn,
    mcThreshold,
  );
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
    } else {
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
