// ==================================================================================
// TSA (Time Stamp Authority) Service
// ==================================================================================
// Gets RFC 3161 timestamps for documents
// Mock implementation for development
// ==================================================================================

import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Get TSA timestamp (mock implementation for development)
 */
export async function getTSATimestamp(hash) {
  if (config.tsa.useMock) {
    return getTSATimestampMock(hash);
  } else {
    return getTSATimestampReal(hash);
  }
}

/**
 * Mock TSA timestamp for development/testing
 */
async function getTSATimestampMock(hash) {
  logger.debug('Getting mock TSA timestamp', { hash: hash.substring(0, 16) + '...' });

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));

  const timestamp = {
    tsaTime: new Date().toISOString(),
    tsaSerial: `TSA-MOCK-${Date.now()}`,
  };

  logger.info('Mock TSA timestamp generated', timestamp);
  return timestamp;
}

/**
 * Real TSA timestamp (RFC 3161)
 * TODO: Implement when production TSA is configured
 */
async function getTSATimestampReal(hash) {
  logger.error('Real TSA not yet implemented');
  throw new Error('Real TSA integration not yet implemented. Set TSA_USE_MOCK=true for development.');
}

export default {
  getTSATimestamp,
};
