/**
 * Mean-Variance Optimizer and Efficient Frontier (ADR-035 / CONTRACT-019)
 *
 * Implements classical Markowitz MVO with long-only constraints via an
 * inline active-set quadratic programming solver. No external dependencies.
 *
 * With N <= 12 assets, the QP has <= 12 variables and <= 25 constraints.
 * Active-set converges in O(N^2) iterations, each O(N^3) — negligible.
 */
import type { AssetClass, ReturnCorrelationMatrix, EfficientFrontierResult } from './types';
export declare function computeEfficientFrontier(assetClasses: AssetClass[], correlation: ReturnCorrelationMatrix, riskFreeRate: number, constraints?: {
    minWeights?: Record<string, number>;
    maxWeights?: Record<string, number>;
}): EfficientFrontierResult;
//# sourceMappingURL=efficient-frontier.d.ts.map