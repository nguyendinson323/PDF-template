// ==================================================================================
// Hash Service
// ==================================================================================
// Computes SHA-256 hash of PDF documents
// ==================================================================================

import { createHash } from 'crypto';
import logger from '../utils/logger.js';

/**
 * Compute SHA-256 hash of buffer
 */
export function computeSHA256(buffer) {
  try {
    logger.debug('Computing SHA-256 hash', { size: buffer.length });

    const hash = createHash('sha256');
    hash.update(buffer);
    const digest = hash.digest('hex');

    logger.info('SHA-256 hash computed', { hash: digest, size: buffer.length });
    return digest;
  } catch (error) {
    logger.error('Failed to compute SHA-256', { error: error.message });
    throw new Error(`Failed to compute SHA-256: ${error.message}`);
  }
}

/**
 * Get short hash for display (last 8 characters)
 */
export function getShortHash(fullHash) {
  if (!fullHash || fullHash.length < 8) {
    return fullHash;
  }
  return fullHash.substring(fullHash.length - 8);
}

export default {
  computeSHA256,
  getShortHash,
};
