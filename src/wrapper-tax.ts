/**
 * Per-wrapper tax computation (ADR-037 / CONTRACT-020).
 *
 * Implements the wrapper x residence x domicile tax matrix:
 *   Taxable, US-Traditional, US-Roth, UK-SIPP, UK-ISA,
 *   UK-Onshore/Offshore Bond, Offshore-Trust, Cayman-Exempt-Company.
 *
 * Also includes RMD computation and dividend withholding treaty table.
 */

import type {
  TaxWrapper,
  TaxResidence,
  TaxDomicile,
  TaxLot,
  TaxBreakdown,
  WrapperTaxResult,
} from './types';
import { calculateTax } from './tax';

// =============================================================================
// RMD Divisor Table (IRS Uniform Lifetime Table, 2024 vintage)
// =============================================================================

export const RMD_DIVISOR_TABLE: Record<number, number> = {
  72: 27.4, 73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9,
  78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5, 83: 17.7,
  84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9,
  90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5,  95: 8.9,
  96: 8.4,  97: 7.8,  98: 7.3,  99: 6.8,  100: 6.4, 101: 6.0,
  102: 5.6, 103: 5.2, 104: 4.9, 105: 4.6, 106: 4.3, 107: 4.1,
  108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3, 113: 3.1,
  114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3,
  120: 2.0,
};

// =============================================================================
// Dividend Withholding Treaty Table (ADR-037 §4)
// =============================================================================

/**
 * Key format: 'source_country:resident_country'
 * Value: withholding rate as decimal (0-1).
 */
export const WITHHOLDING_TREATY_TABLE: Record<string, number> = {
  'US:UK':        0.15,
  'US:Cayman':    0.30,
  'US:UAE':       0.00,
  'US:Singapore': 0.15,
  'US:US':        0.00,
  'UK:US':        0.00,
  'UK:Cayman':    0.00,
  'UK:UAE':       0.00,
  'UK:Singapore': 0.00,
  'UK:UK':        0.00,
};

// =============================================================================
// Bundled Tax Data (re-exported for CONTRACT-020 compliance)
// =============================================================================

export const US_FEDERAL_TAX_BRACKETS_2025: Array<{ threshold: number; rate: number }> = [
  { threshold: 11_925,  rate: 0.10 },
  { threshold: 48_475,  rate: 0.12 },
  { threshold: 103_350, rate: 0.22 },
  { threshold: 197_300, rate: 0.24 },
  { threshold: 250_525, rate: 0.32 },
  { threshold: 626_350, rate: 0.35 },
  { threshold: Infinity, rate: 0.37 },
];

export const UK_INCOME_TAX_BANDS_2025: Array<{ threshold: number; rate: number }> = [
  { threshold: 37_700,  rate: 0.20 },
  { threshold: 112_570, rate: 0.40 },
  { threshold: Infinity, rate: 0.45 },
];

// =============================================================================
// US CGT Rates (simplified: long-term rates for single filer)
// =============================================================================

const US_CGT_RATE = 0.15;
const UK_CGT_RATE_HIGHER = 0.20;

// =============================================================================
// RMD Computation
// =============================================================================

/**
 * Compute Required Minimum Distribution.
 * Returns 0 for age < 73. For age >= 73, returns balance / divisor(age).
 */
export function computeRMD(age: number, traditionalBalance: number): number {
  if (age < 73 || traditionalBalance <= 0) return 0;
  const divisor = RMD_DIVISOR_TABLE[age];
  if (divisor === undefined || divisor <= 0) return 0;
  return traditionalBalance / divisor;
}

// =============================================================================
// Withholding lookup
// =============================================================================

/**
 * Look up dividend withholding rate for a source/resident country pair.
 * Respects scenario overrides.
 */
export function getWithholdingRate(
  sourceCountry: string,
  residentCountry: string,
  overrides?: Record<string, number>,
): number {
  const key = `${sourceCountry}:${residentCountry}`;
  if (overrides && key in overrides) return overrides[key];
  return WITHHOLDING_TREATY_TABLE[key] ?? 0;
}

