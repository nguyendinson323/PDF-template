const { PDFDocument } = require('pdf-lib');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const CoverGeneratorService = require('./CoverGeneratorService');
const TSAService = require('./TSAService');
const S3Service = require('./S3Service');
const logger = require('../utils/logger');

class PublicationService {
  constructor() {
    this.coverGenerator = new CoverGeneratorService();
    this.tsaService = new TSAService();
    this.s3Service = new S3Service();
    this.jobs = new Map(); // In-memory job store
  }

  /**
   * Start publication job
   */
  async startPublicationJob(docId, payload, idempotencyKey) {
    const jobId = uuidv4();
    const startTime = Date.now();

    // Initialize job
    const job = {
      jobId,
      docId,
      status: 'processing',
      createdAt: new Date().toISOString(),
      stages: {},
    };

    this.jobs.set(jobId, job);

    logger.logJobStart(jobId, docId, 'publication');

    // Process asynchronously
    this.processPublication(jobId, docId, payload, idempotencyKey, startTime).catch((error) => {
      job.status = 'failed';
      job.error = {
        code: error.code || 'InternalError',
        message: error.message,
      };
      logger.logJobError(jobId, docId, 'publication', error);
    });

    return {
      jobId,
      status: 'pending',
      createdAt: job.createdAt,
    };
  }

