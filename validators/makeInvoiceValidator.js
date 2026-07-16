const { ResponseUtil } = require('../utils');

/**
 * Make Invoice validators.
 *
 * Light guards mirroring the other v2 stages: qty / billAmount / cdAmount, when
 * supplied, must be valid non-negative numbers (a negative bill amount or
 * discount is never valid).
 */
class MakeInvoiceValidator {
  static validateSubmit(req, res, next) {
    const errors = [];
    for (const field of ['qty', 'billAmount', 'cdAmount']) {
      const v = req.body?.[field];
      if (v !== undefined && v !== null && v !== '') {
        const n = parseFloat(v);
        if (isNaN(n) || n < 0) errors.push({ field, message: `${field} must be a number greater than or equal to 0` });
      }
    }
    if (errors.length) return ResponseUtil.validationError(res, errors);
    next();
  }
}

module.exports = MakeInvoiceValidator;
