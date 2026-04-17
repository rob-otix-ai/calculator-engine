/**
 * Glide-Path Asset Allocation (ADR-034 / CONTRACT-019)
 *
 * Implements linear interpolation of portfolio weights across age-based
 * glide-path steps. Before the first step, initial asset_classes weights
 * apply. After the last step, the last step's weights hold. Between steps,
 * weights are linearly interpolated.
 */
import type { AssetClass, AssetClassId, GlidePathStep } from './types';
/**
 * Resolve the interpolated weight vector for a given age.
 *
 * @param age         Current age in the projection.
 * @param assetClasses The scenario's asset classes (used for initial weights).
 * @param glidePath   Sorted array of GlidePathStep (ascending by age).
 * @returns           A Record mapping each AssetClassId to its weight (0-100).
 */
export declare function resolveWeights(age: number, assetClasses: AssetClass[], glidePath: GlidePathStep[]): Record<AssetClassId, number>;
//# sourceMappingURL=glide-path.d.ts.map