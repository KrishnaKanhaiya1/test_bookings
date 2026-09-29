const { app, request, cleanDatabase, getAuthHeader, createTestUser, createTestCentre, createTestDiagnosticTest, createTestCentreTest, createTestBooking, prisma } = require('./helpers');

describe('Bookings API', () => {
  let user, token, centreTest, otherUser, otherToken;

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
    centreTest = await createTestCentreTest(centre.id, test.id, { price: 1500 });
  });

  describe('POST /api/v1/bookings', () => {
    it('should create a booking', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({
          centreTestId: centreTest.id,
          appointmentDate: futureDate.toISOString()
        });

      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
    });

    it('should set initial status to PENDING', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({
          centreTestId: centreTest.id,
          appointmentDate: futureDate.toISOString()
        });

      expect(res.body.data.status).toBe('PENDING');
    });

    it('should copy price from centre test to booking amount', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({
          centreTestId: centreTest.id,
          appointmentDate: futureDate.toISOString()
        });

      expect(Number(res.body.data.amount)).toBe(1500);
    });

    it('should fail without auth (401)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .send({ centreTestId: centreTest.id, appointmentDate: new Date().toISOString() });
      expect(res.status).toBe(401);
    });

    it('should fail with non-existent centreTestId (404)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({ centreTestId: fakeId, appointmentDate: futureDate.toISOString() });
      expect(res.status).toBe(404);
    });

    it('should fail with past appointment date (400)', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 2);

      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({ centreTestId: centreTest.id, appointmentDate: pastDate.toISOString() });
      expect(res.status).toBe(400);
    });

    it('should fail with invalid centreTestId format (400)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({ centreTestId: 'invalid-id', appointmentDate: new Date().toISOString() });
      expect(res.status).toBe(400);
    });

    it('should fail with missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/v1/bookings')
        .set(getAuthHeader(token))
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/bookings', () => {
    beforeEach(async () => {
      await createTestBooking(user.id, centreTest.id, { status: 'PENDING' });
      await createTestBooking(user.id, centreTest.id, { status: 'CONFIRMED' });
      await createTestBooking(otherUser.id, centreTest.id, { status: 'PENDING' });
    });

    it('should list user\'s bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should support status filter', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?status=CONFIRMED')
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].status).toBe('CONFIRMED');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/v1/bookings?limit=1')
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination).toBeDefined();
    });

    it('should not show other users\' bookings', async () => {
      const res = await request(app)
        .get('/api/v1/bookings')
        .set(getAuthHeader(token));
      expect(res.body.data.every(b => b.userId === user.id)).toBe(true);
    });

    it('should fail without auth (401)', async () => {
      const res = await request(app).get('/api/v1/bookings');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/bookings/:id', () => {
    let booking;
    beforeEach(async () => {
      booking = await createTestBooking(user.id, centreTest.id);
    });

    it('should get booking by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(booking.id);
    });

    it('should fail for another user\'s booking (403)', async () => {
      const res = await request(app)
        .get(`/api/v1/bookings/${booking.id}`)
        .set(getAuthHeader(otherToken));
      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent booking', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/bookings/${fakeId}`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/v1/bookings/:id/cancel', () => {
    let booking;
    beforeEach(async () => {
      booking = await createTestBooking(user.id, centreTest.id, { status: 'PENDING' });
    });

    it('should cancel a PENDING booking', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
    });

    it('should set status to CANCELLED', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set(getAuthHeader(token));
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('should fail to cancel a CONFIRMED booking (400)', async () => {
      const confirmedBooking = await createTestBooking(user.id, centreTest.id, { status: 'CONFIRMED' });
      const res = await request(app)
        .patch(`/api/v1/bookings/${confirmedBooking.id}/cancel`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(400);
    });

    it('should fail to cancel another user\'s booking (403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/bookings/${booking.id}/cancel`)
        .set(getAuthHeader(otherToken));
      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent booking', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .patch(`/api/v1/bookings/${fakeId}/cancel`)
        .set(getAuthHeader(token));
      expect(res.status).toBe(404);
    });
  });
});
