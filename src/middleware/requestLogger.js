/**
 * HTTP Request Logger Middleware.
 * Logs method, URL, status code, and response time using Winston.
 * Excludes health check requests and captures request IDs for distributed tracing.
 */
const logger = require('../logger');

/**
 * HTTP request logging middleware.
 * Records the HTTP method, URL, status code, and duration of incoming requests.
 * Skips the '/health' endpoint to avoid log flooding from health checks and uptime monitors.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
function requestLogger(req, res, next) {
  // Skip health check endpoint from logging
  if (req.originalUrl === '/health' || req.path === '/health') {
    return next();
  }

  const startTime = Date.now();
  const requestId = req.headers['x-request-id'] || req.id || null;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const meta = {
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
      ...(requestId && { requestId }),
    };

    if (statusCode >= 500) {
      logger.error(`${req.method} ${req.originalUrl || req.url} ${statusCode} ${duration}ms`, meta);
    } else if (statusCode >= 400) {
      logger.warn(`${req.method} ${req.originalUrl || req.url} ${statusCode} ${duration}ms`, meta);
    } else {
      logger.info(`${req.method} ${req.originalUrl || req.url} ${statusCode} ${duration}ms`, meta);
    }
  });

  next();
}

module.exports = requestLogger;
