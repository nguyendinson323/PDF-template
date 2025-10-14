# Quick Start Guide

Get the Document Control Microservice running in under 10 minutes!

## 🚀 Option 1: Local Development (Fastest)

### Step 1: Install Dependencies
```bash
cd public
npm install
```

### Step 2: Configure Environment
```bash
cp .env.example .env
```

**Edit `.env` with minimal configuration:**
```env
PORT=3000
NODE_ENV=development
AUTH_MODE=jwt
AWS_REGION=us-east-1
S3_BUCKET=your-bucket-name
TEMPLATE_ROOT=../template
```

### Step 3: Start the Service
```bash
npm run dev
```

### Step 4: Test It
```bash
# Health check
curl http://localhost:3000/health

# Should return:
# {"status":"healthy","version":"1.0.0","uptime":5.2,...}
```

✅ **Done!** Service is running on http://localhost:3000

---

## 🐳 Option 2: Docker (Recommended for Testing)

### Step 1: Start with Docker Compose
```bash
cd public
docker-compose up -d
```

This starts:
- ✅ Document Control service (port 3000)
- ✅ LocalStack (local S3/KMS on port 4566)
- ✅ Prometheus (metrics on port 9090)
- ✅ Grafana (dashboards on port 3001)

### Step 2: Verify Services
```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f document-control
```

### Step 3: Test API
```bash
# Health check
curl http://localhost:3000/health

# Metrics
curl http://localhost:3000/metrics
```

### Step 4: Access Dashboards
- **API:** http://localhost:3000
- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3001 (login: admin/admin)

✅ **Done!** Full stack running with monitoring!

---

## 📝 Making Your First API Call

### 1. Get a JWT Token (Mock for Testing)

For development, you can bypass authentication or use a mock token. In production, get a real JWT from AWS Cognito.

### 2. Prepare Test Payload

Create `test-payload.json`:
```json
{
  "document": {
    "brand": {
      "logoUrl": "https://via.placeholder.com/150"
    },
    "code": "DOC-001",
    "title": "Sample Document",
    "semanticVersion": "v1.0.0",
    "publicationDate": "2024-01-15",
    "qr": {
      "baseUrl": "https://verify.example.com/"
    }
  },
  "context": {
    "areaCode": "ENG",
    "areaName": "Engineering",
    "typeCode": "PROC",
    "typeName": "Procedure",
    "classificationName": "Internal",
    "criticalityCode": "HIGH",
    "criticalityName": "High",
    "destinationPhase": "Production",
    "currentPhase": "Review",
    "statuscurrentPhase": "Active",
    "correlativocurrentPhase": "001",
    "stagePhase": "Draft"
  },
  "participants": {
    "creator": {
      "name": "John Doe",
      "jobTitle": "Engineer",
      "signature": null
    },
    "reviewers": [{
      "name": "Jane Smith",
      "jobTitle": "Senior Engineer",
      "signature": null
    }],
    "qac": {
      "name": "QA Manager",
      "jobTitle": "Quality Assurance",
      "signature": null
    },
    "approvers": [{
      "name": "Director",
      "jobTitle": "Engineering Director",
      "signature": null
    }],
    "dcontrol": {
      "name": "Doc Control",
      "jobTitle": "Document Controller",
      "signature": null
    }
  },
  "checklists": {
    "creator": {
      "id": "CHK-001",
      "date": "2024-01-10",
      "status": "Completed"
    },
    "review": [{
      "id": "CHK-002",
      "date": "2024-01-12",
      "status": "Completed"
    }],
    "qac": {
      "id": "CHK-003",
      "date": "2024-01-13",
      "status": "Completed"
    },
    "approval": [{
      "id": "CHK-004",
      "date": "2024-01-14",
      "status": "Completed"
    }],
    "publish": {
      "id": "CHK-005",
      "date": "2024-01-15",
      "status": "Completed"
    }
  },
  "revision_history": [{
    "version": "v1.0.0",
    "date": "2024-01-15",
    "revisionDescription": "Initial version",
    "responsibleName": "John Doe"
  }],
  "bodyPdfUrl": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
}
```

### 3. Start a Publication Job

```bash
curl -X POST http://localhost:3000/publish/documents/DOC-001/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d @test-payload.json
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### 4. Check Job Status

```bash
curl http://localhost:3000/publish/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "completedAt": "2024-01-15T10:30:07.000Z",
  "result": {
    "s3Key": "publish/DOC-001/v1.0.0/final.pdf",
    "s3Url": "s3://your-bucket/publish/DOC-001/v1.0.0/final.pdf",
    "sha256": "a1b2c3d4...",
    "tsaToken": {
      "timestamp": "2024-01-15T10:30:05.000Z",
      "serialNumber": "123456789"
    },
    "qrUrl": "https://verify.example.com/DOC-001v1.0.0"
  }
}
```

✅ **Success!** Your document has been published with TSA timestamp and uploaded to S3!

---

## 🧪 Using the Postman Collection

### Step 1: Import Collection

1. Open Postman
2. Click **Import**
3. Select `postman_collection.json`

### Step 2: Set Variables

In the collection, set these variables:
- `baseUrl`: `http://localhost:3000`
- `jwt_token`: Your JWT token (or mock for testing)

