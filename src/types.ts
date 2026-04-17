// ---------------------------------------------------------------------------
// Engine Types — standalone type definitions (no Zod dependency)
//
// These are plain TypeScript equivalents of the subset of @shorecrest/schemas
// types that the engine uses for computation.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

export type CurrencyCode =
  | 'USD' | 'EUR' | 'GBP' | 'CHF' | 'HKD' | 'SGD' | 'AED'
  | 'JPY' | 'CAD' | 'AUD' | 'NZD' | 'ZAR' | 'INR' | 'BRL'
  | 'MXN' | 'KYD';

export type Cadence = 'Annual' | 'Monthly' | 'Bi-Weekly' | 'Weekly';

// ---------------------------------------------------------------------------
// Step / Schedule Types
// ---------------------------------------------------------------------------

export interface ContribStep {
  start_age: number;
  end_age: number;
  amount: number;
}

export interface ProfitStep {
  age: number;
  end_age?: number;
  pct: number;
}

export interface RaiseStep {
  start_age: number;
  end_age: number;
  raise_pct: number;
}

export interface YieldStep {
  start_age: number;
  end_age: number;
  rate_pct: number;
}

export interface IncomeStep {
  start_age: number;
  end_age: number;
  amount: number;
  frequency?: 'Annual' | 'Monthly';
}

export interface LoanDraw {
  age: number;
  amount: number;
}

export interface LumpRepayment {
  age: number;
  amount: number;
}

// ---------------------------------------------------------------------------
// Entity Types
// ---------------------------------------------------------------------------

export interface SpendingPhase {
  start_age: number;
  end_age: number;
  mode: 'percent' | 'amount';
  amount: number;
}

export interface TaxConfig {
  jurisdiction: string;
  flat_rate_pct: number;
  filing_status: 'Single' | 'Married Filing Jointly';
  enable_rmd: boolean;
  enable_roth_conversion: boolean;
  roth_conversion_amount: number;
  roth_conversion_start_age: number;
  roth_conversion_end_age: number;
}

export interface IncomeSource {
  label: string;
  type:
    | 'Other'
    | 'Social Security'
    | 'Pension'
    | 'Annuity'
    | 'Part-Time'
    | 'Retirement Income'
    | 'Rental';
  amount: number;
  frequency: 'Annual' | 'Monthly';
  start_age: number;
  end_age: number;
  inflation_adjusted: boolean;
  taxable: boolean;
  tax_rate: number;
  enabled: boolean;
}

export interface Asset {
  [key: string]: unknown;
  label: string;
  current_value: number;
  is_liquid: boolean;
  rate_pct: number;
  enabled: boolean;
  sell_at_age: number | null;
  sale_amount_override: number | null;
}

export interface LiquidityEvent {
  type: 'Credit' | 'Debit';
  label: string;
  start_age: number;
  end_age: number;
  amount: number;
  recurrence: 'One-Time' | 'Annual' | 'Monthly';
  enabled: boolean;
  taxable: boolean;
  tax_rate: number;
}

// ---------------------------------------------------------------------------
// FinancialItem (Advanced Mode)
// ---------------------------------------------------------------------------

export type FinancialItemCategory =
  | 'Cash'
  | 'Investment'
  | 'Property'
  | 'Collectables'
  | 'Salary'
  | 'Pension'
  | 'Social Security'
  | 'Annuity'
  | 'Retirement Income'
  | 'Other'
  | 'Loan';

export interface FinancialItem {
  label: string;
  category: FinancialItemCategory;
  enabled: boolean;

  // Value & returns
  current_value: number;
  rate_pct: number;
  fee_pct: number;
  perf_fee_pct: number;
  is_liquid: boolean;

  // Contributions
  contrib_mode: 'flat' | 'staggered';
  contrib_amount: number;
  contrib_cadence: Cadence;
  contrib_start_age: number | null;
  contrib_end_age: number | null;
  contrib_increase_pct: number;
  contrib_steps: ContribStep[];

  // Investment timing
  invest_start_age: number | null;
  purchase_age: number | null;

  // Sale / profit taking
  profit_taking_mode: 'single' | 'staggered';
  sell_at_age: number | null;
  sale_amount_override: number | null;
  profit_taking_steps: ProfitStep[];
  taxable_on_sale: boolean;
  sale_tax_rate: number;
  estate_pct: number;

  // Property: rental
  rental_amount: number;
  rental_frequency: 'Monthly' | 'Annual';
  rental_start_age: number;
  rental_end_age: number;
  rental_inflation_adjusted: boolean;
  rental_taxable: boolean;
  rental_tax_rate: number;

  // Property: mortgage
  mortgage_payment: number;
  mortgage_frequency: 'Monthly' | 'Annual';
  mortgage_end_age: number;

