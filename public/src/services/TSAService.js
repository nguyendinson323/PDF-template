const axios = require('axios');
const crypto = require('crypto');
const asn1js = require('asn1js');
const pkijs = require('pkijs');
const config = require('../config/config');
const logger = require('../utils/logger');

class TSAService {
  constructor() {
    this.url = config.tsaUrl;
    this.authMode = config.tsa.authMode;
    this.timeout = config.tsa.timeoutMs;
    this.retries = config.tsa.retries;
    this.hashAlg = config.tsa.hashAlg;
    this.policyOid = config.tsa.policyOid;
  }

  /**
   * Generate TSA request (RFC 3161)
   */
  generateTSARequest(messageHash, nonce = null) {
    try {
      // Create MessageImprint
      const hashAlgorithm = new pkijs.AlgorithmIdentifier({
        algorithmId: '2.16.840.1.101.3.4.2.1', // SHA-256 OID
      });

      const messageImprint = new pkijs.MessageImprint({
        hashAlgorithm,
        hashedMessage: new asn1js.OctetString({ valueHex: messageHash }),
      });

      // Create TimeStampReq
      const tsaReq = new pkijs.TimeStampReq({
        version: 1,
        messageImprint,
        reqPolicy: this.policyOid ? this.policyOid : undefined,
        certReq: true, // Request TSA certificate
      });

      // Add nonce if provided
      if (nonce) {
        tsaReq.nonce = new asn1js.Integer({ value: nonce });
      }

      // Encode to DER
      const derEncoded = tsaReq.toSchema().toBER(false);
      return Buffer.from(derEncoded);
    } catch (error) {
      logger.error('Failed to generate TSA request', { error: error.message });
      throw new Error(`TSA request generation failed: ${error.message}`);
    }
  }

