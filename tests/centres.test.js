const { app, request, cleanDatabase, createTestCentre, createTestDiagnosticTest, createTestCentreTest } = require('./helpers');

describe('Centres API', () => {
  let centre1, centre2, test1, test2;

  beforeEach(async () => {
    await cleanDatabase();
    
    // Seed 2 centres
    centre1 = await createTestCentre({ name: 'Alpha Lab', city: 'Mumbai' });
    centre2 = await createTestCentre({ name: 'Beta Lab', city: 'Delhi' });
    
    // Seed tests
    test1 = await createTestDiagnosticTest({ testCode: 'T1' });
    test2 = await createTestDiagnosticTest({ testCode: 'T2' });
    
    // Associate tests
    await createTestCentreTest(centre1.id, test1.id);
    await createTestCentreTest(centre1.id, test2.id);
    await createTestCentreTest(centre2.id, test2.id);
  });

  describe('GET /api/v1/centres', () => {
    it('should list all active centres', async () => {
      const res = await request(app).get('/api/v1/centres');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination (page, limit)', async () => {
      const res = await request(app).get('/api/v1/centres?page=1&limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.limit).toBe(1);
    });

    it('should filter by city', async () => {
      const res = await request(app).get('/api/v1/centres?city=Mumbai');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].city).toBe('Mumbai');
    });

    it('should return empty array for non-matching city', async () => {
      const res = await request(app).get('/api/v1/centres?city=Chennai');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('should include pagination metadata', async () => {
      const res = await request(app).get('/api/v1/centres');
      expect(res.status).toBe(200);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('totalPages');
    });
  });

  describe('GET /api/v1/centres/:id', () => {
    it('should get centre by ID with tests', async () => {
      const res = await request(app).get(`/api/v1/centres/${centre1.id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(centre1.id);
    });

    it('should return 404 for non-existent ID', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/centres/${fakeId}`);
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid UUID format', async () => {
      const res = await request(app).get('/api/v1/centres/invalid-uuid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/centres/:id/tests', () => {
    it('should list tests at a centre', async () => {
      const res = await request(app).get(`/api/v1/centres/${centre1.id}/tests`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/v1/centres/${centre1.id}/tests?limit=1`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should return 404 for non-existent centre', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/centres/${fakeId}/tests`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/v1/tests', () => {
    it('should list all diagnostic tests', async () => {
      const res = await request(app).get('/api/v1/tests');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('should support pagination', async () => {
      const res = await request(app).get('/api/v1/tests?limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('GET /api/v1/tests/:id/centres', () => {
    it('should list centres offering a test', async () => {
      const res = await request(app).get(`/api/v1/tests/${test2.id}/centres`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('should return 404 for non-existent test', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/v1/tests/${fakeId}/centres`);
      expect(res.status).toBe(404);
    });
  });
});
