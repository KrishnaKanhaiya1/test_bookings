/**
 * Global Error Handler Middleware.
 * Catches all operational and unexpected errors, logs failures,
 * and formats consistent JSON error responses.
 */
const { ZodError } = require('zod');
const { Prisma } = require('@prisma/client');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const logger = require('../logger');

/**
 * Express error-handling middleware.
 * Formats errors into { success: false, error: { message, code } }.
 *
 * @param {Error} err - Error instance
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';

  // 1. Operational ApiError thrown purposefully in business logic
  if (err instanceof ApiError || err.isOperational) {
    statusCode = err.statusCode || 400;
    code = err.code || 'BAD_REQUEST';
    message = err.message;
  }
  // 2. Zod schema validation errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    const formatted = err.errors.map((e) => {
      const fieldPath = e.path.filter((p) => p !== 'body' && p !== 'query').join('.');
      return `${fieldPath || 'input'}: ${e.message}`;
    });
    message = formatted.join('; ');
  }
  // 3. Prisma database errors
  else if (err.code === 'P2002' || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
    statusCode = 409;
    code = 'CONFLICT';
    const target = err.meta?.target ? ` on (${Array.isArray(err.meta.target) ? err.meta.target.join(', ') : err.meta.target})` : '';
    message = `Unique constraint violation${target}`;
  } else if (err.code === 'P2025' || (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025')) {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = err.meta?.cause || 'Resource not found';
  } else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    code = 'DATABASE_VALIDATION_ERROR';
    message = 'Invalid database query parameters';
  }
  // 4. Unexpected server bugs
  else {
    statusCode = 500;
    code = 'INTERNAL_ERROR';
    if (config.isProduction) {
      message = 'Internal server error';
    }
  }

  // Log 5xx errors with full stack trace and request details
  if (statusCode >= 500) {
    logger.error(`[${req.method} ${req.originalUrl}] 500 Internal Error: ${err.message}`, {
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      body: req.body,
      query: req.query,
    });
  } else if (statusCode >= 400) {
    logger.warn(`[${req.method} ${req.originalUrl}] ${statusCode} (${code}): ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
    },
  });
}

module.exports = errorHandler;
