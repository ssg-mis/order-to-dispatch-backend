const { ResponseUtil } = require('../utils');

/**
 * Security Guard Approval validators.
 *
 * Light guard mirroring the other v2 stages: the verdict must be APPROVE or
 * REJECT. A REJECT should carry a reason, so remarks are required in that case
 * (mirrors the reject-remarks pattern used across the pipeline).
 */
class SecurityGuardApprovalValidator {
  static validateSubmit(req, res, next) {
    const { verdictStatus, remarks } = req.body || {};
    const verdict = String(verdictStatus ?? '').toUpperCase();
    if (verdict !== 'APPROVE' && verdict !== 'REJECT') {
      return ResponseUtil.validationError(res, [{ field: 'verdictStatus', message: "verdictStatus is required and must be 'APPROVE' or 'REJECT'" }]);
    }
    if (verdict === 'REJECT' && (!remarks || !String(remarks).trim())) {
      return ResponseUtil.validationError(res, [{ field: 'remarks', message: 'remarks are required when rejecting' }]);
    }
    next();
  }
}

module.exports = SecurityGuardApprovalValidator;
