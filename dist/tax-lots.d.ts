/**
 * Tax-lot accounting for CGT computation (ADR-037 / CONTRACT-020).
 *
 * Tracks cost-basis lots per holding. On disposal, lots are selected using
 * FIFO (oldest first) or HIFO (highest cost first) and realised gain is
 * computed as proceeds - cost_basis.
 *
 * Pure, deterministic, no side effects.
 */
import type { TaxLot } from './types';
export declare class TaxLotTracker {
    private lots;
    constructor(initialLots?: TaxLot[]);
    /** Add a new lot (contribution or purchase). */
    addLot(year: number, amount: number, costBasis?: number): void;
    /** Return a copy of all current lots. */
    getLots(): TaxLot[];
    /** Total market value across all lots. */
    totalValue(): number;
    /** Total cost basis across all lots. */
    totalCostBasis(): number;
    /**
     * Dispose lots to cover a withdrawal amount.
     *
     * @param withdrawalAmount - The total proceeds to realise.
     * @param method - 'FIFO' (oldest first) or 'HIFO' (highest cost first).
     * @returns The realised gain (proceeds - cost_basis consumed).
     */
    dispose(withdrawalAmount: number, method?: 'FIFO' | 'HIFO'): number;
    /**
     * Apply proportional growth to all lots (market value changes but cost
     * basis stays fixed — unrealised gain increases).
     */
    applyGrowth(growthRate: number): void;
    private sortForDisposal;
}
//# sourceMappingURL=tax-lots.d.ts.map