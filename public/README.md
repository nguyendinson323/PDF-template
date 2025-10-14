# Document Control Microservice

A production-ready, stateless microservice for document publication and compliance stamping with RFC 3161 TimeStamp Authority (TSA) integration and AWS S3 storage.

## Features

- **Complete PDF Generation Pipeline**
  - Dynamic cover page generation from JSON payload
  - Header/footer stamping on all pages
  - QR code generation for document verification
  - Signature block rendering with image support

- **Compliance & Security**
  - SHA-256 hash computation
  - RFC 3161 TSA timestamp tokens (PAdES DocTimeStamp)
  - AWS S3 upload with SSE-KMS encryption
  - S3 Object Lock support (Governance/Compliance modes)

- **Enterprise-Ready**
  - JWT authentication via AWS Cognito
  - mTLS support for mutual authentication
  - Idempotent API with conflict detection
  - Structured logging with Winston
  - Prometheus metrics endpoint
  - OpenAPI 3.0 specification
  - Comprehensive health checks

- **Production Features**
  - Docker containerization
  - Kubernetes-ready deployment
  - Graceful shutdown handling
  - Request validation
  - Error handling with proper HTTP status codes
  - Background job processing

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Microservice (Node.js)                   │
├─────────────────────────────────────────────────────────────┤
│  API Layer (Express.js)                                     │
│    ├── Authentication Middleware (JWT/mTLS)                │
│    ├── Idempotency Middleware                              │
│    ├── Request Validation                                   │
│    └── Error Handler                                        │
├─────────────────────────────────────────────────────────────┤
│  Business Logic                                             │
│    ├── PublicationService                                   │
│    ├── CoverGeneratorService (from template pack)          │
│    ├── TSAService (RFC 3161)                               │
│    └── S3Service (AWS SDK)                                 │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure                                              │
│    ├── JobStore (in-memory)                                │
│    ├── Logger (Winston)                                     │
│    └── MetricsCollector (prom-client)                      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (optional)
- AWS Account with S3 and KMS access
- AWS Cognito User Pool (for JWT auth)
- TSA endpoint (e.g., DigiCert, Sectigo)

### Installation

1. **Clone and install dependencies:**
```bash
cd public
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Run the service:**
```bash
# Development
npm run dev

# Production
npm start
```

4. **Using Docker:**
```bash
# Build and run
docker-compose up -d

# View logs
docker-compose logs -f document-control

# Stop
docker-compose down
```

## Configuration

### Environment Variables

See [env.example](env.example) for all configuration options. Key variables:

#### Networking
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

#### Authentication
- `AUTH_MODE`: Authentication mode (`jwt` or `mtls`)
- `COGNITO_ISSUER`: AWS Cognito issuer URL
- `COGNITO_JWKS_URI`: JWKS endpoint for JWT verification
- `REQUIRED_SCOPES`: Comma-separated list of required scopes

#### AWS
- `AWS_REGION`: AWS region
- `S3_BUCKET`: S3 bucket name
- `S3_PREFIX`: S3 key prefix (default: `publish/`)
- `KMS_KEY_ARN`: KMS key ARN for encryption
- `S3_OBJECT_LOCK_MODE`: Object Lock mode (`GOVERNANCE` or `COMPLIANCE`)
- `S3_OBJECT_LOCK_RETENTION_DAYS`: Retention period in days

#### TSA (Time Stamp Authority)
- `TSA_URL_SANDBOX`: TSA endpoint for development
- `TSA_URL_PROD`: TSA endpoint for production
- `TSA_AUTH_MODE`: Authentication mode (`none`, `basic`, `oauth`, `mtls`)
- `TSA_HASH_ALG`: Hash algorithm (default: `SHA-256`)
- `TSA_TIMEOUT_MS`: Request timeout (default: 4000ms)
- `TSA_RETRIES`: Number of retry attempts (default: 2)

#### Templates
- `TEMPLATE_ROOT`: Path to template folder (default: `../template`)
- `TEMPLATE_MANIFEST`: Manifest filename (default: `Manifest.json`)
- `TEMPLATE_HEADERFOOTER`: HeaderFooter config (default: `HeaderFooter.json`)

#### Service Behavior
- `IDEMPOTENCY_TTL_SECONDS`: Idempotency key TTL (default: 86400)
- `MAX_INPUT_SIZE_MB`: Maximum request body size (default: 15MB)
- `PDFA_LEVEL`: PDF/A compliance level (default: `2b`)

## API Documentation

### OpenAPI Specification

See [openapi.yaml](openapi.yaml) for the complete API specification.

### Postman Collection

Import [postman_collection.json](postman_collection.json) into Postman for ready-to-use API requests.

### Endpoints

#### Health & Metrics
- `GET /health` - Health check with S3 and TSA status
- `GET /metrics` - Prometheus metrics

#### Publication
- `POST /publish/documents/{docId}/start` - Start publication job
- `GET /publish/jobs/{jobId}` - Get job status

#### Checklists
- `POST /publish/documents/{docId}/checklists` - Issue checklist PDF

#### Audit
- `POST /publish/documents/{docId}/audit-pack` - Generate audit pack

#### Verification
- `GET /publish/verify?docId={docId}&version={version}` - Verify document

### Authentication

All endpoints require authentication via Bearer token:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     http://localhost:3000/health
```

