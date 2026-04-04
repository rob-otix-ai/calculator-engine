import type { Cadence, CurrencyCode, Scenario } from './types';
export declare const CadenceMultiplier: Record<Cadence, number>;
export interface CurrencyInfo {
    code: CurrencyCode;
    symbol: string;
    decimals: number;
}
export declare const CURRENCY_MAP: Record<CurrencyCode, CurrencyInfo>;
export declare const DEFAULT_SCENARIO: Scenario;
//# sourceMappingURL=defaults.d.ts.map