const path = require('path');
require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Authentication
  auth: {
    mode: process.env.AUTH_MODE || 'jwt', // jwt or mtls
    cognito: {
      issuer: process.env.COGNITO_ISSUER,
      jwksUri: process.env.COGNITO_JWKS_URI,
      tokenUrl: process.env.COGNITO_TOKEN_URL,
      clientId: process.env.COGNITO_CLIENT_ID,
      clientSecret: process.env.COGNITO_CLIENT_SECRET,
      requiredScopes: (process.env.REQUIRED_SCOPES || '').split(',').filter(Boolean),
    },
    mtls: {
      caBundlePath: process.env.MTLS_CA_BUNDLE_PATH,
      clientCertPath: process.env.MTLS_CLIENT_CERT_PATH,
      clientKeyPath: process.env.MTLS_CLIENT_KEY_PATH,
    },
  },

  // AWS
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    s3: {
      bucket: process.env.S3_BUCKET,
      prefix: process.env.S3_PREFIX || 'publish/',
      objectLockMode: process.env.S3_OBJECT_LOCK_MODE || 'GOVERNANCE',
      objectLockRetentionDays: parseInt(process.env.S3_OBJECT_LOCK_RETENTION_DAYS, 10) || 365,
    },
    kms: {
      keyArn: process.env.KMS_KEY_ARN,
    },
  },

  // TSA (Time Stamp Authority)
  tsa: {
    urlSandbox: process.env.TSA_URL_SANDBOX || 'http://timestamp.digicert.com',
    urlProd: process.env.TSA_URL_PROD || 'http://timestamp.digicert.com',
    authMode: process.env.TSA_AUTH_MODE || 'none', // none, basic, oauth, mtls
    user: process.env.TSA_USER,
    pass: process.env.TSA_PASS,
    policyOid: process.env.TSA_POLICY_OID,
    hashAlg: process.env.TSA_HASH_ALG || 'SHA-256',
    timeoutMs: parseInt(process.env.TSA_TIMEOUT_MS, 10) || 4000,
    retries: parseInt(process.env.TSA_RETRIES, 10) || 2,
  },

  // Templates
  templates: {
    root: path.resolve(__dirname, '../../..', process.env.TEMPLATE_ROOT || 'template'),
    manifest: process.env.TEMPLATE_MANIFEST || 'Manifest.json',
    headerFooter: process.env.TEMPLATE_HEADERFOOTER || 'HeaderFooter.json',
    vars: process.env.TEMPLATE_VARS || 'var_cover.json',
    generator: process.env.TEMPLATE_GENERATOR || 'generate-golden.js',
    fontsDir: process.env.FONTS_DIR || 'fonts',
  },

  // Service behavior
  service: {
    idempotencyTtlSeconds: parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400,
    maxInputSizeMb: parseInt(process.env.MAX_INPUT_SIZE_MB, 10) || 15,
    pdfaLevel: process.env.PDFA_LEVEL || '2b',
  },

  // Computed values
  get tsaUrl() {
    return this.nodeEnv === 'production' ? this.tsa.urlProd : this.tsa.urlSandbox;
  },

  get isProduction() {
    return this.nodeEnv === 'production';
  },

  get isDevelopment() {
    return this.nodeEnv === 'development';
  },
};

// Validation helper
function validateConfig() {
  const errors = [];

  if (!config.aws.s3.bucket) {
    errors.push('S3_BUCKET is required');
  }

  if (!config.aws.kms.keyArn && config.isProduction) {
    errors.push('KMS_KEY_ARN is required in production');
  }

  if (config.auth.mode === 'jwt') {
    if (!config.auth.cognito.issuer) {
      errors.push('COGNITO_ISSUER is required for JWT auth');
    }
    if (!config.auth.cognito.jwksUri) {
      errors.push('COGNITO_JWKS_URI is required for JWT auth');
    }
  }

  if (config.auth.mode === 'mtls') {
    if (!config.auth.mtls.caBundlePath) {
      errors.push('MTLS_CA_BUNDLE_PATH is required for mTLS auth');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

// Validate on load in production
if (config.isProduction) {
  try {
    validateConfig();
  } catch (error) {
    console.error('Configuration error:', error.message);
    process.exit(1);
  }
}

module.exports = config;
