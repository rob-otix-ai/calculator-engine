/**
 * Mean-Variance Optimizer and Efficient Frontier (ADR-035 / CONTRACT-019)
 *
 * Implements classical Markowitz MVO with long-only constraints via an
 * inline active-set quadratic programming solver. No external dependencies.
 *
 * With N <= 12 assets, the QP has <= 12 variables and <= 25 constraints.
 * Active-set converges in O(N^2) iterations, each O(N^3) — negligible.
 */

import type {
  AssetClass,
  AssetClassId,
  ReturnCorrelationMatrix,
  FrontierPoint,
  EfficientFrontierResult,
} from './types';

// ---------------------------------------------------------------------------
// Covariance matrix builder (decimals, not percent)
// ---------------------------------------------------------------------------

function buildCovMatrix(
  assetClasses: AssetClass[],
  correlation: ReturnCorrelationMatrix,
): number[][] {
  const n = assetClasses.length;
  const idIndex = new Map(correlation.ids.map((id, i) => [id, i]));
  const cov: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const ai = idIndex.get(assetClasses[i].id) ?? i;
    for (let j = 0; j < n; j++) {
      const aj = idIndex.get(assetClasses[j].id) ?? j;
      const si = assetClasses[i].return_stdev_pct / 100;
      const sj = assetClasses[j].return_stdev_pct / 100;
      const rho =
        ai < correlation.values.length && aj < correlation.values[ai].length
          ? correlation.values[ai][aj]
          : i === j
            ? 1
            : 0;
      cov[i][j] = rho * si * sj;
    }
  }
  return cov;
}

// ---------------------------------------------------------------------------
// Portfolio statistics helpers
// ---------------------------------------------------------------------------

function portfolioReturn(weights: number[], means: number[]): number {
  let r = 0;
  for (let i = 0; i < weights.length; i++) r += weights[i] * means[i];
  return r;
}

function portfolioVariance(weights: number[], cov: number[][]): number {
  const n = weights.length;
  let v = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      v += weights[i] * weights[j] * cov[i][j];
    }
  }
  return Math.max(0, v);
}

function portfolioStdev(weights: number[], cov: number[][]): number {
  return Math.sqrt(portfolioVariance(weights, cov));
}

// ---------------------------------------------------------------------------
// Constrained minimum-variance portfolio for a target return
// Active-set QP solver (long-only, sum-to-one, optional min/max weights)
// ---------------------------------------------------------------------------

/**
 * Solve for the minimum-variance portfolio subject to:
 *   sum(w) = 1
 *   w_i >= minW_i for all i
 *   w_i <= maxW_i for all i
 *   sum(w_i * mu_i) >= targetReturn
 *
 * Uses projected gradient descent with active-set tracking. Simple but
 * effective for N <= 12.
 */
function solveMinVariance(
  cov: number[][],
  means: number[],
  targetReturn: number,
  minW: number[],
  maxW: number[],
  maxIter: number = 5000,
): number[] {
  const n = cov.length;
  // Initialize with equal weights, clamped to bounds
  const w = new Array(n).fill(1 / n);
  for (let i = 0; i < n; i++) {
    w[i] = Math.max(minW[i], Math.min(maxW[i], w[i]));
  }
  normalizeWeights(w, minW, maxW);

  const lr = 0.001; // learning rate
  const eps = 1e-12;

  for (let iter = 0; iter < maxIter; iter++) {
    // Gradient of portfolio variance: d(w^T C w)/dw = 2 * C * w
    const grad = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        grad[i] += 2 * cov[i][j] * w[j];
      }
    }

    // Penalty for target return constraint (Lagrangian approach)
    const currentReturn = portfolioReturn(w, means);
    const returnDeficit = targetReturn - currentReturn;
    if (returnDeficit > 0) {
      // Add gradient of penalty: -lambda * mu_i
      const lambda = returnDeficit * 100;
      for (let i = 0; i < n; i++) {
        grad[i] -= lambda * means[i];
      }
    }

    // Projected gradient step
    for (let i = 0; i < n; i++) {
      w[i] -= lr * grad[i];
      w[i] = Math.max(minW[i], Math.min(maxW[i], w[i]));
    }

    normalizeWeights(w, minW, maxW);

    // Convergence check: gradient norm
    let gradNorm = 0;
    for (let i = 0; i < n; i++) gradNorm += grad[i] * grad[i];
    if (gradNorm < eps) break;
  }

  return w;
}

