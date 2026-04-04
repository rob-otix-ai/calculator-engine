/**
 * Multi-jurisdiction tax calculator for the retirement engine.
 *
 * Jurisdictions: Custom (flat rate), Cayman Islands (zero), US (progressive),
 * UK (progressive with personal allowance taper).
 *
 * Also includes RMD (Required Minimum Distribution) and Roth conversion logic.
 */
import type { TaxConfig } from './types';
/**
 * Calculate income tax for the given jurisdiction.
 *
 * @param taxableIncome - Gross income before deductions/allowances.
 * @param config - The scenario's TaxConfig.
 * @param jurisdiction - One of 'Custom', 'Cayman Islands', 'US', 'UK'.
 * @returns Tax amount (always >= 0).
 */
export declare function calculateTax(taxableIncome: number, config: TaxConfig, jurisdiction: string): number;
/**
 * Determine the age at which RMDs must begin based on birth year.
 *
 * - Born <= 1950: age 72
 * - Born 1951-1959: age 73
 * - Born >= 1960: age 75
 */
export declare function getRMDStartAge(birthYear: number): number;
/**
 * Calculate the Required Minimum Distribution for a given age and balance.
 *
 * @param age - The individual's current age.
 * @param taxDeferredBalance - End-of-prior-year tax-deferred account balance.
 * @param birthYear - Birth year, used to determine RMD start age.
 * @returns The RMD amount, or 0 if not yet required or age > 120.
 */
export declare function getRMDAmount(age: number, taxDeferredBalance: number, birthYear: number): number;
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
export declare function calculateRothConversion(age: number, config: TaxConfig): number;
//# sourceMappingURL=tax.d.ts.map