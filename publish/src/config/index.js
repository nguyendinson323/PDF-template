// ==================================================================================
// Configuration Management
// ==================================================================================
// Loads and validates environment variables
// Exports configuration object for use across the application
// ==================================================================================

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

/**
 * Configuration object
 * All environment variables are loaded and validated here
 */
const config = {
  // Server configuration
  server: {
    port: parseInt(process.env.PORT || '8080', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },

  // AWS S3 configuration
  s3: {
    bucket: process.env.S3_BUCKET || 'passfy-docs-bucket',
    region: process.env.AWS_REGION || 'us-east-1',
    useLocal: process.env.S3_USE_LOCAL === 'true',
    localPath: process.env.S3_LOCAL_PATH || './s3-local',
  },

  // AWS KMS configuration
  kms: {
    keyId: process.env.KMS_KEY_ID || 'alias/passfy-docs-key',
  },

  // TSA (Time Stamp Authority) configuration
  tsa: {
    url: process.env.TSA_URL || 'https://freetsa.org/tsr',
    useMock: process.env.TSA_USE_MOCK === 'true',
  },

  // Template Pack configuration
  template: {
    path: process.env.TEMPLATE_PATH || '../template',
  },

  // Authentication configuration
  auth: {
    enabled: process.env.AUTH_ENABLED === 'true',
    bearerToken: process.env.AUTH_BEARER_TOKEN || 'TEST',
  },

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
  },
};

/**
 * Validate required configuration
 * Throws error if critical configuration is missing
 */
function validateConfig() {
  const errors = [];

  // Validate S3 configuration
  if (!config.s3.bucket) {
    errors.push('S3_BUCKET is required');
  }

  if (config.s3.useLocal && !config.s3.localPath) {
    errors.push('S3_LOCAL_PATH is required when S3_USE_LOCAL is true');
  }

  // Validate template path
  if (!config.template.path) {
    errors.push('TEMPLATE_PATH is required');
  }

  // If errors found, throw
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on load
validateConfig();

// Log loaded configuration (sanitized)
const sanitizedConfig = {
  ...config,
  auth: {
    ...config.auth,
    bearerToken: config.auth.bearerToken ? '***' : undefined,
  },
};

console.log('📋 Configuration loaded:', JSON.stringify(sanitizedConfig, null, 2));

export default config;
