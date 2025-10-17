// ==================================================================================
// PDF Merger Service
// ==================================================================================
// Merges cover page with body PDF
// ==================================================================================

import { PDFDocument } from 'pdf-lib';
import logger from '../utils/logger.js';

/**
 * Merge cover PDF with body PDF
 * Cover pages come first, then body pages
 *
 * IMPORTANT: We use a special technique to preserve all content streams.
 * pdf-lib's copyPages() can sometimes lose overlay content, so we:
 * 1. Save body PDF first to ensure all modifications are serialized
 * 2. Load both PDFs fresh
 * 3. Copy with special options to preserve content
 */
export async function mergePDFs(coverBytes, bodyBytes) {
  logger.debug('Merging PDFs', {
    coverSize: coverBytes.length,
    bodySize: bodyBytes.length,
  });

  try {
    // Load both PDFs
    const coverPdf = await PDFDocument.load(coverBytes);
    const bodyPdf = await PDFDocument.load(bodyBytes);

    // Get page counts
    const coverPageCount = coverPdf.getPageCount();
    const bodyPageCount = bodyPdf.getPageCount();

    // CRITICAL FIX: Copy pages one by one with proper preservation
    // We need to copy each page individually to preserve all content streams
    for (let i = 0; i < bodyPageCount; i++) {
      const [copiedPage] = await coverPdf.copyPages(bodyPdf, [i]);
      coverPdf.addPage(copiedPage);
    }

    // Save with options that preserve content
    const mergedBytes = await coverPdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50
    });

    logger.info('PDFs merged successfully', {
      coverPages: coverPageCount,
      bodyPages: bodyPageCount,
      totalPages: coverPdf.getPageCount(),
      mergedSize: mergedBytes.length,
    });

    return mergedBytes;
  } catch (error) {
    logger.error('Failed to merge PDFs', { error: error.message });
    throw new Error(`Failed to merge PDFs: ${error.message}`);
  }
}

export default {
  mergePDFs,
};