### Idempotency

POST endpoints require an `Idempotency-Key` header:

```bash
curl -X POST \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Idempotency-Key: unique-key-12345" \
     -H "Content-Type: application/json" \
     -d @payload.json \
     http://localhost:3000/publish/documents/DOC-001/start
```

## Template Pack Integration

This microservice consumes the Template Pack from the `../template` folder:

- **Manifest.json**: Defines table structures and field positions
- **HeaderFooter.json**: Defines header/footer layout
- **var_cover.json**: Variable mapping reference
- **Fonts**: Inter-Regular.ttf, Inter-Bold.ttf
- **QA Payloads**: Test payloads in `qa/payloads/`

The `CoverGeneratorService` implements the logic from `generate-golden.js` to render dynamic PDFs from JSON payloads.

## Development

### Project Structure

```
public/
├── src/
│   ├── config/           # Configuration management
│   ├── controllers/      # Request handlers
│   ├── middleware/       # Authentication, idempotency, etc.
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   │   ├── CoverGeneratorService.js    # Template rendering
│   │   ├── PublicationService.js       # Orchestration
│   │   ├── S3Service.js                # S3 operations
│   │   └── TSAService.js               # RFC 3161 TSA
│   ├── utils/            # Logger, metrics
│   └── server.js         # Express app
├── tests/
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
├── Dockerfile            # Container definition
├── docker-compose.yml    # Multi-container setup
├── openapi.yaml          # API specification
├── postman_collection.json
├── package.json
└── README.md
```

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Watch mode
npm run test:watch
```

### Linting

```bash
# Check code
npm run lint

# Auto-fix issues
npm run lint:fix
```

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t document-control-microservice:1.0.0 .

# Run container
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/../template:/app/templates:ro \
  --env-file .env \
  --name document-control \
  document-control-microservice:1.0.0
```

### Kubernetes Deployment

See `k8s/` folder for Kubernetes manifests (deployment, service, configmap, secrets).

```bash
# Apply manifests
kubectl apply -f k8s/

# Check status
kubectl get pods -l app=document-control

# View logs
kubectl logs -f deployment/document-control
```

### AWS EKS Deployment

1. Create EKS cluster
2. Set up IAM roles for S3/KMS access
3. Deploy using Helm or kubectl
4. Configure ALB Ingress Controller
5. Set up AWS Cognito for authentication

## Monitoring

### Prometheus Metrics

The service exposes Prometheus metrics at `/metrics`:

```bash
curl http://localhost:3000/metrics
```

