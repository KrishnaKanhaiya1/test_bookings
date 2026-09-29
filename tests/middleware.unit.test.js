/**
 * Unit Test Suite for Middlewares.
 * Tests validate.js, errorHandler.js, and auth.js in isolation.
 */

const { z } = require('zod');
const jwt = require('jsonwebtoken');
const ApiError = require('../src/utils/ApiError');
const { validate, validateQuery } = require('../src/middleware/validate');
const errorHandler = require('../src/middleware/errorHandler');
const config = require('../src/config');

describe('EVE Healthcare — Middlewares Unit Tests', () => {

  // =========================================================================
  // VALIDATION MIDDLEWARE
  // =========================================================================
  describe('validate middleware', () => {
    const testSchema = z.object({
      name: z.string().min(2),
      email: z.string().email(),
    });

    it('should call next() and attach validatedBody for valid payload', () => {
      const req = { body: { name: 'Dr. Jane', email: 'jane@eve.com' } };
      const res = {};
      const next = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.validatedBody).toEqual({ name: 'Dr. Jane', email: 'jane@eve.com' });
    });

    it('should pass ApiError.badRequest to next() when validation fails', () => {
      const req = { body: { name: 'J', email: 'not-an-email' } };
      const res = {};
      const next = jest.fn();

      const middleware = validate(testSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(ApiError);
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('should handle wrapped schemas ({ body: z.object(...) }) seamlessly', () => {
      const wrappedSchema = z.object({
        body: z.object({
          code: z.string().min(3),
        }),
      });

      const req = { body: { code: 'CBC001' } };
      const res = {};
      const next = jest.fn();

      const middleware = validate(wrappedSchema);
      middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(req.validatedBody).toEqual({ code: 'CBC001' });
    });
  });

  // =========================================================================
  // GLOBAL ERROR HANDLER MIDDLEWARE
  // =========================================================================
  describe('errorHandler middleware', () => {
    let mockReq;
    let mockRes;
    let mockNext;

    beforeEach(() => {
      mockReq = { method: 'POST', originalUrl: '/api/v1/test', ip: '127.0.0.1' };
      mockRes = {
        statusCode: 200,
        status: jest.fn(function (code) {
          this.statusCode = code;
          return this;
        }),
        json: jest.fn(function (data) {
          this.body = data;
          return this;
        }),
      };
      mockNext = jest.fn();
    });

    it('should format operational ApiError with custom status and code', () => {
      const err = ApiError.conflict('Booking already confirmed', 'ALREADY_CONFIRMED');

      errorHandler(err, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Booking already confirmed',
          code: 'ALREADY_CONFIRMED',
        },
      });
    });

    it('should format ZodError into 400 with VALIDATION_ERROR code', () => {
      const schema = z.object({ age: z.number().min(18) });
      const parseResult = schema.safeParse({ age: 12 });
      const zodErr = parseResult.error;

      errorHandler(zodErr, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.body.success).toBe(false);
      expect(mockRes.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should format Prisma P2002 error into 409 CONFLICT', () => {
      const prismaErr = new Error('Unique constraint failed');
      prismaErr.code = 'P2002';
      prismaErr.meta = { target: ['email'] };

      errorHandler(prismaErr, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.body.error.code).toBe('CONFLICT');
      expect(mockRes.body.error.message).toContain('Unique constraint violation');
    });

    it('should format Prisma P2025 error into 404 NOT_FOUND', () => {
      const prismaErr = new Error('Record not found');
      prismaErr.code = 'P2025';
      prismaErr.meta = { cause: 'No Booking found' };

      errorHandler(prismaErr, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.body.error.code).toBe('NOT_FOUND');
      expect(mockRes.body.error.message).toBe('No Booking found');
    });

    it('should format unhandled errors into 500 INTERNAL_ERROR', () => {
      const genericErr = new Error('Database server crashed unexpectedly');

      errorHandler(genericErr, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.body.success).toBe(false);
      expect(mockRes.body.error.code).toBe('INTERNAL_ERROR');
    });
  });

});
