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
import type { AssetClass, AssetClassId, ReturnCorrelationMatrix, ReturnProcess, ReturnSampler } from './types';
export interface ShillerRow {
    year: number;
    us_equity: number;
    us_bond: number;
    us_cpi: number;
}
export declare const SHILLER_SERIES: ShillerRow[];
/**
 * Five canonical asset classes with long-run (1926-present-ish) parameters.
 * Means are arithmetic annual returns; stdevs are annualised. Numbers are
 * rough Ibbotson-style references suitable as engine defaults; advisors can
 * override per scenario.
 */
export declare const DEFAULT_ASSET_CLASSES: AssetClass[];
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
export declare const DEFAULT_CORRELATIONS: ReturnCorrelationMatrix;
/**
 * Lower-triangular Cholesky factor of a symmetric positive-semi-definite
 * matrix. Throws an Error with `code: 'NON_PSD_CORRELATION'` (and an
 * `offending_eigenvalue` hint) if the matrix is not PSD.
 *
 * Accepts a small numerical tolerance on the diagonal (a tiny negative pivot
 * within `tol` is treated as zero) so that degenerate-but-valid matrices do
 * not spuriously fail.
 */
export declare function cholesky(matrix: number[][], tol?: number): number[][];
/**
 * Build a covariance matrix from per-asset stdevs (in percent) and a
 * correlation matrix indexed by the same ids. Values are scaled to decimals.
 */
export declare function buildCovariance(assetClasses: AssetClass[], correlation: ReturnCorrelationMatrix): number[][];
/** Stable 32-bit hash combining a seed with a year-index. Used to derive
 *  per-year RNGs so the draw sequence is independent of trial count. */
export declare function hashSeed(seed: number, year: number): number;
/** Mulberry32 PRNG. Matches the engine-wide convention from monte-carlo.ts. */
export declare function mulberry32(seed: number): () => number;
/** Standard-normal draw via Box-Muller; matches monte-carlo.ts gaussian(). */
export declare function standardNormal(rng: () => number): number;
/**
 * Beasley-Springer-Moro approximation of the inverse standard-normal CDF.
 * Adequate for our copula use (~6 sig figs in the tails).
 */
export declare function inverseNormalCDF(p: number): number;
/** Standard-normal CDF (Abramowitz & Stegun 7.1.26 — ~7 sig figs). */
export declare function standardNormalCDF(x: number): number;
/** Student-t CDF for x with `dof` degrees of freedom. */
export declare function studentTCDF(x: number, dof: number): number;
/**
 * Inverse Student-t CDF via bisection. Good to ~5 sig figs which is plenty
 * for the copula transformation step.
 */
export declare function inverseStudentT(p: number, dof: number): number;
/**
 * Build a deterministic correlated multi-asset return sampler for one MC run.
 *
 * @param assetClasses  Active asset classes — at least one entry.
 * @param correlation   NxN correlation matrix (validated PSD via Cholesky).
 * @param process       Distribution choice (LogNormal | StudentT | Bootstrap).
 * @param seed          Run-level seed; per-year seeds are derived deterministically.
 */
export declare function buildReturnSampler(assetClasses: AssetClass[], correlation: ReturnCorrelationMatrix, process: ReturnProcess, seed: number): ReturnSampler;
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
/**
 * Build an augmented (returns + inflation shock) sampler. Falls back to two
 * independent samplers when the supplied inflation process is Flat (since
 * Flat draws no randomness and therefore has nothing to correlate).
 */
export declare function buildJointSampler(assetClasses: AssetClass[], correlation: ReturnCorrelationMatrix, process: ReturnProcess, inflationProcess: {
    kind: 'Flat';
    rate_pct: number;
} | {
    kind: 'AR1';
    long_run_mean_pct: number;
    phi: number;
    shock_stdev_pct: number;
    initial_pct: number;
}, returnInflationCorr: number, bondInflationCorr: number, seed: number): JointSampler;
//# sourceMappingURL=return-sampler.d.ts.map