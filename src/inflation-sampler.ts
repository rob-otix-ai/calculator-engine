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
import { hashSeed, mulberry32, standardNormal } from './return-sampler';

// ===========================================================================
// Calibration preset table
// ===========================================================================

export interface InflationCalibration {
  long_run_mean_pct: number;
  phi: number;
  shock_stdev_pct: number;
}

export type InflationCalibrationPreset =
  | 'US-CPI'
  | 'UK-CPI'
  | 'UK-RPI'
  | 'EU-HICP'
  | 'Custom';

/**
 * Empirically-grounded AR(1) parameter sets. US-CPI matches post-1985 CPI;
 * UK-RPI is moderately more volatile and persistent; EU-HICP is tighter.
 * The engine never reads the preset name directly — the schema layer maps
 * the preset to the three resolved parameters before calling
 * buildInflationSampler.
 */
export const INFLATION_CALIBRATION_PRESETS: Record<
  Exclude<InflationCalibrationPreset, 'Custom'>,
  InflationCalibration
> = {
  'US-CPI': { long_run_mean_pct: 3.0, phi: 0.6, shock_stdev_pct: 1.5 },
  'UK-CPI': { long_run_mean_pct: 2.5, phi: 0.55, shock_stdev_pct: 1.6 },
  'UK-RPI': { long_run_mean_pct: 3.5, phi: 0.7, shock_stdev_pct: 2.0 },
  'EU-HICP': { long_run_mean_pct: 2.0, phi: 0.5, shock_stdev_pct: 1.2 },
};

// ===========================================================================
// Sampler builder
// ===========================================================================

/**
 * Build a deterministic stochastic inflation sampler.
 *
 * Determinism: identical (process, seed) -> identical draw sequence.
 * For Flat the sampler does not consume randomness regardless of seed.
 */
export function buildInflationSampler(
  process: InflationProcess,
  seed: number,
): InflationSampler {
  if (process.kind === 'Flat') {
    const rate = process.rate_pct / 100;
    return {
      kind: 'Flat',
      sample(_year: number, _priorInflation: number): number {
        return rate;
      },
    };
  }

  const mu = process.long_run_mean_pct / 100;
  const phi = process.phi;
  const shockStd = process.shock_stdev_pct / 100;
  return {
    kind: 'AR1',
    sample(year: number, priorInflation: number): number {
      const rng = mulberry32(hashSeed(seed, year));
      const eps = standardNormal(rng) * shockStd;
      return mu + phi * (priorInflation - mu) + eps;
    },
  };
}
