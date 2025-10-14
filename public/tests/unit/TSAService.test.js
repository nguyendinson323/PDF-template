const TSAService = require('../../src/services/TSAService');
const crypto = require('crypto');

describe('TSAService', () => {
  let tsaService;

  beforeEach(() => {
    tsaService = new TSAService();
  });

  describe('computeHash', () => {
    it('should compute SHA-256 hash of buffer', () => {
      const testData = Buffer.from('test data');
      const hash = tsaService.computeHash(testData);

      expect(hash).toBeInstanceOf(Buffer);
      expect(hash.length).toBe(32); // SHA-256 produces 32 bytes
    });

    it('should produce consistent hashes', () => {
      const testData = Buffer.from('test data');
      const hash1 = tsaService.computeHash(testData);
      const hash2 = tsaService.computeHash(testData);

      expect(hash1.equals(hash2)).toBe(true);
    });
  });

  describe('computeHashHex', () => {
    it('should return hex string of hash', () => {
      const testData = Buffer.from('test data');
      const hashHex = tsaService.computeHashHex(testData);

      expect(typeof hashHex).toBe('string');
      expect(hashHex.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]{64}$/.test(hashHex)).toBe(true);
    });
  });

  describe('generateTSARequest', () => {
    it('should generate valid TSA request', () => {
      const testHash = crypto.randomBytes(32);
      const nonce = BigInt(12345);

      const tsaRequest = tsaService.generateTSARequest(testHash, nonce);

      expect(tsaRequest).toBeInstanceOf(Buffer);
      expect(tsaRequest.length).toBeGreaterThan(0);
    });

    it('should generate request without nonce', () => {
      const testHash = crypto.randomBytes(32);

      const tsaRequest = tsaService.generateTSARequest(testHash);

      expect(tsaRequest).toBeInstanceOf(Buffer);
      expect(tsaRequest.length).toBeGreaterThan(0);
    });
  });

  describe('sleep', () => {
    it('should sleep for specified duration', async () => {
      const start = Date.now();
      await tsaService.sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(200);
    });
  });
});
