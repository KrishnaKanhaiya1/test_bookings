/**
 * OpenAPI / Swagger Specification configuration.
 * Generates interactive API documentation conforming to OpenAPI 3.0.0.
 */
const swaggerJsdoc = require('swagger-jsdoc');
const config = require('./config');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'EVE Healthcare API',
    version: '1.0.0',
    description: 'Backend service for diagnostic test bookings and simulated payments',
  },
  servers: [
    {
      url: `http://localhost:${config.port}`,
      description: 'Local development server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide your JWT token in the format: Bearer <token>',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string' },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DiagnosticCentre: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          address: { type: 'string' },
          city: { type: 'string' },
          state: { type: 'string' },
          pincode: { type: 'string' },
          phone: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      DiagnosticTest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          description: { type: 'string', nullable: true },
          testCode: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CentreTest: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          centreId: { type: 'string', format: 'uuid' },
          testId: { type: 'string', format: 'uuid' },
          price: { type: 'number', format: 'float' },
          isAvailable: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
          test: { $ref: '#/components/schemas/DiagnosticTest' },
          centre: { $ref: '#/components/schemas/DiagnosticCentre' },
        },
      },
      Booking: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          userId: { type: 'string', format: 'uuid' },
          centreTestId: { type: 'string', format: 'uuid' },
          appointmentDate: { type: 'string', format: 'date-time' },
          amount: { type: 'number', format: 'float' },
          status: {
            type: 'string',
            enum: ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'],
          },
          version: { type: 'integer' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Payment: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          bookingId: { type: 'string', format: 'uuid' },
          transactionId: { type: 'string' },
          amount: { type: 'number', format: 'float' },
          status: {
            type: 'string',
            enum: ['PENDING', 'SUCCESS', 'FAILED'],
          },
          paymentMethod: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              code: { type: 'string' },
            },
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          page: { type: 'integer', example: 1 },
          limit: { type: 'integer', example: 10 },
          total: { type: 'integer', example: 42 },
          totalPages: { type: 'integer', example: 5 },
        },
      },
    },
  },
  paths: {
    '/api/v1/auth/signup': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user account',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password', 'fullName'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'patient@example.com' },
                  password: { type: 'string', minLength: 8, example: 'securepassword123' },
                  fullName: { type: 'string', minLength: 2, maxLength: 100, example: 'Jane Doe' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'User registered successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        token: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          409: { description: 'Email already registered', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Log in with email and password',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'patient@example.com' },
                  password: { type: 'string', example: 'securepassword123' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'object',
                      properties: {
                        user: { $ref: '#/components/schemas/User' },
                        token: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Invalid credentials', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user profile',
        security: [{ BearerAuth: [] }],
        responses: {
          200: {
            description: 'Current user profile',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/centres': {
      get: {
        tags: ['Centres'],
        summary: 'List diagnostic centres with pagination and city filter',
        parameters: [
          { name: 'city', in: 'query', schema: { type: 'string' }, description: 'Filter centres by city' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 }, description: 'Page number' },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 }, description: 'Page size' },
        ],
        responses: {
          200: {
            description: 'List of diagnostic centres',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/DiagnosticCentre' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/centres/{id}': {
      get: {
        tags: ['Centres'],
        summary: 'Get diagnostic centre details by ID',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Centre ID' },
        ],
        responses: {
          200: {
            description: 'Diagnostic centre details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/DiagnosticCentre' },
                  },
                },
              },
            },
          },
          404: { description: 'Centre not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/centres/{id}/tests': {
      get: {
        tags: ['Centres'],
        summary: 'List available diagnostic tests and prices at a specific centre',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Centre ID' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Tests offered by centre',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/CentreTest' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
          404: { description: 'Centre not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/tests': {
      get: {
        tags: ['Tests'],
        summary: 'List all diagnostic tests (catalogue)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Catalogue of tests',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/DiagnosticTest' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/tests/{id}/centres': {
      get: {
        tags: ['Tests'],
        summary: 'List centres that provide a specific test and their pricing',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Test ID' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'Centres offering the test',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/CentreTest' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
          404: { description: 'Test not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/bookings': {
      post: {
        tags: ['Bookings'],
        summary: 'Create a new test booking',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['centreTestId', 'appointmentDate'],
                properties: {
                  centreTestId: { type: 'string', format: 'uuid' },
                  appointmentDate: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Booking created successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Booking' },
                  },
                },
              },
            },
          },
          400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
      get: {
        tags: ['Bookings'],
        summary: 'List user bookings with optional status filter',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: {
            description: 'List of bookings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Booking' } },
                    pagination: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/bookings/{id}': {
      get: {
        tags: ['Bookings'],
        summary: 'Get booking details by ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Booking ID' },
        ],
        responses: {
          200: {
            description: 'Booking details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Booking' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Booking not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/bookings/{id}/cancel': {
      patch: {
        tags: ['Bookings'],
        summary: 'Cancel an active booking',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Booking ID' },
        ],
        responses: {
          200: {
            description: 'Booking cancelled successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Booking cancelled successfully' },
                    data: { $ref: '#/components/schemas/Booking' },
                  },
                },
              },
            },
          },
          400: { description: 'Cannot cancel booking in current status', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Booking not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/payments': {
      post: {
        tags: ['Payments'],
        summary: 'Initiate payment for a booking',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['bookingId'],
                properties: {
                  bookingId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Payment initiated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { $ref: '#/components/schemas/Payment' },
                  },
                },
              },
            },
          },
          400: { description: 'Bad request or booking not payable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/payments/webhook': {
      post: {
        tags: ['Payments'],
        summary: 'Process payment gateway webhook events (idempotent)',
        parameters: [
          {
            name: 'x-webhook-signature',
            in: 'header',
            required: true,
            schema: { type: 'string' },
            description: 'HMAC signature for webhook payload verification',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['eventId', 'eventType', 'transactionId', 'status', 'bookingId'],
                properties: {
                  eventId: { type: 'string' },
                  eventType: { type: 'string', example: 'payment.success' },
                  transactionId: { type: 'string' },
                  status: { type: 'string', enum: ['SUCCESS', 'FAILED'] },
                  bookingId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Webhook processed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          400: { description: 'Invalid webhook payload or signature', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/v1/payments/{bookingId}': {
      get: {
        tags: ['Payments'],
        summary: 'Get payment records by booking ID',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'bookingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Booking ID' },
        ],
        responses: {
          200: {
            description: 'Payment records for the booking',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Payment' },
                    },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          404: { description: 'Payment not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
  },
};

const swaggerOptions = {
  definition: swaggerDefinition,
  apis: [],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

module.exports = swaggerSpec;
