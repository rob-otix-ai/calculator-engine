import { getLogger } from './logger';
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
export function blendPortfolio(assets) {
    const enabled = assets.filter((a) => a.enabled !== false);
    if (enabled.length === 0) {
        return {
            totalValue: 0,
            blendedReturn: 0,
            blendedFee: 0,
            blendedPerfFee: 0,
            liquidPct: 0,
        };
    }
    const totalValue = enabled.reduce((sum, a) => sum + a.current_value, 0);
    if (totalValue === 0) {
        return {
            totalValue: 0,
            blendedReturn: 0,
            blendedFee: 0,
            blendedPerfFee: 0,
            liquidPct: 0,
        };
    }
    const blendedReturn = enabled.reduce((sum, a) => sum + a.current_value * a.rate_pct, 0) / totalValue;
    // Asset schema doesn't always include fee fields; coalesce to 0
    const blendedFee = enabled.reduce((sum, a) => { var _a; return sum + a.current_value * ((_a = a.fee_pct) !== null && _a !== void 0 ? _a : 0); }, 0) / totalValue;
    const blendedPerfFee = enabled.reduce((sum, a) => { var _a; return sum + a.current_value * ((_a = a.perf_fee_pct) !== null && _a !== void 0 ? _a : 0); }, 0) / totalValue;
    const liquidTotal = enabled
        .filter((a) => a.is_liquid)
        .reduce((sum, a) => sum + a.current_value, 0);
    const liquidPct = (liquidTotal / totalValue) * 100;
    const log = getLogger();
    log.debug('Portfolio blended', {
        assetCount: enabled.length,
        blendedReturn,
        liquidPct,
    });
    return {
        totalValue,
        blendedReturn,
        blendedFee,
        blendedPerfFee,
        liquidPct,
    };
}
// ---------------------------------------------------------------------------
// Estate Value Calculation
// ---------------------------------------------------------------------------
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
export function calculateEstateValue(endBalanceNominal, endDebtNominal, financialItems, yearsHeld) {
    let estate = endBalanceNominal - endDebtNominal;
    for (const item of financialItems) {
        // Skip disabled items and those with no estate earmark
        if (!item.enabled)
            continue;
        if (item.estate_pct <= 0)
            continue;
        const rate = item.rate_pct / 100;
        const projectedValue = item.current_value * Math.pow(1 + rate, yearsHeld);
        estate += projectedValue * (item.estate_pct / 100);
    }
    return estate;
}