  // Income
  income_amount: number;
  income_frequency: 'Annual' | 'Monthly';
  income_start_age: number;
  income_end_age: number;
  inflation_adjusted: boolean;
  taxable: boolean;
  tax_rate: number;
  income_destination: string;
  reinvest_target_item_index: number | null;
  income_mode: 'flat' | 'staggered';
  income_steps: IncomeStep[];

  // Salary
  salary_raise_pct: number;
  salary_raise_mode: 'flat' | 'staggered';
  salary_raise_steps: RaiseStep[];
  salary_bonus_pct: number;

  // Cash yield
  cash_yield_mode: 'flat' | 'staggered';
  cash_yield_steps: YieldStep[];

  // Loan
  loan_opening_principal: number;
  loan_interest_rate_pct: number;
  loan_payment_mode: 'principal_and_interest' | 'interest_only';
  loan_annual_principal_payment: number;
  loan_draws: LoanDraw[];
  loan_term_years: number;
  loan_start_age: number;
  loan_credit_at_start: boolean;
  loan_lump_repayments: LumpRepayment[];
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

export interface Scenario {
  [key: string]: unknown;
  // Identity
  name: string;

  // Timeline
  current_age: number;
  retirement_age: number;
  end_age: number;

  // Portfolio (basic mode)
  current_balance: number;
  contrib_amount: number;
  contrib_cadence: Cadence;
  contrib_increase_pct: number;

  // Returns
  nominal_return_pct: number;
  return_stdev_pct: number;
  return_distribution: 'log-normal' | 'normal';
  inflation_pct: number;
  inflation_enabled: boolean;
  fee_pct: number;
  perf_fee_pct: number;

  // Withdrawal
  withdrawal_method:
    | 'Fixed % of prior-year end balance'
    | 'Fixed real-dollar amount';
  withdrawal_pct: number;
  withdrawal_real_amount: number;
  withdrawal_frequency: 'Annual' | 'Monthly';
  withdrawal_strategy: 'Standard' | 'Guyton-Klinger' | 'Age-Banded' | 'Fixed-Pct';

  // Guyton-Klinger guardrails (legacy engine field names; still authoritative
  // internally — the new CONTRACT-016 names below map onto these via the
  // dispatcher).
  gk_ceiling_pct: number;
  gk_floor_pct: number;
  gk_prosperity_threshold: number;
  gk_capital_preservation_threshold: number;

  // CONTRACT-016 / ADR-026 Guyton-Klinger parameter names (new schema).
  // All defaulted; the dispatcher prefers these when present, otherwise it
  // falls back to the gk_* legacy fields.
  guyton_guard_up_pct?: number;
  guyton_guard_down_pct?: number;
  guyton_cut_pct?: number;
  guyton_raise_pct?: number;
  guyton_max_cut_per_year_pct?: number;

  // Fixed-Pct withdrawal strategy parameter (CONTRACT-016 / ADR-026)
  fixed_withdrawal_pct?: number;

  // Spending phases (Age-Banded)
  spending_phases: SpendingPhase[];

  // Monte Carlo
  enable_mc: boolean;
  mc_runs: number;

  // Tax
  enable_taxes: boolean;
  effective_tax_rate_pct: number;
  tax_jurisdiction: 'Custom' | 'Cayman Islands' | 'US' | 'UK';
  tax_config: TaxConfig | null;
  tax_deferred_pct: number;

  // Planning mode
  planning_mode: 'Individual' | 'Couple';
  partner_name: string;
  partner_current_age: number | null;
  partner_retirement_age: number | null;
  partner_income_sources: IncomeSource[];

  // Legacy assets (basic mode)
  assets: Asset[];
  liquid_pct: number;

  // Advanced mode
  detail_mode: 'basic' | 'advanced';
  financial_items: FinancialItem[];

  // Income sources (basic mode)
  income_sources: IncomeSource[];

  // Liquidity events
  liquidity_events: LiquidityEvent[];

  // Estate
  desired_estate: number;

  // Stress test / black swan
  black_swan_enabled: boolean;
  black_swan_age: number;
  black_swan_loss_pct: number;

  // Currency
  currency_code: string;
  currency_symbol: string;

  // Withdrawal order
  withdrawal_order: string;

  // --------------------------------------------------------------------------
  // v0.4 stochastic foundation (CONTRACT-018) — all optional, all defaulted
  // downstream. A v0.3-shape Scenario continues to typecheck and compute
  // identical outputs.
  // --------------------------------------------------------------------------

  // Multi-asset (ADR-030)
  asset_classes?: AssetClass[];
  return_correlation_matrix?: ReturnCorrelationMatrix | null;
  return_distribution_kind?: 'LogNormal' | 'StudentT' | 'Bootstrap';
  return_distribution_dof?: number;
  bootstrap_window?: [number, number];