### Step 3: Run Requests

Pre-configured requests:
- ✅ Health Check
- ✅ Metrics
- ✅ Start Publication
- ✅ Get Job Status
- ✅ Issue Checklist
- ✅ Generate Audit Pack
- ✅ Verify Document

---

## 🔧 Common Tasks

### View Logs

**Local:**
```bash
# Development mode shows logs in console
npm run dev
```

**Docker:**
```bash
# Follow logs
docker-compose logs -f document-control

# Last 100 lines
docker-compose logs --tail=100 document-control
```

### Check Metrics

```bash
# Prometheus format
curl http://localhost:3000/metrics

# Key metrics to watch:
# - http_request_duration_seconds
# - job_processing_duration_seconds
# - active_jobs_total
# - tsa_requests_total
```

### Test Health Check

```bash
curl http://localhost:3000/health

# Healthy response:
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 120.5,
  "checks": {
    "s3": "ok",
    "tsa": "ok"
  }
}
```

### Stop Services

**Local:**
```bash
# Ctrl+C to stop npm run dev
```

**Docker:**
```bash
# Stop all services
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

---

## 🔑 Setting Up Real Authentication

### AWS Cognito Setup

1. **Create User Pool:**
```bash
aws cognito-idp create-user-pool \
  --pool-name document-control-pool \
  --auto-verified-attributes email
```

2. **Create App Client:**
```bash
aws cognito-idp create-user-pool-client \
  --user-pool-id YOUR_POOL_ID \
  --client-name document-control-client \
  --generate-secret \
  --allowed-o-auth-flows client_credentials \
  --allowed-o-auth-scopes "publish:doc" "publish:chk" "jobs:read"
```

3. **Get JWT Token:**
```bash
curl -X POST https://YOUR_DOMAIN.auth.us-east-1.amazoncognito.com/oauth2/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
```

4. **Update .env:**
```env
COGNITO_ISSUER=https://cognito-idp.us-east-1.amazonaws.com/YOUR_POOL_ID
COGNITO_JWKS_URI=https://cognito-idp.us-east-1.amazonaws.com/YOUR_POOL_ID/.well-known/jwks.json
COGNITO_CLIENT_ID=YOUR_CLIENT_ID
COGNITO_CLIENT_SECRET=YOUR_CLIENT_SECRET
```

---

## 📊 Viewing Metrics in Grafana

### Step 1: Access Grafana
Open http://localhost:3001 (admin/admin)

### Step 2: Add Prometheus Data Source
1. Go to Configuration → Data Sources
2. Add Prometheus
3. URL: `http://prometheus:9090`
4. Save & Test

### Step 3: Create Dashboard
Add panels for:
- **Request Duration:** `http_request_duration_seconds`
- **Job Processing:** `job_processing_duration_seconds`
- **Active Jobs:** `active_jobs_total`
- **TSA Requests:** `tsa_requests_total`

---

## 🐛 Troubleshooting

### "Cannot connect to AWS S3"

**Solution:** Use LocalStack for local development:
```bash
# In docker-compose.yml, LocalStack is already configured
# Update .env:
AWS_ENDPOINT_URL=http://localhost:4566
S3_BUCKET=test-bucket
```

### "TSA request failed"

**Solution:** Use a public TSA:
```env
TSA_URL_SANDBOX=http://timestamp.digicert.com
TSA_AUTH_MODE=none
```

### "Template not found"

**Solution:** Check template path:
```env
TEMPLATE_ROOT=../template
```

Verify folder exists:
```bash
ls -la ../template/
# Should show: Manifest.json, HeaderFooter.json, fonts/
```

### "Authentication failed"

**Solution:** For testing, temporarily disable auth:
```javascript
// In src/routes/index.js, comment out authenticate() middleware
// Or use a mock token for development
```

---

## 📚 Next Steps

1. **Read the full documentation:** [README.md](README.md)
2. **Deploy to production:** [DEPLOYMENT.md](DEPLOYMENT.md)
3. **Review API spec:** [openapi.yaml](openapi.yaml)
4. **Explore template pack:** [../template/README.md](../template/README.md)
5. **Run tests:** `npm test`

---

## 💡 Tips

- **Development:** Use LocalStack instead of real AWS
- **Testing:** Import Postman collection for quick API testing
- **Monitoring:** Check Grafana dashboards for insights
- **Debugging:** Enable DEBUG logs with `NODE_ENV=development`
- **Performance:** Monitor `/metrics` endpoint for bottlenecks

---

## 🆘 Need Help?

- **Documentation:** See [README.md](README.md)
- **Issues:** Check logs with `docker-compose logs -f`
- **Support:** Contact support@passfy.com

---

**Happy Publishing! 🎉**

Your document control microservice is now ready to generate compliant PDFs with timestamps and secure storage!
