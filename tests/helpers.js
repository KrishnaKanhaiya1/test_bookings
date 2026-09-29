const app = require('../src/app');
const request = require('supertest');
const prisma = require('../src/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { cleanDatabase } = require('./setup');

/**
 * Creates a test user in the database
 */
async function createTestUser(overrides = {}) {
  const plainPassword = overrides.password || 'password123';
  const passwordHash = await bcrypt.hash(plainPassword, 10);
  const email = overrides.email || `test${Date.now()}@example.com`;
  
  const user = await prisma.user.create({
    data: {
      email,
      fullName: overrides.fullName || 'Test User',
      passwordHash,
      isActive: true,
      ...overrides
    }
  });

  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  return { user, token, password: plainPassword };
}

/**
 * Creates a test diagnostic centre
 */
async function createTestCentre(overrides = {}) {
  return await prisma.diagnosticCentre.create({
    data: {
      name: overrides.name || 'Test Centre',
      address: overrides.address || '123 Test St',
      city: overrides.city || 'Test City',
      state: overrides.state || 'Test State',
      pincode: overrides.pincode || '123456',
      phone: overrides.phone || '1234567890',
      isActive: true,
      ...overrides
    }
  });
}

/**
 * Creates a test diagnostic test
 */
async function createTestDiagnosticTest(overrides = {}) {
  return await prisma.diagnosticTest.create({
    data: {
      name: overrides.name || 'Complete Blood Count',
      description: overrides.description || 'Routine blood test',
      testCode: overrides.testCode || `TEST-${Date.now()}`,
      ...overrides
    }
  });
}

/**
 * Creates a centre-test association
 */
async function createTestCentreTest(centreId, testId, overrides = {}) {
  return await prisma.centreTest.create({
    data: {
      centreId,
      testId,
      price: overrides.price || 1000,
      isAvailable: overrides.isAvailable !== undefined ? overrides.isAvailable : true
    }
  });
}

/**
 * Creates a booking
 */
async function createTestBooking(userId, centreTestId, overrides = {}) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 1);

  return await prisma.booking.create({
    data: {
      userId,
      centreTestId,
      appointmentDate: overrides.appointmentDate || futureDate,
      amount: overrides.amount || 1000,
      status: overrides.status || 'PENDING',
      version: 1
    }
  });
}

/**
 * Generates an HMAC signature for webhook testing
 */
function generateWebhookSignature(body) {
  return crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(JSON.stringify(body))
    .digest('hex');
}

/**
 * Helper to get authorization header
 */
function getAuthHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = {
  app,
  request,
  prisma,
  createTestUser,
  createTestCentre,
  createTestDiagnosticTest,
  createTestCentreTest,
  createTestBooking,
  generateWebhookSignature,
  cleanDatabase,
  getAuthHeader
};