  // Inflation (ADR-031)
  inflation_model?: 'Flat' | 'AR1';
  inflation_long_run_mean_pct?: number;
  inflation_ar1_phi?: number;
  inflation_shock_stdev_pct?: number;
  inflation_initial_pct?: number;
  inflation_calibration_preset?:
    | 'US-CPI'
    | 'UK-CPI'
    | 'UK-RPI'
    | 'EU-HICP'
    | 'Custom';
  return_inflation_correlation?: number;
  bond_inflation_correlation?: number;

  // Longevity (ADR-032)
  longevity_model?: 'Fixed' | 'Gompertz' | 'Cohort';
  longevity_modal_age?: number;
  longevity_dispersion?: number;
  longevity_cohort_country?: 'US' | 'UK';
  sex?: Sex;
  longevity_partner_modal_age?: number | null;
  longevity_partner_dispersion?: number;
  longevity_partner_cohort_country?: 'US' | 'UK';
  partner_sex?: Sex;

  // Risk metrics (ADR-033)
  risk_free_rate_pct?: number;

  // --------------------------------------------------------------------------
  // v0.5 optimization suite (CONTRACT-019) — all optional, all defaulted
  // --------------------------------------------------------------------------

  /** Glide-path allocation steps (ADR-034). Default: [] (static weights). */
  glide_path?: GlidePathStep[];

  /** User-specified or optimizer-determined SS claiming age (62-70). */
  ss_claiming_age?: number | null;

  /** Pension benefit reduction per year before NRA (default 3). */
  pension_early_factor_pct?: number;

  /** Pension benefit increase per year after NRA (default 6). */
  pension_late_factor_pct?: number;

  /** Percentage of portfolio used to purchase annuity at optimal age (default 0). */
  annuity_purchase_pct?: number;
}

// ---------------------------------------------------------------------------
// v0.5 — Optimization Suite (ADR-034 through ADR-036, CONTRACT-019)
// ---------------------------------------------------------------------------

/**
 * One step in a glide-path allocation schedule.
 * Ages must be sorted ascending with no duplicates.
 * Weights at each step must sum to 100 (+/- 1).
 */
export interface GlidePathStep {
  age: number;
  weights: Record<AssetClassId, number>;
}

/**
 * A single point on the efficient frontier.
 */
export interface FrontierPoint {
  expected_return_pct: number;
  portfolio_stdev_pct: number;
  weights: Record<AssetClassId, number>;
  sharpe_ratio: number;
}

/**
 * Result of computing the efficient frontier.
 */
export interface EfficientFrontierResult {
  frontier: FrontierPoint[];
  current_portfolio: FrontierPoint;
  max_sharpe: FrontierPoint;
  min_variance: FrontierPoint;
  distance_to_frontier_pct: number;
}

/**
 * Result of a claiming optimizer (SS, Pension, or Annuity).
 */
export interface ClaimingOptimizerResult {
  optimal_age: number;
  metric_at_optimal: number;
  sweep: Array<{ age: number; metric_value: number }>;
}

// ---------------------------------------------------------------------------
// Output Types
// ---------------------------------------------------------------------------

/**
 * Tag indicating which strategy event produced this year's withdrawal.
 *  - 'standard': default (no special event)
 *  - 'cut'    : Guyton-Klinger capital preservation rule fired (withdrawal cut)
 *  - 'raise'  : Guyton-Klinger prosperity rule fired (withdrawal raised)
 *  - 'band'   : Age-Banded strategy matched a configured spending phase
 */
export type WithdrawalEvent = 'standard' | 'cut' | 'raise' | 'band';

export interface TimelineRow {
  age: number;
  start_balance_nominal: number;
  contributions: number;
  liquidity_net: number;
  income: number;
  withdrawals: number;
  desired_spending: number;
  fees: number;
  taxes: number;
  income_taxes: number;
  growth: number;
  end_balance_nominal: number;
  cpi_index: number;
  end_balance_real: number;
  end_cash_nominal: number;
  end_debt_nominal: number;
  end_investments_nominal: number;
  end_liquid_nominal: number;
  end_illiquid_nominal: number;
  loan_interest: number;
  loan_principal_repaid: number;
  mortgage_paid: number;
  cash_yield: number;
  insolvency: boolean;
  shortfall_mandatory: number;
  shortfall_contributions: number;
  shortfall_withdrawals: number;

  // CONTRACT-016 / ADR-027 additions
  /** Nominal-dollar loss applied by the Black Swan stress event in this year. Zero in non-shock years. */
  black_swan_loss: number;
  /** Tag indicating which strategy event produced this year's withdrawal. */
  withdrawal_event: WithdrawalEvent;

