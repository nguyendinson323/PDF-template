const express = require('express');
const { body, param, query } = require('express-validator');
const PublicationController = require('../controllers/PublicationController');
const { authenticate } = require('../middleware/auth');
const { idempotency } = require('../middleware/idempotency');
const { metricsHandler } = require('../utils/metrics');
const S3Service = require('../services/S3Service');
const TSAService = require('../services/TSAService');
const logger = require('../utils/logger');

const router = express.Router();
const publicationController = new PublicationController();

// Validation middleware
function validateRequest(req, res, next) {
  const errors = require('express-validator').validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Request validation failed',
      details: errors.array(),
    });
  }
  next();
}

// Health check
router.get('/health', authenticate(['health:read']), async (req, res) => {
  const s3Service = new S3Service();
  const tsaService = new TSAService();

  const checks = {
    s3: await s3Service.healthCheck(),
    tsa: await tsaService.healthCheck(),
  };

  const overallStatus =
    checks.s3.status === 'ok' && checks.tsa.status === 'ok'
      ? 'healthy'
      : checks.s3.status === 'error' || checks.tsa.status === 'error'
      ? 'unhealthy'
      : 'degraded';

  const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json({
    status: overallStatus,
    version: '1.0.0',
    uptime: process.uptime(),
    checks: {
      s3: checks.s3.status,
      tsa: checks.tsa.status,
    },
  });
});

// Metrics
router.get('/metrics', authenticate(['metrics:read']), metricsHandler);

// Start publication
router.post(
  '/publish/documents/:docId/start',
  authenticate(['publish:doc']),
  idempotency,
  [
    param('docId').isString().notEmpty(),
    body('document').isObject(),
    body('document.code').isString().notEmpty(),
    body('document.title').isString().notEmpty(),
    body('document.semanticVersion').isString().notEmpty(),
    body('bodyPdfUrl').isURL(),
  ],
  validateRequest,
  (req, res) => publicationController.startPublication(req, res),
);

// Get job status
router.get(
  '/publish/jobs/:jobId',
  authenticate(['jobs:read']),
  [param('jobId').isUUID()],
  validateRequest,
  (req, res) => publicationController.getJobStatus(req, res),
);

// Issue checklist
router.post(
  '/publish/documents/:docId/checklists',
  authenticate(['publish:chk']),
  idempotency,
  [param('docId').isString().notEmpty(), body('checklistId').isString().notEmpty(), body('answers').isArray()],
  validateRequest,
  (req, res) => publicationController.issueChecklist(req, res),
);

// Generate audit pack
router.post(
  '/publish/documents/:docId/audit-pack',
  authenticate(['publish:audit']),
  idempotency,
  [
    param('docId').isString().notEmpty(),
    body('version').isString().notEmpty(),
    body('checklistIds').isArray(),
  ],
  validateRequest,
  (req, res) => publicationController.generateAuditPack(req, res),
);

// Verify document
router.get(
  '/publish/verify',
  authenticate(['verify:read']),
  [query('docId').isString().notEmpty(), query('version').isString().notEmpty()],
  validateRequest,
  (req, res) => publicationController.verifyDocument(req, res),
);

module.exports = router;
