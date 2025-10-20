// ==================================================================================
// Checklists Route
// ==================================================================================
// POST /publish/documents/:docId/checklists - Submits checklist entries
// Stores checklist data (mock implementation for Final)
// ==================================================================================

import express from 'express';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { BadRequestError } from '../utils/errors.js';

const router = express.Router();

/**
 * POST /publish/documents/:docId/checklists
 * Accepts an array of checklist entries
 *
 * Request body:
 * {
 *   "version": "v2.0.0",
 *   "entries": [
 *     {
 *       "type": "QAC",
 *       "id": "CHK-QA-2025-004",
 *       "status": "Aprobada",
 *       "date": "2025-03-12"
 *     }
 *   ]
 * }
 *
 * Response:
 * {
 *   "status": "accepted",
 *   "docId": "PAS-L1-GOV-PRC-001",
 *   "version": "v2.0.0",
 *   "entriesCount": 1
 * }
 */
router.post('/:docId/checklists', async (req, res, next) => {
  try {
    const { docId } = req.params;
    const { version, entries } = req.body;

    // Validate required fields
    if (!version) {
      throw new BadRequestError('version is required');
    }

    if (!entries || !Array.isArray(entries)) {
      throw new BadRequestError('entries must be an array');
    }

    logger.info('Checklists submission received', { docId, version, entriesCount: entries.length });

    // Store checklist data to local filesystem (mock storage)
    const checklistData = {
      docId,
      version,
      entries,
      submittedAt: new Date().toISOString(),
    };

    // Save to s3-local/checklists/{docId}-{version}.json
    const checklistsDir = join(config.s3.localPath, 'checklists');
    if (!existsSync(checklistsDir)) {
      mkdirSync(checklistsDir, { recursive: true });
    }

    const checklistPath = join(checklistsDir, `${docId}-${version}.json`);
    writeFileSync(checklistPath, JSON.stringify(checklistData, null, 2));

    logger.info('Checklists stored', { path: checklistPath, entriesCount: entries.length });

    // Return success response
    res.json({
      status: 'accepted',
      docId,
      version,
      entriesCount: entries.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
