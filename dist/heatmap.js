import { getLogger } from './logger';
/**
 * Deep-clone a scenario.
 */
function cloneScenario(s) {
    return JSON.parse(JSON.stringify(s));
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
export function generateHeatmap(scenario, projectionFn, options) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    const steps = (_a = options === null || options === void 0 ? void 0 : options.steps) !== null && _a !== void 0 ? _a : 10;
    const ageMin = (_c = (_b = options === null || options === void 0 ? void 0 : options.retirementAgeRange) === null || _b === void 0 ? void 0 : _b[0]) !== null && _c !== void 0 ? _c : scenario.current_age + 1;
    const ageMax = (_e = (_d = options === null || options === void 0 ? void 0 : options.retirementAgeRange) === null || _d === void 0 ? void 0 : _d[1]) !== null && _e !== void 0 ? _e : scenario.end_age - 1;
    const spendMin = (_g = (_f = options === null || options === void 0 ? void 0 : options.spendingRange) === null || _f === void 0 ? void 0 : _f[0]) !== null && _g !== void 0 ? _g : 10000;
    const spendMax = (_j = (_h = options === null || options === void 0 ? void 0 : options.spendingRange) === null || _h === void 0 ? void 0 : _h[1]) !== null && _j !== void 0 ? _j : 120000;
    // Ensure at least 2 steps to avoid division by zero
    const effectiveSteps = Math.max(steps, 2);
    const ageStep = (ageMax - ageMin) / (effectiveSteps - 1);
    const spendStep = (spendMax - spendMin) / (effectiveSteps - 1);
    const log = getLogger();
    log.info('Generating heatmap', { rows: effectiveSteps, cols: effectiveSteps });
    const cells = [];
    const desiredEstate = (_k = scenario.desired_estate) !== null && _k !== void 0 ? _k : 0;
    for (let ai = 0; ai < effectiveSteps; ai++) {
        const retirementAge = Math.round(ageMin + ai * ageStep);
        // Clamp retirement age to valid range
        const clampedAge = Math.max(scenario.current_age + 1, Math.min(scenario.end_age - 1, retirementAge));
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
