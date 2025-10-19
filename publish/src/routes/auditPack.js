// ==================================================================================
// Audit Pack Route
// ==================================================================================
// POST /publish/documents/:docId/audit-pack - Generates audit pack
// Concatenates official document + checklist PDF samples
// ==================================================================================

import express from 'express';
import { PDFDocument } from 'pdf-lib';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

const router = express.Router();

/**
 * POST /publish/documents/:docId/audit-pack
 * Concatenates official document + checklist PDF samples
 *
 * Request body:
 * {
 *   "version": "v2.0.0"
 * }
 *
 * Response:
 * {
 *   "s3Key": "Publicados/audit-packs/PAS-L1-GOV-PRC-001-v2.0.0.pdf",
 *   "sizeBytes": 123456
 * }
 */
router.post('/:docId/audit-pack', async (req, res, next) => {
  try {
    const { docId } = req.params;
    const { version } = req.body;

    // Validate required fields
    if (!version) {
      throw new BadRequestError('version is required');
    }

    logger.info('Audit pack generation requested', { docId, version });

    // Load official document
    const officialS3Key = `Publicados/official/${docId}-${version}.pdf`;
    const officialPath = join(config.s3.localPath, officialS3Key);

    if (!existsSync(officialPath)) {
      throw new NotFoundError(`Official document not found: ${officialS3Key}`);
    }

    logger.debug('Loading official document', { path: officialPath });
    const officialBytes = readFileSync(officialPath);

    // Load checklist sample PDF
    const checklistSamplePath = join(process.cwd(), 'Pack', 'examples', 'checklists-sample.pdf');

    if (!existsSync(checklistSamplePath)) {
      logger.warn('Checklists sample PDF not found, skipping', { path: checklistSamplePath });
      // If no checklist sample, just use the official document
      var mergedBytes = officialBytes;
    } else {
      logger.debug('Loading checklists sample', { path: checklistSamplePath });
      const checklistBytes = readFileSync(checklistSamplePath);

      // Concatenate PDFs using pdf-lib
      logger.debug('Merging official document and checklists');

      const officialDoc = await PDFDocument.load(officialBytes);
      const checklistDoc = await PDFDocument.load(checklistBytes);

      // Copy all pages from checklist to official document
      const checklistPages = await officialDoc.copyPages(checklistDoc, checklistDoc.getPageIndices());
      checklistPages.forEach((page) => {
        officialDoc.addPage(page);
      });

      logger.info('PDFs concatenated', {
        officialPages: officialDoc.getPageCount() - checklistPages.length,
        checklistPages: checklistPages.length,
        totalPages: officialDoc.getPageCount(),
      });

      // Save merged PDF
      var mergedBytes = await officialDoc.save();
    }

    // Save to s3-local/Publicados/audit-packs/{docId}-{version}.pdf
    const auditPackS3Key = `Publicados/audit-packs/${docId}-${version}.pdf`;
    const auditPackPath = join(config.s3.localPath, auditPackS3Key);

    const auditPackDir = dirname(auditPackPath);
    if (!existsSync(auditPackDir)) {
      mkdirSync(auditPackDir, { recursive: true });
    }

    writeFileSync(auditPackPath, mergedBytes);

    logger.info('Audit pack generated', {
      s3Key: auditPackS3Key,
      path: auditPackPath,
      sizeBytes: mergedBytes.length,
    });

    // Return response
    res.json({
      s3Key: auditPackS3Key,
      sizeBytes: mergedBytes.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
