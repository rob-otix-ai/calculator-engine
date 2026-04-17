/**
 * Per-wrapper tax computation (ADR-037 / CONTRACT-020).
 *
 * Implements the wrapper x residence x domicile tax matrix:
 *   Taxable, US-Traditional, US-Roth, UK-SIPP, UK-ISA,
 *   UK-Onshore/Offshore Bond, Offshore-Trust, Cayman-Exempt-Company.
 *
 * Also includes RMD computation and dividend withholding treaty table.
 */
import type { TaxWrapper, TaxResidence, TaxDomicile, TaxLot, WrapperTaxResult } from './types';
export declare const RMD_DIVISOR_TABLE: Record<number, number>;
/**
 * Key format: 'source_country:resident_country'
 * Value: withholding rate as decimal (0-1).
 */
export declare const WITHHOLDING_TREATY_TABLE: Record<string, number>;
export declare const US_FEDERAL_TAX_BRACKETS_2025: Array<{
    threshold: number;
    rate: number;
}>;
export declare const UK_INCOME_TAX_BANDS_2025: Array<{
    threshold: number;
    rate: number;
}>;
/**
 * Compute Required Minimum Distribution.
 * Returns 0 for age < 73. For age >= 73, returns balance / divisor(age).
 */
export declare function computeRMD(age: number, traditionalBalance: number): number;
/**
 * Look up dividend withholding rate for a source/resident country pair.
 * Respects scenario overrides.
 */
export declare function getWithholdingRate(sourceCountry: string, residentCountry: string, overrides?: Record<string, number>): number;
export interface WrapperTaxConfig {
    residence: TaxResidence;
    domicile: TaxDomicile;
    cgtMethod: 'FIFO' | 'HIFO';
    age: number;
    taxableIncome: number;
    /** Year the wrapper was first funded (for Roth 5-year rule). */
    holdingStartYear?: number;
    /** Current calendar year. */
    currentYear?: number;
    /** Whether SIPP tax-free lump has already been claimed. */
    sippLumpClaimed?: boolean;
    /** Scenario-level withholding overrides. */
    withholdingOverrides?: Record<string, number>;
    /** Dividend income component of the withdrawal (for withholding). */
    dividendIncome?: number;
    /** Source country for dividends. Default: derived from wrapper. */
    dividendSourceCountry?: string;
    /** Remittance basis charge active (UK non-dom). */
    remittanceBasisCharge?: boolean;
}
/**
 * Compute tax on a withdrawal from a specific wrapper.
 */
export declare function computeWrapperTax(wrapper: TaxWrapper, withdrawal: number, lots: TaxLot[], config: WrapperTaxConfig): WrapperTaxResult;
//# sourceMappingURL=wrapper-tax.d.ts.map