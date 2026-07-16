const { ResponseUtil } = require('../utils');

/**
 * Dispatch Planning validators.
 *
 * Light guards mirroring the other v2 stages: reject a blank/zero quantity that
 * would otherwise silently create a zero-qty shipment or a no-op preclose.
 * dispatchQty is OPTIONAL on submit (defaults to "all remaining" in the service),
 * but if supplied it must be a positive number.
 */
class DispatchPlanningValidator {
  static validateSubmit(req, res, next) {
    const { dispatchQty } = req.body || {};
    if (dispatchQty !== undefined && dispatchQty !== null && dispatchQty !== '') {
      const q = parseFloat(dispatchQty);
      if (isNaN(q) || q <= 0) {
        return ResponseUtil.validationError(res, [{ field: 'dispatchQty', message: 'dispatchQty must be a number greater than 0' }]);
      }
    }
    next();
  }

  static validatePreclose(req, res, next) {
    const { precloseQty } = req.body || {};
    const q = parseFloat(precloseQty);
    if (precloseQty === undefined || precloseQty === null || isNaN(q) || q <= 0) {
      return ResponseUtil.validationError(res, [{ field: 'precloseQty', message: 'precloseQty is required and must be greater than 0' }]);
    }
    next();
  }
}

module.exports = DispatchPlanningValidator;
