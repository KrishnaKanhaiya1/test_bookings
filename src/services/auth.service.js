const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const config = require('../config');
const ApiError = require('../utils/ApiError');

/**
 * Creates a new user
 * @param {string} email
 * @param {string} password
 * @param {string} fullName
 * @returns {Promise<{user: object, token: string}>}
 */
const signup = async (email, password, fullName) => {
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName,
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      createdAt: true,
    }
  });

  const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  return { user, token };
};

/**
 * Authenticates a user
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object, token: string}>}
 */
const login = async (email, password) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.isActive === false) {
    throw ApiError.unauthorized('Account is deactivated');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = jwt.sign({ userId: user.id }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
    },
    token
  };
};

/**
 * Gets user profile by ID
 * @param {string} userId
 * @returns {Promise<object>}
 */
const getProfile = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      isActive: true,
      createdAt: true,
      updatedAt: true
    }
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

module.exports = {
  signup,
  login,
  getProfile,
};
