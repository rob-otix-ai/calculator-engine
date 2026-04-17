/**
 * Glide-Path Asset Allocation (ADR-034 / CONTRACT-019)
 *
 * Implements linear interpolation of portfolio weights across age-based
 * glide-path steps. Before the first step, initial asset_classes weights
 * apply. After the last step, the last step's weights hold. Between steps,
 * weights are linearly interpolated.
 */
/**
 * Resolve the interpolated weight vector for a given age.
 *
 * @param age         Current age in the projection.
 * @param assetClasses The scenario's asset classes (used for initial weights).
 * @param glidePath   Sorted array of GlidePathStep (ascending by age).
 * @returns           A Record mapping each AssetClassId to its weight (0-100).
 */
export function resolveWeights(age, assetClasses, glidePath) {
    var _a, _b;
    // Base case: no glide path — use static weights from asset_classes.
    if (!glidePath || glidePath.length === 0) {
        const weights = {};
        for (const ac of assetClasses) {
            weights[ac.id] = ac.weight_pct;
        }
        return weights;
    }
    // Before the first step: use initial asset_classes weights.
    if (age <= glidePath[0].age) {
        if (age < glidePath[0].age) {
            const weights = {};
            for (const ac of assetClasses) {
                weights[ac.id] = ac.weight_pct;
            }
            return weights;
        }
        // Exactly at the first step
        return Object.assign({}, glidePath[0].weights);
    }
    // After the last step: use the last step's weights.
    if (age >= glidePath[glidePath.length - 1].age) {
        return Object.assign({}, glidePath[glidePath.length - 1].weights);
    }
    // Between steps: find the two bracketing steps and interpolate.
    let lowerIdx = 0;
    for (let i = 0; i < glidePath.length - 1; i++) {
        if (age >= glidePath[i].age && age < glidePath[i + 1].age) {
            lowerIdx = i;
            break;
        }
    }
    const lower = glidePath[lowerIdx];
    const upper = glidePath[lowerIdx + 1];
    const span = upper.age - lower.age;
    const t = span > 0 ? (age - lower.age) / span : 0;
    // Collect all asset class IDs from both steps
    const allIds = new Set();
    for (const id of Object.keys(lower.weights))
        allIds.add(id);
    for (const id of Object.keys(upper.weights))
        allIds.add(id);
    const weights = {};
    for (const id of allIds) {
        const wLow = (_a = lower.weights[id]) !== null && _a !== void 0 ? _a : 0;
        const wHigh = (_b = upper.weights[id]) !== null && _b !== void 0 ? _b : 0;
        weights[id] = wLow + t * (wHigh - wLow);
    }
    return weights;
}
