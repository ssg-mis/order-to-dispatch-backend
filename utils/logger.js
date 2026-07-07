/**
 * Logger Utility
 * Centralized logging for the application
 */

class Logger {
  // Silenced everywhere — request/query trails were pure noise. Kept as a
  // no-op (rather than deleted) so existing call sites don't need touching.
  static info() {}

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

  // Silenced everywhere — see info() above.
  static debug() {}
}

module.exports = Logger;
