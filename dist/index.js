// ---------------------------------------------------------------------------
// Engine — barrel export
// ---------------------------------------------------------------------------
export { CadenceMultiplier, CURRENCY_MAP, DEFAULT_SCENARIO } from './defaults';
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
// Required-savings reverse solver (CONTRACT-016 / ADR-025)
export { findRequiredSavings, } from './required-savings';
// Withdrawal strategy primitives (CONTRACT-016 / ADR-026) — exported so the
// app can call individual strategies for comparison views.
export { calculateWithdrawal, calculateStandardWithdrawal, calculateGuytonKlingerWithdrawal, calculateAgeBandedWithdrawal, calculateFixedPctWithdrawal, } from './withdrawal';
// Retirement age x spending heatmap
export { generateHeatmap, } from './heatmap';
// Portfolio blending & estate value
export { blendPortfolio, calculateEstateValue, } from './portfolio';
// Logger utilities
export { getLogger, setLogLevel, setLogger } from './logger';
