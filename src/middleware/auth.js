/**
 * JWT Authentication Middleware.
 * Extracts and verifies Bearer token, validates against database,
 * and attaches user details to req.user.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../prisma');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Authentication middleware that verifies the JWT Bearer token in the Authorization header.
 * Validates token signature, checks user existence in the database, and ensures account is active.
 * Sets req.user = { id, email, fullName } on success.
 *
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
const auth = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authorization token is missing or malformed', 'NO_TOKEN');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw ApiError.unauthorized('Authorization token is required', 'NO_TOKEN');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Authentication token has expired', 'TOKEN_EXPIRED');
    }
    if (err.name === 'JsonWebTokenError') {
      throw ApiError.unauthorized('Invalid authentication token', 'TOKEN_INVALID');
    }
    throw ApiError.unauthorized('Authentication failed', 'AUTH_FAILED');
  }

  const userId = decoded.userId || decoded.id;
  if (!userId) {
    throw ApiError.unauthorized('Invalid token payload', 'TOKEN_PAYLOAD_INVALID');
  }

  // Look up user from database to confirm existence and active status
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
    },
  });

  if (!user) {
    throw ApiError.unauthorized('User not found', 'USER_NOT_FOUND');
  }

  if (user.isActive === false) {
    throw ApiError.unauthorized('User account is deactivated', 'ACCOUNT_DEACTIVATED');
  }

  req.user = {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
  };

  next();
});

module.exports = auth;
