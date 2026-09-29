/**
 * Unit Test Suite for Application Services.
 * Tests business logic and edge cases in auth.service, bookings.service,
 * payments.service, and centres.service using mocked Prisma calls.
 */

const ApiError = require('../src/utils/ApiError');
const crypto = require('crypto');
const config = require('../src/config');

// Define mock Prisma client
const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  diagnosticCentre: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  diagnosticTest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  centreTest: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  booking: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  payment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  webhookEvent: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
  },
  $transaction: jest.fn(async (callback) => {
    return await callback(mockPrisma);
  }),
};

// Mock prisma singleton module
jest.mock('../src/prisma', () => mockPrisma);

// Import services after mocking prisma
const authService = require('../src/services/auth.service');
const bookingsService = require('../src/services/bookings.service');
const paymentsService = require('../src/services/payments.service');
const centresService = require('../src/services/centres.service');

describe('EVE Healthcare — Services Unit Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // AUTH SERVICE
  // =========================================================================
  describe('Auth Service', () => {
    const mockUser = {
      id: 'e4b1c2d3-1234-4567-89ab-cdef01234567',
      email: 'doctor@eve.com',
      fullName: 'Dr. Eve',
      passwordHash: '$2b$12$eXAmPLeHaShEDpAsswOrd123456789012345678901234567890',
      isActive: true,
      createdAt: new Date(),
    };

    it('signup: should throw 409 Conflict if email already exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      await expect(
        authService.signup('doctor@eve.com', 'pass12345', 'Dr. Eve')
      ).rejects.toThrow('Email already registered');
    });

    it('login: should throw 401 if user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        authService.login('notfound@eve.com', 'password')
      ).rejects.toThrow('Invalid email or password');
    });

    it('login: should throw 401 if account is deactivated (isActive = false)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ ...mockUser, isActive: false });

      await expect(
        authService.login('doctor@eve.com', 'password')
      ).rejects.toThrow('Account is deactivated');
    });

    it('getProfile: should throw 404 if user not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(
        authService.getProfile('non-existent-id')
      ).rejects.toThrow('User not found');
    });

    it('getProfile: should return user profile data', async () => {
      const { passwordHash, ...profile } = mockUser;
      mockPrisma.user.findUnique.mockResolvedValueOnce(profile);

      const res = await authService.getProfile(mockUser.id);
      expect(res.id).toBe(mockUser.id);
      expect(res.email).toBe(mockUser.email);
    });
  });

  // =========================================================================
  // BOOKINGS SERVICE
  // =========================================================================
  describe('Bookings Service', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const centreTestId = '22222222-3333-4444-5555-666666666666';
    const bookingId = '33333333-4444-5555-6666-777777777777';

    it('createBooking: should throw 404 if centreTest is not found', async () => {
      mockPrisma.centreTest.findUnique.mockResolvedValueOnce(null);

      await expect(
        bookingsService.createBooking(userId, {
          centreTestId,
          appointmentDate: new Date(Date.now() + 86400000).toISOString(),
        })
      ).rejects.toThrow('Test not available at this centre');
    });

    it('createBooking: should throw 400 if centreTest is currently marked unavailable', async () => {
      mockPrisma.centreTest.findUnique.mockResolvedValueOnce({
        id: centreTestId,
        isAvailable: false,
        price: 500,
      });

      await expect(
        bookingsService.createBooking(userId, {
          centreTestId,
          appointmentDate: new Date(Date.now() + 86400000).toISOString(),
        })
      ).rejects.toThrow('This test is currently not available at this centre');
    });

    it('createBooking: should throw 400 if appointment date is in the past', async () => {
      mockPrisma.centreTest.findUnique.mockResolvedValueOnce({
        id: centreTestId,
        isAvailable: true,
        price: 500,
      });

      const yesterday = new Date(Date.now() - 86400000).toISOString();
      await expect(
        bookingsService.createBooking(userId, { centreTestId, appointmentDate: yesterday })
      ).rejects.toThrow('Appointment date must be in the future');
    });

    it('createBooking: should successfully create booking with PENDING status and price snapshot', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockPrisma.centreTest.findUnique.mockResolvedValueOnce({
        id: centreTestId,
        isAvailable: true,
        price: 750.00,
      });

      mockPrisma.booking.create.mockResolvedValueOnce({
        id: bookingId,
        userId,
        centreTestId,
        appointmentDate: futureDate,
        amount: 750.00,
        status: 'PENDING',
        version: 1,
      });

      const booking = await bookingsService.createBooking(userId, {
        centreTestId,
        appointmentDate: futureDate.toISOString(),
      });

      expect(booking.id).toBe(bookingId);
      expect(booking.amount).toBe(750.00);
      expect(booking.status).toBe('PENDING');
    });

    it('getBookingById: should throw 400 for invalid UUID format', async () => {
      await expect(
        bookingsService.getBookingById('invalid-uuid-format', userId)
      ).rejects.toThrow('Invalid booking ID format');
    });

    it('getBookingById: should throw 403 if user tries to access another users booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId: 'other-user-id',
        status: 'PENDING',
      });

      await expect(
        bookingsService.getBookingById(bookingId, userId)
      ).rejects.toThrow('You can only view your own bookings');
    });

    it('cancelBooking: should throw 400 if trying to cancel non-PENDING booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId,
        status: 'CONFIRMED',
      });

      await expect(
        bookingsService.cancelBooking(bookingId, userId)
      ).rejects.toThrow('Only pending bookings can be cancelled');
    });

    it('cancelBooking: should throw 409 Conflict if optimistic lock version mismatch occurs', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId,
        status: 'PENDING',
        version: 1,
      });

      // updateMany returns count: 0 when version was incremented concurrently by another request
      mockPrisma.booking.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        bookingsService.cancelBooking(bookingId, userId)
      ).rejects.toThrow('Booking was modified by another request. Please retry.');
    });
  });

  // =========================================================================
  // PAYMENTS SERVICE
  // =========================================================================
  describe('Payments Service', () => {
    const userId = '11111111-2222-3333-4444-555555555555';
    const bookingId = '33333333-4444-5555-6666-777777777777';

    it('initiatePayment: should throw 403 if user is not the booking owner', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId: 'different-owner-id',
        status: 'PENDING',
        payments: [],
      });

      await expect(
        paymentsService.initiatePayment(userId, bookingId)
      ).rejects.toThrow('You can only pay for your own bookings');
    });

    it('initiatePayment: should throw 400 if booking is not PENDING', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId,
        status: 'CANCELLED',
        payments: [],
      });

      await expect(
        paymentsService.initiatePayment(userId, bookingId)
      ).rejects.toThrow('Only pending bookings can be paid');
    });

    it('initiatePayment: should throw 409 if a successful payment already exists', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId,
        status: 'PENDING',
        payments: [{ id: 'p1', status: 'SUCCESS' }],
      });

      await expect(
        paymentsService.initiatePayment(userId, bookingId)
      ).rejects.toThrow('This booking already has a successful payment');
    });

    it('processWebhook: should reject request if HMAC-SHA256 signature is invalid', async () => {
      const payload = {
        eventId: 'evt-001',
        eventType: 'payment.completed',
        transactionId: 'TXN-001',
        status: 'SUCCESS',
        bookingId,
      };

      await expect(
        paymentsService.processWebhook(payload, 'wrong-hex-signature')
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('processWebhook: should return idempotent success if eventId was already processed', async () => {
      const payload = {
        eventId: 'evt-already-processed',
        eventType: 'payment.completed',
        transactionId: 'TXN-001',
        status: 'SUCCESS',
        bookingId,
      };

      const validSig = crypto
        .createHmac('sha256', config.webhook.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      mockPrisma.webhookEvent.findUnique.mockResolvedValueOnce({
        id: 'wh-1',
        eventId: payload.eventId,
        processed: true,
      });

      const result = await paymentsService.processWebhook(payload, validSig);
      expect(result.processed).toBe(false);
      expect(result.message).toContain('already processed');
    });

    it('getPaymentByBookingId: should throw 403 if user does not own booking', async () => {
      mockPrisma.booking.findUnique.mockResolvedValueOnce({
        id: bookingId,
        userId: 'other-user',
      });

      await expect(
        paymentsService.getPaymentByBookingId(bookingId, userId)
      ).rejects.toThrow('You can only view payments for your own bookings');
    });
  });

  // =========================================================================
  // CENTRES SERVICE
  // =========================================================================
  describe('Centres Service', () => {
    it('getCentreById: should throw 404 if diagnostic centre not found', async () => {
      mockPrisma.diagnosticCentre.findUnique.mockResolvedValueOnce(null);

      await expect(
        centresService.getCentreById('non-existent-centre-id')
      ).rejects.toThrow('Diagnostic centre not found');
    });

    it('getTestCentres: should throw 404 if diagnostic test not found', async () => {
      mockPrisma.diagnosticTest.findUnique.mockResolvedValueOnce(null);

      await expect(
        centresService.getTestCentres('non-existent-test-id', { page: 1, limit: 10, skip: 0 })
      ).rejects.toThrow('Diagnostic test not found');
    });
  });

});
