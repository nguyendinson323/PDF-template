// ==================================================================================
// Health Check Route
// ==================================================================================
// Simple health check endpoint that returns service status
// No authentication required
// ==================================================================================

import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8')
);

// Store server start time
const serverStartTime = Date.now();

/**
 * GET /health
 * Returns service health status
 */
router.get('/', (req, res) => {
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);

  res.json({
    status: 'ok',
    service: packageJson.name,
    version: packageJson.version,
    environment: process.env.NODE_ENV || 'development',
    uptime: uptimeSeconds,
    timestamp: new Date().toISOString(),
    config: {
      s3UseLocal: process.env.S3_USE_LOCAL === 'true',
      tsaUseMock: process.env.TSA_USE_MOCK === 'true',
      authEnabled: process.env.AUTH_ENABLED === 'true'
    }
  });
});

export default router;
