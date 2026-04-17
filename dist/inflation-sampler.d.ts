/**
 * Stochastic Inflation Sampler (ADR-031 / CONTRACT-018)
 *
 * Two processes are supported:
 *   - Flat: returns the configured rate every year and consumes no random
 *     draws (per CONTRACT-018 invariant `inflation_flat_no_rng`).
 *   - AR(1): inflation_t = mu + phi * (inflation_{t-1} - mu) + eps_t
 *     with eps_t ~ Normal(0, shock_stdev_pct/100). Per-year RNG seeds are
 *     derived via the same hash used by the return sampler so the two
 *     samplers' draw streams are independent unless coupled via
 *     buildJointSampler.
 *
 * Calibration presets ship as a constant (CONTRACT-018 schema layer reads
 * this; the engine itself takes the resolved AR(1) parameters).
 */
import type { InflationProcess, InflationSampler } from './types';
export interface InflationCalibration {
    long_run_mean_pct: number;
    phi: number;
    shock_stdev_pct: number;
}
export type InflationCalibrationPreset = 'US-CPI' | 'UK-CPI' | 'UK-RPI' | 'EU-HICP' | 'Custom';
/**
 * Empirically-grounded AR(1) parameter sets. US-CPI matches post-1985 CPI;
 * UK-RPI is moderately more volatile and persistent; EU-HICP is tighter.
 * The engine never reads the preset name directly — the schema layer maps
 * the preset to the three resolved parameters before calling
 * buildInflationSampler.
 */
export declare const INFLATION_CALIBRATION_PRESETS: Record<Exclude<InflationCalibrationPreset, 'Custom'>, InflationCalibration>;
/**
 * Build a deterministic stochastic inflation sampler.
 *
 * Determinism: identical (process, seed) -> identical draw sequence.
 * For Flat the sampler does not consume randomness regardless of seed.
 */
export declare function buildInflationSampler(process: InflationProcess, seed: number): InflationSampler;
//# sourceMappingURL=inflation-sampler.d.ts.map