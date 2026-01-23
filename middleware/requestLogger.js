const { Logger } = require('../utils');

/**
 * Request Logger Middleware
 * Logs all incoming requests
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request
  Logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    Logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
};

module.exports = requestLogger;
