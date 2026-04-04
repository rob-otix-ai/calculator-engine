import type { Scenario, Metrics } from './types';
import { getLogger } from './logger';

// ---------------------------------------------------------------------------
// Retirement Age x Spending Heatmap
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  retirementAge: number;
  annualSpending: number;
  viable: boolean;
  terminalReal: number;
}

export interface HeatmapOptions {
  /** [min, max] retirement age range. Defaults to [current_age+1, end_age-1]. */
  retirementAgeRange?: [number, number];
  /** [min, max] annual spending range. Defaults to [10_000, 120_000]. */
  spendingRange?: [number, number];
  /** Number of steps on each axis. Defaults to 10. */
  steps?: number;
}

/**
 * Deep-clone a scenario.
 */
function cloneScenario(s: Scenario): Scenario {
  return JSON.parse(JSON.stringify(s)) as Scenario;
}

/**
 * Generates a 2D grid of retirement_age x annual_spending cells.
 *
 * For each combination, the scenario is adjusted and a deterministic projection
 * is run.  Each cell records whether the scenario is viable (no shortfall and
 * terminal_real >= desired_estate) along with the terminal_real value.
 *
 * The spending adjustment modifies:
 *   - withdrawal_pct (when using "Fixed % of prior-year end balance")
 *   - withdrawal_real_amount (when using "Fixed real-dollar amount")
 *
 * For percentage-based withdrawal, the spending value is treated as a dollar
 * amount and the withdrawal_real_amount is set (method switched to fixed-dollar)
 * so the heatmap consistently represents dollar-denominated spending levels.
 *
 * @param scenario      Base scenario
 * @param projectionFn  Deterministic projection function
 * @param options       Optional axis ranges and step count
 */
export function generateHeatmap(
  scenario: Scenario,
  projectionFn: (s: Scenario) => { metrics: Metrics },
  options?: HeatmapOptions,
): HeatmapCell[] {
  const steps = options?.steps ?? 10;

  const ageMin = options?.retirementAgeRange?.[0] ?? scenario.current_age + 1;
  const ageMax = options?.retirementAgeRange?.[1] ?? scenario.end_age - 1;

  const spendMin = options?.spendingRange?.[0] ?? 10_000;
  const spendMax = options?.spendingRange?.[1] ?? 120_000;

  // Ensure at least 2 steps to avoid division by zero
  const effectiveSteps = Math.max(steps, 2);

  const ageStep = (ageMax - ageMin) / (effectiveSteps - 1);
  const spendStep = (spendMax - spendMin) / (effectiveSteps - 1);

  const log = getLogger();
  log.info('Generating heatmap', { rows: effectiveSteps, cols: effectiveSteps });

  const cells: HeatmapCell[] = [];
  const desiredEstate = scenario.desired_estate ?? 0;

  for (let ai = 0; ai < effectiveSteps; ai++) {
    const retirementAge = Math.round(ageMin + ai * ageStep);

    // Clamp retirement age to valid range
    const clampedAge = Math.max(
      scenario.current_age + 1,
      Math.min(scenario.end_age - 1, retirementAge),
    );

    for (let si = 0; si < effectiveSteps; si++) {
      const annualSpending = Math.round(spendMin + si * spendStep);

      const s = cloneScenario(scenario);
      s.retirement_age = clampedAge;

      // Set spending as a fixed real-dollar amount for consistent comparison
      s.withdrawal_method = 'Fixed real-dollar amount';
      s.withdrawal_real_amount = Math.max(0, annualSpending);

      const result = projectionFn(s);
      const terminalReal = result.metrics.terminal_real;
      const survived = result.metrics.first_shortfall_age === null;
      const viable = survived && terminalReal >= desiredEstate;

      cells.push({
        retirementAge: clampedAge,
        annualSpending,
        viable,
        terminalReal,
      });
    }
  }

  const viableCells = cells.filter((c) => c.viable).length;
  log.info('Heatmap complete', { viableCells, totalCells: cells.length });

  return cells;
}
