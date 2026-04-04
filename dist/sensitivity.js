import { getLogger } from './logger';
const PARAMETERS = [
    { name: 'nominal_return_pct', label: 'Return +/-1%', delta: 1, deltaIsPct: false },
    { name: 'inflation_pct', label: 'Inflation +/-0.5%', delta: 0.5, deltaIsPct: false },
    { name: 'withdrawal_pct', label: 'Withdrawal +/-0.5%', delta: 0.5, deltaIsPct: false },
    { name: 'fee_pct', label: 'Fees +/-0.25%', delta: 0.25, deltaIsPct: false },
    { name: 'retirement_age', label: 'Retire Age +/-2y', delta: 2, deltaIsPct: false },
    { name: 'contrib_amount', label: 'Contrib +/-20%', delta: 20, deltaIsPct: true },
    { name: 'current_balance', label: 'Balance +/-10%', delta: 10, deltaIsPct: true },
];
/**
 * Deep-clone a scenario so mutations don't leak back to the original.
 */
function cloneScenario(s) {
    return JSON.parse(JSON.stringify(s));
}
/**
 * Clamp a value to stay within [min, max].
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
/**
 * Runs tornado-chart sensitivity analysis.
 *
 * For each of 7 key parameters, the scenario is cloned and the parameter is
 * adjusted +/- its delta.  A deterministic projection is run for each variant
 * and the terminal_real value is recorded.
 *
 * Results are sorted by spread (largest first) so the most impactful
 * parameters appear at the top of the tornado chart.
 *
 * Guards (from EDGE-CASE-REPORT):
 *   - retirement_age is clamped to (current_age, end_age)
 *   - All percentages are clamped >= 0
 *   - contrib_amount and current_balance are clamped >= 0
 *   - withdrawal_pct delta is skipped when withdrawal_strategy is Age-Banded
 */
export function runSensitivityAnalysis(scenario, projectionFn) {
    var _a;
    const log = getLogger();
    log.info('Starting sensitivity analysis', { parameterCount: PARAMETERS.length });
    const factors = [];
    for (const param of PARAMETERS) {
        // Skip withdrawal_pct when strategy is Age-Banded (not applicable)
        if (param.name === 'withdrawal_pct' && scenario.withdrawal_strategy === 'Age-Banded') {
            continue;
        }
        const baselineValue = scenario[param.name];
        // Compute absolute delta
        const absDelta = param.deltaIsPct
            ? baselineValue * (param.delta / 100)
            : param.delta;
        let lowValue = baselineValue - absDelta;
        let highValue = baselineValue + absDelta;
        // --- Clamping guards ---
        if (param.name === 'retirement_age') {
            // retirement_age must stay in (current_age, end_age)
            lowValue = clamp(Math.round(lowValue), scenario.current_age + 1, scenario.end_age - 1);
            highValue = clamp(Math.round(highValue), scenario.current_age + 1, scenario.end_age - 1);
        }
        else if (param.name === 'nominal_return_pct' ||
            param.name === 'inflation_pct' ||
            param.name === 'withdrawal_pct' ||
            param.name === 'fee_pct') {
            // Percentages must stay >= 0
            lowValue = Math.max(0, lowValue);
            highValue = Math.max(0, highValue);
        }
        else if (param.name === 'contrib_amount' || param.name === 'current_balance') {
            // Monetary amounts must stay >= 0
            lowValue = Math.max(0, lowValue);
            highValue = Math.max(0, highValue);
        }
        // Run projection with low value
        const lowScenario = cloneScenario(scenario);
        lowScenario[param.name] = lowValue;
        const lowResult = projectionFn(lowScenario);
        // Run projection with high value
        const highScenario = cloneScenario(scenario);
        highScenario[param.name] = highValue;
        const highResult = projectionFn(highScenario);
        const spread = Math.abs(highResult.metrics.terminal_real - lowResult.metrics.terminal_real);
        log.debug('Sensitivity parameter result', {
            name: param.name,
            lowTerminal: lowResult.metrics.terminal_real,
            highTerminal: highResult.metrics.terminal_real,
            spread,
        });
        factors.push({
            name: param.name,
            label: param.label,
            lowValue,
            highValue,
            lowTerminal: lowResult.metrics.terminal_real,
            highTerminal: highResult.metrics.terminal_real,
            spread,
        });
    }
    // Sort by spread descending (largest impact first)
    factors.sort((a, b) => b.spread - a.spread);
    log.info('Sensitivity complete', { topFactor: (_a = factors[0]) === null || _a === void 0 ? void 0 : _a.name });
    return factors;
}
