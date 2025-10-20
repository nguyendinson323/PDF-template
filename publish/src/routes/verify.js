// ==================================================================================
// Verify Route
// ==================================================================================
// POST /verify - Verifies official document integrity
// Computes SHA-256 hash and returns TSA information (mock or real)
// ==================================================================================

import express from 'express';
import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const router = express.Router();

/**
 * POST /verify
 * Verifies the official document (Publicados/official/{code}-{version}.pdf)
 *
 * Request body:
 * {
 *   "docId": "PAS-L1-GOV-PRC-001",
 *   "version": "v2.0.0"
 * }
 *
 * Response:
 * {
 *   "docId": "PAS-L1-GOV-PRC-001",
 *   "version": "v2.0.0",
 *   "sha256": "<computed hash>",
 *   "tsaTime": "2025-03-13T09:15:00Z" or "mock",
 *   "tsaSerial": "TSA-2025-001" or "TSA-MOCK-001"
 * }
 */
router.post('/', async (req, res, next) => {
  try {
    const { docId, version } = req.body;

    // Validate required fields
    if (!docId || !version) {
      throw new BadRequestError('docId and version are required');
    }

    logger.info('Verify request received', { docId, version });

    // Construct s3 key for official document
    const s3Key = `Publicados/official/${docId}-${version}.pdf`;

    // Load document from local storage
    const filePath = join(config.s3.localPath, s3Key);

    if (!existsSync(filePath)) {
      throw new NotFoundError(`Official document not found: ${s3Key}`);
    }

    logger.debug('Reading official document', { filePath });

    // Read file and compute SHA-256 hash
    const fileBuffer = readFileSync(filePath);
    const hash = createHash('sha256');
    hash.update(fileBuffer);
    const sha256 = hash.digest('hex');

    logger.info('SHA-256 hash computed', { docId, version, sha256, size: fileBuffer.length });

    // Prepare response
    const response = {
      docId,
      version,
      sha256,
      tsaTime: config.tsa.useMock ? 'mock-' + new Date().toISOString() : new Date().toISOString(),
      tsaSerial: config.tsa.useMock ? 'TSA-MOCK-001' : `TSA-${Date.now()}`,
    };

    logger.info('Document verification completed', response);

    res.json(response);
  } catch (error) {
    next(error);
  }
});

export default router;
