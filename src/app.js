/**
 * Express Application Configuration.
 * Sets up security, request logging, body parsing, API documentation,
 * versioned route handlers, and centralized error handling.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');

const swaggerSpec = require('./swagger');
const requestLogger = require('./middleware/requestLogger');
const errorHandler = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');

// Route modules
const authRoutes = require('./routes/auth.routes');
const centresRoutes = require('./routes/centres.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const paymentsRoutes = require('./routes/payments.routes');

const app = express();

// Security HTTP headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors());

// Parse JSON bodies with limit
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP Request logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Swagger interactive API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Mount API routes
app.use('/api/v1/auth', authRoutes);

// centres.routes exports { centresRouter, testsRouter } or a single router
if (centresRoutes && centresRoutes.centresRouter) {
  app.use('/api/v1/centres', centresRoutes.centresRouter);
  if (centresRoutes.testsRouter) {
    app.use('/api/v1/tests', centresRoutes.testsRouter);
  }
} else {
  app.use('/api/v1/centres', centresRoutes);
}

app.use('/api/v1/bookings', bookingsRoutes);
app.use('/api/v1/payments', paymentsRoutes);

// 404 Handler for undefined routes
app.use((req, res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Global error handler middleware (must be registered last)
app.use(errorHandler);

module.exports = app;
