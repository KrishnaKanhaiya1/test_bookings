const { app, request, cleanDatabase, getAuthHeader, createTestUser } = require('./helpers');

describe('Auth API', () => {
  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('POST /api/v1/auth/signup', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'new@example.com', password: 'password123', fullName: 'New User' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toHaveProperty('id');
      expect(res.body.data.user.email).toBe('new@example.com');
      expect(res.body.data).toHaveProperty('token');
    });

    it('should return JWT token on signup', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'token@example.com', password: 'password123', fullName: 'Token User' });
      expect(res.body.data.token).toBeDefined();
    });

    it('should fail with duplicate email (409)', async () => {
      await createTestUser({ email: 'dup@example.com' });
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'dup@example.com', password: 'password123', fullName: 'Dup User' });
      expect(res.status).toBe(409);
    });

    it('should fail with invalid email format (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'invalid-email', password: 'password123', fullName: 'Invalid' });
      expect(res.status).toBe(400);
    });

    it('should fail with short password < 8 chars (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'short@example.com', password: 'short', fullName: 'Short' });
      expect(res.status).toBe(400);
    });

    it('should fail with missing required fields (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({ email: 'missing@example.com' });
      expect(res.status).toBe(400);
    });

    it('should fail with empty body (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/signup')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const { password, user } = await createTestUser();
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password });
      expect(res.status).toBe(200);
      expect(res.body.data.user.id).toBe(user.id);
    });

    it('should return JWT token on login', async () => {
      const { password, user } = await createTestUser();
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password });
      expect(res.body.data.token).toBeDefined();
    });

    it('should fail with wrong password (401)', async () => {
      const { user } = await createTestUser();
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('should fail with non-existent email (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'none@example.com', password: 'password123' });
      expect(res.status).toBe(401);
    });

    it('should fail with missing fields (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'some@example.com' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return current user profile', async () => {
      const { user, token } = await createTestUser();
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(getAuthHeader(token));
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(user.id);
    });

    it('should fail without auth token (401)', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should fail with invalid token (401)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(getAuthHeader('invalid.token.here'));
      expect(res.status).toBe(401);
    });

    it('should fail with expired token (401)', async () => {
      // Mocking an expired token
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign({ id: 'some-uuid' }, process.env.JWT_SECRET, { expiresIn: '-1h' });
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set(getAuthHeader(expiredToken));
      expect(res.status).toBe(401);
    });
  });
});
