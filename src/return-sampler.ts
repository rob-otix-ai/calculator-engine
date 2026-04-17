/**
 * Multi-Asset Correlated Return Sampler (ADR-030 / CONTRACT-018)
 *
 * Implements the per-year correlated return draws for the v0.4 stochastic
 * Monte Carlo. Three sampling processes are supported:
 *
 *   - LogNormal: classic multivariate log-normal — covariance from
 *                stdevs + correlation, Cholesky once, IID standard normals
 *                multiplied by the lower triangular factor each draw.
 *   - StudentT:  Student-t copula — sample correlated normals, push through
 *                an inverse Student-t CDF to get fat-tailed marginals while
 *                preserving the requested rank correlation.
 *   - Bootstrap: pick one historical year-tuple at random per draw; the
 *                simultaneous returns for every requested asset class are
 *                pulled from the bundled SHILLER_SERIES.
 *
 * Determinism: the sampler is built with an integer seed and produces
 * byte-identical output for identical inputs. Per-year seeds are derived via
 * a small inline hash so the per-trial seed sequence is independent of trial
 * count or call order.
 *
 * No new runtime dependencies — Cholesky, the inverse normal CDF and the
 * Student-t inverse CDF are implemented inline below.
 */

import type {
  AssetClass,
  AssetClassId,
  ReturnCorrelationMatrix,
  ReturnProcess,
  ReturnSampler,
} from './types';
import shillerJson from './data/shiller-1871-2024.json' with { type: 'json' };

// ===========================================================================
// Bundled historical series (Bootstrap)
// ===========================================================================

export interface ShillerRow {
  year: number;
  us_equity: number;
  us_bond: number;
  us_cpi: number;
}

interface ShillerWrapper {
  rows: ShillerRow[];
}

export const SHILLER_SERIES: ShillerRow[] = (shillerJson as ShillerWrapper).rows;

// ===========================================================================
// Default asset classes & correlations (CONTRACT-018 / ADR-030)
// ===========================================================================

/**
 * Five canonical asset classes with long-run (1926-present-ish) parameters.
 * Means are arithmetic annual returns; stdevs are annualised. Numbers are
 * rough Ibbotson-style references suitable as engine defaults; advisors can
 * override per scenario.
 */
export const DEFAULT_ASSET_CLASSES: AssetClass[] = [
  { id: 'us_equity', name: 'US Equity', expected_return_pct: 10, return_stdev_pct: 17, weight_pct: 60 },
  { id: 'intl_equity', name: 'Intl Equity', expected_return_pct: 8.5, return_stdev_pct: 20, weight_pct: 15 },
  { id: 'us_bond', name: 'US Bond', expected_return_pct: 4.5, return_stdev_pct: 6, weight_pct: 20 },
  { id: 'reit', name: 'REIT', expected_return_pct: 8, return_stdev_pct: 19, weight_pct: 3 },
  { id: 'cash', name: 'Cash', expected_return_pct: 3, return_stdev_pct: 1, weight_pct: 2 },
];

/**
 * Default 5x5 correlation matrix matching DEFAULT_ASSET_CLASSES order.
 * Numbers are realistic long-run pairwise correlations:
 *   US equity / Intl equity ~ 0.75
 *   US equity / US bond     ~ 0.10
 *   US equity / REIT        ~ 0.65
 *   Intl equity / US bond   ~ 0.05
 *   REIT / US bond          ~ 0.20
 *   anything / cash         ~ 0.0 (treated as independent)
 */
export const DEFAULT_CORRELATIONS: ReturnCorrelationMatrix = {
  ids: ['us_equity', 'intl_equity', 'us_bond', 'reit', 'cash'],
  values: [
    [1.0, 0.75, 0.10, 0.65, 0.0],
    [0.75, 1.0, 0.05, 0.55, 0.0],
    [0.10, 0.05, 1.0, 0.20, 0.05],
    [0.65, 0.55, 0.20, 1.0, 0.0],
    [0.0, 0.0, 0.05, 0.0, 1.0],
  ],
};

// ===========================================================================
// Linear algebra primitives — written inline (no new deps)
// ===========================================================================

/**
 * Lower-triangular Cholesky factor of a symmetric positive-semi-definite
 * matrix. Throws an Error with `code: 'NON_PSD_CORRELATION'` (and an
 * `offending_eigenvalue` hint) if the matrix is not PSD.
 *
 * Accepts a small numerical tolerance on the diagonal (a tiny negative pivot
 * within `tol` is treated as zero) so that degenerate-but-valid matrices do
 * not spuriously fail.
 */
