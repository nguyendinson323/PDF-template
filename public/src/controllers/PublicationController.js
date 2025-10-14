const PublicationService = require('../services/PublicationService');
const logger = require('../utils/logger');

class PublicationController {
  constructor() {
    this.service = new PublicationService();
  }

  async startPublication(req, res) {
    try {
      const { docId } = req.params;
      const payload = req.body;
      const idempotencyKey = req.idempotencyKey;

      const result = await this.service.startPublicationJob(docId, payload, idempotencyKey);

      res.status(202).json(result);
    } catch (error) {
      logger.error('Publication start failed', { error: error.message, docId: req.params.docId });
      res.status(500).json({
        error: 'InternalServerError',
        message: error.message,
      });
    }
  }

  async getJobStatus(req, res) {
    try {
      const { jobId } = req.params;

      const job = this.service.getJobStatus(jobId);

      if (!job) {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Job not found',
        });
      }

      res.status(200).json(job);
    } catch (error) {
      logger.error('Get job status failed', { error: error.message, jobId: req.params.jobId });
      res.status(500).json({
        error: 'InternalServerError',
        message: error.message,
      });
    }
  }

  async issueChecklist(req, res) {
    try {
      const { docId } = req.params;
      const checklistData = req.body;
      const idempotencyKey = req.idempotencyKey;

      const result = await this.service.issueChecklist(docId, checklistData, idempotencyKey);

      res.status(202).json(result);
    } catch (error) {
      logger.error('Checklist issue failed', { error: error.message, docId: req.params.docId });
      res.status(500).json({
        error: 'InternalServerError',
        message: error.message,
      });
    }
  }

  async generateAuditPack(req, res) {
    try {
      const { docId } = req.params;
      const auditPackData = req.body;
      const idempotencyKey = req.idempotencyKey;

      const result = await this.service.generateAuditPack(docId, auditPackData, idempotencyKey);

      res.status(202).json(result);
    } catch (error) {
      logger.error('Audit pack generation failed', { error: error.message, docId: req.params.docId });
      res.status(500).json({
        error: 'InternalServerError',
        message: error.message,
      });
    }
  }

  async verifyDocument(req, res) {
    try {
      const { docId, version } = req.query;

      if (!docId || !version) {
        return res.status(400).json({
          error: 'BadRequest',
          message: 'docId and version query parameters are required',
        });
      }

      const verification = await this.service.verifyDocument(docId, version);

      res.status(200).json(verification);
    } catch (error) {
      if (error.message === 'Document not found') {
        return res.status(404).json({
          error: 'NotFound',
          message: 'Document not found',
        });
      }

      logger.error('Document verification failed', { error: error.message });
      res.status(500).json({
        error: 'InternalServerError',
        message: error.message,
      });
    }
  }
}

module.exports = PublicationController;
