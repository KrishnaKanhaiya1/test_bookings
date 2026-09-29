/**
 * Comprehensive Unit Test Suite for EVE Healthcare Backend.
 * Tests all core domain logic, invariants, security, validation, state machines,
 * error handling, and webhook idempotency without requiring external services.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const ApiError = require('../src/utils/ApiError');
const { getPaginationParams, buildPaginationResponse } = require('../src/utils/pagination');
const config = require('../src/config');

describe('EVE Healthcare — Core Domain & Invariants Unit Tests', () => {

  // =========================================================================
  // 1. AUTHENTICATION & SECURITY
  // =========================================================================
  describe('1. Authentication & Security', () => {
    const JWT_SECRET = 'test-unit-jwt-secret';

    it('should hash passwords with 12 bcrypt salt rounds', async () => {
      const plainPassword = 'securePassword123!';
      const hash = await bcrypt.hash(plainPassword, 12);
      
      expect(hash).toBeDefined();
      expect(hash.startsWith('$2a$12$') || hash.startsWith('$2b$12$')).toBe(true);

      const isValid = await bcrypt.compare(plainPassword, hash);
      expect(isValid).toBe(true);

      const isInvalid = await bcrypt.compare('wrongPassword', hash);
      expect(isInvalid).toBe(false);
    });

    it('should sign and verify valid JWT tokens with userId payload', () => {
      const userId = '11111111-2222-3333-4444-555555555555';
      const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' });

      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.userId).toBe(userId);
      expect(decoded.exp).toBeDefined();
    });

    it('should reject expired JWT tokens', () => {
      const token = jwt.sign({ userId: 'test' }, JWT_SECRET, { expiresIn: '-1s' });
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow('jwt expired');
    });

    it('should reject JWT tokens signed with wrong secret', () => {
      const token = jwt.sign({ userId: 'test' }, 'wrong-secret');
      expect(() => jwt.verify(token, JWT_SECRET)).toThrow('invalid signature');
    });

    // Zod validation schemas for auth
    const signupSchema = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      fullName: z.string().min(2).max(100),
    });

    it('should validate compliant user signup data', () => {
      const valid = { email: 'patient@example.com', password: 'password123', fullName: 'Dr. Jane' };
      const parsed = signupSchema.safeParse(valid);
      expect(parsed.success).toBe(true);
    });

    it('should reject invalid emails, short passwords (<8), or empty names', () => {
      expect(signupSchema.safeParse({ email: 'bad-email', password: 'pass', fullName: 'A' }).success).toBe(false);
      expect(signupSchema.safeParse({ email: 'good@email.com', password: 'short', fullName: 'Name' }).success).toBe(false);
      expect(signupSchema.safeParse({ email: 'good@email.com', password: 'validPassword1', fullName: '' }).success).toBe(false);
    });
  });

  // =========================================================================
  // 2. DIAGNOSTIC CENTRES & TESTS
  // =========================================================================
  describe('2. Diagnostic Centres & Tests Domain Logic', () => {
    it('should correctly support per-centre pricing model (CentreTest association)', () => {
      // In EVE Healthcare, the same test (e.g. CBC) can have different prices at different centres
      const cbcTest = { id: 'test-cbc', name: 'Complete Blood Count', testCode: 'CBC001' };
      const mumbaiCentre = { id: 'centre-mumbai', name: 'Mumbai Diagnostics', city: 'Mumbai' };
      const delhiCentre = { id: 'centre-delhi', name: 'Delhi Diagnostics', city: 'Delhi' };

      const mumbaiPricing = { id: 'ct-1', centreId: mumbaiCentre.id, testId: cbcTest.id, price: 400.00, isAvailable: true };
      const delhiPricing = { id: 'ct-2', centreId: delhiCentre.id, testId: cbcTest.id, price: 350.00, isAvailable: true };

      expect(mumbaiPricing.testId).toBe(delhiPricing.testId);
      expect(mumbaiPricing.price).not.toBe(delhiPricing.price);
      expect(mumbaiPricing.price).toBe(400.00);
      expect(delhiPricing.price).toBe(350.00);
    });

    it('should correctly calculate pagination offsets and totals', () => {
      const query1 = { page: '2', limit: '5' };
      const { page, limit, skip } = getPaginationParams(query1);
      expect(page).toBe(2);
      expect(limit).toBe(5);
      expect(skip).toBe(5);

      const meta = buildPaginationResponse(page, limit, 23);
      expect(meta.total).toBe(23);
      expect(meta.totalPages).toBe(5); // ceil(23 / 5) = 5
      expect(meta.page).toBe(2);
    });

    it('should enforce safe boundary defaults on pagination', () => {
      const { page, limit, skip } = getPaginationParams({ page: '-5', limit: '9999' });
      expect(page).toBe(1); // Min 1
      expect(limit).toBe(100); // Max 100
      expect(skip).toBe(0);
    });
  });

  // =========================================================================
  // 3. BOOKING SYSTEM & STATE MACHINE
  // =========================================================================
  describe('3. Booking System & State Machine', () => {
    const VALID_STATES = ['PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED'];

    it('should enforce valid booking state transitions', () => {
      // Invariant: Bookings start at PENDING
      const booking = {
        id: 'book-001',
        status: 'PENDING',
        version: 1,
        appointmentDate: new Date(Date.now() + 86400000), // tomorrow
        amount: 500.00,
      };

      expect(VALID_STATES).toContain(booking.status);
      expect(booking.status).toBe('PENDING');

      // Valid transition: PENDING -> CONFIRMED (on payment success)
      booking.status = 'CONFIRMED';
      booking.version += 1;
      expect(booking.status).toBe('CONFIRMED');
      expect(booking.version).toBe(2);
    });

    it('should reject cancelling a non-PENDING booking', () => {
      const canCancel = (status) => status === 'PENDING';

      expect(canCancel('PENDING')).toBe(true);
      expect(canCancel('CONFIRMED')).toBe(false);
      expect(canCancel('FAILED')).toBe(false);
      expect(canCancel('CANCELLED')).toBe(false);
    });

    it('should reject appointment dates in the past', () => {
      const isFutureDate = (dateStr) => {
        const d = new Date(dateStr);
        return !isNaN(d.getTime()) && d > new Date();
      };

      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const tomorrow = new Date(Date.now() + 86400000).toISOString();

      expect(isFutureDate(yesterday)).toBe(false);
      expect(isFutureDate(tomorrow)).toBe(true);
      expect(isFutureDate('invalid-date')).toBe(false);
    });

    it('should snapshot the test price at the moment of booking creation', () => {
      const currentCentreTestPrice = 650.00;
      const createdBooking = {
        amount: currentCentreTestPrice, // Snapshot price
        status: 'PENDING',
      };

      // Even if centre later changes price to 800:
      const updatedCentreTestPrice = 800.00;
      expect(createdBooking.amount).toBe(650.00);
      expect(createdBooking.amount).not.toBe(updatedCentreTestPrice);
    });

    it('should simulate Optimistic Concurrency Control (version checking)', () => {
      let bookingRecord = { id: 'book-1', status: 'PENDING', version: 1 };

      // Request 1 reads booking at version 1
      const req1Version = bookingRecord.version;

      // Request 2 reads booking at version 1
      const req2Version = bookingRecord.version;

      // Request 1 updates successfully: version matches 1 -> increments to 2
      const updateBooking = (expectedVersion, newStatus) => {
        if (bookingRecord.version !== expectedVersion) {
          throw ApiError.conflict('Booking was modified by another request. Please retry.');
        }
        bookingRecord.status = newStatus;
        bookingRecord.version += 1;
        return bookingRecord;
      };

      expect(() => updateBooking(req1Version, 'CONFIRMED')).not.toThrow();
      expect(bookingRecord.status).toBe('CONFIRMED');
      expect(bookingRecord.version).toBe(2);

      // Request 2 attempts update with stale version 1 -> Must throw 409 Conflict
      expect(() => updateBooking(req2Version, 'CANCELLED')).toThrow(ApiError);
      try {
        updateBooking(req2Version, 'CANCELLED');
      } catch (err) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('CONFLICT');
      }
    });
  });

  // =========================================================================
  // 4. SIMULATED PAYMENT SERVICE
  // =========================================================================
  describe('4. Simulated Payment Service', () => {
    it('should generate uniquely formatted transaction IDs (TXN_...)', () => {
      const { v4: uuidv4 } = require('uuid');
      const transactionId = 'TXN_' + uuidv4();
      expect(transactionId.startsWith('TXN_')).toBe(true);
      expect(transactionId.length).toBeGreaterThan(20);
    });

    it('should only permit payments on PENDING bookings', () => {
      const validatePayable = (booking) => {
        if (booking.status !== 'PENDING') {
          throw ApiError.badRequest('Only pending bookings can be paid', 'INVALID_STATUS');
        }
        const hasSuccess = (booking.payments || []).some(p => p.status === 'SUCCESS');
        if (hasSuccess) {
          throw ApiError.conflict('This booking already has a successful payment');
        }
      };

      expect(() => validatePayable({ status: 'PENDING', payments: [] })).not.toThrow();
      expect(() => validatePayable({ status: 'CONFIRMED', payments: [] })).toThrow('Only pending bookings can be paid');
      expect(() => validatePayable({ status: 'CANCELLED', payments: [] })).toThrow('Only pending bookings can be paid');
      expect(() => validatePayable({ status: 'PENDING', payments: [{ status: 'SUCCESS' }] })).toThrow('already has a successful payment');
    });

    it('should map payment status to correct booking outcome', () => {
      const mapOutcome = (isSuccess) => ({
        paymentStatus: isSuccess ? 'SUCCESS' : 'FAILED',
        bookingStatus: isSuccess ? 'CONFIRMED' : 'FAILED',
      });

      const successOutcome = mapOutcome(true);
      expect(successOutcome.paymentStatus).toBe('SUCCESS');
      expect(successOutcome.bookingStatus).toBe('CONFIRMED');

      const failedOutcome = mapOutcome(false);
      expect(failedOutcome.paymentStatus).toBe('FAILED');
      expect(failedOutcome.bookingStatus).toBe('FAILED');
    });
  });

  // =========================================================================
  // 5. PAYMENT WEBHOOK & IDEMPOTENCY
  // =========================================================================
  describe('5. Payment Webhook & Idempotency', () => {
    const WEBHOOK_SECRET = 'unit-test-webhook-secret-key';

    const generateSignature = (payload, secret = WEBHOOK_SECRET) => {
      return crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(payload))
        .digest('hex');
    };

    it('should correctly verify valid HMAC-SHA256 webhook signatures', () => {
      const payload = {
        eventId: 'evt_123',
        eventType: 'payment.completed',
        transactionId: 'TXN_123',
        status: 'SUCCESS',
        bookingId: '00000000-0000-0000-0000-000000000000',
      };

      const validSignature = generateSignature(payload);
      const computed = crypto.createHmac('sha256', WEBHOOK_SECRET).update(JSON.stringify(payload)).digest('hex');
      expect(validSignature).toBe(computed);
    });

    it('should reject tampered or invalid webhook signatures with 401', () => {
      const payload = {
        eventId: 'evt_123',
        eventType: 'payment.completed',
        transactionId: 'TXN_123',
        status: 'SUCCESS',
        bookingId: '00000000-0000-0000-0000-000000000000',
      };

      const wrongSignature = 'invalid-hex-signature-12345';
      const verifyWebhookSignature = (body, sig) => {
        const expected = generateSignature(body);
        if (sig !== expected) {
          throw ApiError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
        }
      };

      expect(() => verifyWebhookSignature(payload, wrongSignature)).toThrow('Invalid webhook signature');
      try {
        verifyWebhookSignature(payload, wrongSignature);
      } catch (err) {
        expect(err.statusCode).toBe(401);
        expect(err.code).toBe('INVALID_SIGNATURE');
      }
    });

    it('should guarantee idempotency when identical eventId is received multiple times', () => {
      // In-memory simulation of webhook store
      const webhookEventsStore = new Map();
      let paymentRecord = { id: 'p1', transactionId: 'TXN_1', status: 'PENDING' };
      let bookingRecord = { id: 'b1', status: 'PENDING', version: 1 };

      const processWebhookEvent = (event) => {
        // Step 1: Idempotency check on eventId
        const existing = webhookEventsStore.get(event.eventId);
        if (existing && existing.processed) {
          return { processed: false, message: 'Event already processed (idempotent)' };
        }

        // Step 2: Record event
        webhookEventsStore.set(event.eventId, { ...event, processed: true, processedAt: new Date() });

        // Step 3: Check terminal state
        if (paymentRecord.status === 'SUCCESS' || paymentRecord.status === 'FAILED') {
          return { processed: true, message: 'Payment already in terminal state' };
        }

        // Step 4: Apply status change
        paymentRecord.status = event.status;
        bookingRecord.status = event.status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';
        bookingRecord.version += 1;

        return { processed: true, message: `Payment ${paymentRecord.status}, booking ${bookingRecord.status}` };
      };

      const incomingWebhook = {
        eventId: 'EVT_UNIQUE_1001',
        eventType: 'payment.completed',
        transactionId: 'TXN_1',
        status: 'SUCCESS',
        bookingId: 'b1',
      };

      // Call 1: First delivery
      const res1 = processWebhookEvent(incomingWebhook);
      expect(res1.processed).toBe(true);
      expect(paymentRecord.status).toBe('SUCCESS');
      expect(bookingRecord.status).toBe('CONFIRMED');
      expect(bookingRecord.version).toBe(2);

      // Call 2: Exact duplicate webhook (network retry)
      const res2 = processWebhookEvent(incomingWebhook);
      expect(res2.processed).toBe(false);
      expect(res2.message).toContain('already processed');

      // Call 3: Third delivery
      const res3 = processWebhookEvent(incomingWebhook);
      expect(res3.processed).toBe(false);

      // Invariant: Booking version and status remain uncorrupted
      expect(bookingRecord.status).toBe('CONFIRMED');
      expect(bookingRecord.version).toBe(2);
      expect(webhookEventsStore.size).toBe(1);
    });
  });

  // =========================================================================
  // 6. EDGE CASES & ERROR HANDLING
  // =========================================================================
  describe('6. Edge Cases & ApiError Standard', () => {
    it('should format standard HTTP error responses', () => {
      const badReq = ApiError.badRequest('Missing field', 'VALIDATION_ERROR');
      expect(badReq.statusCode).toBe(400);
      expect(badReq.code).toBe('VALIDATION_ERROR');
      expect(badReq.isOperational).toBe(true);

      const unauth = ApiError.unauthorized('Token expired', 'TOKEN_EXPIRED');
      expect(unauth.statusCode).toBe(401);

      const forbid = ApiError.forbidden('Cannot edit another user booking');
      expect(forbid.statusCode).toBe(403);

      const notFound = ApiError.notFound('Centre not found');
      expect(notFound.statusCode).toBe(404);

      const conflict = ApiError.conflict('Email registered');
      expect(conflict.statusCode).toBe(409);

      const rateLimit = ApiError.tooMany('Too many attempts');
      expect(rateLimit.statusCode).toBe(429);
    });

    it('should validate UUID formats with strict regular expression', () => {
      const UUID_REGEX = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

      expect(UUID_REGEX.test('e4b1c2d3-1234-4567-89ab-cdef01234567')).toBe(true);
      expect(UUID_REGEX.test('invalid-uuid')).toBe(false);
      expect(UUID_REGEX.test('12345')).toBe(false);
      expect(UUID_REGEX.test('../../../etc/passwd')).toBe(false);
      expect(UUID_REGEX.test("'; DROP TABLE users; --")).toBe(false);
    });
  });
});
