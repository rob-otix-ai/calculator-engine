# @robotixai/calculator-engine

Financial retirement projection engine with Monte Carlo simulation.

## Features

- Deterministic year-by-year projection (basic + advanced mode)
- Monte Carlo simulation (1K-10K runs, seeded PRNG)
- Multi-jurisdiction tax (US, UK, Cayman, Custom)
- Withdrawal strategies (Standard, Guyton-Klinger, Age-Banded)
- Sensitivity analysis (tornado chart)
- Historical backtest (154 years of Shiller data)
- Retirement age optimizer (binary search)
- Retirement age x spending heatmap
- Advanced mode with cash waterfall, loans, properties
- Portfolio blending and estate value calculation

## Installation

```bash
npm install @robotixai/calculator-engine
```

No peer dependencies required. All types and defaults are included in the package.

## Quick Start

```typescript
import { runProjection, runMonteCarloSimulation, DEFAULT_SCENARIO } from '@robotixai/calculator-engine';

// Deterministic projection
const { timeline, metrics } = runProjection(DEFAULT_SCENARIO);
console.log(`Terminal balance: $${metrics.terminal_real.toFixed(2)}`);

// Monte Carlo simulation
const mcResult = runMonteCarloSimulation(DEFAULT_SCENARIO, runProjection, { runs: 1000 });
console.log(`Success probability: ${mcResult.probability_no_shortfall}%`);
```

## API Reference

### Projection

| Function | Description |
|---|---|
| `runProjection(scenario, overrideReturns?)` | Deterministic year-by-year projection (basic mode). Returns `{ timeline, metrics }`. |
| `runAdvancedProjection(scenario, overrideReturns?)` | Advanced mode projection with cash waterfall, individual financial items, loans, and properties. |

### Monte Carlo

| Function / Type | Description |
|---|---|
| `runMonteCarloSimulation(scenario, projectionFn, options?)` | Seeded PRNG Monte Carlo runner. Returns `MCResult` with percentiles, fan chart, and success probability. |
| `MCOptions` | `{ runs?, seed?, budgetMs? }` |
| `MCResult` | `{ probability_no_shortfall, median_terminal, p10_terminal, p90_terminal, fan_chart, ... }` |
| `ProjectionFn` | Type alias for the projection function signature. |

### Sensitivity Analysis

| Function / Type | Description |
|---|---|
| `runSensitivityAnalysis(scenario, projectionFn)` | Tornado chart analysis across 7 key parameters. Returns `SensitivityFactor[]` sorted by impact. |
| `SensitivityFactor` | `{ name, label, lowValue, highValue, lowTerminal, highTerminal, spread }` |

### Historical Backtest

| Function / Type | Description |
|---|---|
| `runHistoricalBacktest(scenario, projectionFn)` | Rolling-window backtest using embedded Shiller data (1871-2024). Returns `BacktestResult`. |
| `BacktestPeriod` | `{ startYear, endYear, terminalReal, survived }` |
| `BacktestResult` | `{ periods, successRate }` |

### Retirement Age Optimizer

| Function / Type | Description |
|---|---|
| `findEarliestRetirementAge(scenario, projectionFn, mcFn?, options?)` | Linear scan + binary search for earliest viable retirement age and minimum contribution. |
| `OptimizerResult` | `{ retirementAge, terminalReal, survived, mcSuccessPct }` |
| `OptimizerOutput` | `{ results, earliestViableAge, minContribution }` |
| `OptimizerOptions` | `{ mcThreshold? }` |

### Heatmap

| Function / Type | Description |
|---|---|
| `generateHeatmap(scenario, projectionFn, options?)` | Generates a 2D grid of retirement age x annual spending viability cells. |
| `HeatmapCell` | `{ retirementAge, annualSpending, viable, terminalReal }` |
| `HeatmapOptions` | `{ retirementAgeRange?, spendingRange?, steps? }` |

### Portfolio

| Function / Type | Description |
|---|---|
| `blendPortfolio(assets)` | Computes weighted-average return, fee, and liquidity across assets. |
| `calculateEstateValue(endBalance, endDebt, items, years)` | Computes estate value with per-item earmarking. |
| `BlendedPortfolio` | `{ totalValue, blendedReturn, blendedFee, blendedPerfFee, liquidPct }` |

## Engine Modules

| Module | Purpose |
|---|---|
| `projection.ts` | Basic-mode deterministic projection (contributions, income, withdrawals, fees, taxes, growth) |
| `advanced.ts` | Advanced-mode 9-step cash waterfall with individual financial items |
| `monte-carlo.ts` | Seeded PRNG, Box-Muller normal/log-normal return generation, fan chart |
| `tax.ts` | US progressive brackets, UK progressive with personal allowance taper, Cayman zero, Custom flat |
| `withdrawal.ts` | Standard, Guyton-Klinger guardrails, Age-Banded spending phases |
| `sensitivity.ts` | Tornado chart across 7 parameters with clamping guards |
| `backtest.ts` | 154 years of embedded Shiller real total stock returns |
| `optimizer.ts` | Linear scan + binary search for earliest viable retirement age |
| `heatmap.ts` | 2D retirement age x spending grid |
| `portfolio.ts` | Portfolio blending and estate value |

## Edge Cases & Guards

- **Near-zero threshold ($100)**: Prevents asymptotic depletion with high withdrawal rates
- **Box-Muller ln(0) guard**: Clamps u1 to `[1e-10, 1)` to prevent `-Infinity` returns
- **Return clamp**: Normal distribution returns clamped to `>= -1.0` (can't lose more than 100%)
- **MC run validation**: Runs must be 0 (disabled) or 100-10,000
- **Wall-clock budget**: MC and optimizer abort after 50 seconds
- **RMD divisor guard**: Handles missing/zero divisors gracefully
- **Age-Banded gaps**: Returns $0 withdrawal with console warning
- **Sensitivity clamping**: retirement_age stays in `(current_age, end_age)`, percentages >= 0
- **Amortization zero-rate**: Falls back to `principal / term` to avoid division by zero

## License

MIT
