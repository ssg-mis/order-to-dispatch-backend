/**
 * Rate Derivation Utility
 * 
 * For "regular" order types, derives rate_per_15kg (A) and rate_per_ltr (B)
 * from a single rate_of_material + product_name by reverse-engineering 
 * the sku_rate formulas and sku_selling_price landing cost formula.
 */

const db = require('../config/db');
const Logger = require('./logger');

/**
 * Safe math expression evaluator (Shunting-yard algorithm)
 * Handles +, -, *, /, parentheses, and decimal numbers.
 */
function evaluateExpression(expr) {
  let s = expr.replace(/\s+/g, '');
  if (!/^[0-9+\-*/().]+$/.test(s)) return 0;

  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const applyOp = (op, b, a) => {
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '*') return a * b;
    if (op === '/') return b !== 0 ? a / b : 0;
    return 0;
  };

  const values = [];
  const ops = [];

  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') {
      ops.push(s[i]);
    } else if ((s[i] >= '0' && s[i] <= '9') || s[i] === '.') {
      let val = '';
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
        val += s[i++];
      }
      values.push(parseFloat(val));
      i--;
    } else if (s[i] === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        values.push(applyOp(ops.pop(), values.pop(), values.pop()));
      }
      ops.pop();
    } else if (['+', '-', '*', '/'].includes(s[i])) {
      // Handle unary minus (e.g., at start or after '(')
      if (s[i] === '-' && (i === 0 || s[i - 1] === '(' || ['+', '-', '*', '/'].includes(s[i - 1]))) {
        // Read the number after the minus
        let val = '-';
        i++;
        while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) {
          val += s[i++];
        }
        values.push(parseFloat(val));
        i--;
        continue;
      }
      while (ops.length > 0 && precedence[ops[ops.length - 1]] >= precedence[s[i]]) {
        values.push(applyOp(ops.pop(), values.pop(), values.pop()));
      }
      ops.push(s[i]);
    }
  }
  while (ops.length > 0) {
    values.push(applyOp(ops.pop(), values.pop(), values.pop()));
  }
  return values[0] || 0;
}

/**
 * Evaluate a sku_rate formula by substituting a value for the variable (A or B).
 * @param {string} formula - e.g., "A-250" or "((B-6.5)/990*910)+6"
 * @param {number} value - the numeric value to substitute
 * @returns {number} the result
 */
function evaluateFormulaWithValue(formula, value) {
  // Replace both A and B with the value (formulas use only one variable)
  const substituted = formula
    .replace(/A/gi, value.toString())
    .replace(/B/gi, value.toString());
  return evaluateExpression(substituted);
}

/**
 * Reverse a sku_rate formula to find the variable (A or B) given the output rate.
 * 
 * All sku_rate formulas are LINEAR in A or B, so:
 *   f(x) = slope * x + intercept
 *   x = (rate - intercept) / slope
 * 
 * We find slope and intercept by evaluating at x=0 and x=1.
 */
function reverseFormula(formula, rateOfMaterial) {
  const f0 = evaluateFormulaWithValue(formula, 0);   // intercept
  const f1 = evaluateFormulaWithValue(formula, 1);   // slope + intercept
  const slope = f1 - f0;

  if (Math.abs(slope) < 0.0001) {
    Logger.warn(`[RATE_DERIVATION] Formula "${formula}" has zero slope, cannot reverse`);
    return null;
  }

  return (rateOfMaterial - f0) / slope;
}

/**
 * Determine whether a formula is A-based or B-based
 */
function getFormulaVariable(formula) {
  if (!formula) return null;
  const upper = formula.toUpperCase();
  if (upper.includes('A')) return 'A';
  if (upper.includes('B')) return 'B';
  return null;
}

/**
 * Normalize an SKU name for fuzzy matching.
 * Strips oil-type prefixes (HK, SBO, RBO, PALM, SOYA, etc.) and normalizes units.
 */
