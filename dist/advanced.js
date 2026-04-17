/**
 * Advanced Mode Cash Waterfall Engine
 *
 * Tracks individual financial items (cash, investments, properties, loans,
 * salary, pensions, etc.) separately with a cash account as the central
 * reservoir. Implements the 9-step cash waterfall per spec section 14.
 *
 * Resolution order per year:
 *   1. Income phase (salary, pension, SS, rental, cash yield)
 *   2. Mandatory debits (mortgages, loan interest/principal)
 *   3. Investment sales (single/staggered profit-taking)
 *   4. Liquidity events
 *   5. Contributions (pre-retirement)
 *   6. Withdrawal demand (post-retirement)
 *   7. Tax settlement
 *   8. Insolvency check
 *   9. Investment growth (per-item rates, fees, performance fees)
 */
import { CadenceMultiplier } from './defaults.js';
import { calculateTax } from './tax.js';
import { calculateWithdrawal, } from './withdrawal.js';
import { getLogger } from './logger.js';
// =============================================================================
// Helper Functions
// =============================================================================
/**
 * Standard amortization payment formula.
 * GUARD: if rate === 0, return principal / term to avoid division by zero.
 * GUARD: if term <= 0, return 0 (perpetual loan — interest-only).
 */
function amortizationPayment(principal, annualRate, term) {
    if (term <= 0)
        return 0;
    if (principal <= 0)
        return 0;
    if (annualRate === 0)
        return principal / term;
    const r = annualRate;
    return principal * (r / (1 - Math.pow(1 + r, -term)));
}
/**
 * Resolve a staggered step value for the given age, falling back to a default.
 * Uses Array.find — first matching step wins (overlap behavior per ADR-012).
 */
function resolveStaggeredStep(steps, age) {
    return steps.find((s) => age >= s.start_age && age <= s.end_age);
}
/**
 * Resolve salary income for a given age, handling flat vs staggered income_steps
 * and applying raises.
 */
function resolveSalaryIncome(item, age, currentAge) {
    var _a;
    if (!item.enabled)
        return 0;
    if (age < item.income_start_age || age > item.income_end_age)
        return 0;
    // Base income: flat or staggered
    let baseIncome;
    if (item.income_mode === 'staggered' && item.income_steps.length > 0) {
        const step = resolveStaggeredStep(item.income_steps, age);
        if (!step)
            return 0;
        const freq = (_a = step.frequency) !== null && _a !== void 0 ? _a : item.income_frequency;
        baseIncome = step.amount * (freq === 'Monthly' ? 12 : 1);
    }
    else {
        baseIncome = item.income_amount * (item.income_frequency === 'Monthly' ? 12 : 1);
    }
    // Apply raises
    const yearsWorked = age - Math.max(item.income_start_age, currentAge);
    if (yearsWorked > 0) {
        if (item.salary_raise_mode === 'staggered' && item.salary_raise_steps.length > 0) {
            // For staggered raises, compound year by year from start
            let salary = item.income_amount * (item.income_frequency === 'Monthly' ? 12 : 1);
            for (let a = Math.max(item.income_start_age, currentAge) + 1; a <= age; a++) {
                const raiseStep = resolveStaggeredStep(item.salary_raise_steps, a);
                const raisePct = raiseStep ? raiseStep.raise_pct : 0;
                salary *= 1 + raisePct / 100;
            }
            baseIncome = salary;
        }
        else {
            // Flat raise: compound
            baseIncome *= Math.pow(1 + item.salary_raise_pct / 100, yearsWorked);
        }
    }
    // Add bonus
    baseIncome *= 1 + item.salary_bonus_pct / 100;
    return baseIncome;
}
/**
 * Resolve cash yield rate for the given age (flat or staggered).
 */
function resolveCashYield(item, age) {
    if (item.cash_yield_mode === 'staggered' && item.cash_yield_steps.length > 0) {
        const step = resolveStaggeredStep(item.cash_yield_steps, age);
        return step ? step.rate_pct : 0;
    }
    return item.rate_pct;
}
/**
 * Resolve contribution amount for an investment item at the given age.
 * Returns annual contribution amount.
 */
