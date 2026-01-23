/**
 * Input Validation Utilities
 * Reusable validation functions
 */

class Validator {
  /**
   * Validate required fields
   * @param {Object} data - Data object to validate
   * @param {Array<string>} requiredFields - List of required field names
   * @returns {Object} Validation result
   */
  static validateRequired(data, requiredFields) {
    const errors = [];
    
    requiredFields.forEach(field => {
      if (!data[field] || data[field] === '') {
        errors.push({
          field,
          message: `${field} is required`
        });
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean}
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate phone number (basic)
   * @param {string} phone - Phone number to validate
   * @returns {boolean}
   */
  static isValidPhone(phone) {
    const phoneRegex = /^[0-9]{10,15}$/;
    return phoneRegex.test(phone.replace(/[\s-]/g, ''));
  }

  /**
   * Validate minimum length
   * @param {string} value - Value to check
   * @param {number} minLength - Minimum length
   * @returns {boolean}
   */
  static minLength(value, minLength) {
    return value && value.length >= minLength;
  }

  /**
   * Validate maximum length
   * @param {string} value - Value to check
   * @param {number} maxLength - Maximum length
   * @returns {boolean}
   */
  static maxLength(value, maxLength) {
    return value && value.length <= maxLength;
  }

  /**
   * Validate number range
   * @param {number} value - Value to check
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @returns {boolean}
   */
  static isInRange(value, min, max) {
    return value >= min && value <= max;
  }
}

module.exports = Validator;