function normalizeForMatching(name) {
  return (name || '')
    .toUpperCase()
    .replace(/KGS/g, 'KG')
    .replace(/LTRS/g, 'LTR')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract quantity + packaging part from a product name.
 * e.g., "HK SBO 15 KGS TIN" → "15 KG TIN"
 *        "PALM OIL 990 MLT PP" → "990 MLT PP"
 */
function extractPackagingPart(productName) {
  const normalized = normalizeForMatching(productName);
  // Match a number (with optional decimal) followed by unit and packaging type
  const match = normalized.match(/(\d+\.?\d*)\s*(KG|LTR|MLT|GMS?|ML)\s*(TIN|JAR|BKT|PP|BTL)?/i);
  if (match) {
    return match[0].trim();
  }
  return normalized;
}

/**
 * Find the best matching sku_rate entry for a given product name.
 */
function findMatchingSkuRate(productName, skuRates) {
  const productPart = extractPackagingPart(productName);
  const normalizedProduct = normalizeForMatching(productPart);

  Logger.info(`[RATE_DERIVATION] Matching product: "${productName}" → extracted: "${productPart}" → normalized: "${normalizedProduct}"`);

  // Try exact match first
  let bestMatch = null;
  let bestScore = 0;

  for (const entry of skuRates) {
    const normalizedSku = normalizeForMatching(entry.sku);
    
    // Check if normalized product contains the normalized SKU or vice versa
    if (normalizedProduct === normalizedSku) {
      return entry; // Perfect match
    }

    // Score by how much of the SKU matches the product
    const skuParts = normalizedSku.split(' ');
    const matchingParts = skuParts.filter(part => normalizedProduct.includes(part));
    const score = matchingParts.length / skuParts.length;

    if (score > bestScore && score >= 0.6) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestMatch) {
    Logger.info(`[RATE_DERIVATION] Best match: "${bestMatch.sku}" (score: ${bestScore.toFixed(2)})`);
  } else {
    Logger.warn(`[RATE_DERIVATION] No match found for "${productName}"`);
  }

  return bestMatch;
}

/**
 * Find a sku_selling_price entry by packing_material name (fuzzy).
 */
function findSellingPrice(packingMaterial, sellingPrices) {
  const normalize = (s) => (s || '').toUpperCase().replace(/KGS/g, 'KG').replace(/LTRS/g, 'LTR').replace(/[^A-Z0-9]/g, '');
  const target = normalize(packingMaterial);

  return sellingPrices.find(sp => {
    const normalized = normalize(sp.packing_material);
    return normalized === target;
  }) || null;
}

/**
 * Main function: derive rate_per_15kg and rate_per_ltr for a regular order.
 * 
 * @param {string} productName - e.g., "HK SBO 15 KGS TIN"
 * @param {number} rateOfMaterial - the known rate for this product
 * @returns {Promise<{rate_per_15kg: number, rate_per_ltr: number} | null>}
 */
async function deriveRatesForRegularOrder(productName, rateOfMaterial) {
  try {
    Logger.info(`[RATE_DERIVATION] Starting derivation for product="${productName}", rate=${rateOfMaterial}`);

    // 1. Fetch sku_rate and sku_selling_price data
    const [skuRateResult, sellingPriceResult] = await Promise.all([
      db.query('SELECT id, sku, rate, formula FROM sku_rate ORDER BY id ASC'),
      db.query('SELECT * FROM sku_selling_price ORDER BY id ASC')
    ]);

    const skuRates = skuRateResult.rows;
    const sellingPrices = sellingPriceResult.rows;

    if (!skuRates.length || !sellingPrices.length) {
      Logger.warn('[RATE_DERIVATION] Missing sku_rate or sku_selling_price data');
      return null;
    }

    // 2. Match product to sku_rate
    const matchedSku = findMatchingSkuRate(productName, skuRates);
    if (!matchedSku || !matchedSku.formula) {
      Logger.warn(`[RATE_DERIVATION] Could not match product "${productName}" to any sku_rate`);
      return null;
    }

    const variable = getFormulaVariable(matchedSku.formula);
    Logger.info(`[RATE_DERIVATION] Matched SKU: "${matchedSku.sku}", formula: "${matchedSku.formula}", variable: ${variable}`);

    // 3. Reverse the formula to get A or B
    const derivedValue = reverseFormula(matchedSku.formula, rateOfMaterial);
    if (derivedValue === null) {
      return null;
    }

    Logger.info(`[RATE_DERIVATION] Reversed formula: ${variable} = ${derivedValue.toFixed(2)}`);

    let ratePer15Kg, ratePerLtr;

    if (variable === 'A') {
      // We have A (15 KG rate). Derive rate_per_ltr from GT.
      ratePer15Kg = derivedValue;

      // Get sku_selling_price for 15 KGS TIN to reverse-calculate GT
      const sp15kg = findSellingPrice('15 KGS TIN', sellingPrices);
      if (!sp15kg) {
        Logger.warn('[RATE_DERIVATION] Cannot find selling price for 15 KGS TIN');
        return { rate_per_15kg: parseFloat(ratePer15Kg.toFixed(2)), rate_per_ltr: null };
      }

      const netOil15 = parseFloat(sp15kg.net_oil_in_gm) || 0;
      const packingCost15 = parseFloat(sp15kg.packing_cost) || 0;

      // Reverse landing cost formula: A = (GT/1000)*net_oil + packing_cost
      // GT = (A - packing_cost) * 1000 / net_oil
      const gt = (ratePer15Kg - packingCost15) * 1000 / netOil15;
      Logger.info(`[RATE_DERIVATION] Derived GT = ${gt.toFixed(4)} (from A=${ratePer15Kg}, net_oil=${netOil15}, packing=${packingCost15})`);

      // rate_per_ltr = GT (No margin as per latest instruction)
      ratePerLtr = gt;
      Logger.info(`[RATE_DERIVATION] rate_per_ltr = GT = ${ratePerLtr.toFixed(2)}`);

    } else if (variable === 'B') {
      // We have B (1 LTR rate). Derive rate_per_15kg from GT.
      ratePerLtr = derivedValue;

      // As per user instruction, Rate per LTR (B) is used directly as GT
      const gt = ratePerLtr;
      Logger.info(`[RATE_DERIVATION] Using GT = ratePerLtr = ${gt.toFixed(2)}`);

      // Forward: A = ((GT/1000) * net_oil_15kg + packing_cost_15kg) * 1.04
      const sp15kg = findSellingPrice('15 KGS TIN', sellingPrices);
      if (!sp15kg) {
        Logger.warn('[RATE_DERIVATION] Cannot find selling price for 15 KGS TIN');
        return { rate_per_15kg: null, rate_per_ltr: parseFloat(ratePerLtr.toFixed(2)) };
      }

      const netOil15 = parseFloat(sp15kg.net_oil_in_gm) || 0;
      const packingCost15 = parseFloat(sp15kg.packing_cost) || 0;
      const cost15kg = (gt / 1000) * netOil15 + packingCost15;
      ratePer15Kg = cost15kg; // Removed 4% margin as per user request
      
      Logger.info(`[RATE_DERIVATION] rate_per_15kg = ((${gt.toFixed(2)}/1000)*${netOil15}+${packingCost15}) = ${ratePer15Kg.toFixed(2)}`);

    } else {
      Logger.warn(`[RATE_DERIVATION] Unknown variable in formula: "${matchedSku.formula}"`);
      return null;
    }

    const result = {
      rate_per_15kg: ratePer15Kg,
      rate_per_ltr: ratePerLtr
    };

    Logger.info(`[RATE_DERIVATION] Final result: rate_per_15kg=${result.rate_per_15kg}, rate_per_ltr=${result.rate_per_ltr}`);
    return result;

  } catch (error) {
    Logger.error('[RATE_DERIVATION] Error deriving rates:', error);
    return null;
  }
}

module.exports = {
  deriveRatesForRegularOrder,
  reverseFormula,
  evaluateExpression,
  evaluateFormulaWithValue
};
