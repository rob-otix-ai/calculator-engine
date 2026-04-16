import { getLogger } from './logger';
// ---------------------------------------------------------------------------
// Historical Backtest — Shiller Data (real total stock returns, 1871-2024)
// ---------------------------------------------------------------------------
/**
 * Embedded Shiller real total stock return data (inflation-adjusted).
 * Source: Robert Shiller's dataset — real total return on S&P composite index.
 * Values represent annual real (after-inflation) total returns including
 * dividends, expressed as decimals (e.g., 0.1478 = 14.78%).
 */
const SHILLER_DATA = [
    { year: 1871, realStockReturn: 0.1478 },
    { year: 1872, realStockReturn: 0.1076 },
    { year: 1873, realStockReturn: -0.0415 },
    { year: 1874, realStockReturn: 0.1249 },
    { year: 1875, realStockReturn: 0.0555 },
    { year: 1876, realStockReturn: -0.0290 },
    { year: 1877, realStockReturn: 0.0187 },
    { year: 1878, realStockReturn: 0.1797 },
    { year: 1879, realStockReturn: 0.2102 },
    { year: 1880, realStockReturn: 0.2361 },
    { year: 1881, realStockReturn: 0.0118 },
    { year: 1882, realStockReturn: 0.0043 },
    { year: 1883, realStockReturn: -0.0041 },
    { year: 1884, realStockReturn: -0.0785 },
    { year: 1885, realStockReturn: 0.3034 },
    { year: 1886, realStockReturn: 0.1350 },
    { year: 1887, realStockReturn: -0.0122 },
    { year: 1888, realStockReturn: 0.0447 },
    { year: 1889, realStockReturn: 0.0511 },
    { year: 1890, realStockReturn: -0.0678 },
    { year: 1891, realStockReturn: 0.1920 },
    { year: 1892, realStockReturn: 0.0486 },
    { year: 1893, realStockReturn: -0.1716 },
    { year: 1894, realStockReturn: 0.0311 },
    { year: 1895, realStockReturn: 0.0520 },
    { year: 1896, realStockReturn: -0.0146 },
    { year: 1897, realStockReturn: 0.1768 },
    { year: 1898, realStockReturn: 0.2315 },
    { year: 1899, realStockReturn: 0.0178 },
    { year: 1900, realStockReturn: 0.1422 },
    { year: 1901, realStockReturn: 0.2007 },
    { year: 1902, realStockReturn: 0.0694 },
    { year: 1903, realStockReturn: -0.1724 },
    { year: 1904, realStockReturn: 0.3269 },
    { year: 1905, realStockReturn: 0.2206 },
    { year: 1906, realStockReturn: -0.0123 },
    { year: 1907, realStockReturn: -0.3274 },
    { year: 1908, realStockReturn: 0.4576 },
    { year: 1909, realStockReturn: 0.1805 },
    { year: 1910, realStockReturn: -0.0254 },
    { year: 1911, realStockReturn: 0.0399 },
    { year: 1912, realStockReturn: 0.0196 },
    { year: 1913, realStockReturn: -0.1087 },
    { year: 1914, realStockReturn: -0.0641 },
    { year: 1915, realStockReturn: 0.3197 },
    { year: 1916, realStockReturn: -0.0159 },
    { year: 1917, realStockReturn: -0.3180 },
    { year: 1918, realStockReturn: 0.1073 },
    { year: 1919, realStockReturn: 0.0759 },
    { year: 1920, realStockReturn: -0.1702 },
    { year: 1921, realStockReturn: 0.2315 },
    { year: 1922, realStockReturn: 0.2934 },
    { year: 1923, realStockReturn: 0.0540 },
    { year: 1924, realStockReturn: 0.2772 },
    { year: 1925, realStockReturn: 0.2808 },
    { year: 1926, realStockReturn: 0.1124 },
    { year: 1927, realStockReturn: 0.3727 },
    { year: 1928, realStockReturn: 0.4362 },
    { year: 1929, realStockReturn: -0.0885 },
    { year: 1930, realStockReturn: -0.2512 },
    { year: 1931, realStockReturn: -0.3887 },
    { year: 1932, realStockReturn: -0.0157 },
    { year: 1933, realStockReturn: 0.5701 },
    { year: 1934, realStockReturn: 0.0225 },
    { year: 1935, realStockReturn: 0.4577 },
    { year: 1936, realStockReturn: 0.3274 },
    { year: 1937, realStockReturn: -0.3788 },
    { year: 1938, realStockReturn: 0.2862 },
    { year: 1939, realStockReturn: 0.0230 },
    { year: 1940, realStockReturn: -0.0935 },
    { year: 1941, realStockReturn: -0.1792 },
    { year: 1942, realStockReturn: 0.1218 },
    { year: 1943, realStockReturn: 0.2275 },
    { year: 1944, realStockReturn: 0.1741 },
    { year: 1945, realStockReturn: 0.3413 },
    { year: 1946, realStockReturn: -0.2449 },
    { year: 1947, realStockReturn: -0.0434 },
    { year: 1948, realStockReturn: 0.0233 },
    { year: 1949, realStockReturn: 0.2115 },
    { year: 1950, realStockReturn: 0.2493 },
    { year: 1951, realStockReturn: 0.1458 },
    { year: 1952, realStockReturn: 0.1470 },
    { year: 1953, realStockReturn: -0.0124 },
    { year: 1954, realStockReturn: 0.5266 },
    { year: 1955, realStockReturn: 0.3139 },
    { year: 1956, realStockReturn: 0.0389 },
    { year: 1957, realStockReturn: -0.1401 },
    { year: 1958, realStockReturn: 0.4292 },
    { year: 1959, realStockReturn: 0.1055 },
    { year: 1960, realStockReturn: -0.0012 },
    { year: 1961, realStockReturn: 0.2638 },
    { year: 1962, realStockReturn: -0.1001 },
    { year: 1963, realStockReturn: 0.2055 },
    { year: 1964, realStockReturn: 0.1555 },
    { year: 1965, realStockReturn: 0.1040 },
    { year: 1966, realStockReturn: -0.1369 },
    { year: 1967, realStockReturn: 0.2084 },
    { year: 1968, realStockReturn: 0.0658 },
    { year: 1969, realStockReturn: -0.1464 },
    { year: 1970, realStockReturn: -0.0203 },
    { year: 1971, realStockReturn: 0.1068 },
    { year: 1972, realStockReturn: 0.1520 },
    { year: 1973, realStockReturn: -0.2343 },
    { year: 1974, realStockReturn: -0.3728 },
    { year: 1975, realStockReturn: 0.2896 },
    { year: 1976, realStockReturn: 0.1924 },
    { year: 1977, realStockReturn: -0.1248 },
    { year: 1978, realStockReturn: -0.0186 },
    { year: 1979, realStockReturn: 0.0574 },
    { year: 1980, realStockReturn: 0.1934 },
    { year: 1981, realStockReturn: -0.1269 },
    { year: 1982, realStockReturn: 0.1703 },
    { year: 1983, realStockReturn: 0.1871 },
    { year: 1984, realStockReturn: 0.0122 },
    { year: 1985, realStockReturn: 0.2810 },
    { year: 1986, realStockReturn: 0.1683 },
    { year: 1987, realStockReturn: 0.0192 },
    { year: 1988, realStockReturn: 0.1201 },
    { year: 1989, realStockReturn: 0.2662 },
    { year: 1990, realStockReturn: -0.0917 },
    { year: 1991, realStockReturn: 0.2654 },
    { year: 1992, realStockReturn: 0.0441 },
    { year: 1993, realStockReturn: 0.0720 },
    { year: 1994, realStockReturn: -0.0138 },
    { year: 1995, realStockReturn: 0.3452 },
    { year: 1996, realStockReturn: 0.1920 },
    { year: 1997, realStockReturn: 0.3128 },
    { year: 1998, realStockReturn: 0.2709 },
    { year: 1999, realStockReturn: 0.1826 },
    { year: 2000, realStockReturn: -0.1249 },
    { year: 2001, realStockReturn: -0.1347 },
    { year: 2002, realStockReturn: -0.2388 },
    { year: 2003, realStockReturn: 0.2637 },
    { year: 2004, realStockReturn: 0.0769 },
    { year: 2005, realStockReturn: 0.0146 },
    { year: 2006, realStockReturn: 0.1338 },
    { year: 2007, realStockReturn: 0.0111 },
    { year: 2008, realStockReturn: -0.3685 },
    { year: 2009, realStockReturn: 0.2646 },
    { year: 2010, realStockReturn: 0.1306 },
    { year: 2011, realStockReturn: -0.0183 },
    { year: 2012, realStockReturn: 0.1396 },
    { year: 2013, realStockReturn: 0.3069 },
    { year: 2014, realStockReturn: 0.1156 },
    { year: 2015, realStockReturn: 0.0065 },
    { year: 2016, realStockReturn: 0.0977 },
    { year: 2017, realStockReturn: 0.1930 },
    { year: 2018, realStockReturn: -0.0624 },
    { year: 2019, realStockReturn: 0.2880 },
    { year: 2020, realStockReturn: 0.1640 },
    { year: 2021, realStockReturn: 0.2168 },
    { year: 2022, realStockReturn: -0.2455 },
    { year: 2023, realStockReturn: 0.2214 },
    { year: 2024, realStockReturn: 0.2315 },
];
/**
 * Runs the scenario against historical Shiller data using rolling N-year windows.
 *
 * N = end_age - current_age (the full projection span).
 * For each starting year where N years of data are available, the projection
 * is run using historical real stock returns, and the terminal balance and
 * survival status are recorded.
 *
 * @param scenario   The base scenario (retirement_age, current_age, etc.)
 * @param projectionFn  A projection function that accepts a Scenario plus an
 *                      array of annual real returns and produces Metrics.
 * @returns  Array of BacktestPeriod results and the overall success rate (0-100).
 */
