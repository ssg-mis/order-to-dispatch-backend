const Validator = require('./commonValidator');
const { ResponseUtil } = require('../utils');

/**
 * Sample validator for item creation/update
 */
class SampleValidator {
  /**
   * Validate item creation
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateCreate(req, res, next) {
    const { body } = req;
    const requiredFields = ['name', 'description'];
    
    // Check required fields
    const { isValid, errors } = Validator.validateRequired(body, requiredFields);
    
    if (!isValid) {
      return ResponseUtil.validationError(res, errors);
    }
    
    // Additional validations
    const additionalErrors = [];
    
    if (body.name && !Validator.minLength(body.name, 3)) {
      additionalErrors.push({
        field: 'name',
        message: 'Name must be at least 3 characters long'
      });
    }
    
    if (body.email && !Validator.isValidEmail(body.email)) {
      additionalErrors.push({
        field: 'email',
        message: 'Invalid email format'
      });
    }
    
    if (additionalErrors.length > 0) {
      return ResponseUtil.validationError(res, additionalErrors);
    }
    
    next();
  }

  /**
   * Validate item update
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next middleware function
   */
  static validateUpdate(req, res, next) {
    const { body } = req;
    const errors = [];
    
    if (body.name && !Validator.minLength(body.name, 3)) {
      errors.push({
        field: 'name',
        message: 'Name must be at least 3 characters long'
      });
    }
    
    if (body.email && !Validator.isValidEmail(body.email)) {
      errors.push({
        field: 'email',
        message: 'Invalid email format'
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
}

module.exports = SampleValidator;