function resolveContributions(item, age, currentAge) {
    var _a, _b;
    // Check age bounds
    const startAge = (_a = item.contrib_start_age) !== null && _a !== void 0 ? _a : currentAge;
    const endAge = (_b = item.contrib_end_age) !== null && _b !== void 0 ? _b : 120;
    if (age < startAge || age > endAge)
        return 0;
    // Check invest_start_age — no contributions before the investment enters the portfolio
    if (item.invest_start_age != null && age < item.invest_start_age)
        return 0;
    if (item.contrib_mode === 'staggered' && item.contrib_steps.length > 0) {
        const step = resolveStaggeredStep(item.contrib_steps, age);
        if (!step)
            return 0;
        // Use the parent's cadence to annualize
        return step.amount * CadenceMultiplier[item.contrib_cadence];
    }
    // Flat mode with annual increase
    const yearsFromStart = age - startAge;
    const baseAnnual = item.contrib_amount * CadenceMultiplier[item.contrib_cadence];
    return baseAnnual * Math.pow(1 + item.contrib_increase_pct / 100, yearsFromStart);
}
// =============================================================================
// Income Category Helpers
// =============================================================================
const INCOME_CATEGORIES = new Set([
    'Pension',
    'Social Security',
    'Annuity',
    'Retirement Income',
    'Other',
]);
// =============================================================================
// Main Projection
// =============================================================================
export function runAdvancedProjection(scenario, overrideReturns) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1;
    const { current_age, retirement_age, end_age, inflation_pct, inflation_enabled, financial_items, liquidity_events, enable_taxes, effective_tax_rate_pct, tax_jurisdiction, tax_config, black_swan_enabled, black_swan_age, black_swan_loss_pct, desired_estate, } = scenario;
    const log = getLogger();
    log.info('Starting advanced projection', {
        currentAge: current_age,
        retirementAge: retirement_age,
        itemCount: financial_items.length,
    });
    const items = financial_items.filter((item) => item.enabled);
    // -------------------------------------------------------------------------
    // Initialize state
    // -------------------------------------------------------------------------
    const cashItem = items.find((i) => i.category === 'Cash');
    let cashBalance = (_a = cashItem === null || cashItem === void 0 ? void 0 : cashItem.current_value) !== null && _a !== void 0 ? _a : 0;
    // Investment balances indexed by position in original financial_items array
    const investmentBalances = new Map();
    const highWaterMarks = new Map();
    const costBasis = new Map();
    const loanBalances = new Map();
    // Property/Collectables value tracking
    const propertyValues = new Map();
    for (let idx = 0; idx < financial_items.length; idx++) {
        const item = financial_items[idx];
        if (!item.enabled)
            continue;
        if (item.category === 'Investment') {
            investmentBalances.set(idx, item.current_value);
            highWaterMarks.set(idx, item.current_value);
            costBasis.set(idx, item.current_value);
        }
        else if (item.category === 'Property' || item.category === 'Collectables') {
            propertyValues.set(idx, item.current_value);
            costBasis.set(idx, item.current_value);
        }
        else if (item.category === 'Loan') {
            loanBalances.set(idx, item.loan_opening_principal);
            // Credit opening principal to cash if configured
            if (item.loan_credit_at_start && current_age === item.loan_start_age) {
                cashBalance += item.loan_opening_principal;
            }
        }
    }
    // -------------------------------------------------------------------------
    // Accumulators
    // -------------------------------------------------------------------------
    const timeline = [];
    let cpiIndex = 1.0;
    let gkState = null;
    let firstShortfallAge = null;
    let totalContributions = 0;
    let totalWithdrawals = 0;
    let totalFees = 0;
    let totalTaxes = 0;
    // -------------------------------------------------------------------------
    // Year-by-year loop
    // -------------------------------------------------------------------------
    for (let age = current_age; age <= end_age; age++) {
        const yearIndex = age - current_age;
        // Snapshot start-of-year balances
        const startCash = cashBalance;
        const startInvestments = sumMap(investmentBalances);
        const startProperties = sumMap(propertyValues);
        const startLoans = sumMap(loanBalances);
        const startBalance = startCash + startInvestments + startProperties - startLoans;
        // Per-year accumulators
        let yearIncome = 0;
        let yearIncomeTaxes = 0;
        let yearContributions = 0;
        let yearWithdrawals = 0;
        let yearDesiredSpending = 0;
        let yearFees = 0;
        let yearTaxes = 0;
        let yearGrowth = 0;
        let yearLiquidityNet = 0;
        let yearLoanInterest = 0;
        let yearLoanPrincipalRepaid = 0;
        let yearMortgagePaid = 0;
        let yearCashYield = 0;
        let shortfallMandatory = 0;
        let shortfallContributions = 0;
        let shortfallWithdrawals = 0;
        let yearTaxableIncome = 0;
        let yearBlackSwanLoss = 0;
        let withdrawalEvent = 'standard';
        // =====================================================================
        // 1. INCOME PHASE
        // =====================================================================
        // --- Salary items ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || item.category !== 'Salary')
                continue;
            const gross = resolveSalaryIncome(item, age, current_age);
            if (gross <= 0)
                continue;
            const tax = item.taxable ? gross * (item.tax_rate / 100) : 0;
            const net = gross - tax;
            yearIncome += gross;
            yearIncomeTaxes += tax;
            if (item.taxable)
                yearTaxableIncome += gross;
            // Route income
            if (item.income_destination !== 'cash' &&
                item.reinvest_target_item_index != null &&
                investmentBalances.has(item.reinvest_target_item_index)) {
                const targetIdx = item.reinvest_target_item_index;
                investmentBalances.set(targetIdx, ((_b = investmentBalances.get(targetIdx)) !== null && _b !== void 0 ? _b : 0) + net);
                costBasis.set(targetIdx, ((_c = costBasis.get(targetIdx)) !== null && _c !== void 0 ? _c : 0) + net);
            }
            else {
                cashBalance += net;
            }
        }
        // --- Pension/SS/Annuity/RetirementIncome/Other items ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || !INCOME_CATEGORIES.has(item.category))
                continue;
            if (age < item.income_start_age || age > item.income_end_age)
                continue;
            let income;
            if (item.income_mode === 'staggered' && item.income_steps.length > 0) {
                const step = resolveStaggeredStep(item.income_steps, age);
                if (!step)
                    continue;
                const freq = (_d = step.frequency) !== null && _d !== void 0 ? _d : item.income_frequency;
                income = step.amount * (freq === 'Monthly' ? 12 : 1);
            }
            else {
                income = item.income_amount * (item.income_frequency === 'Monthly' ? 12 : 1);
            }
            if (item.inflation_adjusted)
                income *= cpiIndex;
            const tax = item.taxable ? income * (item.tax_rate / 100) : 0;
            const net = income - tax;
            yearIncome += income;
            yearIncomeTaxes += tax;
            if (item.taxable)
                yearTaxableIncome += income;
            cashBalance += net;
        }
        // --- Property rental income ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || item.category !== 'Property')
                continue;
            if (item.rental_amount <= 0)
                continue;
            if (age < item.rental_start_age || age > item.rental_end_age)
                continue;
            // Skip rental if property doesn't exist yet
            if (item.purchase_age != null && age < item.purchase_age)
                continue;
            // Skip rental if property already sold
            if (item.profit_taking_mode === 'single' &&
                item.sell_at_age != null &&
                age > item.sell_at_age)
                continue;
            let rental = item.rental_amount * (item.rental_frequency === 'Monthly' ? 12 : 1);
            if (item.rental_inflation_adjusted)
                rental *= cpiIndex;
            const tax = item.rental_taxable ? rental * (item.rental_tax_rate / 100) : 0;
            const net = rental - tax;
            yearIncome += rental;
            yearIncomeTaxes += tax;
            if (item.rental_taxable)
                yearTaxableIncome += rental;
            cashBalance += net;
        }
        // --- Cash yield ---
        if (cashItem && cashBalance > 0) {
            const cashRate = resolveCashYield(cashItem, age);
            const yieldAmount = cashBalance * (cashRate / 100);
            cashBalance += yieldAmount;
            yearCashYield += yieldAmount;
            yearIncome += yieldAmount;
        }
        // =====================================================================
        // 2. MANDATORY DEBITS
        // =====================================================================
        // --- Property mortgages ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || item.category !== 'Property')
                continue;
            if (item.mortgage_payment <= 0)
                continue;
            if (age > item.mortgage_end_age)
                continue;
            const payment = item.mortgage_payment * (item.mortgage_frequency === 'Monthly' ? 12 : 1);
            cashBalance -= payment;
            yearMortgagePaid += payment;
        }
        // --- Loan payments ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || item.category !== 'Loan')
                continue;
            const balance = (_e = loanBalances.get(idx)) !== null && _e !== void 0 ? _e : 0;
            if (balance <= 0 && !item.loan_draws.some((d) => d.age === age))
                continue;
            // Interest
            const interest = balance * (item.loan_interest_rate_pct / 100);
            cashBalance -= interest;
            yearLoanInterest += interest;
            // Principal
            let principalPayment = 0;
            if (item.loan_payment_mode === 'principal_and_interest' &&
                item.loan_term_years > 0) {
                const elapsed = age - item.loan_start_age;
                const remainingTerm = Math.max(1, item.loan_term_years - elapsed);
                const annualPayment = amortizationPayment(balance, item.loan_interest_rate_pct / 100, remainingTerm);
                principalPayment = Math.max(0, annualPayment - interest);
            }
            else if (item.loan_payment_mode !== 'principal_and_interest') {
                // Interest-only mode: optional fixed principal payment
                principalPayment = item.loan_annual_principal_payment;
            }
            // Cap principal payment at remaining balance
            principalPayment = Math.min(principalPayment, Math.max(0, balance));
            cashBalance -= principalPayment;
            loanBalances.set(idx, balance - principalPayment);
            yearLoanPrincipalRepaid += principalPayment;
            // Loan draws at this age
            for (const draw of item.loan_draws) {
                if (draw.age === age && age >= item.loan_start_age) {
                    loanBalances.set(idx, ((_f = loanBalances.get(idx)) !== null && _f !== void 0 ? _f : 0) + draw.amount);
                    if (item.loan_credit_at_start) {
                        cashBalance += draw.amount;
                    }
                }
            }
            // Lump repayments at this age
            for (const repay of item.loan_lump_repayments) {
                if (repay.age === age) {
                    const currentBal = (_g = loanBalances.get(idx)) !== null && _g !== void 0 ? _g : 0;
                    const actual = Math.min(repay.amount, Math.max(0, currentBal));
                    cashBalance -= actual;
                    loanBalances.set(idx, currentBal - actual);
                    yearLoanPrincipalRepaid += actual;
                }
            }
        }
        // Track mandatory shortfall if cash went negative from mandatory debits
        if (cashBalance < 0) {
            shortfallMandatory = Math.abs(Math.min(0, cashBalance - startCash + yearIncome - yearIncomeTaxes + yearCashYield));
        }
        // =====================================================================
        // 3. INVESTMENT SALES
        // =====================================================================
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled)
                continue;
            if (item.category !== 'Investment' &&
                item.category !== 'Property' &&
                item.category !== 'Collectables')
                continue;
            // Guard: skip sale if asset doesn't exist yet
            if (item.purchase_age != null && age < item.purchase_age)
                continue;
            const isInvestment = item.category === 'Investment';
            const currentValue = isInvestment
                ? (_h = investmentBalances.get(idx)) !== null && _h !== void 0 ? _h : 0
                : (_j = propertyValues.get(idx)) !== null && _j !== void 0 ? _j : 0;
            const currentBasis = (_k = costBasis.get(idx)) !== null && _k !== void 0 ? _k : 0;
            if (item.profit_taking_mode === 'single' && item.sell_at_age === age) {
                const proceeds = (_l = item.sale_amount_override) !== null && _l !== void 0 ? _l : currentValue;
                const gain = proceeds - currentBasis;
                const tax = item.taxable_on_sale
                    ? Math.max(0, gain) * (item.sale_tax_rate / 100)
                    : 0;
                cashBalance += proceeds - tax;
                yearTaxes += tax;
                if (item.taxable_on_sale && gain > 0)
                    yearTaxableIncome += gain;
                if (isInvestment) {
                    investmentBalances.set(idx, 0);
                }
                else {
                    propertyValues.set(idx, 0);
                }
                costBasis.set(idx, 0);
            }
            if (item.profit_taking_mode === 'staggered') {
                for (const step of item.profit_taking_steps) {
                    // Step matches if age === step.age, or within range if end_age is set
                    const matches = step.end_age != null
                        ? age >= step.age && age <= step.end_age
                        : age === step.age;
                    if (!matches)
                        continue;
                    const bal = isInvestment
                        ? (_m = investmentBalances.get(idx)) !== null && _m !== void 0 ? _m : 0
                        : (_o = propertyValues.get(idx)) !== null && _o !== void 0 ? _o : 0;
                    const basis = (_p = costBasis.get(idx)) !== null && _p !== void 0 ? _p : 0;
                    const sellAmount = bal * (step.pct / 100);
                    const proportionalBasis = basis * (step.pct / 100);
                    const gain = sellAmount - proportionalBasis;
                    const tax = item.taxable_on_sale
                        ? Math.max(0, gain) * (item.sale_tax_rate / 100)
                        : 0;
                    cashBalance += sellAmount - tax;
                    yearTaxes += tax;
                    if (item.taxable_on_sale && gain > 0)
                        yearTaxableIncome += gain;
                    if (isInvestment) {
                        investmentBalances.set(idx, bal - sellAmount);
                    }
                    else {
                        propertyValues.set(idx, bal - sellAmount);
                    }
                    costBasis.set(idx, basis - proportionalBasis);
                }
            }
        }
        // =====================================================================
        // 4. LIQUIDITY EVENTS
        // =====================================================================
        for (const event of liquidity_events) {
            if (!event.enabled)
                continue;
            if (age < event.start_age || age > event.end_age)
                continue;
            // One-Time fires only at start_age
            if (event.recurrence === 'One-Time' && age !== event.start_age)
                continue;
            let amount = event.amount;
            if (event.recurrence === 'Monthly')
                amount *= 12;
            const tax = event.taxable ? amount * (event.tax_rate / 100) : 0;
            if (event.type === 'Credit') {
                cashBalance += amount - tax;
                yearLiquidityNet += amount - tax;
                if (event.taxable)
                    yearTaxableIncome += amount;
            }
            else {
                cashBalance -= amount;
                yearLiquidityNet -= amount;
                // Tax on debit events still applied
                yearTaxes += tax;
            }
        }
        // =====================================================================
        // 5. CONTRIBUTIONS (age < retirement_age)
        // =====================================================================
        if (age < retirement_age) {
            for (let idx = 0; idx < financial_items.length; idx++) {
                const item = financial_items[idx];
                if (!item.enabled || item.category !== 'Investment')
                    continue;
                if (item.contrib_amount <= 0 && item.contrib_steps.length === 0)
                    continue;
                let contrib = resolveContributions(item, age, current_age);
                if (contrib <= 0)
                    continue;
                // Cap at available cash
                if (contrib > Math.max(0, cashBalance)) {
                    const shortfall = contrib - Math.max(0, cashBalance);
                    log.warn('Contribution shortfall', { age, shortfall, requested: contrib, available: Math.max(0, cashBalance) });
                    shortfallContributions += shortfall;
                    contrib = Math.max(0, cashBalance);
                }
                cashBalance -= contrib;
                investmentBalances.set(idx, ((_q = investmentBalances.get(idx)) !== null && _q !== void 0 ? _q : 0) + contrib);
                costBasis.set(idx, ((_r = costBasis.get(idx)) !== null && _r !== void 0 ? _r : 0) + contrib);
                yearContributions += contrib;
            }
        }
        // =====================================================================
        // 6. WITHDRAWAL DEMAND (age >= retirement_age)
        // =====================================================================
        if (age >= retirement_age) {
            // Total portfolio for withdrawal calculation
            const totalPortfolio = cashBalance + sumMap(investmentBalances) + sumMap(propertyValues);
            const priorEndBalance = yearIndex > 0 && timeline.length > 0
                ? timeline[timeline.length - 1].end_balance_nominal
                : totalPortfolio;
            const withdrawalResult = calculateWithdrawal(scenario, {
                age,
                currentBalance: totalPortfolio,
                priorEndBalance,
                availableBalance: totalPortfolio,
                cpiIndex,
                gkState,
            });
            if (withdrawalResult.gkState) {
                gkState = withdrawalResult.gkState;
            }
            withdrawalEvent = withdrawalResult.event;
            const desiredWithdrawal = withdrawalResult.withdrawal;
            yearDesiredSpending = desiredWithdrawal;
            // Withdraw from cash first
            const actualFromCash = Math.min(desiredWithdrawal, Math.max(0, cashBalance));
            cashBalance -= actualFromCash;
            const remainingDemand = desiredWithdrawal - actualFromCash;
            if (remainingDemand > 0) {
                shortfallWithdrawals = remainingDemand;
            }
            yearWithdrawals = actualFromCash;
            if (yearWithdrawals > 0)
                yearTaxableIncome += yearWithdrawals;
        }
        // =====================================================================
        // 7. TAX SETTLEMENT
        // =====================================================================
        if (enable_taxes && yearTaxableIncome > 0) {
            let jurisdictionTax = 0;
            if (tax_config) {
                jurisdictionTax = calculateTax(yearTaxableIncome, tax_config, tax_jurisdiction);
            }
            else {
                // Custom / flat rate fallback
                jurisdictionTax = yearTaxableIncome * (effective_tax_rate_pct / 100);
            }
            // Subtract already-withheld income taxes to avoid double-counting
            const netTaxDue = Math.max(0, jurisdictionTax - yearIncomeTaxes);
            cashBalance -= netTaxDue;
            yearTaxes += netTaxDue;
        }
        // =====================================================================
        // 8. INSOLVENCY CHECK
        // =====================================================================
        const insolvency = cashBalance < 0;
        if (insolvency) {
            log.warn('Insolvency detected', { age, cashBalance });
        }
        if (insolvency && firstShortfallAge === null) {
            firstShortfallAge = age;
        }
        // =====================================================================
        // 9. INVESTMENT GROWTH
        // =====================================================================
        // --- Black swan event ---
        const blackSwanActive = black_swan_enabled && age === black_swan_age;
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled || item.category !== 'Investment')
                continue;
            const balance = (_s = investmentBalances.get(idx)) !== null && _s !== void 0 ? _s : 0;
            if (balance <= 0)
                continue;
            let returnRate = overrideReturns != null
                ? ((_t = overrideReturns[yearIndex]) !== null && _t !== void 0 ? _t : item.rate_pct / 100)
                : item.rate_pct / 100;
            // Apply black swan
            if (blackSwanActive) {
                returnRate -= black_swan_loss_pct / 100;
                // Track the nominal-dollar loss attributable to the shock for this
                // item. The shock applies on top of normal returns, so the marginal
                // loss is balance * (loss_pct / 100).
                yearBlackSwanLoss += balance * (black_swan_loss_pct / 100);
            }
            const grossReturn = balance * returnRate;
            // Management fee
            const mgmtFee = balance * (item.fee_pct / 100);
            // Performance fee (high-water mark)
            let perfFee = 0;
            const hwm = (_u = highWaterMarks.get(idx)) !== null && _u !== void 0 ? _u : 0;
            const postGrowthValue = balance + grossReturn - mgmtFee;
            if (postGrowthValue > hwm && item.perf_fee_pct > 0) {
                const gainAboveHWM = postGrowthValue - hwm;
                perfFee = gainAboveHWM * (item.perf_fee_pct / 100);
                highWaterMarks.set(idx, postGrowthValue - perfFee);
            }
            const newBalance = balance + grossReturn - mgmtFee - perfFee;
            investmentBalances.set(idx, Math.max(0, newBalance));
            yearGrowth += grossReturn;
            yearFees += mgmtFee + perfFee;
        }
        // --- Property/Collectables appreciation ---
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled)
                continue;
            if (item.category !== 'Property' && item.category !== 'Collectables')
                continue;
            const value = (_v = propertyValues.get(idx)) !== null && _v !== void 0 ? _v : 0;
            if (value <= 0)
                continue;
            // Skip growth if not yet purchased
            if (item.purchase_age != null && age < item.purchase_age)
                continue;
            let growthRate = item.rate_pct / 100;
            if (blackSwanActive && item.is_liquid) {
                // ADR-027: in advanced mode the shock applies only to liquid
                // investment items (Cash, illiquid Property/Collectables, and
                // income-producing items are exempt). Properties/Collectables that
                // happen to be marked liquid (rare but possible) participate.
                growthRate -= black_swan_loss_pct / 100;
                yearBlackSwanLoss += value * (black_swan_loss_pct / 100);
            }
            const appreciation = value * growthRate;
            propertyValues.set(idx, value + appreciation);
            yearGrowth += appreciation;
        }
        // =====================================================================
        // Build TimelineRow
        // =====================================================================
        // Update CPI for this year
        if (inflation_enabled) {
            cpiIndex *= 1 + inflation_pct / 100;
        }
        const endCash = cashBalance;
        const endInvestments = sumMap(investmentBalances);
        const endProperties = sumMap(propertyValues);
        const endDebt = sumMap(loanBalances);
        const endBalanceNominal = endCash + endInvestments + endProperties - endDebt;
        const endBalanceReal = cpiIndex > 0 ? endBalanceNominal / cpiIndex : endBalanceNominal;
        // Liquid vs illiquid classification
        let endLiquid = endCash;
        let endIlliquid = 0;
        for (let idx = 0; idx < financial_items.length; idx++) {
            const item = financial_items[idx];
            if (!item.enabled)
                continue;
            if (item.category === 'Investment') {
                const bal = (_w = investmentBalances.get(idx)) !== null && _w !== void 0 ? _w : 0;
                if (item.is_liquid)
                    endLiquid += bal;
                else
                    endIlliquid += bal;
            }
            else if (item.category === 'Property' || item.category === 'Collectables') {
                const val = (_x = propertyValues.get(idx)) !== null && _x !== void 0 ? _x : 0;
                if (item.is_liquid)
                    endLiquid += val;
                else
                    endIlliquid += val;
            }
        }
        totalContributions += yearContributions;
        totalWithdrawals += yearWithdrawals;
        totalFees += yearFees;
        totalTaxes += yearTaxes + yearIncomeTaxes;
        const row = {
            age,
            start_balance_nominal: startBalance,
            contributions: yearContributions,
            liquidity_net: yearLiquidityNet,
            income: yearIncome,
            withdrawals: yearWithdrawals,
            desired_spending: yearDesiredSpending,
            fees: yearFees,
            taxes: yearTaxes,
            income_taxes: yearIncomeTaxes,
            growth: yearGrowth,
            end_balance_nominal: endBalanceNominal,
            cpi_index: cpiIndex,
            end_balance_real: endBalanceReal,
            end_cash_nominal: endCash,
            end_debt_nominal: endDebt,
            end_investments_nominal: endInvestments + endProperties,
            end_liquid_nominal: endLiquid,
            end_illiquid_nominal: endIlliquid,
            loan_interest: yearLoanInterest,
            loan_principal_repaid: yearLoanPrincipalRepaid,
            mortgage_paid: yearMortgagePaid,
            cash_yield: yearCashYield,
            insolvency,
            shortfall_mandatory: shortfallMandatory,
            shortfall_contributions: shortfallContributions,
            shortfall_withdrawals: shortfallWithdrawals,
            black_swan_loss: yearBlackSwanLoss,
            withdrawal_event: withdrawalEvent,
            // v0.4 additions: deterministic advanced projection still uses the flat
            // legacy inflation rate; asset_returns is null because per-class
            // multi-asset mode is not active in this code path.
            inflation_this_year: inflation_enabled ? inflation_pct / 100 : 0,
            asset_returns: null,
        };
        timeline.push(row);
    }
    // -------------------------------------------------------------------------
    // Compute Metrics
    // -------------------------------------------------------------------------
    const lastRow = timeline[timeline.length - 1];
    const terminalNominal = (_y = lastRow === null || lastRow === void 0 ? void 0 : lastRow.end_balance_nominal) !== null && _y !== void 0 ? _y : 0;
    const terminalReal = (_z = lastRow === null || lastRow === void 0 ? void 0 : lastRow.end_balance_real) !== null && _z !== void 0 ? _z : 0;
    // Estate value: sum of projected values * estate_pct, minus debt
    let estateValue = 0;
    for (let idx = 0; idx < financial_items.length; idx++) {
        const item = financial_items[idx];
        if (!item.enabled || item.estate_pct <= 0)
            continue;
        let projectedValue = 0;
        if (item.category === 'Investment') {
            projectedValue = (_0 = investmentBalances.get(idx)) !== null && _0 !== void 0 ? _0 : 0;
        }
        else if (item.category === 'Property' || item.category === 'Collectables') {
            projectedValue = (_1 = propertyValues.get(idx)) !== null && _1 !== void 0 ? _1 : 0;
        }
        else if (item.category === 'Cash') {
            projectedValue = cashBalance;
        }
        estateValue += projectedValue * (item.estate_pct / 100);
    }
    estateValue -= sumMap(loanBalances);
    estateValue = Math.max(0, estateValue);
    // Readiness score: only meaningful for fixed-dollar withdrawal
    let readinessScore = 100;
    if (scenario.withdrawal_method === 'Fixed real-dollar amount') {
        const totalDesired = timeline
            .filter((r) => r.age >= retirement_age)
            .reduce((sum, r) => sum + r.desired_spending, 0);
        const totalActual = timeline
            .filter((r) => r.age >= retirement_age)
            .reduce((sum, r) => sum + r.withdrawals, 0);
        readinessScore =
            totalDesired > 0
                ? Math.min(200, (totalActual / totalDesired) * 100)
                : 100;
    }
    const insolvencyCount = timeline.filter((r) => r.insolvency).length;
    log.info('Advanced projection complete', {
        terminalReal,
        insolvencyCount,
    });
    const metrics = {
        terminal_nominal: terminalNominal,
        terminal_real: terminalReal,
        first_shortfall_age: firstShortfallAge,
        readiness_score: readinessScore,
        total_contributions: totalContributions,
        total_withdrawals: totalWithdrawals,
        total_fees: totalFees,
        total_taxes: totalTaxes,
        estate_value: estateValue,
    };
    return { timeline, metrics };
}
// =============================================================================
// Utility
// =============================================================================
function sumMap(map) {
    let total = 0;
    for (const v of map.values()) {
        total += v;
    }
    return total;
}
