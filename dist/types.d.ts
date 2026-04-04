export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CHF' | 'HKD' | 'SGD' | 'AED' | 'JPY' | 'CAD' | 'AUD' | 'NZD' | 'ZAR' | 'INR' | 'BRL' | 'MXN' | 'KYD';
export type Cadence = 'Annual' | 'Monthly' | 'Bi-Weekly' | 'Weekly';
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
    type: 'Other' | 'Social Security' | 'Pension' | 'Annuity' | 'Part-Time' | 'Retirement Income' | 'Rental';
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
export type FinancialItemCategory = 'Cash' | 'Investment' | 'Property' | 'Collectables' | 'Salary' | 'Pension' | 'Social Security' | 'Annuity' | 'Retirement Income' | 'Other' | 'Loan';
export interface FinancialItem {
    label: string;
    category: FinancialItemCategory;
    enabled: boolean;
    current_value: number;
    rate_pct: number;
    fee_pct: number;
    perf_fee_pct: number;
    is_liquid: boolean;
    contrib_mode: 'flat' | 'staggered';
    contrib_amount: number;
    contrib_cadence: Cadence;
    contrib_start_age: number | null;
    contrib_end_age: number | null;
    contrib_increase_pct: number;
    contrib_steps: ContribStep[];
    invest_start_age: number | null;
    purchase_age: number | null;
    profit_taking_mode: 'single' | 'staggered';
    sell_at_age: number | null;
    sale_amount_override: number | null;
    profit_taking_steps: ProfitStep[];
    taxable_on_sale: boolean;
    sale_tax_rate: number;
    estate_pct: number;
    rental_amount: number;
    rental_frequency: 'Monthly' | 'Annual';
    rental_start_age: number;
    rental_end_age: number;
    rental_inflation_adjusted: boolean;
    rental_taxable: boolean;
    rental_tax_rate: number;
    mortgage_payment: number;
    mortgage_frequency: 'Monthly' | 'Annual';
    mortgage_end_age: number;
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
    salary_raise_pct: number;
    salary_raise_mode: 'flat' | 'staggered';
    salary_raise_steps: RaiseStep[];
    salary_bonus_pct: number;
    cash_yield_mode: 'flat' | 'staggered';
    cash_yield_steps: YieldStep[];
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
export interface Scenario {
    [key: string]: unknown;
    name: string;
    current_age: number;
    retirement_age: number;
    end_age: number;
    current_balance: number;
    contrib_amount: number;
    contrib_cadence: Cadence;
    contrib_increase_pct: number;
    nominal_return_pct: number;
    return_stdev_pct: number;
    return_distribution: 'log-normal' | 'normal';
    inflation_pct: number;
    inflation_enabled: boolean;
    fee_pct: number;
    perf_fee_pct: number;
    withdrawal_method: 'Fixed % of prior-year end balance' | 'Fixed real-dollar amount';
    withdrawal_pct: number;
    withdrawal_real_amount: number;
    withdrawal_frequency: 'Annual' | 'Monthly';
    withdrawal_strategy: 'Standard' | 'Guyton-Klinger' | 'Age-Banded';
    gk_ceiling_pct: number;
    gk_floor_pct: number;
    gk_prosperity_threshold: number;
    gk_capital_preservation_threshold: number;
    spending_phases: SpendingPhase[];
    enable_mc: boolean;
    mc_runs: number;
    enable_taxes: boolean;
    effective_tax_rate_pct: number;
    tax_jurisdiction: 'Custom' | 'Cayman Islands' | 'US' | 'UK';
    tax_config: TaxConfig | null;
    tax_deferred_pct: number;
    planning_mode: 'Individual' | 'Couple';
    partner_name: string;
    partner_current_age: number | null;
    partner_retirement_age: number | null;
    partner_income_sources: IncomeSource[];
    assets: Asset[];
    liquid_pct: number;
    detail_mode: 'basic' | 'advanced';
    financial_items: FinancialItem[];
    income_sources: IncomeSource[];
    liquidity_events: LiquidityEvent[];
    desired_estate: number;
    black_swan_enabled: boolean;
    black_swan_age: number;
    black_swan_loss_pct: number;
    currency_code: string;
    currency_symbol: string;
    withdrawal_order: string;
}
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
//# sourceMappingURL=types.d.ts.map