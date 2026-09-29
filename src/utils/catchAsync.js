/**
 * Wraps an async Express route handler to catch rejected promises
 * and forward them to the error-handling middleware.
 * Eliminates try-catch boilerplate in every route.
 *
 * Usage: router.get('/path', catchAsync(async (req, res) => { ... }));
 */
const catchAsync = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = catchAsync;
