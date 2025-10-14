const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config/config');
const logger = require('../utils/logger');

class S3Service {
  constructor() {
    this.client = new S3Client({
      region: config.aws.region,
    });
    this.bucket = config.aws.s3.bucket;
    this.prefix = config.aws.s3.prefix;
  }

  /**
   * Generate S3 key for document
   */
  generateKey(docId, version, filename) {
    return `${this.prefix}${docId}/v${version}/${filename}`;
  }

  /**
   * Upload PDF to S3 with SSE-KMS and Object Lock
   */
  async uploadPDF(buffer, docId, version, filename = 'final.pdf', metadata = {}) {
    const startTime = Date.now();
    const key = this.generateKey(docId, version, filename);

    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'application/pdf',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: config.aws.kms.keyArn,
        Metadata: {
          docId,
          version,
          uploadedAt: new Date().toISOString(),
          ...metadata,
        },
      };

      // Add Object Lock if configured
      if (config.aws.s3.objectLockMode && config.aws.s3.objectLockRetentionDays) {
        const retainUntilDate = new Date();
        retainUntilDate.setDate(retainUntilDate.getDate() + config.aws.s3.objectLockRetentionDays);

        params.ObjectLockMode = config.aws.s3.objectLockMode;
        params.ObjectLockRetainUntilDate = retainUntilDate;
      }

      const command = new PutObjectCommand(params);
      const response = await this.client.send(command);

      const duration = Date.now() - startTime;

      logger.info('S3 upload successful', {
        bucket: this.bucket,
        key,
        size: buffer.length,
        durationMs: duration,
      });

      return {
        bucket: this.bucket,
        key,
        region: config.aws.region,
        etag: response.ETag,
        versionId: response.VersionId,
        url: `s3://${this.bucket}/${key}`,
        httpsUrl: `https://${this.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`,
      };
    } catch (error) {
      logger.error('S3 upload failed', {
        bucket: this.bucket,
        key,
        error: error.message,
      });
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Upload JSON metadata
   */
  async uploadMetadata(metadata, docId, version) {
    const startTime = Date.now();
    const key = this.generateKey(docId, version, 'metadata.json');

    try {
      const params = {
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: 'application/json',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: config.aws.kms.keyArn,
      };

      const command = new PutObjectCommand(params);
      await this.client.send(command);

      const duration = Date.now() - startTime;

      logger.info('S3 metadata upload successful', {
        bucket: this.bucket,
        key,
        durationMs: duration,
      });

      return {
        bucket: this.bucket,
        key,
        url: `s3://${this.bucket}/${key}`,
      };
    } catch (error) {
      logger.error('S3 metadata upload failed', {
        bucket: this.bucket,
        key,
        error: error.message,
      });
      throw new Error(`S3 metadata upload failed: ${error.message}`);
    }
  }

  /**
   * Download file from S3
   */
  async downloadFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('S3 download failed', {
        bucket: this.bucket,
        key,
        error: error.message,
      });
      throw new Error(`S3 download failed: ${error.message}`);
    }
  }

  /**
   * Check if file exists in S3
   */
  async fileExists(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key) {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      return {
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        etag: response.ETag,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error) {
      logger.error('S3 get metadata failed', {
        bucket: this.bucket,
        key,
        error: error.message,
      });
      throw new Error(`S3 get metadata failed: ${error.message}`);
    }
  }

  /**
   * Health check - verify S3 access
   */
  async healthCheck() {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: `${this.prefix}health-check`,
      });

      await this.client.send(command);
      return { status: 'ok', message: 'S3 accessible' };
    } catch (error) {
      if (error.name === 'NotFound') {
        // Bucket exists but file doesn't - that's OK
        return { status: 'ok', message: 'S3 accessible' };
      }
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = S3Service;