export function cholesky(matrix: number[][], tol: number = 1e-10): number[][] {
  const n = matrix.length;
  if (n === 0) return [];
  for (let i = 0; i < n; i++) {
    if (matrix[i].length !== n) {
      const err = new Error('cholesky: matrix is not square') as Error & { code?: string };
      err.code = 'NON_PSD_CORRELATION';
      throw err;
    }
  }

  const L: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];

      if (i === j) {
        const pivot = matrix[i][i] - sum;
        if (pivot < -tol) {
          const err = new Error(
            `Correlation matrix is not positive semi-definite (pivot ${pivot.toExponential(3)} at row ${i}).`,
          ) as Error & { code?: string; offending_eigenvalue?: number };
          err.code = 'NON_PSD_CORRELATION';
          err.offending_eigenvalue = pivot;
          throw err;
        }
        L[i][j] = Math.sqrt(Math.max(0, pivot));
      } else {
        const denom = L[j][j];
        if (denom === 0) {
          // Zero pivot on a strictly-PSD matrix can occur for a redundant
          // dimension; we propagate a 0 row, which produces a zero draw for
          // that dimension — acceptable degenerate behaviour.
          L[i][j] = 0;
        } else {
          L[i][j] = (matrix[i][j] - sum) / denom;
        }
      }
    }
  }
  return L;
}

/**
 * Build a covariance matrix from per-asset stdevs (in percent) and a
 * correlation matrix indexed by the same ids. Values are scaled to decimals.
 */
export function buildCovariance(
  assetClasses: AssetClass[],
  correlation: ReturnCorrelationMatrix,
): number[][] {
  const n = assetClasses.length;
  const idIndex = new Map(correlation.ids.map((id, i) => [id, i]));
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const ai = idIndex.get(assetClasses[i].id);
    if (ai === undefined) {
      throw new Error(
        `correlation matrix is missing id "${assetClasses[i].id}"`,
      );
    }
    for (let j = 0; j < n; j++) {
      const aj = idIndex.get(assetClasses[j].id);
      if (aj === undefined) {
        throw new Error(
          `correlation matrix is missing id "${assetClasses[j].id}"`,
        );
      }
      const sigmaI = assetClasses[i].return_stdev_pct / 100;
      const sigmaJ = assetClasses[j].return_stdev_pct / 100;
      cov[i][j] = correlation.values[ai][aj] * sigmaI * sigmaJ;
    }
  }
  return cov;
}

// ===========================================================================
// RNG primitives — splitmix32 hash + mulberry32 stream
// ===========================================================================

/** Stable 32-bit hash combining a seed with a year-index. Used to derive
 *  per-year RNGs so the draw sequence is independent of trial count. */