**Key Metrics:**
- `http_request_duration_seconds` - HTTP request latency
- `job_processing_duration_seconds` - Job processing time
- `job_stages_duration_seconds` - Individual stage durations
- `active_jobs_total` - Number of active jobs
- `s3_upload_size_bytes` - S3 upload sizes
- `tsa_requests_total` - TSA request count

### Grafana Dashboards

Use the included Grafana setup in `docker-compose.yml`:

1. Access Grafana at http://localhost:3001
2. Login with `admin/admin`
3. Add Prometheus datasource (http://prometheus:9090)
4. Import dashboard or create custom visualizations

### Logging

Structured JSON logs are written to:
- Console (stdout)
- `logs/combined.log` (all logs)
- `logs/error.log` (errors only)

**Log Format:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "level": "info",
  "message": "Job started",
  "jobId": "uuid",
  "docId": "DOC-001",
  "operation": "publication"
}
```

## Troubleshooting

### Common Issues

**1. TSA Connection Failed**
```
Error: TSA request failed: ECONNREFUSED
```
Solution: Check TSA_URL_SANDBOX/PROD and firewall rules. Verify TSA endpoint is accessible.

**2. S3 Access Denied**
```
Error: S3 upload failed: AccessDenied
```
Solution: Verify AWS credentials, IAM roles, and KMS key permissions.

**3. JWT Verification Failed**
```
Error: Invalid or expired token
```
Solution: Check COGNITO_ISSUER and COGNITO_JWKS_URI are correct. Ensure token is not expired.

**4. Template Not Found**
```
Error: Failed to load manifest
```
Solution: Verify TEMPLATE_ROOT points to the correct template folder.

### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development npm run dev
```

## Performance

### Benchmarks

Typical performance (p95):
- Cover generation: ~500ms
- PDF merge: ~300ms
- TSA request: ~1-3s (network dependent)
- S3 upload: ~500ms-2s (size dependent)
- **Total pipeline: ~3-7s**

### Optimization Tips

1. **Enable caching** for repeated logo URLs
2. **Use Redis** instead of in-memory job store for horizontal scaling
3. **Increase TSA timeout** for slow networks
4. **Use S3 Transfer Acceleration** for faster uploads
5. **Deploy closer to TSA endpoint** to reduce latency

## Security

### Best Practices

- ✅ All secrets in environment variables (never in code)
- ✅ TLS 1.2+ for all external communications
- ✅ JWT validation with proper issuer verification
- ✅ mTLS support for mutual authentication
- ✅ S3 server-side encryption with KMS
- ✅ Object Lock for immutable documents
- ✅ No sensitive data in logs
- ✅ Non-root container user
- ✅ Health checks without authentication
- ✅ Request size limits
- ✅ Graceful error handling

### Compliance

- **RFC 3161**: TimeStamp Protocol implementation
- **PAdES**: PDF Advanced Electronic Signatures (B-LTA profile)
- **PDF/A**: Archival format support (2b level)
- **GDPR**: No PII in logs, data retention controls
- **SOC 2**: Audit logging, access controls

## Support

### Documentation

- [API Reference](openapi.yaml)
- [Template Pack Docs](../template/README.md)
- [Template API Reference](../template/API_REFERENCE.md)

### Contact

For issues, questions, or contributions:
- GitHub Issues: [github.com/yourorg/document-control](https://github.com/yourorg/document-control)
- Email: support@passfy.com

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Changelog

### v1.0.0 (2024-01-15)
- Initial release
- Complete publication pipeline
- RFC 3161 TSA integration
- S3 upload with SSE-KMS
- JWT/mTLS authentication
- Idempotency support
- Prometheus metrics
- Docker containerization
- OpenAPI 3.0 specification
- Comprehensive test suite

---

**Built with:** Node.js, Express, pdf-lib, AWS SDK, PKI.js

**Maintained by:** Passfy Document Control Team
