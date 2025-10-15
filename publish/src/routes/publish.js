// ==================================================================================
// Publish Route
// ==================================================================================
// POST /publish - Generate official published PDF with hash and TSA
// ==================================================================================

import express from 'express';
import multer from 'multer';
import { PDFDocument } from 'pdf-lib';
import { validateDTO, generateOfficialPath, generateStampedPath, requiresHashAndTSA } from '../utils/dtoValidator.js';
import { generateCover } from '../services/coverGenerator.js';
import { applyHeaderFooter } from '../services/headerFooterService.js';
import { mergePDFs } from '../services/pdfMerger.js';
import { computeSHA256 } from '../services/hashService.js';
import { getTSATimestamp } from '../services/tsaService.js';
import { uploadFile, downloadFile } from '../services/s3Service.js';
import { buildQRURL } from '../services/qrService.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';

const router = express.Router();

// Configure multer for multipart form data
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
});

/**
 * POST /publish
 * Generate official published PDF with hash and TSA
 * Supports both multipart upload and S3 bodySource
 */
router.post('/', upload.fields([
  { name: 'dto', maxCount: 1 },
  { name: 'body', maxCount: 1 },
]), async (req, res, next) => {
  const startTime = Date.now();

  try {
    // Parse DTO (can be from file upload or request body)
    let dto;
    if (req.files && req.files.dto && req.files.dto[0]) {
      // DTO from multipart upload
      const dtoBuffer = req.files.dto[0].buffer;
      dto = JSON.parse(dtoBuffer.toString('utf8'));
    } else if (req.body && Object.keys(req.body).length > 0) {
      // DTO from JSON body (for bodySource mode)
      dto = req.body;
    } else {
      throw new ValidationError('DTO is required (either as file or JSON body)');
    }

    // Get body PDF (from upload or S3)
    let bodyBuffer;
    if (req.files && req.files.body && req.files.body[0]) {
      // Body from multipart upload
      bodyBuffer = req.files.body[0].buffer;
      logger.debug('Body PDF from multipart upload', { size: bodyBuffer.length });
    } else if (dto.bodySource && dto.bodySource.s3Key) {
      // Body from S3 (bodySource mode)
      logger.debug('Fetching body PDF from S3', { s3Key: dto.bodySource.s3Key });
      bodyBuffer = await downloadFile(dto.bodySource.s3Key);
      logger.debug('Body PDF downloaded from S3', { size: bodyBuffer.length });
    } else {
      throw new ValidationError('Body PDF is required (either as file upload or bodySource.s3Key)');
    }

    logger.info('Publish request received', {
      docId: dto?.document?.code,
      bodySize: bodyBuffer.length,
    });

    // Validate DTO
    validateDTO(dto);

    // Verify body is a PDF
    if (!bodyBuffer.toString('hex', 0, 4).startsWith('25504446')) {
      throw new ValidationError('Body file must be a PDF');
    }

    // Step 1: Generate cover page (without hash/TSA first)
    logger.debug('Generating cover page (initial)');
    let coverPdfBytes = await generateCover(dto);

    // Get cover page count for continuous numbering
    const coverDoc = await PDFDocument.load(coverPdfBytes);
    const coverPageCount = coverDoc.getPageCount();
    logger.debug('Cover page count', { coverPageCount });

    // Step 2: Apply header/footer to body
    logger.debug('Applying header/footer to body');
    const stampedBodyBytes = await applyHeaderFooter(bodyBuffer, dto, coverPageCount);

    // Step 3: Merge cover + stamped body
    logger.debug('Merging cover and body (initial)');
    let mergedPdfBytes = await mergePDFs(coverPdfBytes, stampedBodyBytes);

    // Step 4: Compute SHA-256 hash
    logger.debug('Computing SHA-256 hash');
    const sha256 = computeSHA256(Buffer.from(mergedPdfBytes));

    // Step 5: Get TSA timestamp (if needed)
    let tsaTime = '';
    let tsaSerial = '';

    if (requiresHashAndTSA(dto.context.currentPhase)) {
      logger.debug('Getting TSA timestamp');
      const tsaResult = await getTSATimestamp(sha256);
      tsaTime = tsaResult.tsaTime;
      tsaSerial = tsaResult.tsaSerial;
    }

    // Step 6: Update DTO with hash/TSA and regenerate cover
    if (requiresHashAndTSA(dto.context.currentPhase)) {
      logger.debug('Updating DTO with hash/TSA');
      dto.document.security = {
        hashSha256: sha256,
        tsaTime,
        tsaSerial,
      };

      // Regenerate cover with hash/TSA
      logger.debug('Regenerating cover page with hash/TSA');
      coverPdfBytes = await generateCover(dto);

      // Re-merge with updated cover
      logger.debug('Merging updated cover and body');
      mergedPdfBytes = await mergePDFs(coverPdfBytes, stampedBodyBytes);
    }

    // Step 7: Upload to S3
    let s3Key;
    if (requiresHashAndTSA(dto.context.currentPhase)) {
      // V-* phases go to official path
      s3Key = dto.document.s3Refs?.official || generateOfficialPath(dto);
    } else {
      // R-* phases go to stamped path
      s3Key = dto.document.s3Refs?.stamped || generateStampedPath(dto);
    }

    logger.debug('Uploading to S3', { s3Key });
    const uploadResult = await uploadFile(s3Key, Buffer.from(mergedPdfBytes));

    // Step 8: Build QR URL
    const qrUrl = buildQRURL(dto);

    const duration = Date.now() - startTime;

    // Return success response
    const response = {
      status: 'published',
      s3Key: uploadResult.s3Key,
      sha256: requiresHashAndTSA(dto.context.currentPhase) ? sha256 : undefined,
      tsaTime: tsaTime || undefined,
      tsaSerial: tsaSerial || undefined,
      qrUrl,
      pages: Math.ceil(mergedPdfBytes.length / 2048), // Approximate
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    };

    logger.info('Publish completed', {
      docId: dto.document.code,
      s3Key: uploadResult.s3Key,
      hasHash: !!sha256,
      hasTSA: !!tsaTime,
      duration_ms: duration,
    });

    res.json(response);
  } catch (error) {
    logger.error('Publish failed', { error: error.message, stack: error.stack });
    next(error);
  }
});

export default router;
