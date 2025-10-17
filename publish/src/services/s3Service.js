// ==================================================================================
// S3 Service
// ==================================================================================
// Handles S3 operations (upload, download, check existence)
// Supports both local filesystem (development) and AWS S3 (production)
// ==================================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { NotFoundError, ServiceUnavailableError } from '../utils/errors.js';

/**
 * Upload file to S3 (or local filesystem)
 */
export async function uploadFile(s3Key, buffer) {
  logger.debug('Uploading file', { s3Key, size: buffer.length });

  if (config.s3.useLocal) {
    return uploadFileLocal(s3Key, buffer);
  } else {
    return uploadFileAWS(s3Key, buffer);
  }
}

/**
 * Download file from S3 (or local filesystem)
 */
export async function downloadFile(s3Key) {
  logger.debug('Downloading file', { s3Key });

  if (config.s3.useLocal) {
    return downloadFileLocal(s3Key);
  } else {
    return downloadFileAWS(s3Key);
  }
}

/**
 * Check if file exists in S3 (or local filesystem)
 */
export async function fileExists(s3Key) {
  if (config.s3.useLocal) {
    return fileExistsLocal(s3Key);
  } else {
    return fileExistsAWS(s3Key);
  }
}

// ==================================================================================
// Local Filesystem Implementation
// ==================================================================================

/**
 * Upload file to local filesystem with retry logic for Windows file locking
 */
function uploadFileLocal(s3Key, buffer, retries = 5, delayMs = 200) {
  const filePath = join(config.s3.localPath, s3Key);
  const dir = dirname(filePath);

  // Create directory if it doesn't exist
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Try to delete existing file first if it exists
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
      logger.debug('Deleted existing file before upload', { s3Key });
    } catch (deleteError) {
      logger.warn('Could not delete existing file, will try to overwrite', { s3Key, error: deleteError.message });
    }
  }

  // Try to write file with retries for EBUSY errors (Windows file locking)
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      writeFileSync(filePath, buffer);

      logger.info('File uploaded to local storage', { s3Key, path: filePath, attempt });

      return {
        s3Key,
        location: filePath,
        size: buffer.length,
      };
    } catch (error) {
      // Retry on EBUSY (file locked) or EPERM (permission denied) errors
      if ((error.code === 'EBUSY' || error.code === 'EPERM') && attempt < retries) {
        logger.warn('File locked, retrying...', { s3Key, attempt, retries, errorCode: error.code, error: error.message });

        // Wait before retrying (exponential backoff with longer delays)
        const sleepMs = delayMs * Math.pow(2, attempt - 1); // 200, 400, 800, 1600, 3200ms
        const start = Date.now();
        while (Date.now() - start < sleepMs) {
          // Busy wait
        }
        continue;
      }

      // If not retriable error or out of retries, throw error
      logger.error('Failed to upload file to local storage', { s3Key, attempt, errorCode: error.code, error: error.message });
      throw new ServiceUnavailableError(`Failed to upload file: ${error.message}`);
    }
  }
}

/**
 * Download file from local filesystem
 */
function downloadFileLocal(s3Key) {
  try {
    const filePath = join(config.s3.localPath, s3Key);

    // Check if file exists
    if (!existsSync(filePath)) {
      throw new NotFoundError(`File not found: ${s3Key}`);
    }

    // Read file
    const buffer = readFileSync(filePath);

    logger.info('File downloaded from local storage', { s3Key, path: filePath, size: buffer.length });

    return buffer;
  } catch (error) {
    if (error instanceof NotFoundError) {
      throw error;
    }
    logger.error('Failed to download file from local storage', { s3Key, error: error.message });
    throw new ServiceUnavailableError(`Failed to download file: ${error.message}`);
  }
}

/**
 * Check if file exists in local filesystem
 */
function fileExistsLocal(s3Key) {
  const filePath = join(config.s3.localPath, s3Key);
  return existsSync(filePath);
}

// ==================================================================================
// AWS S3 Implementation (Placeholder for future)
// ==================================================================================

/**
 * Upload file to AWS S3
 * TODO: Implement when AWS integration is needed
 */
async function uploadFileAWS(s3Key, buffer) {
  throw new Error('AWS S3 upload not yet implemented');
}

/**
 * Download file from AWS S3
 * TODO: Implement when AWS integration is needed
 */
async function downloadFileAWS(s3Key) {
  throw new Error('AWS S3 download not yet implemented');
}

/**
 * Check if file exists in AWS S3
 * TODO: Implement when AWS integration is needed
 */
async function fileExistsAWS(s3Key) {
  throw new Error('AWS S3 fileExists not yet implemented');
}

export default {
  uploadFile,
  downloadFile,
  fileExists,
};
