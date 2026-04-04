/**
 * Multi-jurisdiction tax calculator for the retirement engine.
 *
 * Jurisdictions: Custom (flat rate), Cayman Islands (zero), US (progressive),
 * UK (progressive with personal allowance taper).
 *
 * Also includes RMD (Required Minimum Distribution) and Roth conversion logic.
 */
import { getLogger } from './logger';
const US_STANDARD_DEDUCTION_SINGLE = 15000;
const US_STANDARD_DEDUCTION_MFJ = 30000;
const US_BRACKETS_2025_SINGLE = [
    { ceiling: 11925, rate: 0.10 },
    { ceiling: 48475, rate: 0.12 },
    { ceiling: 103350, rate: 0.22 },
    { ceiling: 197300, rate: 0.24 },
    { ceiling: 250525, rate: 0.32 },
    { ceiling: 626350, rate: 0.35 },
    { ceiling: Infinity, rate: 0.37 },
];
const US_BRACKETS_2025_MFJ = [
    { ceiling: 23850, rate: 0.10 },
    { ceiling: 96950, rate: 0.12 },
    { ceiling: 206700, rate: 0.22 },
    { ceiling: 394600, rate: 0.24 },
    { ceiling: 501050, rate: 0.32 },
    { ceiling: 751600, rate: 0.35 },
    { ceiling: Infinity, rate: 0.37 },
];
// =============================================================================
// UK Tax Constants (2025-26)
// =============================================================================
const UK_PERSONAL_ALLOWANCE = 12570;
/** Income threshold above which the personal allowance begins to taper. */
const UK_TAPER_THRESHOLD = 100000;
/** Income at which the personal allowance is fully withdrawn:
 *  100,000 + 2 * 12,570 = 125,140.
 *
 *  In the GBP 100,000 - 125,140 band the effective marginal rate is 60%:
 *  for every additional GBP 1 of income, you lose GBP 0.50 of personal
 *  allowance, so you pay 40% on GBP 1 of income PLUS 40% on GBP 0.50
 *  of previously-sheltered income = 60p total.
 */
const UK_TAPER_FULL_WITHDRAWAL = 125140;
/** Bands applied to income ABOVE the (adjusted) personal allowance. */
const UK_BANDS_2025_26 = [
    { ceiling: 37700, rate: 0.20 },
    { ceiling: 112570, rate: 0.40 },
    { ceiling: Infinity, rate: 0.45 },
];
// =============================================================================
// IRS Uniform Lifetime Table (ages 72-120)
// =============================================================================
const RMD_DIVISORS = {
    72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
    78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
    84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
    90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9,
    96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0,
    102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
    108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
    114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
    120: 2.0,
};
// =============================================================================
// Progressive bracket calculation (shared by US and UK)
// =============================================================================
/**
 * Compute total tax by walking through progressive brackets.
 * @param taxableIncome - Income subject to tax (after deductions/allowances).
 * @param brackets - Ordered array of brackets (ceiling is cumulative, not width).
 */
function applyProgressiveBrackets(taxableIncome, brackets) {
    if (taxableIncome <= 0)
        return 0;
    let tax = 0;
    let prev = 0;
    for (const { ceiling, rate } of brackets) {
        if (taxableIncome <= prev)
            break;
        const taxableInBracket = Math.min(taxableIncome, ceiling) - prev;
        tax += taxableInBracket * rate;
        prev = ceiling;
    }
    return tax;
}
// =============================================================================
// US Tax
// =============================================================================
function calculateUSTax(grossIncome, filingStatus) {
    if (grossIncome <= 0)
        return 0;
    const deduction = filingStatus === 'Married Filing Jointly'
        ? US_STANDARD_DEDUCTION_MFJ
        : US_STANDARD_DEDUCTION_SINGLE;
    const brackets = filingStatus === 'Married Filing Jointly'
        ? US_BRACKETS_2025_MFJ
        : US_BRACKETS_2025_SINGLE;
    const taxableIncome = Math.max(0, grossIncome - deduction);
    return applyProgressiveBrackets(taxableIncome, brackets);
}
// =============================================================================
// UK Tax
// =============================================================================
/**
 * Compute the adjusted personal allowance after the taper.
 *
 * For gross income above GBP 100,000 the allowance is reduced by GBP 1 for
 * every GBP 2 of income above 100K. This creates an effective 60% marginal
 * rate in the GBP 100,000 - 125,140 band.
 */