  /**
   * Send request to TSA and get timestamp token
   */
  async requestTimestamp(pdfHash, attempt = 1) {
    const startTime = Date.now();

    try {
      // Generate nonce (random 8 bytes)
      const nonce = crypto.randomBytes(8).readBigUInt64BE();

      // Generate TSA request
      const tsaRequest = this.generateTSARequest(pdfHash, nonce);

      // Prepare HTTP request headers
      const headers = {
        'Content-Type': 'application/timestamp-query',
        'Content-Length': tsaRequest.length,
      };

      // Add authentication if required
      if (this.authMode === 'basic' && config.tsa.user && config.tsa.pass) {
        const auth = Buffer.from(`${config.tsa.user}:${config.tsa.pass}`).toString('base64');
        headers.Authorization = `Basic ${auth}`;
      }

      // Send request to TSA
      logger.info('Sending TSA request', {
        url: this.url,
        attempt,
        hashLength: pdfHash.length,
      });

      const response = await axios.post(this.url, tsaRequest, {
        headers,
        responseType: 'arraybuffer',
        timeout: this.timeout,
      });

      const duration = Date.now() - startTime;

      // Verify response
      if (response.status !== 200) {
        throw new Error(`TSA returned status ${response.status}`);
      }

      const tsaResponse = Buffer.from(response.data);

      // Parse and validate TSA response
      const validationResult = await this.validateTSAResponse(tsaResponse, pdfHash, nonce);

      logger.info('TSA request successful', {
        url: this.url,
        attempt,
        durationMs: duration,
        tokenSize: tsaResponse.length,
      });

      return {
        token: tsaResponse,
        ...validationResult,
        durationMs: duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('TSA request failed', {
        url: this.url,
        attempt,
        durationMs: duration,
        error: error.message,
      });

      // Retry if attempts remaining
      if (attempt < this.retries) {
        logger.info(`Retrying TSA request (${attempt + 1}/${this.retries})`);
        await this.sleep(1000 * attempt); // Exponential backoff
        return this.requestTimestamp(pdfHash, attempt + 1);
      }

      throw new Error(`TSA request failed after ${attempt} attempts: ${error.message}`);
    }
  }

  /**
   * Validate TSA response
   */
  async validateTSAResponse(tsaResponse, originalHash, nonce) {
    try {
      // Parse ASN.1 structure
      const asn1 = asn1js.fromBER(tsaResponse);
      if (asn1.offset === -1) {
        throw new Error('Invalid ASN.1 structure');
      }

      // Parse TimeStampResp
      const tsResp = new pkijs.TimeStampResp({ schema: asn1.result });

      // Check status
      const status = tsResp.status.status;
      if (status !== 0 && status !== 1) {
        // 0 = granted, 1 = grantedWithMods
        const failInfo = tsResp.status.failInfo;
        throw new Error(`TSA rejected request. Status: ${status}, FailInfo: ${failInfo}`);
      }

      // Extract timestamp token
      if (!tsResp.timeStampToken) {
        throw new Error('No timestamp token in response');
      }

      const token = tsResp.timeStampToken;
      const signedData = new pkijs.SignedData({ schema: token.content });

      // Extract TSTInfo
      const tstInfo = signedData.encapContentInfo.eContent.valueBlock.value[0];
      const tstInfoParsed = new pkijs.TSTInfo({ schema: tstInfo });

      // Validate message imprint matches
      const hashedMessage = Buffer.from(tstInfoParsed.messageImprint.hashedMessage.valueBlock.valueHex);
      if (!hashedMessage.equals(originalHash)) {
        throw new Error('Message imprint mismatch');
      }

      // Extract timestamp
      const genTime = tstInfoParsed.genTime;
      const serialNumber = tstInfoParsed.serialNumber.valueBlock.toString();

      logger.info('TSA response validated', {
        status,
        genTime: genTime.toDate().toISOString(),
        serialNumber,
      });

      return {
        valid: true,
        status,
        timestamp: genTime.toDate(),
        serialNumber,
        policyOid: tstInfoParsed.policy,
      };
    } catch (error) {
      logger.error('TSA response validation failed', { error: error.message });
      throw new Error(`TSA response validation failed: ${error.message}`);
    }
  }

  /**
   * Embed TSA token in PDF (PAdES-B-LTA format)
   * This is a simplified version - full PAdES requires more complex implementation
   */
  async embedTimestampInPDF(pdfBuffer, tsaToken) {
    try {
      // For a complete implementation, you would:
      // 1. Parse PDF structure
      // 2. Create signature dictionary
      // 3. Add DSS (Document Security Store)
      // 4. Embed TSA token in signature
      // 5. Update cross-reference table

      // This requires a full PAdES library like pdf-lib with digital signature support
      // or Apache PDFBox (Java) or EU DSS library

      logger.warn('PDF timestamp embedding requires full PAdES implementation');

      // For now, return the original PDF and token separately
      // In production, integrate with EU DSS or similar library
      return {
        signedPdf: pdfBuffer,
        timestamp: tsaToken,
        format: 'PAdES-B-LTA',
      };
    } catch (error) {
      logger.error('Failed to embed timestamp in PDF', { error: error.message });
      throw new Error(`Timestamp embedding failed: ${error.message}`);
    }
  }

  /**
   * Compute SHA-256 hash of PDF
   */
  computeHash(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
  }

  /**
   * Compute SHA-256 hash and return hex string
   */
  computeHashHex(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Sleep utility for retry backoff
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Health check - verify TSA is accessible
   */
  async healthCheck() {
    try {
      // Generate a dummy hash
      const dummyHash = crypto.randomBytes(32);

      // Try to get a timestamp (with short timeout)
      const result = await axios.post(
        this.url,
        this.generateTSARequest(dummyHash),
        {
          headers: { 'Content-Type': 'application/timestamp-query' },
          responseType: 'arraybuffer',
          timeout: 2000, // 2 second timeout for health check
        },
      );

      if (result.status === 200) {
        return { status: 'ok', message: 'TSA accessible' };
      }

      return { status: 'degraded', message: `TSA returned status ${result.status}` };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = TSAService;
