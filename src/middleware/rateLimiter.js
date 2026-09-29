/**
 * Rate limiting middleware using express-rate-limit.
 * Prevents brute force and denial of service attacks by throttling client requests.
 */
const rateLimit = require('express-rate-limit');
const config = require('../config');

/**
 * Factory function to create custom rate limiters with unified error responses.
 *
 * @param {object} options - express-rate-limit configuration overrides
 * @returns {import('express').RequestHandler}
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || config.rateLimit.windowMs;
  const max = options.max !== undefined ? options.max : config.rateLimit.max;
  const message = options.message || 'Too many requests, please try again later.';

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Return standard RateLimit-* headers
    legacyHeaders: false, // Disable X-RateLimit-* headers
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: {
          message,
          code: 'RATE_LIMITED',
        },
      });
    },
    ...options,
  });
}

/** General API rate limiter for standard endpoints */
const apiLimiter = createRateLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
});

/** Stricter rate limiter for sensitive authentication endpoints (5 requests per 15 minutes) */
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes.',
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
};
