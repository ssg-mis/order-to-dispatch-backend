const Validator = require('./commonValidator');
const { ResponseUtil } = require('../utils');

/**
 * Order Dispatch Validator
 */
class OrderDispatchValidator {
  /**
   * Validate order creation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateCreate(req, res, next) {
    const { body } = req;
    const errors = [];

    // Required fields validation
    const requiredFields = ['customer_name', 'order_type'];
    const { isValid, errors: requiredErrors } = Validator.validateRequired(body, requiredFields);
    
    if (!isValid) {
      return ResponseUtil.validationError(res, requiredErrors);
    }

    // Validate products array if multiple products
    if (body.products && Array.isArray(body.products)) {
      if (body.products.length === 0) {
        errors.push({
          field: 'products',
          message: 'Products array cannot be empty'
        });
      }
      
      // Validate each product
      body.products.forEach((product, index) => {
        if (!product.product_name) {
          errors.push({
            field: `products[${index}].product_name`,
            message: 'Product name is required'
          });
        }
      });
    }

    // Validate numeric fields if present
    if (body.order_quantity && isNaN(body.order_quantity)) {
      errors.push({
        field: 'order_quantity',
        message: 'Order quantity must be a number'
      });
    }

    if (body.rate_of_material && isNaN(body.rate_of_material)) {
      errors.push({
        field: 'rate_of_material',
        message: 'Rate of material must be a number'
      });
    }

    if (body.total_amount_with_gst && isNaN(body.total_amount_with_gst)) {
      errors.push({
        field: 'total_amount_with_gst',
        message: 'Total amount must be a number'
      });
    }

    // Validate dates if present
    if (body.start_date && isNaN(Date.parse(body.start_date))) {
      errors.push({
        field: 'start_date',
        message: 'Invalid start date format'
      });
    }

    if (body.end_date && isNaN(Date.parse(body.end_date))) {
      errors.push({
        field: 'end_date',
        message: 'Invalid end date format'
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

    // Validate DO-XXX format
    if (!/^DO-\d{3,}$/.test(orderNo)) {
      return ResponseUtil.validationError(res, [{
        field: 'orderNo',
        message: 'Invalid order number format. Expected format: DO-001'
      }]);
    }

    next();
  }
}

module.exports = OrderDispatchValidator;
