const { ResponseUtil } = require('../utils');

/**
 * Check Invoice validators.
 *
 * Light guard mirroring the other v2 stages: when the verdict is an Issue,
 * remarks explaining it are required (the reject/issue-remarks pattern used
 * across the pipeline). A plain verify carries no required fields.
 */
class CheckInvoiceValidator {
  static validateSubmit(req, res, next) {
    const { status, remarks } = req.body || {};
    if (status === 'Issue' && (!remarks || !String(remarks).trim())) {
      return ResponseUtil.validationError(res, [{ field: 'remarks', message: 'remarks are required when reporting an Issue' }]);
    }
    next();
  }
}

module.exports = CheckInvoiceValidator;