export function hashSeed(seed: number, year: number): number {
  let x = (seed | 0) ^ Math.imul(year + 1, 0x9e3779b9);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Mulberry32 PRNG. Matches the engine-wide convention from monte-carlo.ts. */
export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard-normal draw via Box-Muller; matches monte-carlo.ts gaussian(). */
export function standardNormal(rng: () => number): number {
  const u1 = Math.max(rng(), 1e-10);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ===========================================================================
// Inverse normal & inverse Student-t CDFs (for Student-t copula path)
// ===========================================================================

/**
 * Beasley-Springer-Moro approximation of the inverse standard-normal CDF.
 * Adequate for our copula use (~6 sig figs in the tails).
 */
export function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
           ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > pHigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
         (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Standard-normal CDF (Abramowitz & Stegun 7.1.26 — ~7 sig figs). */
export function standardNormalCDF(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y =
    1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

/** Lanczos log-gamma — used by the Student-t inverse CDF. */
function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Regularised incomplete beta function — continued-fraction approach. */
function betaIncomplete(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbeta = logGamma(a + b) - logGamma(a) - logGamma(b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b + lbeta) / a;
  // Lentz's algorithm for the continued fraction
  let f = 1.0;
  let c = 1.0;
  let d = 0.0;
  for (let i = 0; i < 200; i++) {
    const m = i / 2;
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0)
      numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else
      numerator = -(((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1)));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-12) break;
  }
  return front * (f - 1);
}

/** Student-t CDF for x with `dof` degrees of freedom. */
export function studentTCDF(x: number, dof: number): number {
  const v = dof;
  const xx = (v) / (v + x * x);
  const ib = betaIncomplete(v / 2, 0.5, xx);
  if (x >= 0) return 1 - 0.5 * ib;
  return 0.5 * ib;
}

/**
 * Inverse Student-t CDF via bisection. Good to ~5 sig figs which is plenty
 * for the copula transformation step.
 */
export function inverseStudentT(p: number, dof: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let lo = -50;
  let hi = 50;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    const cdf = studentTCDF(mid, dof);
    if (cdf < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-7) break;
  }
  return 0.5 * (lo + hi);
}

// ===========================================================================
// Sampler builder
// ===========================================================================

/**
 * Build a deterministic correlated multi-asset return sampler for one MC run.
 *
 * @param assetClasses  Active asset classes — at least one entry.
 * @param correlation   NxN correlation matrix (validated PSD via Cholesky).
 * @param process       Distribution choice (LogNormal | StudentT | Bootstrap).
 * @param seed          Run-level seed; per-year seeds are derived deterministically.
 */
export function buildReturnSampler(
  assetClasses: AssetClass[],
  correlation: ReturnCorrelationMatrix,
  process: ReturnProcess,
  seed: number,
): ReturnSampler {
  if (assetClasses.length === 0) {
    throw new Error('buildReturnSampler: assetClasses must be non-empty');
  }
  if (process.kind === 'StudentT' && process.dof <= 2) {
    const err = new Error(
      `Student-T degrees of freedom must be > 2 for finite variance (got ${process.dof}).`,
    ) as Error & { code?: string };
    err.code = 'STUDENT_T_DOF_TOO_LOW';
    throw err;
  }

  const n = assetClasses.length;
  const means = assetClasses.map((a) => a.expected_return_pct / 100);
  const stdevs = assetClasses.map((a) => a.return_stdev_pct / 100);

  if (process.kind === 'Bootstrap') {
    // Filter the historical series to the requested window once.
    const [yLo, yHi] = process.window;
    if (yLo >= yHi) {
      const err = new Error(
        `bootstrap window invalid: ${yLo}-${yHi}`,
      ) as Error & { code?: string };
      err.code = 'BOOTSTRAP_WINDOW_INVALID';
      throw err;
    }
    const window = SHILLER_SERIES.filter(
      (r) => r.year >= yLo && r.year <= yHi,
    );
    if (window.length === 0) {
      const err = new Error(
        `bootstrap window contains no rows (${yLo}-${yHi})`,
      ) as Error & { code?: string };
      err.code = 'BOOTSTRAP_WINDOW_INVALID';
      throw err;
    }
    return {
      sample(year: number): Record<AssetClassId, number> {
        const rng = mulberry32(hashSeed(seed, year));
        const idx = Math.floor(rng() * window.length) % window.length;
        const row = window[idx];
        // Map every requested asset class to a column from the historical
        // row. Unknown ids fall back to the asset's expected return — we
        // always return the same shape regardless of what's bundled.
        const out: Record<AssetClassId, number> = {};
        for (let i = 0; i < n; i++) {
          const id = assetClasses[i].id;
          if (id === 'us_equity' || id === 'intl_equity' || id === 'reit') {
            out[id] = row.us_equity;
          } else if (id === 'us_bond' || id === 'intl_bond') {
            out[id] = row.us_bond;
          } else if (id === 'cash') {
            // Cash is largely unaffected by a bootstrap sample; use the mean.
            out[id] = means[i];
          } else {
            out[id] = means[i];
          }
        }
        return out;
      },
    };
  }

  // LogNormal & StudentT both use the Cholesky factor of the covariance
  // matrix. We compute it once at build time; per-year work is one matrix-
  // vector multiply plus inverse-CDF transforms.
  const cov = buildCovariance(assetClasses, correlation);
  const L = cholesky(cov);
  const dof = process.kind === 'StudentT' ? process.dof : 0;
  const studentScale =
    dof > 2 ? Math.sqrt(dof / (dof - 2)) : 1;

  return {
    sample(year: number): Record<AssetClassId, number> {
      const rng = mulberry32(hashSeed(seed, year));
      // Step 1: n IID standard-normal draws.
      const z: number[] = new Array(n);
      for (let i = 0; i < n; i++) z[i] = standardNormal(rng);
      // Step 2: correlated normals via L*z
      const correlatedZ: number[] = new Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          correlatedZ[i] += L[i][j] * z[j];
        }
      }
      // Step 3: convert to per-asset returns.
      const out: Record<AssetClassId, number> = {};
      for (let i = 0; i < n; i++) {
        const id = assetClasses[i].id;
        if (process.kind === 'LogNormal') {
          // Standard log-normal: returnNominal = exp(mu_ln + sigma_ln * z) - 1
          // where the (mu, sigma) for the log space are derived from arith
          // mean + stdev per-class. We re-derive sigma_ln per class instead
          // of using the correlated covariance directly — the Cholesky-
          // driven correlatedZ supplies the standard-normal shock with the
          // requested cross-correlation, but each class still uses its own
          // parameters in log-space so the marginal mean/stdev are right.
          const ratio = stdevs[i] / (1 + means[i]);
          const sigmaLn = Math.sqrt(Math.log(1 + ratio * ratio));
          const muLn = Math.log(1 + means[i]) - (sigmaLn * sigmaLn) / 2;
          // Normalise the correlated draw to unit stdev then apply per-class
          // log-normal parameters. Without this, the log-normal mean drifts
          // because we'd be exponentiating a draw with the wrong scale.
          const unitScale = stdevs[i] > 0 ? correlatedZ[i] / stdevs[i] : 0;
          out[id] = Math.exp(muLn + sigmaLn * unitScale) - 1;
        } else {
          // Student-t copula: convert correlated normal to a uniform via
          // standard-normal CDF, then push through inverse Student-t CDF
          // with the configured dof. Final scaling preserves the requested
          // arithmetic mean and stdev.
          const unitScale = stdevs[i] > 0 ? correlatedZ[i] / stdevs[i] : 0;
          const u = standardNormalCDF(unitScale);
          // Clamp away from 0/1 to avoid +/-Infinity from the inverse CDF.
          const uClamped = Math.min(0.9999999, Math.max(1e-7, u));
          const tDraw = inverseStudentT(uClamped, dof);
          // Student-t with dof has variance dof/(dof-2); divide to standardise.
          const standardised = tDraw / studentScale;
          out[id] = means[i] + stdevs[i] * standardised;
        }
        // Floor return at -1 (cannot lose more than 100%).
        if (out[id] < -1) out[id] = -1;
      }
      return out;
    },
  };
}

