// ---------------------------------------------------------------------------
// Engine — barrel export
// ---------------------------------------------------------------------------
export { CadenceMultiplier, DEFAULT_SCENARIO } from './defaults';
// Deterministic projection (basic & advanced)
export { runProjection } from './projection';
export { runAdvancedProjection } from './advanced';
// Monte Carlo simulation
export { runMonteCarloSimulation, } from './monte-carlo';
// Sensitivity (Tornado chart)
export { runSensitivityAnalysis, } from './sensitivity';
// Historical backtest (Shiller data)
export { runHistoricalBacktest, } from './backtest';
// Retirement age optimizer
export { findEarliestRetirementAge, } from './optimizer';
// Retirement age x spending heatmap
export { generateHeatmap, } from './heatmap';
// Portfolio blending & estate value
export { blendPortfolio, calculateEstateValue, } from './portfolio';
