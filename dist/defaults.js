// ---------------------------------------------------------------------------
// Engine Defaults — standalone default values (no Zod dependency)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Cadence Multiplier
// ---------------------------------------------------------------------------
export const CadenceMultiplier = {
    Annual: 1,
    Monthly: 12,
    'Bi-Weekly': 26,
    Weekly: 52,
};
export const CURRENCY_MAP = {
    USD: { code: 'USD', symbol: '$', decimals: 2 },
    EUR: { code: 'EUR', symbol: '€', decimals: 2 },
    GBP: { code: 'GBP', symbol: '£', decimals: 2 },
    CHF: { code: 'CHF', symbol: 'CHF', decimals: 2 },
    HKD: { code: 'HKD', symbol: 'HK$', decimals: 2 },
    SGD: { code: 'SGD', symbol: 'S$', decimals: 2 },
    AED: { code: 'AED', symbol: 'د.إ', decimals: 2 },
    JPY: { code: 'JPY', symbol: '¥', decimals: 0 },
    CAD: { code: 'CAD', symbol: 'C$', decimals: 2 },
    AUD: { code: 'AUD', symbol: 'A$', decimals: 2 },
    NZD: { code: 'NZD', symbol: 'NZ$', decimals: 2 },
    ZAR: { code: 'ZAR', symbol: 'R', decimals: 2 },
    INR: { code: 'INR', symbol: '₹', decimals: 2 },
    BRL: { code: 'BRL', symbol: 'R$', decimals: 2 },
    MXN: { code: 'MXN', symbol: 'Mex$', decimals: 2 },
    KYD: { code: 'KYD', symbol: 'CI$', decimals: 2 },
};
// ---------------------------------------------------------------------------
// Default Scenario
// ---------------------------------------------------------------------------
export const DEFAULT_SCENARIO = {
    name: 'Scenario A',
    // Timeline
    current_age: 30,
    retirement_age: 65,
    end_age: 100,
    // Portfolio
    current_balance: 100000,
    contrib_amount: 500,
    contrib_cadence: 'Monthly',
    contrib_increase_pct: 0,
    // Returns
    nominal_return_pct: 8,
    return_stdev_pct: 15,
    return_distribution: 'log-normal',
    inflation_pct: 3,
    inflation_enabled: true,
    fee_pct: 0.5,
    perf_fee_pct: 0,
    // Withdrawal
    withdrawal_method: 'Fixed % of prior-year end balance',
    withdrawal_pct: 4,
    withdrawal_real_amount: 50000,
    withdrawal_frequency: 'Annual',
    withdrawal_strategy: 'Standard',
    // Guyton-Klinger
    gk_ceiling_pct: 20,
    gk_floor_pct: 20,
    gk_prosperity_threshold: 20,
    gk_capital_preservation_threshold: 20,
    // Spending phases
    spending_phases: [],
    // Monte Carlo
    enable_mc: true,
    mc_runs: 1000,
    // Tax
    enable_taxes: false,
    effective_tax_rate_pct: 0,
    tax_jurisdiction: 'Custom',
    tax_config: null,
    tax_deferred_pct: 85,
    // Planning
    planning_mode: 'Individual',
    partner_name: '',
    partner_current_age: null,
    partner_retirement_age: null,
    partner_income_sources: [],
    // Assets
    assets: [],
    liquid_pct: 100,
    // Advanced
    detail_mode: 'basic',
    financial_items: [],
    // Income
    income_sources: [],
    // Liquidity events
    liquidity_events: [],
    // Estate
    desired_estate: 0,
    // Black swan
    black_swan_enabled: false,
    black_swan_age: 70,
    black_swan_loss_pct: 50,
    // Currency
    currency_code: 'USD',
    currency_symbol: '$',
    // Withdrawal order
    withdrawal_order: 'Tax-Efficient',
};
