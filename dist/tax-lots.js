/**
 * Tax-lot accounting for CGT computation (ADR-037 / CONTRACT-020).
 *
 * Tracks cost-basis lots per holding. On disposal, lots are selected using
 * FIFO (oldest first) or HIFO (highest cost first) and realised gain is
 * computed as proceeds - cost_basis.
 *
 * Pure, deterministic, no side effects.
 */
export class TaxLotTracker {
    constructor(initialLots = []) {
        this.lots = initialLots.map((l) => (Object.assign({}, l)));
    }
    /** Add a new lot (contribution or purchase). */
    addLot(year, amount, costBasis) {
        if (amount <= 0)
            return;
        this.lots.push({
            year_acquired: year,
            amount,
            cost_basis: costBasis !== null && costBasis !== void 0 ? costBasis : amount,
        });
    }
    /** Return a copy of all current lots. */
    getLots() {
        return this.lots.map((l) => (Object.assign({}, l)));
    }
    /** Total market value across all lots. */
    totalValue() {
        return this.lots.reduce((s, l) => s + l.amount, 0);
    }
    /** Total cost basis across all lots. */
    totalCostBasis() {
        return this.lots.reduce((s, l) => s + l.cost_basis, 0);
    }
    /**
     * Dispose lots to cover a withdrawal amount.
     *
     * @param withdrawalAmount - The total proceeds to realise.
     * @param method - 'FIFO' (oldest first) or 'HIFO' (highest cost first).
     * @returns The realised gain (proceeds - cost_basis consumed).
     */
    dispose(withdrawalAmount, method = 'FIFO') {
        if (withdrawalAmount <= 0)
            return 0;
        // Sort lots for disposal order
        const sorted = this.sortForDisposal(method);
        let remaining = withdrawalAmount;
        let totalCostConsumed = 0;
        const kept = [];
        for (const lot of sorted) {
            if (remaining <= 0) {
                kept.push(lot);
                continue;
            }
            if (lot.amount <= remaining) {
                // Consume entire lot
                remaining -= lot.amount;
                totalCostConsumed += lot.cost_basis;
            }
            else {
                // Partial consumption
                const fraction = remaining / lot.amount;
                const costConsumed = lot.cost_basis * fraction;
                totalCostConsumed += costConsumed;
                kept.push({
                    year_acquired: lot.year_acquired,
                    amount: lot.amount - remaining,
                    cost_basis: lot.cost_basis - costConsumed,
                });
                remaining = 0;
            }
        }
        this.lots = kept;
        const actualProceeds = withdrawalAmount - remaining;
        return actualProceeds - totalCostConsumed;
    }
    /**
     * Apply proportional growth to all lots (market value changes but cost
     * basis stays fixed — unrealised gain increases).
     */
    applyGrowth(growthRate) {
        for (const lot of this.lots) {
            lot.amount *= 1 + growthRate;
        }
    }
    sortForDisposal(method) {
        const copy = this.lots.map((l) => (Object.assign({}, l)));
        if (method === 'FIFO') {
            copy.sort((a, b) => a.year_acquired - b.year_acquired);
        }
        else {
            // HIFO: highest cost_basis first (minimises realised gain)
            copy.sort((a, b) => b.cost_basis - a.cost_basis);
        }
        return copy;
    }
}
