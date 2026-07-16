const { ResponseUtil } = require('../utils');

/**
 * Actual Dispatch validators.
 *
 * Light guards mirroring the other v2 stages. actualQtyDispatch is OPTIONAL
 * (defaults to the shipment's planned qty in the service), but if supplied it
 * must be a non-negative number — a negative dispatched qty is never valid.
 */
class ActualDispatchValidator {
  static validateSubmit(req, res, next) {
    const { actualQtyDispatch } = req.body || {};
    if (actualQtyDispatch !== undefined && actualQtyDispatch !== null && actualQtyDispatch !== '') {
      const q = parseFloat(actualQtyDispatch);
      if (isNaN(q) || q < 0) {
        return ResponseUtil.validationError(res, [{ field: 'actualQtyDispatch', message: 'actualQtyDispatch must be a number greater than or equal to 0' }]);
      }
    }
    next();
  }
}

module.exports = ActualDispatchValidator;
