const request = require('supertest');
const app = require('../../src/server');

describe('Health Endpoint', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer mock-token'); // Mock JWT for test

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');
    });

    it('should include S3 and TSA checks', async () => {
      const response = await request(app)
        .get('/health')
        .set('Authorization', 'Bearer mock-token');

      expect(response.body.checks).toHaveProperty('s3');
      expect(response.body.checks).toHaveProperty('tsa');
    });
  });

  describe('GET /', () => {
    it('should return service info', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('status');
      expect(response.body.service).toBe('Document Control Microservice');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app).get('/unknown-endpoint');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toBe('NotFound');
    });
  });
});