  /**
   * Process publication (async)
   */
  async processPublication(jobId, docId, payload, idempotencyKey, startTime) {
    const job = this.jobs.get(jobId);

    try {
      // Stage 1: Generate cover
      logger.logStage(jobId, 'cover_generation', 'started');
      const coverStart = Date.now();
      const coverPdf = await this.coverGenerator.generateCover(payload);
      job.stages.cover = Date.now() - coverStart;
      logger.logStage(jobId, 'cover_generation', 'completed', job.stages.cover);

      // Stage 2: Download body PDF
      logger.logStage(jobId, 'body_download', 'started');
      const bodyStart = Date.now();
      const bodyPdf = await this.downloadBodyPdf(payload.bodyPdfUrl);
      job.stages.body = Date.now() - bodyStart;
      logger.logStage(jobId, 'body_download', 'completed', job.stages.body);

      // Stage 3: Merge PDFs
      logger.logStage(jobId, 'pdf_merge', 'started');
      const mergeStart = Date.now();
      const mergedPdf = await this.mergePDFs(coverPdf, bodyPdf);
      job.stages.merge = Date.now() - mergeStart;
      logger.logStage(jobId, 'pdf_merge', 'completed', job.stages.merge);

      // Stage 4: Apply headers/footers (stub - full implementation needed)
      logger.logStage(jobId, 'header_footer', 'started');
      const stampStart = Date.now();
      const stampedPdf = await this.applyHeadersFooters(mergedPdf, payload);
      job.stages.stamp = Date.now() - stampStart;
      logger.logStage(jobId, 'header_footer', 'completed', job.stages.stamp);

      // Stage 5: Compute hash
      logger.logStage(jobId, 'hash_computation', 'started');
      const hashStart = Date.now();
      const sha256 = this.tsaService.computeHashHex(stampedPdf);
      const sha256Buffer = this.tsaService.computeHash(stampedPdf);
      job.stages.hash = Date.now() - hashStart;
      logger.logStage(jobId, 'hash_computation', 'completed', job.stages.hash);

      // Stage 6: Get TSA timestamp
      logger.logStage(jobId, 'tsa_request', 'started');
      const tsaStart = Date.now();
      const tsaResult = await this.tsaService.requestTimestamp(sha256Buffer);
      job.stages.tsa = Date.now() - tsaStart;
      logger.logStage(jobId, 'tsa_request', 'completed', job.stages.tsa);

      // Stage 7: Embed timestamp (stub - full PAdES implementation needed)
      logger.logStage(jobId, 'tsa_embed', 'started');
      const embedStart = Date.now();
      const signedResult = await this.tsaService.embedTimestampInPDF(stampedPdf, tsaResult.token);
      job.stages.embed = Date.now() - embedStart;
      logger.logStage(jobId, 'tsa_embed', 'completed', job.stages.embed);

      // Stage 8: Upload to S3
      logger.logStage(jobId, 's3_upload', 'started');
      const uploadStart = Date.now();
      const s3Result = await this.s3Service.uploadPDF(
        signedResult.signedPdf,
        docId,
        payload.document.semanticVersion,
        'final.pdf',
        {
          sha256,
          tsaTimestamp: tsaResult.timestamp.toISOString(),
          tsaSerial: tsaResult.serialNumber,
        },
      );
      job.stages.upload = Date.now() - uploadStart;
      logger.logStage(jobId, 's3_upload', 'completed', job.stages.upload);

      // Stage 9: Upload metadata
      const metadata = {
        docId,
        code: payload.document.code,
        version: payload.document.semanticVersion,
        title: payload.document.title,
        publicationDate: payload.document.publicationDate || new Date().toISOString(),
        sha256,
        tsa: {
          timestamp: tsaResult.timestamp.toISOString(),
          serialNumber: tsaResult.serialNumber,
          policyOid: tsaResult.policyOid,
        },
        s3: s3Result,
        qrUrl: `${payload.document.qr.baseUrl}${payload.document.code}${payload.document.semanticVersion}`,
        processedAt: new Date().toISOString(),
      };

      await this.s3Service.uploadMetadata(metadata, docId, payload.document.semanticVersion);

      // Job completed
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = {
        s3Key: s3Result.key,
        s3Url: s3Result.url,
        sha256,
        tsaToken: {
          timestamp: tsaResult.timestamp.toISOString(),
          serialNumber: tsaResult.serialNumber,
        },
        qrUrl: metadata.qrUrl,
      };

      const totalDuration = Date.now() - startTime;
      logger.logJobComplete(jobId, docId, 'publication', totalDuration);
    } catch (error) {
      job.status = 'failed';
      job.error = {
        code: error.code || 'InternalError',
        message: error.message,
      };
      logger.logJobError(jobId, docId, 'publication', error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getJobStatus(jobId) {
    return this.jobs.get(jobId);
  }

  /**
   * Download body PDF from URL
   */
  async downloadBodyPdf(url) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 second timeout
      });

      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Failed to download body PDF: ${error.message}`);
    }
  }

  /**
   * Merge cover and body PDFs
   */
  async mergePDFs(coverBuffer, bodyBuffer) {
    try {
      const finalDoc = await PDFDocument.create();

      // Load cover PDF
      const coverDoc = await PDFDocument.load(coverBuffer);
      const coverPages = await finalDoc.copyPages(coverDoc, coverDoc.getPageIndices());
      coverPages.forEach((page) => finalDoc.addPage(page));

      // Load body PDF
      const bodyDoc = await PDFDocument.load(bodyBuffer);
      const bodyPages = await finalDoc.copyPages(bodyDoc, bodyDoc.getPageIndices());
      bodyPages.forEach((page) => finalDoc.addPage(page));

      const pdfBytes = await finalDoc.save();
      return Buffer.from(pdfBytes);
    } catch (error) {
      throw new Error(`PDF merge failed: ${error.message}`);
    }
  }

  /**
   * Apply headers and footers to all pages
   * This is a stub - full implementation requires stamping each page with HeaderFooter.json config
   */
  async applyHeadersFooters(pdfBuffer, payload) {
    try {
      // Full implementation would:
      // 1. Load HeaderFooter.json
      // 2. For each page in PDF (except cover):
      //    - Render header with logo, doc info, QR
      //    - Render footer with page numbers, hash, etc.
      // 3. Apply variable substitution from payload

      // For now, return as-is
      logger.warn('Header/footer stamping not fully implemented - returning PDF as-is');
      return pdfBuffer;
    } catch (error) {
      throw new Error(`Header/footer stamping failed: ${error.message}`);
    }
  }

  /**
   * Issue checklist PDF
   */
  async issueChecklist(docId, checklistData, idempotencyKey) {
    const jobId = uuidv4();

    const job = {
      jobId,
      docId,
      status: 'processing',
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Process async
    this.processChecklist(jobId, docId, checklistData).catch((error) => {
      job.status = 'failed';
      job.error = { message: error.message };
    });

    return { jobId, status: 'pending', createdAt: job.createdAt };
  }

  /**
   * Process checklist generation
   */
  async processChecklist(jobId, docId, checklistData) {
    const job = this.jobs.get(jobId);

    try {
      // Generate checklist PDF (stub)
      logger.info('Generating checklist PDF', { jobId, docId, checklistId: checklistData.checklistId });

      // Would generate PDF from checklistData.answers
      const checklistPdf = Buffer.from('PDF placeholder'); // Stub

      // Upload to S3
      const s3Result = await this.s3Service.uploadPDF(
        checklistPdf,
        docId,
        'checklists',
        `${checklistData.checklistId}.pdf`,
      );

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = {
        s3Key: s3Result.key,
        checklistId: checklistData.checklistId,
      };
    } catch (error) {
      job.status = 'failed';
      job.error = { message: error.message };
      throw error;
    }
  }

  /**
   * Generate audit pack
   */
  async generateAuditPack(docId, auditPackData, idempotencyKey) {
    const jobId = uuidv4();

    const job = {
      jobId,
      docId,
      status: 'processing',
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Process async
    this.processAuditPack(jobId, docId, auditPackData).catch((error) => {
      job.status = 'failed';
      job.error = { message: error.message };
    });

    return { jobId, status: 'pending', createdAt: job.createdAt };
  }

  /**
   * Process audit pack generation
   */
  async processAuditPack(jobId, docId, auditPackData) {
    const job = this.jobs.get(jobId);

    try {
      logger.info('Generating audit pack', { jobId, docId });

      // Download final document
      const docKey = this.s3Service.generateKey(docId, auditPackData.version, 'final.pdf');
      const docPdf = await this.s3Service.downloadFile(docKey);

      // Download checklists
      const checklistPdfs = await Promise.all(
        auditPackData.checklistIds.map((chkId) =>
          this.s3Service.downloadFile(this.s3Service.generateKey(docId, 'checklists', `${chkId}.pdf`)),
        ),
      );

      // Merge all PDFs
      const mergedDoc = await PDFDocument.create();

      // Add main document
      const mainDoc = await PDFDocument.load(docPdf);
      const mainPages = await mergedDoc.copyPages(mainDoc, mainDoc.getPageIndices());
      mainPages.forEach((page) => mergedDoc.addPage(page));

      // Add checklists
      for (const checklistPdf of checklistPdfs) {
        const chkDoc = await PDFDocument.load(checklistPdf);
        const chkPages = await mergedDoc.copyPages(chkDoc, chkDoc.getPageIndices());
        chkPages.forEach((page) => mergedDoc.addPage(page));
      }

      const auditPackPdf = await mergedDoc.save();

      // Upload to S3
      const s3Result = await this.s3Service.uploadPDF(
        Buffer.from(auditPackPdf),
        docId,
        auditPackData.version,
        'audit-pack.pdf',
      );

      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      job.result = {
        s3Key: s3Result.key,
        totalPages: mergedDoc.getPageCount(),
      };
    } catch (error) {
      job.status = 'failed';
      job.error = { message: error.message };
      throw error;
    }
  }

  /**
   * Verify document
   */
  async verifyDocument(docId, version) {
    try {
      // Download metadata from S3
      const metadataKey = this.s3Service.generateKey(docId, version, 'metadata.json');
      const metadataBuffer = await this.s3Service.downloadFile(metadataKey);
      const metadata = JSON.parse(metadataBuffer.toString('utf8'));

      return {
        docId: metadata.docId,
        version: metadata.version,
        code: metadata.code,
        title: metadata.title,
        sha256: metadata.sha256,
        tsaTime: metadata.tsa.timestamp,
        tsaSerial: metadata.tsa.serialNumber,
        s3Key: metadata.s3.key,
        qrUrl: metadata.qrUrl,
        publicationDate: metadata.publicationDate,
      };
    } catch (error) {
      if (error.message.includes('NoSuchKey') || error.message.includes('NotFound')) {
        throw new Error('Document not found');
      }
      throw error;
    }
  }
}

module.exports = PublicationService;
