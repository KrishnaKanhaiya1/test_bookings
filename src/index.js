/**
 * Server Entry Point.
 * Verifies database connectivity, starts the Express HTTP server,
 * and configures graceful shutdown and process-level error handlers.
 */
const app = require('./app');
const config = require('./config');
const logger = require('./logger');
const prisma = require('./prisma');

let server;

/**
 * Initializes database connection and starts HTTP listener.
 */
async function startServer() {
  try {
    // Check database connection
    await prisma.$connect();
    logger.info('Database connection established successfully');

    server = app.listen(config.port, () => {
      logger.info('===============================================');
      logger.info(` EVE Healthcare Backend API is running`);
      logger.info(` Environment  : ${config.nodeEnv}`);
      logger.info(` Port         : ${config.port}`);
      logger.info(` API Base URL : http://localhost:${config.port}/api/v1`);
      logger.info(` Swagger Docs : http://localhost:${config.port}/api-docs`);
      logger.info(` Health Check : http://localhost:${config.port}/health`);
      logger.info('===============================================');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

/**
 * Initiates graceful application shutdown.
 * Closes the HTTP server to finish ongoing requests, then disconnects Prisma.
 *
 * @param {string} signal - Triggering signal or reason
 */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await prisma.$disconnect();
        logger.info('Database connection closed.');
        process.exit(0);
      } catch (err) {
        logger.error('Error disconnecting database during shutdown:', err);
        process.exit(1);
      }
    });

    // Force termination if closing takes longer than 10 seconds
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit.');
      process.exit(1);
    }, 10000).unref();
  } else {
    try {
      await prisma.$disconnect();
    } catch (_) {}
    process.exit(0);
  }
}

// Process signal listeners
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Process error listeners for unexpected failures
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection:', {
    reason: reason instanceof Error ? reason.stack : reason,
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception occurred:', {
    error: error.stack || error.message,
  });
  gracefulShutdown('uncaughtException');
});

// Start the server
startServer();

module.exports = server;
