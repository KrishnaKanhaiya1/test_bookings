process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/eve_test?schema=public';

const prisma = require('../src/prisma');

let isDbConnected = false;

async function cleanDatabase() {
  if (!isDbConnected) return;
  try {
    // Delete in correct order to respect foreign key constraints
    await prisma.payment.deleteMany({});
    await prisma.webhookEvent.deleteMany({});
    await prisma.booking.deleteMany({});
    await prisma.centreTest.deleteMany({});
    await prisma.diagnosticTest.deleteMany({});
    await prisma.diagnosticCentre.deleteMany({});
    await prisma.user.deleteMany({});
  } catch (err) {
    // ignore if tables not yet created
  }
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    isDbConnected = true;
    await cleanDatabase();
  } catch (err) {
    isDbConnected = false;
    // Live database not reachable in current environment.
    // Unit tests will proceed without interruption.
  }
});

afterAll(async () => {
  if (isDbConnected) {
    try {
      await prisma.$disconnect();
    } catch (err) {
      // ignore disconnect errors on exit
    }
  }
});

module.exports = { cleanDatabase, isDbConnected: () => isDbConnected };
