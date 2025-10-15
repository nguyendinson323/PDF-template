// ==================================================================================
// Document Publisher Microservice - Main Server
// ==================================================================================
// Stateless microservice for generating official PDFs with covers, headers/footers,
// SHA-256 hash, and RFC 3161 timestamps
// ==================================================================================

import express from 'express';
import dotenv from 'dotenv';
import config from './config/index.js';
import logger from './utils/logger.js';
import authMiddleware from './middleware/auth.js';
import errorHandler from './middleware/errorHandler.js';
import healthRouter from './routes/health.js';
import stampRouter from './routes/stamp.js';
import publishRouter from './routes/publish.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = config.server.port;

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.logResponse(req, res, Date.now() - start);
  });
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Authentication middleware (applies to all routes except /health)
app.use(authMiddleware);

// Routes
app.use('/health', healthRouter);
app.use('/stamp', stampRouter);
app.use('/publish', publishRouter);

// Basic root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Document Publisher',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'GET /health',
      'POST /stamp',
      'POST /publish'
    ]
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info('Server started', {
    port: PORT,
    env: config.server.nodeEnv,
  });
  console.log(`🚀 Document Publisher listening on port ${PORT}`);
  console.log(`📝 Environment: ${config.server.nodeEnv}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Export for testing
export default app;
