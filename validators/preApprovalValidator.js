const { ResponseUtil } = require('../utils');

/**
 * Pre-Approval submit validator.
 *
 * The reference had NO validation on this route - a blank/zero approvalQty
 * would silently zero out remainingQty (exactly the kind of loose end that
 * later surfaces as a "my quantity disappeared" bug). This minimal guard is a
 * deliberate improvement.
 */
class PreApprovalValidator {
  static validateSubmit(req, res, next) {
    const { body } = req;
    const errors = [];

    const approvalQty = parseFloat(body.approvalQty);
    if (body.approvalQty === undefined || body.approvalQty === null || isNaN(approvalQty) || approvalQty <= 0) {
      errors.push({ field: 'approvalQty', message: 'approvalQty is required and must be greater than 0' });
    }
    ['rate', 'ratePer15kg', 'ratePerLtr'].forEach((f) => {
      if (body[f] !== undefined && body[f] !== null && isNaN(parseFloat(body[f]))) {
        errors.push({ field: f, message: `${f} must be a number` });
      }
    });

    if (errors.length > 0) return ResponseUtil.validationError(res, errors);
    next();
  }
}

module.exports = PreApprovalValidator;
