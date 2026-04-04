export type { Cadence, CurrencyCode, ContribStep, ProfitStep, RaiseStep, YieldStep, IncomeStep, LoanDraw, LumpRepayment, SpendingPhase, TaxConfig, IncomeSource, Asset, LiquidityEvent, FinancialItemCategory, FinancialItem, Scenario, TimelineRow, FanChartRow, Metrics, } from './types';
export { CadenceMultiplier, CURRENCY_MAP, DEFAULT_SCENARIO, type CurrencyInfo } from './defaults';
export { runProjection } from './projection';
export { runAdvancedProjection } from './advanced';
export { runMonteCarloSimulation, type MCOptions, type MCResult, type ProjectionFn, } from './monte-carlo';
export { runSensitivityAnalysis, type SensitivityFactor, } from './sensitivity';
export { runHistoricalBacktest, type BacktestPeriod, type BacktestResult, } from './backtest';
export { findEarliestRetirementAge, type OptimizerResult, type OptimizerOutput, type OptimizerOptions, } from './optimizer';
export { generateHeatmap, type HeatmapCell, type HeatmapOptions, } from './heatmap';
export { blendPortfolio, calculateEstateValue, type BlendedPortfolio, } from './portfolio';
export { getLogger, setLogLevel, setLogger, type Logger, type LogLevel } from './logger';
//# sourceMappingURL=index.d.ts.map