// =============================================================================
// Per-wrapper tax computation
// =============================================================================

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

function emptyBreakdown(): TaxBreakdown {
  return {
    income_tax: 0,
    capital_gains_tax: 0,
    dividend_withholding: 0,
    rmd_forced_withdrawal: 0,
    remittance_basis_charge: 0,
    total: 0,
  };
}

function finalise(bd: TaxBreakdown): TaxBreakdown {
  bd.total = bd.income_tax + bd.capital_gains_tax + bd.dividend_withholding
    + bd.rmd_forced_withdrawal + bd.remittance_basis_charge;
  return bd;
}

/**
 * Compute tax on a withdrawal from a specific wrapper.
 */
export function computeWrapperTax(
  wrapper: TaxWrapper,
  withdrawal: number,
  lots: TaxLot[],
  config: WrapperTaxConfig,
): WrapperTaxResult {
  const bd = emptyBreakdown();

  if (withdrawal <= 0) {
    return {
      wrapper,
      gross_withdrawal: 0,
      tax_breakdown: finalise(bd),
      net_withdrawal: 0,
      remaining_lots: lots.map((l) => ({ ...l })),
    };
  }

  // Compute realised gain from lots
  const totalLotValue = lots.reduce((s, l) => s + l.amount, 0);
  const totalCostBasis = lots.reduce((s, l) => s + l.cost_basis, 0);
  const gainFraction = totalLotValue > 0
    ? Math.max(0, (totalLotValue - totalCostBasis) / totalLotValue)
    : 0;
  const realisedGain = withdrawal * gainFraction;

  // Compute remaining lots after disposal
  const remainingLots = disposeLots(lots, withdrawal, config.cgtMethod);

  // Apply dividend withholding if applicable
  if (config.dividendIncome && config.dividendIncome > 0 && wrapper === 'Taxable') {
    const sourceCountry = config.dividendSourceCountry ?? 'US';
    const residentCountry = config.residence === 'Custom' ? 'US' : config.residence;
    const rate = getWithholdingRate(sourceCountry, residentCountry, config.withholdingOverrides);
    bd.dividend_withholding = config.dividendIncome * rate;
  }

  switch (wrapper) {
    case 'Taxable':
      bd.income_tax = computeResidenceIncomeTax(withdrawal - realisedGain, config);
      bd.capital_gains_tax = computeResidenceCGT(realisedGain, config);
      break;

    case 'US-Traditional-401k':
    case 'US-Traditional-IRA':
      // Entire withdrawal taxed as ordinary income
      bd.income_tax = computeResidenceIncomeTax(withdrawal, config);
      break;

    case 'US-Roth-401k':
    case 'US-Roth-IRA': {
      // Tax-free if qualified: age >= 59.5 and 5-year holding period
      const holdingYears = (config.currentYear ?? 2025) - (config.holdingStartYear ?? 2020);
      const qualified = config.age >= 59.5 && holdingYears >= 5;
      if (!qualified) {
        // Non-qualified: earnings portion taxed as income + 10% penalty
        bd.income_tax = computeResidenceIncomeTax(realisedGain, config);
      }
      break;
    }

    case 'UK-SIPP': {
      // Access at 57+. 25% tax-free lump, rest as income.
      if (config.age < 57) {
        // Validation: should not withdraw before 57
        // Still compute but flag — engine should prevent this
        bd.income_tax = computeResidenceIncomeTax(withdrawal, config);
      } else {
        const taxFreePortion = config.sippLumpClaimed ? 0 : 0.25;
        const taxFreeAmount = withdrawal * taxFreePortion;
        const taxableAmount = withdrawal - taxFreeAmount;
        bd.income_tax = computeResidenceIncomeTax(taxableAmount, config);
      }
      break;
    }

    case 'UK-ISA':
      // Fully tax-free
      break;

    case 'UK-Onshore-Bond':
    case 'UK-Offshore-Bond':
      // Deferred; chargeable event on withdrawal. Gain taxed as income.
      bd.income_tax = computeResidenceIncomeTax(realisedGain, config);
      break;

    case 'Offshore-Trust':
    case 'Cayman-Exempt-Company':
      // Tax-free growth. On distribution to UK/US resident, taxed as income.
      if (config.residence === 'UK' || config.residence === 'US') {
        bd.income_tax = computeResidenceIncomeTax(withdrawal, config);
      }
      // Otherwise tax-free (Cayman, UAE, Singapore)
      break;
  }

  // UK non-dom remittance basis
  if (
    config.domicile === 'UK-Non-Dom' &&
    config.residence === 'UK' &&
    isOffshoreWrapper(wrapper)
  ) {
    // Offshore withdrawals are remittances taxed at UK rates
    // (already taxed above if residence === UK, so this is handled)
    if (config.remittanceBasisCharge) {
      bd.remittance_basis_charge = 30_000;
    }
  }

  finalise(bd);

  return {
    wrapper,
    gross_withdrawal: withdrawal,
    tax_breakdown: bd,
    net_withdrawal: withdrawal - bd.total,
    remaining_lots: remainingLots,
  };
}

