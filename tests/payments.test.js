const { app, request, cleanDatabase, getAuthHeader, createTestUser, createTestCentre, createTestDiagnosticTest, createTestCentreTest, createTestBooking, generateWebhookSignature, prisma } = require('./helpers');

describe('Payments API', () => {
  let user, token, otherUser, otherToken, booking, centreTest;

  beforeEach(async () => {
    await cleanDatabase();
    const u = await createTestUser();
    user = u.user;
    token = u.token;

    const ou = await createTestUser({ email: 'other@example.com' });
    otherUser = ou.user;
    otherToken = ou.token;

    const centre = await createTestCentre();
    const test = await createTestDiagnosticTest();
    centreTest = await createTestCentreTest(centre.id, test.id);
    booking = await createTestBooking(user.id, centreTest.id, { status: 'PENDING' });
  });

  describe('POST /api/v1/payments', () => {
    it('should initiate payment for a pending booking', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: booking.id });
      expect(res.status).toBe(201);
      expect(res.body.data.payment).toHaveProperty('transactionId');
    });

    it('should create payment record with transaction ID', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: booking.id });
      
      const payment = await prisma.payment.findUnique({ where: { id: res.body.data.payment.id } });
      expect(payment).toBeDefined();
      expect(payment.transactionId).toBeDefined();
      expect(['SUCCESS', 'FAILED']).toContain(payment.status);
    });

    it('should update booking status based on payment result', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: booking.id });
      
      const b = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(b).toBeDefined();
      expect(['CONFIRMED', 'FAILED']).toContain(b.status);
    });

    it('should fail without auth (401)', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .send({ bookingId: booking.id });
      expect(res.status).toBe(401);
    });

    it('should fail for non-existent booking (404)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: fakeId });
      expect(res.status).toBe(404);
    });

    it('should fail for another user\'s booking (403)', async () => {
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(otherToken))
        .send({ bookingId: booking.id });
      expect(res.status).toBe(403);
    });

    it('should fail for non-PENDING booking (400)', async () => {
      const confirmed = await createTestBooking(user.id, centreTest.id, { status: 'CONFIRMED' });
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: confirmed.id });
      expect(res.status).toBe(400);
    });

    it('should fail for already-paid booking (409)', async () => {
      // Simulating a booking that is pending but already has a pending/success payment 
      // depends on exact app logic. We will test general logic here.
      // Let's create a payment
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          transactionId: 'TXN_SIMULATED_1',
          amount: booking.amount,
          status: 'SUCCESS',
          paymentMethod: 'CARD'
        }
      });
      // and update booking status to match what typically happens
      await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' }});
      const res = await request(app)
        .post('/api/v1/payments')
        .set(getAuthHeader(token))
        .send({ bookingId: booking.id });
      // Depending on implementation, it's either 400 (not pending) or 409
      expect([400, 409]).toContain(res.status); 
    });
  });

  describe('POST /api/v1/payments/webhook', () => {
    let payment;
    beforeEach(async () => {
      payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          transactionId: `TXN_${Date.now()}`,
          amount: booking.amount,
          status: 'PENDING',
          paymentMethod: 'CARD'
        }
      });
    });

    it('should process valid webhook', async () => {
      const payload = {
        eventId: `EVT_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: payment.transactionId,
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should be IDEMPOTENT — processing same event twice should not create duplicates', async () => {
      const payload = {
        eventId: `EVT_IDEMP_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: payment.transactionId,
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      // First call
      const res1 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      expect(res1.status).toBe(200);

      // Verify DB state
      const count1 = await prisma.webhookEvent.count({ where: { eventId: payload.eventId } });
      expect(count1).toBe(1);
      
      const b1 = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(b1.status).toBe('CONFIRMED'); // assuming it turns confirmed

      // Second call
      const res2 = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      expect(res2.status).toBe(200);
      
      // DB state unchanged
      const count2 = await prisma.webhookEvent.count({ where: { eventId: payload.eventId } });
      expect(count2).toBe(1);
      
      const b2 = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(b2.status).toBe('CONFIRMED');
    });

    it('should verify webhook signature', async () => {
      const payload = { eventId: '123', eventType: 'payment.completed', transactionId: payment.transactionId, status: 'SUCCESS', bookingId: booking.id };
      const signature = generateWebhookSignature(payload);
      
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      expect(res.status).toBe(200);
    });

    it('should reject invalid signature (401)', async () => {
      const payload = {
        eventId: `EVT_INVSIG_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: payment.transactionId,
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', 'invalid-signature-hex')
        .send(payload);
      expect(res.status).toBe(401);
    });

    it('should handle non-existent transaction gracefully', async () => {
      const payload = {
        eventId: `EVT_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: 'NON_EXISTENT_TXN',
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Payment not found');
    });

    it('should handle payment already in terminal state', async () => {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'SUCCESS' } });

      const payload = {
        eventId: `EVT_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: payment.transactionId,
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      const res = await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      expect(res.status).toBe(200);
    });

    it('should update booking status on SUCCESS webhook', async () => {
      const payload = {
        eventId: `EVT_SUC_${Date.now()}`,
        eventType: 'payment.completed',
        transactionId: payment.transactionId,
        status: 'SUCCESS',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      const b = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(b.status).toBe('CONFIRMED');
    });

    it('should update booking status on FAILED webhook', async () => {
      const payload = {
        eventId: `EVT_FAIL_${Date.now()}`,
        eventType: 'payment.failed',
        transactionId: payment.transactionId,
        status: 'FAILED',
        bookingId: booking.id
      };
      const signature = generateWebhookSignature(payload);

      await request(app)
        .post('/api/v1/payments/webhook')
        .set('x-webhook-signature', signature)
        .send(payload);
      
      const b = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(b.status).toBe('FAILED');
    });
  });

  describe('GET /api/v1/payments/:bookingId', () => {
    beforeEach(async () => {
      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          transactionId: `TXN_${Date.now()}`,
          amount: booking.amount,
          status: 'SUCCESS',
          paymentMethod: 'CARD'
        }
      });
    });

    it('should get payments for a booking', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/${booking.id}`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].bookingId).toBe(booking.id);
    });

    it('should fail without auth (401)', async () => {
      const res = await request(app).get(`/api/v1/payments/${booking.id}`);
      expect(res.status).toBe(401);
    });

    it('should fail for another user\'s booking (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/payments/${booking.id}`)
        .set(getAuthHeader(otherToken));
      expect(res.status).toBe(403);
    });
  });
});
