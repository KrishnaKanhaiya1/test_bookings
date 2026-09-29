const prisma = require('../prisma');
const ApiError = require('../utils/ApiError');

const uuidRegex = /^[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

/**
 * Creates a new booking
 * @param {string} userId - ID of the user creating the booking
 * @param {Object} data - Booking details
 * @param {string} data.centreTestId - ID of the centre test
 * @param {string} data.appointmentDate - Appointment date
 * @returns {Promise<Object>} Created booking
 */
const createBooking = async (userId, { centreTestId, appointmentDate }) => {
  const centreTest = await prisma.centreTest.findUnique({
    where: { id: centreTestId },
    include: { centre: true, test: true },
  });

  if (!centreTest) {
    throw ApiError.notFound('Test not available at this centre');
  }

  if (!centreTest.isAvailable) {
    throw ApiError.badRequest('This test is currently not available at this centre');
  }

  const appointment = new Date(appointmentDate);
  if (isNaN(appointment.getTime())) {
    throw ApiError.badRequest('Invalid appointment date');
  }

  if (appointment <= new Date()) {
    throw ApiError.badRequest('Appointment date must be in the future');
  }

  const booking = await prisma.booking.create({
    data: {
      userId,
      centreTestId,
      appointmentDate: appointment,
      amount: centreTest.price,
      status: 'PENDING',
    },
    include: {
      centreTest: {
        include: {
          centre: true,
          test: true,
        }
      }
    }
  });

  return booking;
};

/**
 * Get user bookings with pagination
 * @param {string} userId - ID of the user
 * @param {Object} query - Pagination and filter query
 * @returns {Promise<Object>} Paginated bookings result
 */
const getUserBookings = async (userId, { page, limit, skip, status }) => {
  const where = { userId };
  if (status) {
    where.status = status;
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        centreTest: {
          include: {
            centre: true,
            test: true,
          }
        },
        payments: true,
      }
    }),
    prisma.booking.count({ where })
  ]);

  return { bookings, total };
};

/**
 * Get booking by ID
 * @param {string} bookingId - ID of the booking
 * @param {string} userId - ID of the user requesting
 * @returns {Promise<Object>} Booking details
 */
const getBookingById = async (bookingId, userId) => {
  if (!uuidRegex.test(bookingId)) {
    throw ApiError.badRequest('Invalid booking ID format');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      centreTest: {
        include: {
          centre: true,
          test: true,
        }
      },
      payments: true,
    }
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  if (booking.userId !== userId) {
    throw ApiError.forbidden('You can only view your own bookings');
  }

  return booking;
};

/**
 * Cancel a pending booking using optimistic locking
 * @param {string} bookingId - ID of the booking
 * @param {string} userId - ID of the user cancelling
 * @returns {Promise<Object>} Cancelled booking details
 */
const cancelBooking = async (bookingId, userId) => {
  if (!uuidRegex.test(bookingId)) {
    throw ApiError.badRequest('Invalid booking ID format');
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
  });

  if (!booking) {
    throw ApiError.notFound('Booking not found');
  }

  if (booking.userId !== userId) {
    throw ApiError.forbidden('You can only view your own bookings');
  }

  if (booking.status !== 'PENDING') {
    throw ApiError.badRequest('Only pending bookings can be cancelled', 'INVALID_STATUS_TRANSITION');
  }

  // Use optimistic locking to prevent race conditions during status updates
  const updateResult = await prisma.booking.updateMany({
    where: {
      id: bookingId,
      version: booking.version,
    },
    data: {
      status: 'CANCELLED',
      version: { increment: 1 },
    }
  });

  if (updateResult.count === 0) {
    throw ApiError.conflict('Booking was modified by another request. Please retry.');
  }

  return getBookingById(bookingId, userId);
};

module.exports = {
  createBooking,
  getUserBookings,
  getBookingById,
  cancelBooking,
};
