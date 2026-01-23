/**
 * Logger Utility
 * Centralized logging for the application
 */

class Logger {
  static info(message, meta = {}) {
    console.log(`[INFO] [${new Date().toISOString()}]`, message, meta);
  }

  static error(message, error = null, meta = {}) {
    console.error(`[ERROR] [${new Date().toISOString()}]`, message, {
      error: error?.message || error,
      stack: error?.stack,
      ...meta
    });
  }

  static warn(message, meta = {}) {
    console.warn(`[WARN] [${new Date().toISOString()}]`, message, meta);
  }

  static debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] [${new Date().toISOString()}]`, message, meta);
    }
  }
}

module.exports = Logger;
