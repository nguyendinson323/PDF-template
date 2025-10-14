const client = require('prom-client');

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

const jobProcessingDuration = new client.Histogram({
  name: 'job_processing_duration_seconds',
  help: 'Duration of job processing in seconds',
  labelNames: ['job_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300],
});

const jobStagesDuration = new client.Histogram({
  name: 'job_stages_duration_seconds',
  help: 'Duration of job stages in seconds',
  labelNames: ['stage'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const activeJobs = new client.Gauge({
  name: 'active_jobs_total',
  help: 'Number of currently active jobs',
  labelNames: ['status'],
});

const s3UploadSize = new client.Histogram({
  name: 's3_upload_size_bytes',
  help: 'Size of files uploaded to S3',
  labelNames: ['file_type'],
  buckets: [1000, 10000, 100000, 1000000, 10000000, 50000000],
});

const tsaRequestCounter = new client.Counter({
  name: 'tsa_requests_total',
  help: 'Total number of TSA requests',
  labelNames: ['status'],
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(jobProcessingDuration);
register.registerMetric(jobStagesDuration);
register.registerMetric(activeJobs);
register.registerMetric(s3UploadSize);
register.registerMetric(tsaRequestCounter);

// Middleware to track HTTP requests
function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe(
      {
        method: req.method,
        route: req.route ? req.route.path : req.path,
        status_code: res.statusCode,
      },
      duration,
    );
  });

  next();
}

// Export metrics endpoint handler
async function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}

module.exports = {
  register,
  metricsMiddleware,
  metricsHandler,
  metrics: {
    httpRequestDuration,
    jobProcessingDuration,
    jobStagesDuration,
    activeJobs,
    s3UploadSize,
    tsaRequestCounter,
  },
};
