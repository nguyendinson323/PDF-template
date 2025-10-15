// ==================================================================================
// QR Code Service
// ==================================================================================
// Generates QR codes for document verification
// ==================================================================================

import QRCode from 'qrcode';
import logger from '../utils/logger.js';

/**
 * Generate QR code as PNG buffer
 */
export async function generateQRCode(text, width = 150) {
  try {
    logger.debug('Generating QR code', { text, width });

    const buffer = await QRCode.toBuffer(text, {
      errorCorrectionLevel: 'M',
      type: 'png',
      width: width,
      margin: 0,
    });

    logger.debug('QR code generated', { size: buffer.length });
    return buffer;
  } catch (error) {
    logger.error('Failed to generate QR code', { error: error.message });
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
}

/**
 * Build QR URL from DTO
 */
export function buildQRURL(dto) {
  const { baseUrl } = dto.document.qr;
  const { code, semanticVersion } = dto.document;

  // Format: baseUrl + code + version
  // Example: https://verify.passfy.io/docPAS-L1-GOV-PRC-001v2.0.0
  const url = `${baseUrl}${code}${semanticVersion}`;

  logger.debug('Built QR URL', { url });
  return url;
}

export default {
  generateQRCode,
  buildQRURL,
};