export function runHistoricalBacktest(scenario, projectionFn) {
    const log = getLogger();
    const span = scenario.end_age - scenario.current_age;
    // Guard: span must be at least 1
    if (span < 1) {
        return { periods: [], successRate: 0 };
    }
    const periods = [];
    const firstYear = SHILLER_DATA[0].year;
    const lastYear = SHILLER_DATA[SHILLER_DATA.length - 1].year;
    const dataLength = lastYear - firstYear + 1;
    // Number of rolling windows we can create
    const windowCount = dataLength - span + 1;
    if (windowCount < 1) {
        // Projection span exceeds available data — return empty with a note
        // (CONTRACT-005: "fewer periods returned; minimum 1 period required" —
        //  but if we truly can't make even 1 window, return empty.)
        return { periods: [], successRate: 0 };
    }
    // Build a lookup map for O(1) access by year
    const returnsByYear = new Map();
    for (const entry of SHILLER_DATA) {
        returnsByYear.set(entry.year, entry.realStockReturn);
    }
    log.info('Starting backtest', { spanYears: span, windowCount });
    let survivedCount = 0;
    for (let i = 0; i < windowCount; i++) {
        const startYear = firstYear + i;
        const endYear = startYear + span - 1;
        // Extract returns for this window
        const returns = [];
        for (let y = startYear; y <= endYear; y++) {
            const r = returnsByYear.get(y);
            if (r === undefined)
                break;
            returns.push(r);
        }
        // If we didn't get enough years (shouldn't happen given windowCount calc), skip
        if (returns.length < span)
            continue;
        // ADR-027: backtests already include real historical crashes — layering a
        // synthetic Black Swan event would double-count. Force-disable it on a
        // per-window scenario clone.
        const periodScenario = JSON.parse(JSON.stringify(scenario));
        periodScenario.black_swan_enabled = false;
        // Run projection with historical returns
        const result = projectionFn(periodScenario, returns);
        // Balance floor at 0 (CONTRACT-005 invariant)
        const terminalReal = Math.max(0, result.metrics.terminal_real);
        const survived = result.metrics.first_shortfall_age === null;
        periods.push({
            startYear,
            endYear,
            terminalReal,
            survived,
        });
        if (survived)
            survivedCount++;
    }
    const successRate = periods.length > 0
        ? (survivedCount / periods.length) * 100
        : 0;
    log.info('Backtest complete', { successRate, periodsAnalyzed: periods.length });
    return { periods, successRate };
}