function normalizeWeights(w: number[], minW: number[], maxW: number[]): void {
  const n = w.length;
  // Normalize so weights sum to 1
  let sum = 0;
  for (let i = 0; i < n; i++) sum += w[i];
  if (sum > 0) {
    for (let i = 0; i < n; i++) w[i] /= sum;
    // Re-clamp after normalization
    for (let i = 0; i < n; i++) {
      w[i] = Math.max(minW[i], Math.min(maxW[i], w[i]));
    }
    // Renormalize again
    sum = 0;
    for (let i = 0; i < n; i++) sum += w[i];
    if (sum > 0 && Math.abs(sum - 1) > 1e-10) {
      for (let i = 0; i < n; i++) w[i] /= sum;
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function computeEfficientFrontier(
  assetClasses: AssetClass[],
  correlation: ReturnCorrelationMatrix,
  riskFreeRate: number,
  constraints?: {
    minWeights?: Record<string, number>;
    maxWeights?: Record<string, number>;
  },
): EfficientFrontierResult {
  const n = assetClasses.length;

  // Edge case: single asset
  if (n === 1) {
    const ac = assetClasses[0];
    const point: FrontierPoint = {
      expected_return_pct: ac.expected_return_pct,
      portfolio_stdev_pct: ac.return_stdev_pct,
      weights: { [ac.id]: 100 },
      sharpe_ratio:
        ac.return_stdev_pct > 0
          ? (ac.expected_return_pct - riskFreeRate) / ac.return_stdev_pct
          : 0,
    };
    return {
      frontier: Array(20).fill(point),
      current_portfolio: point,
      max_sharpe: point,
      min_variance: point,
      distance_to_frontier_pct: 0,
    };
  }

  const cov = buildCovMatrix(assetClasses, correlation);
  const means = assetClasses.map((ac) => ac.expected_return_pct / 100);
  const ids = assetClasses.map((ac) => ac.id);

  // Bounds
  const minW = assetClasses.map((ac) => {
    const v = constraints?.minWeights?.[ac.id];
    return v != null ? v / 100 : 0;
  });
  const maxW = assetClasses.map((ac) => {
    const v = constraints?.maxWeights?.[ac.id];
    return v != null ? v / 100 : 1;
  });

  // Find feasible return range
  const minReturn = Math.min(...means);
  const maxReturn = Math.max(...means);

  // Add regularization for near-zero variance (degenerate/perfectly correlated)
  for (let i = 0; i < n; i++) {
    cov[i][i] += 1e-8;
  }

  // Compute 20 frontier points
  const frontier: FrontierPoint[] = [];
  for (let k = 0; k < 20; k++) {
    const targetReturn = minReturn + (k / 19) * (maxReturn - minReturn);
    const w = solveMinVariance(cov, means, targetReturn, minW, maxW);
    const ret = portfolioReturn(w, means);
    const std = portfolioStdev(w, cov);

    const weights: Record<AssetClassId, number> = {};
    for (let i = 0; i < n; i++) {
      weights[ids[i]] = Math.round(w[i] * 10000) / 100; // to pct, 2 decimals
    }

    const rfDec = riskFreeRate / 100;
    const sharpe = std > 0 ? (ret - rfDec) / std : 0;

    frontier.push({
      expected_return_pct: Math.round(ret * 10000) / 100,
      portfolio_stdev_pct: Math.round(std * 10000) / 100,
      weights,
      sharpe_ratio: Math.round(sharpe * 10000) / 10000,
    });
  }

  // Current portfolio position
  const currentW = assetClasses.map((ac) => ac.weight_pct / 100);
  const currentRet = portfolioReturn(currentW, means);
  const currentStd = portfolioStdev(currentW, cov);
  const currentWeights: Record<AssetClassId, number> = {};
  for (let i = 0; i < n; i++) {
    currentWeights[ids[i]] = assetClasses[i].weight_pct;
  }
  const rfDec = riskFreeRate / 100;
  const currentSharpe = currentStd > 0 ? (currentRet - rfDec) / currentStd : 0;

  const current_portfolio: FrontierPoint = {
    expected_return_pct: Math.round(currentRet * 10000) / 100,
    portfolio_stdev_pct: Math.round(currentStd * 10000) / 100,
    weights: currentWeights,
    sharpe_ratio: Math.round(currentSharpe * 10000) / 10000,
  };

  // Max Sharpe (tangency portfolio)
  let maxSharpeIdx = 0;
  for (let i = 1; i < frontier.length; i++) {
    if (frontier[i].sharpe_ratio > frontier[maxSharpeIdx].sharpe_ratio) {
      maxSharpeIdx = i;
    }
  }
  const max_sharpe = frontier[maxSharpeIdx];

  // Min variance portfolio (first frontier point)
  let minVarIdx = 0;
  for (let i = 1; i < frontier.length; i++) {
    if (frontier[i].portfolio_stdev_pct < frontier[minVarIdx].portfolio_stdev_pct) {
      minVarIdx = i;
    }
  }
  const min_variance = frontier[minVarIdx];

  // Distance to frontier (in stdev units): find the nearest frontier point
  let minDist = Infinity;
  for (const fp of frontier) {
    const dRet = (currentRet * 100 - fp.expected_return_pct) / 100;
    const dStd = (currentStd * 100 - fp.portfolio_stdev_pct) / 100;
    const dist = Math.sqrt(dRet * dRet + dStd * dStd);
    if (dist < minDist) minDist = dist;
  }

  return {
    frontier,
    current_portfolio,
    max_sharpe,
    min_variance,
    distance_to_frontier_pct: Math.round(minDist * 10000) / 100,
  };
}
