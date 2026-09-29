const express = require('express');
const { z } = require('zod');
const auth = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const catchAsync = require('../utils/catchAsync');
const bookingsService = require('../services/bookings.service');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');

const router = express.Router();

const UUID_REGEX = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

const createBookingSchema = z.object({
  body: z.object({
    centreTestId: z.string().uuid(),
    appointmentDate: z.string().datetime(),
  }),
});

router.use(auth);

router.post('/', validate(createBookingSchema), catchAsync(async (req, res) => {
  const booking = await bookingsService.createBooking(req.user.id, req.validatedBody);
  res.status(201).json({ success: true, data: booking });
}));

router.get('/', catchAsync(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const status = req.query.status;
  
  const { bookings, total } = await bookingsService.getUserBookings(req.user.id, { page, limit, skip, status });
  
  res.status(200).json({ 
    success: true, 
    data: bookings, 
    pagination: buildPaginationResponse(page, limit, total).pagination
  });
}));

router.get('/:id', catchAsync(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid booking ID format' });
  }
  const booking = await bookingsService.getBookingById(req.params.id, req.user.id);
  res.status(200).json({ success: true, data: booking });
}));

router.patch('/:id/cancel', catchAsync(async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid booking ID format' });
  }
  const booking = await bookingsService.cancelBooking(req.params.id, req.user.id);
  res.status(200).json({ success: true, message: 'Booking cancelled successfully', data: booking });
}));

module.exports = router;
