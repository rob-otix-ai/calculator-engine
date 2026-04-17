/**
 * Longevity Sampler (ADR-032 / DDD-010 / CONTRACT-018)
 *
 * Three models:
 *   - Fixed: every trial terminates at end_age. sample() is a no-op (does
 *     not consume randomness); median() returns end_age; survival() is a
 *     step function.
 *   - Gompertz: parametric Gompertz distribution; sample by inverting the
 *     conditional survival CDF given current_age. Median has a closed form:
 *     `modal + dispersion * ln(ln(2))`.
 *   - Cohort: bundled US SSA / UK ONS cohort survival tables; inverse-CDF
 *     sampling on the conditional distribution given current_age.
 */

import type { LongevityModel, LongevitySampler, Sex } from './types';
import { hashSeed, mulberry32 } from './return-sampler';
import usSsaTable from './data/life-tables/us-ssa-2020.json' with { type: 'json' };
import ukOnsTable from './data/life-tables/uk-ons-2020.json' with { type: 'json' };

interface LifeTable {
  ages: number[];
  survival: { M: number[]; F: number[] };
}

const TABLES: Record<'US' | 'UK', LifeTable> = {
  US: usSsaTable as unknown as LifeTable,
  UK: ukOnsTable as unknown as LifeTable,
};

// ===========================================================================
// Gompertz helpers
// ===========================================================================

/**
 * Gompertz survival from age 0 to `age`, parameterised by modal age and
 * dispersion (b). Anchored so S(0) = 1.
 */
export function gompertzSurvival(
  age: number,
  modal: number,
  b: number,
): number {
  const term = Math.exp((age - modal) / b) - Math.exp(-modal / b);
  return Math.exp(-term);
}

/**
 * Conditional survival to `age` given alive at `currentAge`. Used by the
 * sampler to invert the conditional CDF.
 */
export function gompertzConditionalSurvival(
  age: number,
  currentAge: number,
  modal: number,
  b: number,
): number {
  if (age <= currentAge) return 1.0;
  const sCurrent = gompertzSurvival(currentAge, modal, b);
  if (sCurrent <= 0) return 0;
  return gompertzSurvival(age, modal, b) / sCurrent;
}

/**
 * Closed-form Gompertz median lifespan: `modal + dispersion * ln(ln(2))`.
 * The bare Gompertz mean is pulled upward by the long right tail; the
 * median is the better central tendency for the deterministic projection.
 */
export function gompertzMedian(modal: number, dispersion: number): number {
  // Note: ln(ln(2)) ≈ -0.366. Median is slightly below the modal age.
  return modal + dispersion * Math.log(Math.log(2));
}

/**
 * Inverse-CDF sample from a Gompertz distribution conditional on current age.
 * Uses one uniform draw `u` so determinism is straightforward.
 *
 *   Solve gompertzConditionalSurvival(age) = 1 - u for `age`.
 *   Closed form:
 *     1 - u = exp( -[ exp((age - m)/b) - exp((c - m)/b) ] )
 *     -ln(1 - u) = exp((age - m)/b) - exp((c - m)/b)
 *     age = m + b * ln( exp((c - m)/b) - ln(1 - u) )
 */
export function gompertzSampleAge(
  current_age: number,
  modal: number,
  b: number,
  u: number,
): number {
  const uClamped = Math.min(0.999999999, Math.max(1e-9, u));
  const inner = Math.exp((current_age - modal) / b) - Math.log(1 - uClamped);
  const age = modal + b * Math.log(inner);
  return age;
}

// ===========================================================================
// Sampler builder
// ===========================================================================

export function buildLongevitySampler(
  model: LongevityModel,
  seed: number,
): LongevitySampler {
  if (model.kind === 'Fixed') {
    const endAge = model.end_age;
    return {
      kind: 'Fixed',
      sample(_current_age: number): number {
        return endAge;
      },
      median(_current_age: number): number {
        return endAge;
      },
      survival(age: number, _current_age: number): number {
        return age <= endAge ? 1 : 0;
      },
    };
  }

  if (model.kind === 'Gompertz') {
    const modal = model.modal_age;
    const b = model.dispersion;
    return {
      kind: 'Gompertz',
      sample(current_age: number): number {
        const rng = mulberry32(hashSeed(seed, current_age));
        const u = rng();
        const raw = gompertzSampleAge(current_age, modal, b, u);
        const intAge = Math.floor(raw);
        return Math.max(current_age, intAge);
      },
      median(current_age: number): number {
        // Numerically solve conditional median (S_cond = 0.5). Closed form:
        //   age = m + b * ln( exp((c - m)/b) + ln(2) )
        const inner = Math.exp((current_age - modal) / b) + Math.log(2);
        const med = modal + b * Math.log(inner);
        return Math.max(current_age, med);
      },
      survival(age: number, current_age: number): number {
        return gompertzConditionalSurvival(age, current_age, modal, b);
      },
    };
  }

  // Cohort
  const tbl = TABLES[model.country];
  const sex: Sex = model.sex === 'Unspecified' ? 'F' : model.sex;
  const survArr =
    sex === 'M' ? tbl.survival.M : tbl.survival.F;
  const ages = tbl.ages;

  function survAt(age: number): number {
    if (age <= ages[0]) return 1;
    if (age >= ages[ages.length - 1]) return 0;
    const i = Math.floor(age) - ages[0];
    return survArr[Math.max(0, Math.min(survArr.length - 1, i))];
  }

  function conditionalSurv(age: number, current_age: number): number {
    if (age <= current_age) return 1;
    const s0 = survAt(current_age);
    if (s0 <= 0) return 0;
    return survAt(age) / s0;
  }

  function inverseCDF(current_age: number, u: number): number {
    // Find the smallest integer age such that 1 - conditionalSurv(age) >= u.
    // Start from current_age and walk forward through the table; cap at the
    // last age.
    const target = 1 - u; // we want survival <= target
    for (let a = current_age; a <= ages[ages.length - 1]; a++) {
      if (conditionalSurv(a, current_age) <= target) return a;
    }
    return ages[ages.length - 1];
  }

  return {
    kind: 'Cohort',
    sample(current_age: number): number {
      const rng = mulberry32(hashSeed(seed, current_age));
      const u = rng();
      const a = inverseCDF(current_age, u);
      return Math.max(current_age, Math.floor(a));
    },
    median(current_age: number): number {
      // 50% of conditional CDF
      for (let a = current_age; a <= ages[ages.length - 1]; a++) {
        if (conditionalSurv(a, current_age) <= 0.5) return a;
      }
      return ages[ages.length - 1];
    },
    survival(age: number, current_age: number): number {
      return conditionalSurv(age, current_age);
    },
  };
}
