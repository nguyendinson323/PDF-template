const crypto = require('crypto');
const config = require('../config/config');
const logger = require('../utils/logger');

// In-memory store for idempotency keys
// In production, use Redis or similar distributed cache
class IdempotencyStore {
  constructor() {
    this.store = new Map();
    this.ttl = config.service.idempotencyTtlSeconds * 1000; // Convert to ms

    // Cleanup expired entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  // Generate hash of payload for comparison
  hashPayload(payload) {
    const str = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return crypto.createHash('sha256').update(str).digest('hex');
  }

  // Store idempotency key with payload hash
  set(key, payloadHash, response) {
    this.store.set(key, {
      payloadHash,
      response,
      timestamp: Date.now(),
    });
  }

  // Get stored entry for idempotency key
  get(key) {
    const entry = this.store.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry;
  }

  // Check if key exists and payload matches
  check(key, payloadHash) {
    const entry = this.get(key);

    if (!entry) {
      return { exists: false };
    }

    if (entry.payloadHash !== payloadHash) {
      return { exists: true, match: false };
    }

    return { exists: true, match: true, response: entry.response };
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.store.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired idempotency keys`);
    }
  }

  // Get store size (for metrics)
  size() {
    return this.store.size;
  }
}

// Singleton instance
const idempotencyStore = new IdempotencyStore();

// Idempotency middleware
function idempotency(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'];

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Idempotency-Key header is required',
    });
  }

  // Validate key format (should be UUID or similar)
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(idempotencyKey)) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Invalid Idempotency-Key format (expected 8-128 alphanumeric characters)',
    });
  }

  // Hash the request payload
  const payloadHash = idempotencyStore.hashPayload(req.body);

  // Check if key exists
  const check = idempotencyStore.check(idempotencyKey, payloadHash);

  if (check.exists && !check.match) {
    // Same key, different payload - conflict
    logger.warn('Idempotency conflict detected', {
      idempotencyKey,
      path: req.path,
    });

    return res.status(409).json({
      error: 'Conflict',
      message: 'Idempotency key already used with different payload',
    });
  }

  if (check.exists && check.match) {
    // Same key, same payload - return cached response
    logger.info('Idempotent request detected, returning cached response', {
      idempotencyKey,
      path: req.path,
    });

    return res.status(check.response.status).json(check.response.body);
  }

  // New request - store key and continue
  req.idempotencyKey = idempotencyKey;
  req.payloadHash = payloadHash;

  // Intercept response to cache it
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    // Store response for future idempotent requests
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(idempotencyKey, payloadHash, {
        status: res.statusCode,
        body,
      });
    }
    return originalJson(body);
  };

  next();
}

module.exports = {
  idempotency,
  idempotencyStore,
};
