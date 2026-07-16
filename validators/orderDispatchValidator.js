const Validator = require('./commonValidator');
const { ResponseUtil } = require('../utils');
const { schema } = require('../config/db-v2.ts');

const ORDER_TYPES = schema.orderTypeEnum.enumValues;
const ORDER_CATEGORIES = schema.orderCategoryEnum.enumValues;
const DELIVERY_PURPOSES = schema.deliveryPurposeEnum.enumValues;
const ORDER_THROUGH = schema.orderThroughEnum.enumValues;

/**
 * Order Dispatch Validator
 */
class OrderDispatchValidator {
  /**
   * Validate order creation (Order Punch) - v2 schema payload.
   * @body { customerId, orderType, items: [{ skuId, orderQuantity, ... }], ... }
   */
  static validateCreate(req, res, next) {
    const { body } = req;
    const errors = [];

    if (!body.customerId) {
      errors.push({ field: 'customerId', message: 'customerId is required' });
    }

    if (!body.orderType) {
      errors.push({ field: 'orderType', message: 'orderType is required' });
    } else if (!ORDER_TYPES.includes(body.orderType)) {
      errors.push({ field: 'orderType', message: `orderType must be one of: ${ORDER_TYPES.join(', ')}` });
    }

    if (body.orderCategory && !ORDER_CATEGORIES.includes(body.orderCategory)) {
      errors.push({ field: 'orderCategory', message: `orderCategory must be one of: ${ORDER_CATEGORIES.join(', ')}` });
    }
    if (body.deliveryPurpose && !DELIVERY_PURPOSES.includes(body.deliveryPurpose)) {
      errors.push({ field: 'deliveryPurpose', message: `deliveryPurpose must be one of: ${DELIVERY_PURPOSES.join(', ')}` });
    }
    if (body.orderThrough && !ORDER_THROUGH.includes(body.orderThrough)) {
      errors.push({ field: 'orderThrough', message: `orderThrough must be one of: ${ORDER_THROUGH.join(', ')}` });
    }

    if (!Array.isArray(body.items) || body.items.length === 0) {
      errors.push({ field: 'items', message: 'At least one line item is required' });
    } else {
      body.items.forEach((item, index) => {
        if (!item.skuId) {
          errors.push({ field: `items[${index}].skuId`, message: 'skuId is required' });
        }
        if (item.orderQuantity != null && isNaN(parseFloat(item.orderQuantity))) {
          errors.push({ field: `items[${index}].orderQuantity`, message: 'orderQuantity must be a number' });
        }
        if (item.rateOfMaterial != null && isNaN(parseFloat(item.rateOfMaterial))) {
          errors.push({ field: `items[${index}].rateOfMaterial`, message: 'rateOfMaterial must be a number' });
        }
      });
    }

    if (errors.length > 0) {
      return ResponseUtil.validationError(res, errors);
    }

    next();
  }

  /**
   * Validate order update
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateUpdate(req, res, next) {
    const { body } = req;
    const errors = [];

    // At least one field should be present
    if (Object.keys(body).length === 0) {
      return ResponseUtil.validationError(res, [{
        field: 'body',
        message: 'At least one field is required for update'
      }]);
    }

    // Validate numeric fields if present
    if (body.order_quantity && isNaN(body.order_quantity)) {
      errors.push({
        field: 'order_quantity',
        message: 'Order quantity must be a number'
      });
    }

    if (errors.length > 0) {
      return ResponseUtil.validationError(res, errors);
    }

    next();
  }

  /**
   * Validate ID parameter
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateId(req, res, next) {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return ResponseUtil.validationError(res, [{
        field: 'id',
        message: 'Invalid ID parameter'
      }]);
    }

    next();
  }

  /**
   * Validate order number parameter
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateOrderNumber(req, res, next) {
    const { orderNo } = req.params;

    if (!orderNo) {
      return ResponseUtil.validationError(res, [{
        field: 'orderNo',
        message: 'Order number is required'
      }]);
    }

    // Validate DO-XXX or DO/YY-YY/XXXX format
    if (!/^DO[-\/](?:\d{2}-\d{2}\/)?\d+[A-Z]?(-\d+)?$/.test(orderNo)) {
      return ResponseUtil.validationError(res, [{
        field: 'orderNo',
        message: 'Invalid order number format. Expected format: DO/26-27/0001'
      }]);
    }

    next();
  }
}

module.exports = OrderDispatchValidator;
