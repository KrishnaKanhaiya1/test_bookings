const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const catchAsync = require('../utils/catchAsync');
const paymentsService = require('../services/payments.service');

const router = express.Router();

const UUID_REGEX = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

const initiatePaymentSchema = z.object({
  body: z.object({
    bookingId: z.string().uuid(),
  }),
});

const webhookSchema = z.object({
  body: z.object({
    eventId: z.string(),
    eventType: z.string(),
    transactionId: z.string(),
    status: z.enum(['SUCCESS', 'FAILED']),
    bookingId: z.string().uuid(),
  })
});

// Auth required for initiating payment
router.post('/', auth, validate(initiatePaymentSchema), catchAsync(async (req, res) => {
  const result = await paymentsService.initiatePayment(req.user.id, req.validatedBody.bookingId);
  res.status(201).json({ success: true, data: result });
}));

// No auth middleware for webhook, uses signature verification
router.post('/webhook', validate(webhookSchema), catchAsync(async (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const result = await paymentsService.processWebhook(req.validatedBody, signature);
  res.status(200).json({ success: true, data: result });
}));

// Auth required for getting payments by booking ID
router.get('/:bookingId', auth, catchAsync(async (req, res) => {
  if (!UUID_REGEX.test(req.params.bookingId)) {
    return res.status(400).json({ success: false, message: 'Invalid booking ID format' });
  }
  const payments = await paymentsService.getPaymentByBookingId(req.params.bookingId, req.user.id);
  res.status(200).json({ success: true, data: payments });
}));

module.exports = router;
