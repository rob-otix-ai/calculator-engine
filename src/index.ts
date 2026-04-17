// ---------------------------------------------------------------------------
// Engine — barrel export
// ---------------------------------------------------------------------------

// Types & defaults (standalone — no @shorecrest/schemas dependency)
export type {
  Cadence,
  CurrencyCode,
  ContribStep,
  ProfitStep,
  RaiseStep,
  YieldStep,
  IncomeStep,
  LoanDraw,
  LumpRepayment,
  SpendingPhase,
  TaxConfig,
  IncomeSource,
  Asset,
  LiquidityEvent,
  FinancialItemCategory,
  FinancialItem,
  Scenario,
  TimelineRow,
  WithdrawalEvent,
  FanChartRow,
  Metrics,
  // v0.4 stochastic types (CONTRACT-018)
  AssetClass,
  AssetClassId,
  ReturnCorrelationMatrix,
  RiskMetrics,
  ReturnProcess,
  InflationProcess,
  LongevityModel,
  Sex,
  ReturnSampler,
  InflationSampler,
  LongevitySampler,
  // v0.5 optimization types (CONTRACT-019)
  GlidePathStep,
  FrontierPoint,
  EfficientFrontierResult,
  ClaimingOptimizerResult,
  // v0.6 onshore/offshore tax types (CONTRACT-020)
  TaxResidence,
  TaxDomicile,
  TaxWrapper,
  TaxLot,
  TaxBreakdown,
  WrapperTaxResult,
} from './types';

export { CadenceMultiplier, CURRENCY_MAP, DEFAULT_SCENARIO, type CurrencyInfo } from './defaults';

// Deterministic projection (basic & advanced)
export { runProjection } from './projection';
export { runAdvancedProjection } from './advanced';

// Monte Carlo simulation
export {
  runMonteCarloSimulation,
  type MCOptions,
  type MCResult,
  type ProjectionFn,
} from './monte-carlo';

// Sensitivity (Tornado chart)
export {
  runSensitivityAnalysis,
  type SensitivityFactor,
} from './sensitivity';

// Historical backtest (Shiller data)
export {
  runHistoricalBacktest,
  type BacktestPeriod,
  type BacktestResult,
} from './backtest';

// Retirement age optimizer
export {
  findEarliestRetirementAge,
  type OptimizerResult,
  type OptimizerOutput,
  type OptimizerOptions,
} from './optimizer';

// Required-savings reverse solver (CONTRACT-016 / ADR-025)
export {
  findRequiredSavings,
  type SolverResult,
  type FindRequiredSavingsOptions,
} from './required-savings';

// Withdrawal strategy primitives (CONTRACT-016 / ADR-026) — exported so the
// app can call individual strategies for comparison views.
export {
  calculateWithdrawal,
  calculateStandardWithdrawal,
  calculateGuytonKlingerWithdrawal,
  calculateAgeBandedWithdrawal,
  calculateFixedPctWithdrawal,
  type WithdrawalParams,
  type WithdrawalResult,
  type StandardWithdrawalParams,
  type GuytonKlingerWithdrawalParams,
  type AgeBandedWithdrawalParams,
  type FixedPctWithdrawalParams,
  type GKState,
} from './withdrawal';

// Retirement age x spending heatmap
export {
  generateHeatmap,
  type HeatmapCell,
  type HeatmapOptions,
} from './heatmap';

// Portfolio blending & estate value
export {
  blendPortfolio,
  calculateEstateValue,
  type BlendedPortfolio,
} from './portfolio';

// v0.4 stochastic samplers (ADR-030 through ADR-033)
export {
  buildReturnSampler,
  DEFAULT_ASSET_CLASSES,
  DEFAULT_CORRELATIONS,
  SHILLER_SERIES,
} from './return-sampler';

export {
  buildInflationSampler,
  INFLATION_CALIBRATION_PRESETS,
  INFLATION_CALIBRATION_PRESETS as INFLATION_PRESETS,
} from './inflation-sampler';

export {
  buildLongevitySampler,
} from './longevity-sampler';

export { computeRiskMetrics, type MCRiskInputs } from './risk-metrics';

// v0.5 — Glide-path allocation (ADR-034 / CONTRACT-019)
export { resolveWeights } from './glide-path';

// v0.5 — Efficient frontier (ADR-035 / CONTRACT-019)
export { computeEfficientFrontier } from './efficient-frontier';

// v0.5 — Claiming optimizers (ADR-036 / CONTRACT-019)
export {
  optimizeSsClaiming,
  optimizePensionClaiming,
  optimizeAnnuityTiming,
  SSA_ADJUSTMENT_FACTORS,
  ANNUITY_RATE_TABLE,
} from './claiming-optimizers';

// v0.6 — Onshore/Offshore Tax (ADR-037 / CONTRACT-020)
export {
  computeWrapperTax,
  computeRMD,
  getWithholdingRate,
  RMD_DIVISOR_TABLE,
  WITHHOLDING_TREATY_TABLE,
  US_FEDERAL_TAX_BRACKETS_2025,
  UK_INCOME_TAX_BANDS_2025,
} from './wrapper-tax';

export { TaxLotTracker } from './tax-lots';

// Logger utilities
export { getLogger, setLogLevel, setLogger, type Logger, type LogLevel } from './logger';
