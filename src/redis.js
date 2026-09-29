/**
 * Redis client singleton and caching helpers using ioredis.
 * Provides resilient error handling so cache failures do not crash the application.
 * In test mode, provides a no-op / null mock client.
 */
const Redis = require('ioredis');
const config = require('./config');
const logger = require('./logger');

let redis;

if (config.isTest) {
  // Mock Redis client for test environments
  redis = {
    status: 'ready',
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1,
    on: () => redis,
    once: () => redis,
    quit: async () => 'OK',
    disconnect: () => {},
    ping: async () => 'PONG',
  };
} else {
  redis = new Redis(config.redis.url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false, // Prevents indefinite command queuing when Redis is down
    retryStrategy(times) {
      if (times > 3) {
        logger.warn('Redis retry limit exceeded. Proceeding without Redis cache.');
        return null; // Stop reconnection attempts
      }
      return Math.min(times * 200, 1000);
    },
    reconnectOnError(err) {
      logger.warn(`Redis reconnectOnError: ${err.message}`);
      return false;
    },
  });

  redis.on('connect', () => {
    logger.info('Connected to Redis server');
  });

  redis.on('error', (err) => {
    // Log as warning rather than crashing the application
    logger.warn(`Redis connection error: ${err.message}`);
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });
}

/**
 * Retrieves and JSON-deserializes a cached item from Redis.
 * If Redis is unavailable or the key does not exist, safely returns null.
 *
 * @param {string} key - Redis cache key
 * @returns {Promise<any|null>} Parsed cached data or null
 */
async function cacheGet(key) {
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    logger.warn(`Redis cacheGet failed for key "${key}": ${err.message}`);
    return null;
  }
}

/**
 * JSON-serializes and stores an item in Redis with an optional TTL.
 *
 * @param {string} key - Redis cache key
 * @param {any} value - Value to serialize and store
 * @param {number} [ttl] - Expiry in seconds (defaults to config.cache.ttl)
 * @returns {Promise<boolean>} True if stored successfully, false otherwise
 */
async function cacheSet(key, value, ttl = config.cache.ttl) {
  try {
    const serialized = JSON.stringify(value);
    if (ttl && ttl > 0) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
    return true;
  } catch (err) {
    logger.warn(`Redis cacheSet failed for key "${key}": ${err.message}`);
    return false;
  }
}

/**
 * Deletes one or more keys from Redis.
 *
 * @param {string|string[]} key - Key or array of keys to delete
 * @returns {Promise<boolean>} True if delete executed, false if failed
 */
async function cacheDel(key) {
  try {
    if (Array.isArray(key)) {
      if (key.length > 0) {
        await redis.del(...key);
      }
    } else {
      await redis.del(key);
    }
    return true;
  } catch (err) {
    logger.warn(`Redis cacheDel failed for key "${key}": ${err.message}`);
    return false;
  }
}

// Attach helper functions to client instance for convenience
redis.cacheGet = cacheGet;
redis.cacheSet = cacheSet;
redis.cacheDel = cacheDel;
redis.redis = redis;

module.exports = redis;
module.exports.redis = redis;
module.exports.cacheGet = cacheGet;
module.exports.cacheSet = cacheSet;
module.exports.cacheDel = cacheDel;
