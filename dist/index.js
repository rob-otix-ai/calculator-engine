// ---------------------------------------------------------------------------
// Engine — barrel export
// ---------------------------------------------------------------------------
export { CadenceMultiplier, CURRENCY_MAP, DEFAULT_SCENARIO } from './defaults.js';
// Deterministic projection (basic & advanced)
export { runProjection } from './projection.js';
export { runAdvancedProjection } from './advanced.js';
// Monte Carlo simulation
export { runMonteCarloSimulation, } from './monte-carlo.js';
// Sensitivity (Tornado chart)
export { runSensitivityAnalysis, } from './sensitivity.js';
// Historical backtest (Shiller data)
export { runHistoricalBacktest, } from './backtest.js';
// Retirement age optimizer
export { findEarliestRetirementAge, } from './optimizer.js';
// Required-savings reverse solver (CONTRACT-016 / ADR-025)
export { findRequiredSavings, } from './required-savings.js';
// Withdrawal strategy primitives (CONTRACT-016 / ADR-026) — exported so the
// app can call individual strategies for comparison views.
export { calculateWithdrawal, calculateStandardWithdrawal, calculateGuytonKlingerWithdrawal, calculateAgeBandedWithdrawal, calculateFixedPctWithdrawal, } from './withdrawal.js';
// Retirement age x spending heatmap
export { generateHeatmap, } from './heatmap.js';
// Portfolio blending & estate value
export { blendPortfolio, calculateEstateValue, } from './portfolio.js';
// v0.4 stochastic samplers (ADR-030 through ADR-033)
export { buildReturnSampler, DEFAULT_ASSET_CLASSES, DEFAULT_CORRELATIONS, SHILLER_SERIES, } from './return-sampler.js';
export { buildInflationSampler, INFLATION_CALIBRATION_PRESETS, INFLATION_CALIBRATION_PRESETS as INFLATION_PRESETS, } from './inflation-sampler.js';
export { buildLongevitySampler, } from './longevity-sampler.js';
export { computeRiskMetrics } from './risk-metrics.js';
// v0.5 — Glide-path allocation (ADR-034 / CONTRACT-019)
export { resolveWeights } from './glide-path.js';
// v0.5 — Efficient frontier (ADR-035 / CONTRACT-019)
export { computeEfficientFrontier } from './efficient-frontier.js';
// v0.5 — Claiming optimizers (ADR-036 / CONTRACT-019)
export { optimizeSsClaiming, optimizePensionClaiming, optimizeAnnuityTiming, SSA_ADJUSTMENT_FACTORS, ANNUITY_RATE_TABLE, } from './claiming-optimizers.js';
// Logger utilities
export { getLogger, setLogLevel, setLogger } from './logger.js';