function ukAdjustedAllowance(grossIncome) {
    if (grossIncome <= UK_TAPER_THRESHOLD) {
        return UK_PERSONAL_ALLOWANCE;
    }
    const reduction = Math.floor((grossIncome - UK_TAPER_THRESHOLD) / 2);
    return Math.max(0, UK_PERSONAL_ALLOWANCE - reduction);
}
function calculateUKTax(grossIncome) {
    if (grossIncome <= 0)
        return 0;
    const allowance = ukAdjustedAllowance(grossIncome);
    const taxableIncome = Math.max(0, grossIncome - allowance);
    return applyProgressiveBrackets(taxableIncome, UK_BANDS_2025_26);
}
// =============================================================================
// Main entry point
// =============================================================================
/**
 * Calculate income tax for the given jurisdiction.
 *
 * @param taxableIncome - Gross income before deductions/allowances.
 * @param config - The scenario's TaxConfig.
 * @param jurisdiction - One of 'Custom', 'Cayman Islands', 'US', 'UK'.
 * @returns Tax amount (always >= 0).
 */
export function calculateTax(taxableIncome, config, jurisdiction) {
    if (taxableIncome <= 0)
        return 0;
    let taxAmount;
    switch (jurisdiction) {
        case 'Cayman Islands':
            taxAmount = 0;
            break;
        case 'US':
            taxAmount = calculateUSTax(taxableIncome, config.filing_status);
            break;
        case 'UK':
            taxAmount = calculateUKTax(taxableIncome);
            break;
        case 'Custom':
        default:
            taxAmount = taxableIncome * (config.flat_rate_pct / 100);
            break;
    }
    const log = getLogger();
    log.debug('Tax calculated', { jurisdiction, taxableIncome, taxAmount });
    return taxAmount;
}
// =============================================================================
// RMD (Required Minimum Distributions)
// =============================================================================
/**
 * Determine the age at which RMDs must begin based on birth year.
 *
 * - Born <= 1950: age 72
 * - Born 1951-1959: age 73
 * - Born >= 1960: age 75
 */
export function getRMDStartAge(birthYear) {
    if (birthYear <= 1950)
        return 72;
    if (birthYear <= 1959)
        return 73;
    return 75;
}
/**
 * Calculate the Required Minimum Distribution for a given age and balance.
 *
 * @param age - The individual's current age.
 * @param taxDeferredBalance - End-of-prior-year tax-deferred account balance.
 * @param birthYear - Birth year, used to determine RMD start age.
 * @returns The RMD amount, or 0 if not yet required or age > 120.
 */
export function getRMDAmount(age, taxDeferredBalance, birthYear) {
    const startAge = getRMDStartAge(birthYear);
    if (age < startAge || age > 120)
        return 0;
    if (taxDeferredBalance <= 0)
        return 0;
    const divisor = RMD_DIVISORS[age];
    if (divisor === undefined || divisor <= 0)
        return 0;
    return taxDeferredBalance / divisor;
}
// =============================================================================
// Roth Conversion
// =============================================================================
/**
 * Calculate the Roth conversion amount for a given age and tax config.
 *
 * If the current age is within the configured conversion window
 * (roth_conversion_start_age <= age <= roth_conversion_end_age) and
 * conversions are enabled, returns the configured conversion amount.
 * Otherwise returns 0.
 *
 * Note: the converted amount adds to taxable income for the conversion year.
 * The caller is responsible for clamping the conversion to the available
 * tax-deferred balance and adding it to taxable income.
 */
export function calculateRothConversion(age, config) {
    if (!config.enable_roth_conversion)
        return 0;
    if (age < config.roth_conversion_start_age)
        return 0;
    if (age > config.roth_conversion_end_age)
        return 0;
    return config.roth_conversion_amount;
}
