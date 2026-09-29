/**
 * Centralized configuration loaded from environment variables.
 * All config values are accessed through this module.
 */
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  jwt: {
    secret: process.env.JWT_SECRET || 'super-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'webhook-secret-key',
  },
  cache: {
    ttl: parseInt(process.env.CACHE_TTL, 10) || 300,
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 100,
  },
};
