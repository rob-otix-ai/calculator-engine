import type { Scenario, Metrics } from './types';
import { getLogger } from './logger';

// ---------------------------------------------------------------------------
// Retirement Age Optimizer
// ---------------------------------------------------------------------------

export interface OptimizerResult {
  retirementAge: number;
  terminalReal: number;
  survived: boolean;
  mcSuccessPct: number | null;
}

export interface OptimizerOutput {
  results: OptimizerResult[];
  earliestViableAge: number | null;
  minContribution: number | null;
}

export interface OptimizerOptions {
  /** MC success threshold percentage (default 90). */
  mcThreshold?: number;
}

/**
 * Deep-clone a scenario.
 */
function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}

/**
 * Checks whether a given retirement age is viable for the scenario.
 *
 * Viable means:
 *   1. Deterministic projection survives (no shortfall)
 *   2. terminal_real >= desired_estate
 *   3. If MC function provided: MC success >= threshold
 */
function isViable(
  scenario: Scenario,
  retirementAge: number,
  projectionFn: (s: Scenario) => { metrics: Metrics },
  mcFn?: (s: Scenario) => { probability_no_shortfall: number },
  mcThreshold = 90,
): { result: OptimizerResult; viable: boolean } {
  const s = cloneScenario(scenario);
  s.retirement_age = retirementAge;

  const proj = projectionFn(s);
  const terminalReal = proj.metrics.terminal_real;
  const survived = proj.metrics.first_shortfall_age === null;
  const meetsEstate = terminalReal >= (scenario.desired_estate ?? 0);

  let mcSuccessPct: number | null = null;
  let mcPasses = true;

  if (mcFn) {
    const mcResult = mcFn(s);
    mcSuccessPct = mcResult.probability_no_shortfall;
    mcPasses = mcSuccessPct >= mcThreshold;
  }

  const viable = survived && meetsEstate && mcPasses;

  return {
    result: {
      retirementAge,
      terminalReal,
      survived,
      mcSuccessPct,
    },
    viable,
  };
}

/**
 * Binary search for the minimum contribution amount (within $1 tolerance)
 * that makes a given retirement age viable.
 *
 * Returns the minimum contribution, or null if even the maximum doesn't work.
 */
function findMinContribution(
  scenario: Scenario,
  retirementAge: number,
  projectionFn: (s: Scenario) => { metrics: Metrics },
  mcFn?: (s: Scenario) => { probability_no_shortfall: number },
  mcThreshold = 90,
): number | null {
  // Search between 0 and a reasonable upper bound.
  // Use 10x the current contribution or $100,000/month as the ceiling.
  const maxContrib = Math.max(scenario.contrib_amount * 10, 100_000);
  let lo = 0;
  let hi = maxContrib;

  // First check if even the max contribution works
  const sMax = cloneScenario(scenario);
  sMax.retirement_age = retirementAge;
  sMax.contrib_amount = hi;
  const maxCheck = isViable(sMax, retirementAge, projectionFn, mcFn, mcThreshold);
  if (!maxCheck.viable) {
    return null; // Even maximum contribution doesn't make it viable
  }

  // Check if zero contribution already works
  const sMin = cloneScenario(scenario);
  sMin.retirement_age = retirementAge;
  sMin.contrib_amount = 0;
  const minCheck = isViable(sMin, retirementAge, projectionFn, mcFn, mcThreshold);
  if (minCheck.viable) {
    return 0;
  }

  // Binary search within $1 tolerance
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const s = cloneScenario(scenario);
    s.retirement_age = retirementAge;
    s.contrib_amount = mid;
    const check = isViable(s, retirementAge, projectionFn, mcFn, mcThreshold);
    if (check.viable) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return hi;
}

/**
 * Finds the earliest viable retirement age by testing each candidate from
 * current_age + 1 to end_age - 1.
 *
 * For each candidate:
 *   - Runs a deterministic projection
 *   - Checks terminal_real >= desired_estate AND no shortfall
 *   - If mcFn provided: runs MC (capped at 300 runs externally) and checks
 *     success >= mcThreshold
 *
 * Also binary-searches for the minimum contribution amount at the earliest
 * viable age (within $1 tolerance).
 *
 * @param scenario     Base scenario
 * @param projectionFn Deterministic projection function
 * @param mcFn         Optional Monte Carlo function (should use 300 capped runs)
 * @param options      Optional { mcThreshold } (default 90)
 */
export function findEarliestRetirementAge(
  scenario: Scenario,
  projectionFn: (s: Scenario) => { metrics: Metrics },
  mcFn?: (s: Scenario) => { probability_no_shortfall: number },
  options?: OptimizerOptions,
): OptimizerOutput {
  const log = getLogger();
  const mcThreshold = options?.mcThreshold ?? 90;
  const results: OptimizerResult[] = [];
  let earliestViableAge: number | null = null;

  const startAge = scenario.current_age + 1;
  const endAge = scenario.end_age - 1;

  log.info('Starting optimizer', {
    searchRange: [startAge, endAge],
    mcEnabled: mcFn != null,
  });

  // Budget guard: track wall-clock time (50s limit per CONTRACT-005)
  const startTime = Date.now();
  const BUDGET_MS = 50_000;

  for (let age = startAge; age <= endAge; age++) {
    // Budget guard: abort if we've exceeded 50 seconds
    if (Date.now() - startTime > BUDGET_MS) {
      break;
    }

    const { result, viable } = isViable(
      scenario,
      age,
      projectionFn,
      mcFn,
      mcThreshold,
    );

    log.debug('Optimizer candidate', {
      age,
      terminalReal: result.terminalReal,
      survived: result.survived,
      viable,
    });

    results.push(result);

    if (viable && earliestViableAge === null) {
      earliestViableAge = age;
    }
  }

  // Find minimum contribution for earliest viable age
  let minContribution: number | null = null;
  if (earliestViableAge !== null) {
    minContribution = findMinContribution(
      scenario,
      earliestViableAge,
      projectionFn,
      mcFn,
      mcThreshold,
    );
  }

  log.info('Optimizer complete', { earliestViableAge, minContribution });

  return {
    results,
    earliestViableAge,
    minContribution,
  };
}
