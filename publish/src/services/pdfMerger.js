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
 */
export async function mergePDFs(coverBytes, bodyBytes) {
  logger.debug('Merging PDFs', {
    coverSize: coverBytes.length,
    bodySize: bodyBytes.length,
  });

  try {
    // Create new PDF document
    const mergedPdf = await PDFDocument.create();

    // Load cover PDF
    const coverPdf = await PDFDocument.load(coverBytes);
    const coverPages = await mergedPdf.copyPages(coverPdf, coverPdf.getPageIndices());

    // Add cover pages
    for (const page of coverPages) {
      mergedPdf.addPage(page);
    }

    // Load body PDF
    const bodyPdf = await PDFDocument.load(bodyBytes);
    const bodyPages = await mergedPdf.copyPages(bodyPdf, bodyPdf.getPageIndices());

    // Add body pages
    for (const page of bodyPages) {
      mergedPdf.addPage(page);
    }

    // Save merged PDF
    const mergedBytes = await mergedPdf.save();

    logger.info('PDFs merged successfully', {
      coverPages: coverPages.length,
      bodyPages: bodyPages.length,
      totalPages: mergedPdf.getPageCount(),
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
