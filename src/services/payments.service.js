const prisma = require('../prisma');
const ApiError = require('../utils/ApiError');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../logger');

const uuidRegex = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

/**
 * Initiates a payment process for a booking
 * @param {string} userId - ID of the user
 * @param {string} bookingId - ID of the booking to pay for
 * @returns {Promise<Object>} Payment and booking details
 */
const initiatePayment = async (userId, bookingId) => {
  if (!uuidRegex.test(bookingId)) {
    throw ApiError.badRequest('Invalid booking ID format');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: true }
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  if (booking.userId !== userId) {
    throw ApiError.forbidden('You can only pay for your own bookings');
  }

  if (booking.status !== 'PENDING') {
    throw ApiError.badRequest('Only pending bookings can be paid', 'INVALID_STATUS');
  }

  const hasSuccessPayment = booking.payments.some(p => p.status === 'SUCCESS');
  if (hasSuccessPayment) {
    throw ApiError.conflict('This booking already has a successful payment');
  }

  const hasPendingPayment = booking.payments.some(p => p.status === 'PENDING');
  if (hasPendingPayment) {
    throw ApiError.conflict('A payment is already being processed for this booking');
  }

  const transactionId = 'TXN_' + uuidv4();

  // SIMULATE PAYMENT (70% success rate)
  const isSuccess = Math.random() < 0.7;
  const paymentStatus = isSuccess ? 'SUCCESS' : 'FAILED';
  const bookingStatus = isSuccess ? 'CONFIRMED' : 'FAILED';

  // Use a transaction to ensure atomicity between payment creation and booking status update
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        bookingId,
        transactionId,
        amount: booking.amount,
        status: paymentStatus,
        paymentMethod: 'SIMULATED',
      },
    });

    const updatedBooking = await tx.booking.update({
      where: { id: bookingId, version: booking.version },
      data: {
        status: bookingStatus,
        version: { increment: 1 },
      },
    });

    return { payment, booking: updatedBooking };
  });

  logger.info(`Payment initiated for booking ${bookingId} with status ${paymentStatus}`);
  
  return { payment: result.payment, booking: result.booking };
};

/**
 * Process a payment webhook in an idempotent manner
 * @param {Object} payload - Webhook payload
 * @param {string} signature - Webhook signature
 * @returns {Promise<Object>} Webhook processing result
 */
const processWebhook = async ({ eventId, eventType, transactionId, status, bookingId }, signature) => {
  // Step 1: Verify HMAC signature
  const payloadStr = JSON.stringify({ eventId, eventType, transactionId, status, bookingId });
  const expectedSignature = crypto.createHmac('sha256', config.webhook.secret).update(payloadStr).digest('hex');

  if (signature !== expectedSignature) {
    throw ApiError.unauthorized('Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  // Step 2: Check idempotency upfront
  const existingEvent = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existingEvent && existingEvent.processed) {
    return { processed: false, message: 'Event already processed (idempotent)' };
  }

  // Step 3: Use transaction for idempotency and updates
  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.webhookEvent.findUnique({ where: { eventId } });
    if (event && event.processed) {
      return { processed: false, message: 'Event already processed' };
    }

    // Upsert webhook event (create if not exists)
    const webhookEvent = await tx.webhookEvent.upsert({
      where: { eventId },
      create: {
        eventId,
        eventType,
        payload: { transactionId, status, bookingId },
        processed: false,
      },
      update: {},
    });

    const payment = await tx.payment.findUnique({ where: { transactionId } });
    if (!payment) {
      // Payment not found — could be a stale/invalid webhook
      await tx.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, processedAt: new Date() },
      });
      return { processed: true, message: 'Payment not found for this transaction' };
    }

    // Skip if payment already in terminal state
    if (payment.status === 'SUCCESS' || payment.status === 'FAILED') {
      await tx.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true, processedAt: new Date() },
      });
      return { processed: true, message: 'Payment already in terminal state' };
    }

    // Update payment status
    const newPaymentStatus = status;
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: newPaymentStatus },
    });

    // Update booking status
    const newBookingStatus = status === 'SUCCESS' ? 'CONFIRMED' : 'FAILED';
    await tx.booking.update({
      where: { id: payment.bookingId },
      data: {
        status: newBookingStatus,
        version: { increment: 1 },
      },
    });

    // Mark webhook as processed
    await tx.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { processed: true, processedAt: new Date() },
    });

    return { processed: true, message: `Payment ${newPaymentStatus}, booking ${newBookingStatus}` };
  });

  return result;
};

/**
 * Get payments for a given booking
 * @param {string} bookingId - ID of the booking
 * @param {string} userId - ID of the user requesting
 * @returns {Promise<Array>} List of payments
 */
const getPaymentByBookingId = async (bookingId, userId) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }
  
  if (booking.userId !== userId) {
    throw ApiError.forbidden('You can only view payments for your own bookings');
  }

  const payments = await prisma.payment.findMany({
    where: { bookingId },
    orderBy: { createdAt: 'desc' },
  });

  return payments;
};

module.exports = {
  initiatePayment,
  processWebhook,
  getPaymentByBookingId,
};
