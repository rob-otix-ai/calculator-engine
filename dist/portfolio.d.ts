import type { Asset, FinancialItem } from './types';
export interface BlendedPortfolio {
    totalValue: number;
    blendedReturn: number;
    blendedFee: number;
    blendedPerfFee: number;
    liquidPct: number;
}
/**
 * Computes weighted-average return, fee, perf-fee, and liquid percentage
 * across a set of basic-mode assets.
 *
 * Only enabled assets are included.  If total value is 0 (or no enabled
 * assets), returns zeroed-out values.
 *
 * Formulas (from spec section 14):
 *   total         = sum of enabled asset values
 *   blended_return = sum(asset.current_value * asset.rate_pct) / total
 *   blended_fee    = sum(asset.current_value * asset.fee_pct) / total   (if fee exists)
 *   blended_perf_fee = sum(asset.current_value * asset.perf_fee_pct) / total (if exists)
 *   liquid_pct     = sum(liquid asset values) / total * 100
 *
 * Note: Asset schema may not carry fee_pct / perf_fee_pct — those fields are
 * optional on the Asset type.  When absent they default to 0.
 */
export declare function blendPortfolio(assets: Asset[]): BlendedPortfolio;
/**
 * Computes the estate value at the end of a projection.
 *
 * From spec section 14:
 *   estate = endBalanceNominal - endDebtNominal
 *          + sum( item.current_value * (1 + rate)^years * estate_pct/100 )
 *
 * Only enabled financial items with estate_pct > 0 contribute additional
 * estate value beyond the main portfolio balance.
 *
 * @param endBalanceNominal  Nominal portfolio balance at projection end
 * @param endDebtNominal     Total outstanding loan/debt balances at projection end
 * @param financialItems     Advanced-mode financial items (for estate earmarks)
 * @param yearsHeld          Number of years from start to end of projection
 */
export declare function calculateEstateValue(endBalanceNominal: number, endDebtNominal: number, financialItems: FinancialItem[], yearsHeld: number): number;
//# sourceMappingURL=portfolio.d.ts.map