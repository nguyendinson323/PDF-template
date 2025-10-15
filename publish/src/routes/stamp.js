// ==================================================================================
// Stamp Route
// ==================================================================================
// POST /stamp - Generate stamped PDF from S3 body reference
// ==================================================================================

import express from 'express';
import { validateDTO, generateStampedPath } from '../utils/dtoValidator.js';
import { downloadFile, uploadFile } from '../services/s3Service.js';
import { generateCover } from '../services/coverGenerator.js';
import { applyHeaderFooter } from '../services/headerFooterService.js';
import { mergePDFs } from '../services/pdfMerger.js';
import { ValidationError } from '../utils/errors.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /stamp
 * Generate stamped PDF from S3 body reference
 */
router.post('/', async (req, res, next) => {
  const startTime = Date.now();

  try {
    const dto = req.body;

    logger.info('Stamp request received', { docId: dto?.document?.code });

    // Validate DTO
    validateDTO(dto);

    // Check bodySource is provided
    if (!dto.bodySource || !dto.bodySource.s3Key) {
      throw new ValidationError('bodySource.s3Key is required for /stamp endpoint');
    }

    // Step 1: Download body PDF from S3
    logger.debug('Downloading body PDF from S3', { s3Key: dto.bodySource.s3Key });
    const bodyPdfBytes = await downloadFile(dto.bodySource.s3Key);

    // Step 2: Generate cover page
    logger.debug('Generating cover page');
    const coverPdfBytes = await generateCover(dto);

    // Step 3: Apply header/footer to body
    logger.debug('Applying header/footer to body');
    const stampedBodyBytes = await applyHeaderFooter(bodyPdfBytes, dto);

    // Step 4: Merge cover + stamped body
    logger.debug('Merging cover and body');
    const mergedPdfBytes = await mergePDFs(coverPdfBytes, stampedBodyBytes);

    // Step 5: Upload to S3 (stamped path)
    const stampedPath = dto.document.s3Refs?.stamped || generateStampedPath(dto);
    logger.debug('Uploading stamped PDF to S3', { s3Key: stampedPath });
    const uploadResult = await uploadFile(stampedPath, Buffer.from(mergedPdfBytes));

    const duration = Date.now() - startTime;

    // Return success response
    const response = {
      status: 'completed',
      s3Key: uploadResult.s3Key,
      pages: Math.ceil(mergedPdfBytes.length / 2048), // Approximate page count
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    };

    logger.info('Stamp completed', {
      docId: dto.document.code,
      s3Key: uploadResult.s3Key,
      duration_ms: duration,
    });

    res.json(response);
  } catch (error) {
    logger.error('Stamp failed', { error: error.message, stack: error.stack });
    next(error);
  }
});

export default router;
