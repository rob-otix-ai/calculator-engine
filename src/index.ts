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
  FanChartRow,
  Metrics,
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

// Logger utilities
export { getLogger, setLogLevel, setLogger, type Logger, type LogLevel } from './logger';
