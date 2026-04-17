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

export class TaxLotTracker {
  private lots: TaxLot[];

  constructor(initialLots: TaxLot[] = []) {
    this.lots = initialLots.map((l) => ({ ...l }));
  }

  /** Add a new lot (contribution or purchase). */
  addLot(year: number, amount: number, costBasis?: number): void {
    if (amount <= 0) return;
    this.lots.push({
      year_acquired: year,
      amount,
      cost_basis: costBasis ?? amount,
    });
  }

  /** Return a copy of all current lots. */
  getLots(): TaxLot[] {
    return this.lots.map((l) => ({ ...l }));
  }

  /** Total market value across all lots. */
  totalValue(): number {
    return this.lots.reduce((s, l) => s + l.amount, 0);
  }

  /** Total cost basis across all lots. */
  totalCostBasis(): number {
    return this.lots.reduce((s, l) => s + l.cost_basis, 0);
  }

  /**
   * Dispose lots to cover a withdrawal amount.
   *
   * @param withdrawalAmount - The total proceeds to realise.
   * @param method - 'FIFO' (oldest first) or 'HIFO' (highest cost first).
   * @returns The realised gain (proceeds - cost_basis consumed).
   */
  dispose(withdrawalAmount: number, method: 'FIFO' | 'HIFO' = 'FIFO'): number {
    if (withdrawalAmount <= 0) return 0;

    // Sort lots for disposal order
    const sorted = this.sortForDisposal(method);
    let remaining = withdrawalAmount;
    let totalCostConsumed = 0;
    const kept: TaxLot[] = [];

    for (const lot of sorted) {
      if (remaining <= 0) {
        kept.push(lot);
        continue;
      }

      if (lot.amount <= remaining) {
        // Consume entire lot
        remaining -= lot.amount;
        totalCostConsumed += lot.cost_basis;
      } else {
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
  applyGrowth(growthRate: number): void {
    for (const lot of this.lots) {
      lot.amount *= 1 + growthRate;
    }
  }

  private sortForDisposal(method: 'FIFO' | 'HIFO'): TaxLot[] {
    const copy = this.lots.map((l) => ({ ...l }));
    if (method === 'FIFO') {
      copy.sort((a, b) => a.year_acquired - b.year_acquired);
    } else {
      // HIFO: highest cost_basis first (minimises realised gain)
      copy.sort((a, b) => b.cost_basis - a.cost_basis);
    }
    return copy;
  }
}
