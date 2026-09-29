const prisma = require('../prisma');
const config = require('../config');
const { cacheGet, cacheSet } = require('../redis');
const ApiError = require('../utils/ApiError');

/**
 * List diagnostic centres with optional city filter and pagination
 * @param {object} params
 * @param {number} params.page
 * @param {number} params.limit
 * @param {number} params.skip
 * @param {string} [params.city]
 * @returns {Promise<{centres: array, total: number}>}
 */
const listCentres = async ({ page, limit, skip, city }) => {
  const cacheKey = `centres:list:${page}:${limit}:${city || 'all'}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const where = { isActive: true };
  if (city) {
    where.city = {
      contains: city,
      mode: 'insensitive'
    };
  }

  const [centres, total] = await Promise.all([
    prisma.diagnosticCentre.findMany({
      where,
      skip,
      take: limit,
      include: {
        _count: {
          select: { centreTests: true }
        }
      }
    }),
    prisma.diagnosticCentre.count({ where })
  ]);

  const result = { centres, total };
  await cacheSet(cacheKey, result, config.cache.ttl);

  return result;
};

/**
 * Get centre details by ID, including available tests
 * @param {string} id
 * @returns {Promise<object>}
 */
const getCentreById = async (id) => {
  const cacheKey = `centres:${id}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const centre = await prisma.diagnosticCentre.findUnique({
    where: { id },
    include: {
      centreTests: {
        where: { isAvailable: true },
        include: {
          test: true
        }
      }
    }
  });

  if (!centre) {
    throw ApiError.notFound('Diagnostic centre not found');
  }

  await cacheSet(cacheKey, centre, config.cache.ttl);
  return centre;
};

/**
 * Get tests available at a specific centre with pagination
 * @param {string} centreId
 * @param {object} pagination
 * @param {number} pagination.page
 * @param {number} pagination.limit
 * @param {number} pagination.skip
 * @returns {Promise<{tests: array, total: number}>}
 */
const getCentreTests = async (centreId, { page, limit, skip }) => {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id: centreId } });
  if (!centre) {
    throw ApiError.notFound('Diagnostic centre not found');
  }

  const where = { centreId, isAvailable: true };

  const [centreTests, total] = await Promise.all([
    prisma.centreTest.findMany({
      where,
      skip,
      take: limit,
      include: {
        test: true
      }
    }),
    prisma.centreTest.count({ where })
  ]);

  const tests = centreTests.map(ct => ({
    ...ct.test,
    price: ct.price,
    centreTestId: ct.id
  }));

  return { tests, total };
};

/**
 * List all diagnostic tests with pagination
 * @param {object} pagination
 * @param {number} pagination.page
 * @param {number} pagination.limit
 * @param {number} pagination.skip
 * @returns {Promise<{tests: array, total: number}>}
 */
const listTests = async ({ page, limit, skip }) => {
  const cacheKey = `tests:list:${page}:${limit}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [tests, total] = await Promise.all([
    prisma.diagnosticTest.findMany({
      skip,
      take: limit,
      include: {
        _count: {
          select: { centreTests: true }
        }
      }
    }),
    prisma.diagnosticTest.count()
  ]);

  const result = { tests, total };
  await cacheSet(cacheKey, result, config.cache.ttl);

  return result;
};

/**
 * Get centres offering a specific test with pagination
 * @param {string} testId
 * @param {object} pagination
 * @param {number} pagination.page
 * @param {number} pagination.limit
 * @param {number} pagination.skip
 * @returns {Promise<{centres: array, total: number}>}
 */
const getTestCentres = async (testId, { page, limit, skip }) => {
  const test = await prisma.diagnosticTest.findUnique({ where: { id: testId } });
  if (!test) {
    throw ApiError.notFound('Diagnostic test not found');
  }

  const where = { testId, isAvailable: true };

  const [centreTests, total] = await Promise.all([
    prisma.centreTest.findMany({
      where,
      skip,
      take: limit,
      include: {
        centre: true
      }
    }),
    prisma.centreTest.count({ where })
  ]);

  const centres = centreTests.map(ct => ({
    ...ct.centre,
    price: ct.price,
    centreTestId: ct.id
  }));

  return { centres, total };
};

module.exports = {
  listCentres,
  getCentreById,
  getCentreTests,
  listTests,
  getTestCentres
};