  // CONTRACT-018 / ADR-030..033 additions (v0.4). All defaulted; existing
  // consumers that do not inspect these fields are unaffected.
  /** Realised inflation rate for this year (decimal, e.g. 0.025 == 2.5%). */
  inflation_this_year: number;
  /** Per-asset realised return by AssetClassId. Null in single-asset mode. */
  asset_returns: Record<string, number> | null;
  /** True on the final row of an MC trial that was terminated by a stochastic longevity draw (not at end_age). */
  death_sampled_this_trial?: boolean;
}

export interface FanChartRow {
  age: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface Metrics {
  terminal_nominal: number;
  terminal_real: number;
  first_shortfall_age: number | null;
  readiness_score: number;
  total_contributions: number;
  total_withdrawals: number;
  total_fees: number;
  total_taxes: number;
  estate_value: number;
}

// ---------------------------------------------------------------------------
// v0.4 — Stochastic Foundation (ADR-029 through ADR-033, CONTRACT-018)
// ---------------------------------------------------------------------------

/**
 * A stable identifier for an asset class within a scenario. Common canonical
 * values are listed first; arbitrary user-defined ids are also permitted.
 */
export type AssetClassId =
  | 'us_equity'
  | 'intl_equity'
  | 'us_bond'
  | 'intl_bond'
  | 'reit'
  | 'commodities'
  | 'cash'
  | string;

/**
 * One row of the multi-asset portfolio.
 * Weights across all AssetClasses in a Scenario must sum to 100 +/- 1.
 */
export interface AssetClass {
  id: AssetClassId;
  name: string;
  expected_return_pct: number;
  return_stdev_pct: number;
  weight_pct: number;
}

/**
 * Square symmetric positive-semi-definite matrix indexed by AssetClassId.
 * Validated at the engine boundary via attempted Cholesky factorisation.
 */
export interface ReturnCorrelationMatrix {
  ids: AssetClassId[];
  values: number[][];
}

/**
 * Sex designation used by the Gompertz and cohort longevity models.
 */
export type Sex = 'M' | 'F' | 'Unspecified';

/**
 * Discriminated union describing the sampling process for annual returns.
 *  - LogNormal: current v0.3 behaviour (multivariate log-normal).
 *  - StudentT: Student-t copula with configurable degrees of freedom.
 *  - Bootstrap: resamples simultaneous tuples from a bundled historical series.
 */
export type ReturnProcess =
  | { kind: 'LogNormal' }
  | { kind: 'StudentT'; dof: number }
  | { kind: 'Bootstrap'; window: [number, number] };

/**
 * Stochastic inflation process. Flat is a no-op passthrough; AR(1) follows the
 * recurrence defined in ADR-031.
 */
export type InflationProcess =
  | { kind: 'Flat'; rate_pct: number }
  | {
      kind: 'AR1';
      long_run_mean_pct: number;
      phi: number;
      shock_stdev_pct: number;
      initial_pct: number;
    };

/**
 * Longevity sampling model (ADR-032 / DDD-010).
 */
export type LongevityModel =
  | { kind: 'Fixed'; end_age: number }
  | { kind: 'Gompertz'; modal_age: number; dispersion: number; sex?: Sex }
  | {
      kind: 'Cohort';
      country: 'US' | 'UK';
      sex: Sex;
      birth_year: number;
    };

/**
 * Produces a correlated tuple of asset returns for a given year index.
 * Must be deterministic given the build-time seed.
 */
export interface ReturnSampler {
  sample(year: number): Record<AssetClassId, number>;
}

/**
 * Produces an inflation rate (decimal, not percent) for a given year. The
 * AR(1) variant consumes one draw per call; Flat is a no-op.
 */
export interface InflationSampler {
  sample(year: number, priorInflation: number): number;
  readonly kind: 'Flat' | 'AR1';
}

/**
 * Samples a death age from the configured longevity model. `median` and
 * `survival` are deterministic and do not consume randomness.
 */
export interface LongevitySampler {
  sample(current_age: number): number;
  median(current_age: number): number;
  survival(age: number, current_age: number): number;
  readonly kind: 'Fixed' | 'Gompertz' | 'Cohort';
}

/**
 * Institutional risk metrics attached to a Monte Carlo result (ADR-033).
 */
export interface RiskMetrics {
  var_95_terminal_real: number;
  var_99_terminal_real: number;
  cvar_95_terminal_real: number;
  cvar_99_terminal_real: number;
  var_95_return_pct: number;
  sortino_ratio: number;
  max_drawdown_pct: number;
  max_drawdown_recovery_years: number;
  median_drawdown_pct: number;
  median_drawdown_recovery_years: number;
  p10_year_by_year_balance_real: number[];
  p50_year_by_year_balance_real: number[];
  p90_year_by_year_balance_real: number[];
}
