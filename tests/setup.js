process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.WEBHOOK_SECRET = 'test-webhook-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST || 'postgresql://postgres:postgres@localhost:5432/eve_test?schema=public';

const prisma = require('../src/prisma');

async function cleanDatabase() {
  // Delete in correct order to respect foreign key constraints
  await prisma.payment.deleteMany({});
  await prisma.webhookEvent.deleteMany({});
  await prisma.booking.deleteMany({});
  await prisma.centreTest.deleteMany({});
  await prisma.diagnosticTest.deleteMany({});
  await prisma.diagnosticCentre.deleteMany({});
  await prisma.user.deleteMany({});
}

beforeAll(async () => {
  await prisma.$connect();
  await cleanDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

module.exports = { cleanDatabase };