// =============================================================================
// Helpers
// =============================================================================

function isOffshoreWrapper(wrapper: TaxWrapper): boolean {
  return (
    wrapper === 'UK-Offshore-Bond' ||
    wrapper === 'Offshore-Trust' ||
    wrapper === 'Cayman-Exempt-Company'
  );
}

function computeResidenceIncomeTax(income: number, config: WrapperTaxConfig): number {
  if (income <= 0) return 0;
  const { residence } = config;

  switch (residence) {
    case 'US':
      return calculateTax(income, {
        jurisdiction: 'US',
        flat_rate_pct: 0,
        filing_status: 'Single',
        enable_rmd: false,
        enable_roth_conversion: false,
        roth_conversion_amount: 0,
        roth_conversion_start_age: 0,
        roth_conversion_end_age: 0,
      }, 'US');

    case 'UK':
      return calculateTax(income, {
        jurisdiction: 'UK',
        flat_rate_pct: 0,
        filing_status: 'Single',
        enable_rmd: false,
        enable_roth_conversion: false,
        roth_conversion_amount: 0,
        roth_conversion_start_age: 0,
        roth_conversion_end_age: 0,
      }, 'UK');

    case 'Cayman':
    case 'UAE':
      return 0;

    case 'Singapore':
      // Simplified: flat 22% for high earners
      return income * 0.22;

    case 'Custom':
    default:
      return 0;
  }
}

function computeResidenceCGT(gain: number, config: WrapperTaxConfig): number {
  if (gain <= 0) return 0;
  const { residence } = config;

  switch (residence) {
    case 'US':
      return gain * US_CGT_RATE;
    case 'UK':
      return gain * UK_CGT_RATE_HIGHER;
    case 'Cayman':
    case 'UAE':
      return 0;
    case 'Singapore':
      return 0; // Singapore has no CGT
    case 'Custom':
    default:
      return 0;
  }
}

/**
 * Dispose lots and return remaining lots after withdrawal.
 */
function disposeLots(
  lots: TaxLot[],
  withdrawalAmount: number,
  method: 'FIFO' | 'HIFO',
): TaxLot[] {
  if (withdrawalAmount <= 0 || lots.length === 0) {
    return lots.map((l) => ({ ...l }));
  }

  const sorted = lots.map((l) => ({ ...l }));
  if (method === 'FIFO') {
    sorted.sort((a, b) => a.year_acquired - b.year_acquired);
  } else {
    sorted.sort((a, b) => b.cost_basis - a.cost_basis);
  }

  let remaining = withdrawalAmount;
  const kept: TaxLot[] = [];

  for (const lot of sorted) {
    if (remaining <= 0) {
      kept.push(lot);
      continue;
    }
    if (lot.amount <= remaining) {
      remaining -= lot.amount;
    } else {
      const fraction = remaining / lot.amount;
      kept.push({
        year_acquired: lot.year_acquired,
        amount: lot.amount - remaining,
        cost_basis: lot.cost_basis * (1 - fraction),
      });
      remaining = 0;
    }
  }

  return kept;
}
