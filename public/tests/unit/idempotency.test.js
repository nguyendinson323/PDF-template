const { idempotencyStore } = require('../../src/middleware/idempotency');

describe('IdempotencyStore', () => {
  beforeEach(() => {
    // Clear store before each test
    idempotencyStore.store.clear();
  });

  describe('hashPayload', () => {
    it('should hash object payload', () => {
      const payload = { test: 'data', number: 123 };
      const hash = idempotencyStore.hashPayload(payload);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex
    });

    it('should hash string payload', () => {
      const payload = 'test string';
      const hash = idempotencyStore.hashPayload(payload);

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64);
    });

    it('should produce same hash for identical payloads', () => {
      const payload = { test: 'data' };
      const hash1 = idempotencyStore.hashPayload(payload);
      const hash2 = idempotencyStore.hashPayload(payload);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different payloads', () => {
      const payload1 = { test: 'data1' };
      const payload2 = { test: 'data2' };
      const hash1 = idempotencyStore.hashPayload(payload1);
      const hash2 = idempotencyStore.hashPayload(payload2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('set and get', () => {
    it('should store and retrieve entry', () => {
      const key = 'test-key';
      const payloadHash = 'hash123';
      const response = { status: 200, body: { result: 'success' } };

      idempotencyStore.set(key, payloadHash, response);
      const entry = idempotencyStore.get(key);

      expect(entry).toBeDefined();
      expect(entry.payloadHash).toBe(payloadHash);
      expect(entry.response).toEqual(response);
    });

    it('should return null for non-existent key', () => {
      const entry = idempotencyStore.get('non-existent');
      expect(entry).toBeNull();
    });

    it('should include timestamp in entry', () => {
      const key = 'test-key';
      const payloadHash = 'hash123';
      const response = { status: 200, body: {} };
      const beforeTime = Date.now();

      idempotencyStore.set(key, payloadHash, response);
      const entry = idempotencyStore.get(key);
      const afterTime = Date.now();

      expect(entry.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('check', () => {
    it('should return exists: false for new key', () => {
      const result = idempotencyStore.check('new-key', 'hash123');

      expect(result.exists).toBe(false);
      expect(result.match).toBeUndefined();
      expect(result.response).toBeUndefined();
    });

    it('should return exists: true, match: true for matching payload', () => {
      const key = 'test-key';
      const payloadHash = 'hash123';
      const response = { status: 200, body: {} };

      idempotencyStore.set(key, payloadHash, response);
      const result = idempotencyStore.check(key, payloadHash);

      expect(result.exists).toBe(true);
      expect(result.match).toBe(true);
      expect(result.response).toEqual(response);
    });

    it('should return exists: true, match: false for different payload', () => {
      const key = 'test-key';
      const payloadHash1 = 'hash123';
      const payloadHash2 = 'hash456';
      const response = { status: 200, body: {} };

      idempotencyStore.set(key, payloadHash1, response);
      const result = idempotencyStore.check(key, payloadHash2);

      expect(result.exists).toBe(true);
      expect(result.match).toBe(false);
    });
  });

  describe('size', () => {
    it('should return correct store size', () => {
      expect(idempotencyStore.size()).toBe(0);

      idempotencyStore.set('key1', 'hash1', {});
      expect(idempotencyStore.size()).toBe(1);

      idempotencyStore.set('key2', 'hash2', {});
      expect(idempotencyStore.size()).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should not remove fresh entries', () => {
      const key = 'test-key';
      idempotencyStore.set(key, 'hash123', {});

      idempotencyStore.cleanup();

      expect(idempotencyStore.get(key)).not.toBeNull();
    });

    it('should remove expired entries', () => {
      const key = 'test-key';
      idempotencyStore.set(key, 'hash123', {});

      // Manually set old timestamp
      const entry = idempotencyStore.store.get(key);
      entry.timestamp = Date.now() - idempotencyStore.ttl - 1000;

      idempotencyStore.cleanup();

      expect(idempotencyStore.get(key)).toBeNull();
    });
  });
});
