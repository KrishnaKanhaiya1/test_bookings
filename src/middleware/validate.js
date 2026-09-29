/**
 * Validation middleware factory using Zod schemas.
 * Validates incoming request body or query params against the provided schema.
 * Parsed/sanitized data is stored in req.validatedBody or req.validatedQuery.
 */
const ApiError = require('../utils/ApiError');

/**
 * Creates middleware that validates request body against a Zod schema.
 * Handles both flat body schemas and schemas wrapped in { body: ... }.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
const validate = (schema) => (req, res, next) => {
  let result = schema.safeParse(req.body);

  // If validation fails directly, check if schema expects { body: ... } wrapper
  if (!result.success && schema.shape && schema.shape.body) {
    const wrappedResult = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (wrappedResult.success) {
      req.validatedBody = wrappedResult.data.body;
      return next();
    }
    result = wrappedResult;
  }

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.filter((p) => p !== 'body').join('.'),
      message: e.message,
    }));
    const message = errors.map((e) => `${e.field || 'input'}: ${e.message}`).join('; ');
    return next(ApiError.badRequest(message, 'VALIDATION_ERROR'));
  }

  req.validatedBody = result.data;
  next();
};

/**
 * Creates middleware that validates query parameters against a Zod schema.
 * Handles both flat query schemas and schemas wrapped in { query: ... }.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @returns {import('express').RequestHandler}
 */
const validateQuery = (schema) => (req, res, next) => {
  let result = schema.safeParse(req.query);

  if (!result.success && schema.shape && schema.shape.query) {
    const wrappedResult = schema.safeParse({ query: req.query });
    if (wrappedResult.success) {
      req.validatedQuery = wrappedResult.data.query;
      return next();
    }
    result = wrappedResult;
  }

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      field: e.path.filter((p) => p !== 'query').join('.'),
      message: e.message,
    }));
    const message = errors.map((e) => `${e.field || 'query'}: ${e.message}`).join('; ');
    return next(ApiError.badRequest(message, 'VALIDATION_ERROR'));
  }

  req.validatedQuery = result.data;
  next();
};

module.exports = { validate, validateQuery };