// ===========================================================================
// Joint return-inflation sampler (Section 4 of the v0.4 task list)
// ===========================================================================

/**
 * Couple a return sampler with an inflation shock dimension via an augmented
 * covariance matrix. Equity classes use `return_inflation_correlation`; bond
 * classes use `bond_inflation_correlation`; cash is treated as orthogonal to
 * the inflation shock.
 *
 * The augmented matrix is PSD-validated via Cholesky at build time; failure
 * throws an Error with code 'NON_PSD_CORRELATION'.
 *
 * Per year the sampler produces:
 *   - a Record<AssetClassId, number> of nominal returns
 *   - a single inflation rate (decimal) — the AR(1) recurrence applied if
 *     the supplied `InflationProcess` is AR(1); flat passthrough otherwise.
 */
export interface JointSample {
  returns: Record<AssetClassId, number>;
  inflation: number;
}

export interface JointSampler {
  sample(year: number, priorInflation: number): JointSample;
}

const EQUITY_LIKE = new Set<AssetClassId>([
  'us_equity',
  'intl_equity',
  'reit',
  'commodities',
]);
const BOND_LIKE = new Set<AssetClassId>(['us_bond', 'intl_bond']);

function inflationCorrelationFor(
  id: AssetClassId,
  returnInflationCorr: number,
  bondInflationCorr: number,
): number {
  if (BOND_LIKE.has(id)) return bondInflationCorr;
  if (EQUITY_LIKE.has(id)) return returnInflationCorr;
  // Cash and unknown classes: treated as uncorrelated with inflation shocks.
  return 0;
}

/**
 * Build an augmented (returns + inflation shock) sampler. Falls back to two
 * independent samplers when the supplied inflation process is Flat (since
 * Flat draws no randomness and therefore has nothing to correlate).
 */
