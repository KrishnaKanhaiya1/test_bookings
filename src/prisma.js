/**
 * Prisma client singleton.
 * Reuses a single PrismaClient instance across the app to avoid connection exhaustion.
 * In development, stores the client on `global` to survive hot-reloads.
 */
const { PrismaClient } = require('@prisma/client');
const config = require('./config');

const prismaOptions = {
  log: config.isProduction
    ? ['error']
    : ['query', 'info', 'warn', 'error'],
};

/** @type {PrismaClient} */
let prisma;

if (config.isProduction) {
  prisma = new PrismaClient(prismaOptions);
} else {
  // In dev/test, reuse client across hot-reloads
  if (!global.__prisma) {
    global.__prisma = new PrismaClient(prismaOptions);
  }
  prisma = global.__prisma;
}

module.exports = prisma;
