# Developer Cheat Sheet & Live Coding Survival Guide
> **For EVE Healthcare SDE Intern Live Technical Interview**

---

## Part 1: How the System Works (Mental Model in 60 Seconds)

When an HTTP request hits the backend:
```
Client Request
      │
      ▼
1. Express App (`src/app.js`) ──> Applies Helmet (security), CORS, JSON parser, Winston Request Logger
      │
      ▼
2. Rate Limiter (`src/middleware/rateLimiter.js`) ──> Blocks IP if exceeding limits (auth endpoints stricter: 5 req/15 min)
      │
      ▼
3. Router (`src/routes/*.routes.js`) ──> Matches URL (e.g., `POST /api/v1/bookings`)
      │
      ├──> Auth Middleware (`src/middleware/auth.js`) [if protected]
      │      Verifies Bearer JWT -> finds active user in DB -> attaches user object to `req.user = { id, email, fullName }`
      │
      ├──> Validation Middleware (`src/middleware/validate.js`) [if schema defined]
      │      Runs Zod schema -> validates inputs -> attaches parsed/sanitized payload to `req.validatedBody`
      │
      ▼
4. Route Handler (`catchAsync`) ──> Wraps async calls to catch any uncaught exceptions & forward to `errorHandler`
      │
      ▼
5. Service Layer (`src/services/*.service.js`) ──> PURE BUSINESS LOGIC & PRISMA DB QUERIES
      │   - Checks business invariants (e.g., booking must be PENDING, date in future)
      │   - Runs atomic DB transactions via `prisma.$transaction(...)`
      │   - Checks/updates Redis cache via `cacheGet`/`cacheSet`
      │
      ▼
6. Response / Error Handler:
      - Success: Returns `{ success: true, data: result }` (or `{ success: true, ...pagination, data: items }`)
      - Failure: Thrown `ApiError` is caught by `src/middleware/errorHandler.js` -> Returns `{ success: false, error: { message, code } }` with appropriate HTTP status code (400, 401, 403, 404, 409, 500)
```

---

## Part 2: The "5-Minute Architecture Defense" (What to Say to Interviewers)

### Q1: "Why did you use Node.js, Express, and PostgreSQL with Prisma instead of MongoDB?"
> **Answer to give:**
> *"Diagnostic bookings and payments require strong ACID consistency, strict foreign-key integrity, and financial accuracy. Relational modeling prevents orphaned records (e.g. bookings pointing to deleted tests or centres) and allows us to use atomic database transactions for payments. Prisma was chosen over Mongoose because it provides schema migrations, type-safe queries, relation mapping, and prevents SQL injection out of the box."*

### Q2: "How did you implement Webhook Idempotency and why is it important?"
> **Answer to give:**
> *"Payment gateways like Stripe or Razorpay guarantee at-least-once delivery, meaning network retries can send the exact same webhook payload multiple times. To guarantee idempotency:*
> *1. We store a unique `eventId` in the `WebhookEvent` table.*
> *2. Inside an atomic `prisma.$transaction`, we check if the `eventId` has already been processed. If yes, we immediately return a 200 OK no-op.*
> *3. We check if the payment is already in a terminal state (`SUCCESS` or `FAILED`).*
> *4. Only if unprocessed do we update the payment and booking status and mark `processed: true` with a timestamp.*
> *5. We verify the payload with an HMAC-SHA256 signature header (`x-webhook-signature`) against our shared webhook secret before processing."*

### Q3: "How do you handle race conditions or concurrent updates on Bookings?"
> **Answer to give:**
> *"We implemented Optimistic Concurrency Control using an integer `version` field on the `Booking` model. When updating a booking (e.g., during cancellation or payment confirmation), we run `updateMany` where `id = bookingId` AND `version = currentVersion`, incrementing the version by 1. If two concurrent requests try to update the same booking simultaneously, one succeeds and the other updates 0 rows, triggering a 409 Conflict error without holding expensive pessimistic database locks."*

### Q4: "What is your caching strategy?"
> **Answer to give:**
> *"We use Redis with a Cache-Aside pattern for read-heavy, low-churn diagnostic centre catalogues and test lists. The cache uses a configurable TTL (default 300s). In case Redis is down or unreachable, our Redis module gracefully catches connection errors, logs a warning, and falls back directly to PostgreSQL without crashing the user request."*

---

## Part 3: Live Coding Recipes (Copy & Paste Ready)

During the live coding round, the interviewer will typically ask you to make a small change live. Here are the 6 most common requests and the exact changes:

---

### Scenario 1: "Add a Cancellation Reason to Bookings"

**Step 1:** Open `prisma/schema.prisma` and add `cancellationReason` to `model Booking`:
```prisma
model Booking {
  // ... existing fields ...
  cancellationReason String? @map("cancellation_reason")
}
```
Run in terminal: `npx prisma db push`

**Step 2:** Open `src/routes/bookings.routes.js`:
Add cancellation schema:
```javascript
const cancelBookingSchema = z.object({
  body: z.object({
    reason: z.string().min(3).max(255).optional(),
  }),
});
```
Update route:
```javascript
router.patch('/:id/cancel', validate(cancelBookingSchema), catchAsync(async (req, res) => {
  const reason = req.validatedBody ? req.validatedBody.reason : undefined;
  const booking = await bookingsService.cancelBooking(req.params.id, req.user.id, reason);
  res.status(200).json({ success: true, message: 'Booking cancelled successfully', data: booking });
}));
```

**Step 3:** Open `src/services/bookings.service.js`:
Update `cancelBooking` function:
```javascript
const cancelBooking = async (bookingId, userId, reason) => {
  // ... existing checks ...
  const updateResult = await prisma.booking.updateMany({
    where: { id: bookingId, version: booking.version },
    data: {
      status: 'CANCELLED',
      cancellationReason: reason || 'Cancelled by user',
      version: { increment: 1 },
    }
  });
  // ...
};
```

---

### Scenario 2: "Add a Discount Code / Coupon System to Bookings"

**Step 1:** Open `src/routes/bookings.routes.js`:
Add `discountCode` to `createBookingSchema`:
```javascript
const createBookingSchema = z.object({
  body: z.object({
    centreTestId: z.string().uuid(),
    appointmentDate: z.string().datetime(),
    discountCode: z.string().optional(), // <-- ADD THIS
  }),
});
```

**Step 2:** Open `src/services/bookings.service.js`:
In `createBooking`:
```javascript
const createBooking = async (userId, { centreTestId, appointmentDate, discountCode }) => {
  // ... existing checks ...
  let finalPrice = Number(centreTest.price);
  
  // Apply discount logic:
  if (discountCode === 'SAVE10') {
    finalPrice = finalPrice * 0.9; // 10% off
  } else if (discountCode === 'FLAT100') {
    finalPrice = Math.max(0, finalPrice - 100); // 100 INR off
  }

  const booking = await prisma.booking.create({
    data: {
      userId,
      centreTestId,
      appointmentDate: appointment,
      amount: finalPrice, // <-- Uses discounted price
      status: 'PENDING',
    },
    // ...
  });
  return booking;
};
```

---

### Scenario 3: "Prevent Duplicate Bookings for the Same User at the Same Time"

**Step:** In `src/services/bookings.service.js`, inside `createBooking`:
```javascript
// Add this check right before prisma.booking.create:
const existingSlot = await prisma.booking.findFirst({
  where: {
    userId,
    appointmentDate: appointment,
    status: { in: ['PENDING', 'CONFIRMED'] },
  },
});

if (existingSlot) {
  throw ApiError.conflict('You already have an appointment scheduled for this exact time');
}
```

---

### Scenario 4: "Filter Bookings by Date Range (`fromDate` and `toDate`)"

**Step 1:** Open `src/services/bookings.service.js`:
Update `getUserBookings`:
```javascript
const getUserBookings = async (userId, { page, limit, skip, status, fromDate, toDate }) => {
  const where = { userId };
  if (status) where.status = status;
  
  // Add date range filtering:
  if (fromDate || toDate) {
    where.appointmentDate = {};
    if (fromDate) where.appointmentDate.gte = new Date(fromDate);
    if (toDate) where.appointmentDate.lte = new Date(toDate);
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
    prisma.booking.count({ where })
  ]);
  return { bookings, total };
};
```

**Step 2:** In `src/routes/bookings.routes.js`:
Pass `fromDate` and `toDate` from `req.query`:
```javascript
router.get('/', catchAsync(async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { status, fromDate, toDate } = req.query;
  const { bookings, total } = await bookingsService.getUserBookings(req.user.id, {
    page, limit, skip, status, fromDate, toDate
  });
  // ...
}));
```

---

### Scenario 5: "Add a New Endpoint: `GET /api/v1/bookings/stats` (User Booking Summary)"

**Step 1:** In `src/services/bookings.service.js`:
Add:
```javascript
const getBookingStats = async (userId) => {
  const [total, pending, confirmed, cancelled] = await Promise.all([
    prisma.booking.count({ where: { userId } }),
    prisma.booking.count({ where: { userId, status: 'PENDING' } }),
    prisma.booking.count({ where: { userId, status: 'CONFIRMED' } }),
    prisma.booking.count({ where: { userId, status: 'CANCELLED' } }),
  ]);
  return { total, pending, confirmed, cancelled };
};

module.exports = {
  // ...
  getBookingStats,
};
```

**Step 2:** In `src/routes/bookings.routes.js`:
**IMPORTANT:** Place this route *BEFORE* `GET /:id`!
```javascript
router.get('/stats', catchAsync(async (req, res) => {
  const stats = await bookingsService.getBookingStats(req.user.id);
  res.status(200).json({ success: true, data: stats });
}));
```

---

### Scenario 6: "Add Soft Deletion / Deactivate a Diagnostic Centre"

**Step 1:** In `src/services/centres.service.js`:
```javascript
const deactivateCentre = async (id) => {
  const centre = await prisma.diagnosticCentre.findUnique({ where: { id } });
  if (!centre) throw ApiError.notFound('Centre not found');
  
  const updated = await prisma.diagnosticCentre.update({
    where: { id },
    data: { isActive: false },
  });

  // Invalidate Redis cache
  const { cacheDel } = require('../redis');
  await cacheDel(`centres:${id}`);

  return updated;
};
```

---

## Part 4: Live Interview Gotchas & Traps (DO NOT FALL FOR THESE)

1. **The Route Order Trap:**
   In Express, routes match from top to bottom. If you define `GET /api/v1/bookings/:id` and then define `GET /api/v1/bookings/stats`, requests to `/bookings/stats` will treat `'stats'` as the `:id` parameter and throw a UUID validation error! **Always define specific static routes (`/stats`, `/summary`) before parameterized routes (`/:id`).**

2. **The Missing `await` Trap:**
   Prisma query methods (`findUnique`, `create`, `update`, `$transaction`) return Promises! If you write `const booking = prisma.booking.findUnique(...)` without `await`, `booking` will be a Promise object, your `if (!booking)` check will evaluate to false, and you will introduce silent bugs.

3. **The Date Formatting Trap:**
   In Zod, `z.string().datetime()` requires strict ISO-8601 strings (e.g. `'2026-10-15T10:00:00.000Z'`). If testing with Postman or Curl, make sure the string ends with `Z`.

4. **The Response Envelope Pattern:**
   All successful endpoints in this codebase follow this exact structure:
   - Single item: `res.status(200).json({ success: true, data: result });`
   - Created: `res.status(201).json({ success: true, data: result });`
   - Paginated list: `res.status(200).json({ success: true, data: items, pagination: { page, limit, total, totalPages } });`

5. **The Error Throwing Pattern:**
   Never send manual error responses like `res.status(400).json(...)` inside service functions. Always throw `ApiError`:
   - `throw ApiError.badRequest('Reason message');` (400)
   - `throw ApiError.unauthorized('Not authenticated');` (401)
   - `throw ApiError.forbidden('Forbidden access');` (403)
   - `throw ApiError.notFound('Resource not found');` (404)
   - `throw ApiError.conflict('Already exists');` (409)

---

## Part 5: Cheat Sheet of Useful Commands

| Task | Command |
|------|---------|
| Start dev server | `npm run dev` |
| Run all tests | `npm test` |
| Run single test file | `npx jest tests/payments.test.js` |
| View DB in browser GUI | `npx prisma studio` |
| Apply schema changes to DB | `npx prisma db push` |
| Reset & reseed DB | `npm run db:seed` |
| Inspect Docker containers | `docker-compose ps` |
| View app logs in Docker | `docker-compose logs -f app` |
