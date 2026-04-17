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
import type { LongevityModel, LongevitySampler } from './types';
/**
 * Gompertz survival from age 0 to `age`, parameterised by modal age and
 * dispersion (b). Anchored so S(0) = 1.
 */
export declare function gompertzSurvival(age: number, modal: number, b: number): number;
/**
 * Conditional survival to `age` given alive at `currentAge`. Used by the
 * sampler to invert the conditional CDF.
 */
export declare function gompertzConditionalSurvival(age: number, currentAge: number, modal: number, b: number): number;
/**
 * Closed-form Gompertz median lifespan: `modal + dispersion * ln(ln(2))`.
 * The bare Gompertz mean is pulled upward by the long right tail; the
 * median is the better central tendency for the deterministic projection.
 */
export declare function gompertzMedian(modal: number, dispersion: number): number;
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
export declare function gompertzSampleAge(current_age: number, modal: number, b: number, u: number): number;
export declare function buildLongevitySampler(model: LongevityModel, seed: number): LongevitySampler;
//# sourceMappingURL=longevity-sampler.d.ts.map