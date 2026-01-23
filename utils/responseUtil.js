/**
 * Response Utilities
 * Standardized response formats for API endpoints
 */

class ResponseUtil {
  /**
   * Success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code
   * @param {*} errors - Additional error details
   */
  static error(res, message = 'Error occurred', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Validation error response
   * @param {Object} res - Express response object
   * @param {Array} errors - Validation errors
   */
  static validationError(res, errors) {
    return this.error(res, 'Validation failed', 422, errors);
  }

  /**
   * Not found response
   * @param {Object} res - Express response object
   * @param {string} message - Not found message
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, message, 404);
  }

  /**
   * Unauthorized response
   * @param {Object} res - Express response object
   * @param {string} message - Unauthorized message
   */
  static unauthorized(res, message = 'Unauthorized') {
    return this.error(res, message, 401);
  }

  /**
   * Forbidden response
   * @param {Object} res - Express response object
   * @param {string} message - Forbidden message
   */
  static forbidden(res, message = 'Forbidden') {
    return this.error(res, message, 403);
  }
}

module.exports = ResponseUtil;