export function buildJointSampler(
  assetClasses: AssetClass[],
  correlation: ReturnCorrelationMatrix,
  process: ReturnProcess,
  inflationProcess:
    | { kind: 'Flat'; rate_pct: number }
    | { kind: 'AR1'; long_run_mean_pct: number; phi: number; shock_stdev_pct: number; initial_pct: number },
  returnInflationCorr: number,
  bondInflationCorr: number,
  seed: number,
): JointSampler {
  // Flat inflation: no augmentation needed; delegate to the plain return
  // sampler and constant inflation.
  if (inflationProcess.kind === 'Flat') {
    const rs = buildReturnSampler(assetClasses, correlation, process, seed);
    const flatRate = inflationProcess.rate_pct / 100;
    return {
      sample(year: number, _priorInflation: number): JointSample {
        return { returns: rs.sample(year), inflation: flatRate };
      },
    };
  }

  // Bootstrap path: historical years carry their own inflation, so the
  // "joint" draw simply pairs a sampled history-year's CPI with its returns.
  if (process.kind === 'Bootstrap') {
    const [yLo, yHi] = process.window;
    const window = SHILLER_SERIES.filter(
      (r) => r.year >= yLo && r.year <= yHi,
    );
    if (window.length === 0) {
      const err = new Error(
        `bootstrap window contains no rows (${yLo}-${yHi})`,
      ) as Error & { code?: string };
      err.code = 'BOOTSTRAP_WINDOW_INVALID';
      throw err;
    }
    const n = assetClasses.length;
    const means = assetClasses.map((a) => a.expected_return_pct / 100);
    return {
      sample(year: number, _priorInflation: number): JointSample {
        const rng = mulberry32(hashSeed(seed, year));
        const idx = Math.floor(rng() * window.length) % window.length;
        const row = window[idx];
        const ret: Record<AssetClassId, number> = {};
        for (let i = 0; i < n; i++) {
          const id = assetClasses[i].id;
          if (EQUITY_LIKE.has(id)) ret[id] = row.us_equity;
          else if (BOND_LIKE.has(id)) ret[id] = row.us_bond;
          else if (id === 'cash') ret[id] = means[i];
          else ret[id] = means[i];
        }
        return { returns: ret, inflation: row.us_cpi };
      },
    };
  }

  // LogNormal / StudentT path: build the augmented covariance and Cholesky-
  // factorise once. The extra dimension is the inflation shock.
  const n = assetClasses.length;
  const means = assetClasses.map((a) => a.expected_return_pct / 100);
  const stdevs = assetClasses.map((a) => a.return_stdev_pct / 100);
  const inflStd = inflationProcess.shock_stdev_pct / 100;
  const inflMean = inflationProcess.long_run_mean_pct / 100;
  const phi = inflationProcess.phi;

  // Build (n+1)x(n+1) covariance matrix. Top-left n x n block is the
  // existing return covariance; the extra row/column couples each asset to
  // the inflation shock.
  const baseCov = buildCovariance(assetClasses, correlation);
  const aug: number[][] = baseCov.map((row) => [...row, 0]);
  aug.push(new Array(n + 1).fill(0));
  for (let i = 0; i < n; i++) {
    const corr = inflationCorrelationFor(
      assetClasses[i].id,
      returnInflationCorr,
      bondInflationCorr,
    );
    const cov = corr * stdevs[i] * inflStd;
    aug[i][n] = cov;
    aug[n][i] = cov;
  }
  aug[n][n] = inflStd * inflStd;

  const L = cholesky(aug); // throws NON_PSD_CORRELATION if augmented matrix invalid
  const dof = process.kind === 'StudentT' ? process.dof : 0;
  const studentScale = dof > 2 ? Math.sqrt(dof / (dof - 2)) : 1;

  return {
    sample(year: number, priorInflation: number): JointSample {
      const rng = mulberry32(hashSeed(seed, year));
      const z: number[] = new Array(n + 1);
      for (let i = 0; i < n + 1; i++) z[i] = standardNormal(rng);
      const correlatedZ: number[] = new Array(n + 1).fill(0);
      for (let i = 0; i < n + 1; i++) {
        for (let j = 0; j <= i; j++) correlatedZ[i] += L[i][j] * z[j];
      }
      // Returns
      const ret: Record<AssetClassId, number> = {};
      for (let i = 0; i < n; i++) {
        const id = assetClasses[i].id;
        const unit = stdevs[i] > 0 ? correlatedZ[i] / stdevs[i] : 0;
        let r: number;
        if (process.kind === 'LogNormal') {
          const ratio = stdevs[i] / (1 + means[i]);
          const sigmaLn = Math.sqrt(Math.log(1 + ratio * ratio));
          const muLn = Math.log(1 + means[i]) - (sigmaLn * sigmaLn) / 2;
          r = Math.exp(muLn + sigmaLn * unit) - 1;
        } else {
          const u = standardNormalCDF(unit);
          const uClamped = Math.min(0.9999999, Math.max(1e-7, u));
          const tDraw = inverseStudentT(uClamped, dof);
          r = means[i] + stdevs[i] * (tDraw / studentScale);
        }
        if (r < -1) r = -1;
        ret[id] = r;
      }
      // Inflation: AR(1) using the augmented draw as epsilon (already scaled
      // by inflStd via the Cholesky factor — divide back out so we have a
      // unit-stdev shock, then multiply by inflStd for the recurrence).
      const epsUnit = inflStd > 0 ? correlatedZ[n] / inflStd : 0;
      const epsilon = inflStd * epsUnit; // == correlatedZ[n] but kept explicit
      const nextInflation = inflMean + phi * (priorInflation - inflMean) + epsilon;
      return { returns: ret, inflation: nextInflation };
    },
  };
}
