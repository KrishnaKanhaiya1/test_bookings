/**
 * Pagination utilities for list endpoints.
 */

/**
 * Extracts and validates pagination parameters from query string.
 * @param {object} query - req.query object
 * @returns {{ page: number, limit: number, skip: number }}
 */
function getPaginationParams(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

/**
 * Builds the pagination metadata for API responses.
 * Polymorphic implementation supporting both:
 *   - buildPaginationResponse(page, limit, total)
 *   - buildPaginationResponse(items, total, page, limit)
 *
 * @param {number|Array} arg1 - Page number OR items array
 * @param {number} arg2 - Limit OR total items count
 * @param {number} [arg3] - Total items count OR page number
 * @param {number} [arg4] - Limit when arg1 is items
 * @returns {{ page: number, limit: number, total: number, totalPages: number, pagination: object, data?: Array }}
 */
function buildPaginationResponse(arg1, arg2, arg3, arg4) {
  let items = null;
  let page = 1;
  let limit = 10;
  let total = 0;

  if (Array.isArray(arg1)) {
    // Signature: buildPaginationResponse(items, total, page, limit)
    items = arg1;
    total = typeof arg2 === 'number' ? arg2 : 0;
    page = typeof arg3 === 'number' ? Math.max(1, arg3) : 1;
    limit = typeof arg4 === 'number' && arg4 > 0 ? arg4 : 10;
  } else {
    // Signature: buildPaginationResponse(page, limit, total)
    page = typeof arg1 === 'number' ? Math.max(1, arg1) : 1;
    limit = typeof arg2 === 'number' && arg2 > 0 ? arg2 : 10;
    total = typeof arg3 === 'number' ? arg3 : 0;
  }

  const totalPages = Math.ceil(total / limit) || 0;
  const paginationMeta = {
    page,
    limit,
    total,
    totalPages,
  };

  const result = {
    page,
    limit,
    total,
    totalPages,
    pagination: paginationMeta,
  };

  if (items !== null) {
    result.data = items;
  }

  return result;
}

module.exports = { getPaginationParams, buildPaginationResponse };
