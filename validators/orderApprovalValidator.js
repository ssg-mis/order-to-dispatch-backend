const { ResponseUtil } = require('../utils');

/**
 * Order Approval submit validator.
 *
 * Light guard mirroring PreApprovalValidator's spirit: the approve/reject
 * decision (overallStatus) must be present so the service never has to guess
 * whether to advance the item. Everything else is optional checklist state.
 */
class OrderApprovalValidator {
  static validateSubmit(req, res, next) {
    const { body } = req;
    const errors = [];

    if (body.overallStatus === undefined || body.overallStatus === null || body.overallStatus === '') {
      errors.push({ field: 'overallStatus', message: 'overallStatus (approve/reject decision) is required' });
    }

    if (errors.length > 0) return ResponseUtil.validationError(res, errors);
    next();
  }
}

module.exports = OrderApprovalValidator;
