/**
 * Custom API error class for consistent error handling.
 * Thrown by services and caught by the errorHandler middleware.
 */
class ApiError extends Error {
  constructor(statusCode, message, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Distinguishes expected errors from bugs
    Error.captureStackTrace(this, this.constructor);
  }

  /** 400 Bad Request */
  static badRequest(message, code = 'BAD_REQUEST') {
    return new ApiError(400, message, code);
  }

  /** 401 Unauthorized */
  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new ApiError(401, message, code);
  }

  /** 403 Forbidden */
  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, message, code);
  }

  /** 404 Not Found */
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, message, code);
  }

  /** 409 Conflict */
  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, message, code);
  }

  /** 429 Too Many Requests */
  static tooMany(message = 'Too many requests', code = 'RATE_LIMITED') {
    return new ApiError(429, message, code);
  }

  /** 500 Internal Server Error */
  static internal(message = 'Internal server error') {
    return new ApiError(500, message, 'INTERNAL_ERROR');
  }
}

module.exports = ApiError;
