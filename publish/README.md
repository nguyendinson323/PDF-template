# Document Publisher Service

A stateless REST API microservice for publishing official documents with digital stamping, cover page generation, and header/footer formatting.

## Overview

This service implements the complete document publication workflow:
- Generates professional cover pages with QR codes, approval tables, and revision history
- Applies headers and footers to document body pages
- Merges cover and body into final stamped PDF
- Computes SHA-256 hash for document integrity
- Obtains TSA timestamps for official versions
- Stores documents in S3 (local filesystem for development)

## Architecture

```
┌─────────────────┐
│  Client/API     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Express API    │  (Routes: /health, /stamp, /publish)
├─────────────────┤
│  Middleware     │  (Auth, Error Handler, Logger)
├─────────────────┤
│  Services       │  (Cover, Header/Footer, PDF Merge, QR, Hash, TSA)
├─────────────────┤
│  Storage        │  (S3 Service - Local/AWS)
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Template Pack  │  (Manifest.json, HeaderFooter.json, Fonts)
└─────────────────┘
```

## Features

- **Template Pack Integration**: Reuses battle-tested PDF generation logic from template folder
- **DTO Validation**: Comprehensive validation against contract-m1.json schema
- **Business Rules**: Phase-based logic (R-* development, V-* official versions)
- **Local S3 Simulation**: Filesystem-based storage for development
- **Structured Logging**: JSON-formatted logs with context
- **Performance**: Both endpoints complete in <500ms (requirement: <7s)
- **Error Handling**: Centralized error handling with custom error classes

## Prerequisites

- Node.js 18+ (ES modules)
- Template Pack in `../template/` folder (Manifest.json, HeaderFooter.json, fonts/)
- 257 npm packages (see package.json)

## Installation

```bash
cd publish
npm install
```

## Configuration

Create `.env` file (use `.env.example` as template):

```env
# Server
PORT=8080
NODE_ENV=development

# S3 Storage
S3_BUCKET=passfy-docs-bucket
S3_REGION=us-east-1
S3_USE_LOCAL=true
S3_LOCAL_PATH=./s3-local

# KMS (for future AWS integration)
KMS_KEY_ID=alias/passfy-docs-key

# TSA (Time Stamp Authority)
TSA_URL=https://freetsa.org/tsr
TSA_USE_MOCK=true

# Template Pack
TEMPLATE_PATH=../template

# Authentication
AUTH_ENABLED=false
AUTH_BEARER_TOKEN=your-secret-token-here

# Logging
LOG_LEVEL=debug
```

## Running the Service

```bash
npm start
```

Server will start on http://localhost:8080

## API Endpoints

### 1. Health Check

```bash
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "document-publisher",
  "timestamp": "2025-10-15T07:52:07.379Z",
  "uptime": 123.45,
  "env": "development"
}
```

### 2. Stamp Document (S3 → S3)

Downloads body PDF from S3, stamps it with cover/header/footer, uploads result.

```bash
POST /stamp
Content-Type: application/json

{
  "document": {
    "code": "PAS-L1-GOV-PRC-001",
    "title": "Proceso de Gestión de Cambios",
    "semanticVersion": "v2.0.0",
    ...
  },
  "bodySource": {
    "s3Key": "Desarrollo/bodies/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf"
  },
  ...
}
```

**Response:**
```json
{
  "status": "completed",
  "s3Key": "Desarrollo/stamped/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf",
  "qrUrl": "https://verify.passfy.io/docPAS-L1-GOV-PRC-001v2.0.0",
  "pages": 4,
  "timestamp": "2025-10-15T07:52:47.853Z",
  "duration_ms": 426
}
```

### 3. Publish Document (Multipart Upload)

Uploads body PDF + DTO, generates stamped version, computes hash, gets TSA (if official).

```bash
POST /publish
Content-Type: multipart/form-data

Form fields:
- dto: JSON file (DTO structure)
- body: PDF file (document body)
```

**Response:**
```json
{
  "status": "published",
  "s3Key": "Desarrollo/stamped/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf",
  "sha256": "c00f963d74b26fd1a6b11672aecb024df987c231e69cee9809123f91e104e48b",
  "tsaTime": "2025-10-15T07:55:42.449Z",
  "qrUrl": "https://verify.passfy.io/docPAS-L1-GOV-PRC-001v2.0.0",
  "pages": 213,
  "timestamp": "2025-10-15T07:55:42.450Z",
  "duration_ms": 360
}
```

## Testing

Run test scripts:

```bash
# Test /stamp endpoint
node test-stamp.js

# Test /publish endpoint
node test-publish.js
```

Both tests use `Pack/examples/dto-s3.json` and `Pack/examples/body.pdf`.

## DTO Structure

The service expects a complete DTO (Data Transfer Object) conforming to contract-m1.json:

```json
{
  "document": {
    "code": "PAS-L1-GOV-PRC-001",
    "title": "Document Title",
    "semanticVersion": "v2.0.0",
    "publicationDate": "2024-03-15",
    "brand": {
      "name": "Passfy",
      "logoUrl": "https://example.com/logo.png"
    },
    "qr": {
      "baseUrl": "https://verify.passfy.io/doc"
    },
    "s3Refs": {
      "body": "Desarrollo/bodies/...",
      "stamped": "Desarrollo/stamped/...",
      "official": "Publicados/official/..."
    }
  },
  "context": {
    "areaCode": "GOV",
    "areaName": "Gobierno",
    "typeCode": "PRC",
    "typeName": "Proceso",
    "currentPhase": "R-Final",
    "stagePhase": "En Desarrollo",
    "destinationPhase": "R-Final",
    "correlativocurrentPhase": "001",
    "criticalityCode": "L1",
    "criticalityName": "Alta",
    "classificationName": "Interna"
  },
  "participants": {
    "creator": { "name": "...", "jobTitle": "..." },
    "reviewers": [{ "name": "...", "jobTitle": "..." }],
    "qac": { "name": "...", "jobTitle": "..." },
    "approvers": [{ "name": "...", "jobTitle": "..." }],
    "dcontrol": { "name": "...", "jobTitle": "..." }
  },
  "checklists": {
    "creator": { "list": [...] },
    "review": { "list": [...] },
    "qac": { "list": [...] },
    "approval": { "list": [...] },
    "publish": { "list": [...] }
  },
  "revision_history": [
    {
      "version": "v2.0.0",
      "date": "2024-03-15",
      "revisionDescription": "Initial version",
      "responsibleName": "John Doe"
    }
  ]
}
```

## Business Rules

### Phase-Based Logic

**R-* Phases (Development):**
- R-Draft, R-View, R-Approval, R-qac, R-Final
- Storage: `Desarrollo/stamped/`
- Hash/TSA: Not required

**V-* Phases (Official):**
- V-Test, V-Major, V-Minor, V-Patch, V-Deprecated, V-Cancelled, V-Obsolete
- Storage: `Publicados/official/`
- Hash/TSA: Required
- Cover regenerated with hash and TSA timestamp

### S3 Path Generation

```javascript
// Body path
Desarrollo/bodies/{code}-{version}-{phase}-{correlative}.pdf

// Stamped path (R-* phases)
Desarrollo/stamped/{code}-{version}-{phase}-{correlative}.pdf

// Official path (V-* phases)
Publicados/official/{code}-{version}.pdf
```

## Project Structure

```
publish/
├── src/
│   ├── server.js                    # Express app entry point
│   ├── config/
│   │   └── index.js                 # Configuration management
│   ├── middleware/
│   │   ├── auth.js                  # Bearer token authentication
│   │   └── errorHandler.js          # Centralized error handling
│   ├── routes/
│   │   ├── health.js                # Health check endpoint
│   │   ├── stamp.js                 # /stamp endpoint
│   │   └── publish.js               # /publish endpoint
│   ├── services/
│   │   ├── coverGenerator.js        # Cover page generation
│   │   ├── headerFooterService.js   # Header/footer stamping
│   │   ├── pdfMerger.js             # PDF merging
│   │   ├── qrService.js             # QR code generation
│   │   ├── hashService.js           # SHA-256 computation
│   │   ├── tsaService.js            # TSA timestamp service
│   │   ├── s3Service.js             # S3 operations
│   │   └── templateService.js       # Template Pack loader
│   └── utils/
│       ├── logger.js                # Structured logging
│       ├── errors.js                # Custom error classes
│       ├── dtoValidator.js          # DTO validation
│       └── pdfUtils.js              # PDF rendering utilities
├── s3-local/                        # Local S3 simulation
│   ├── Desarrollo/
│   │   ├── bodies/
│   │   └── stamped/
│   └── Publicados/
│       └── official/
├── test-stamp.js                    # Test /stamp endpoint
├── test-publish.js                  # Test /publish endpoint
├── create-test-body.js              # Generate test PDF
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── REQUIREMENTS.md                  # Detailed requirements
├── TODO.txt                         # Implementation plan
└── PROGRESS.md                      # Progress tracking
```

## Cover Page Layout

The generated cover page includes:

1. **Header Section**
   - Document title (left)
   - QR code for verification (right)
   - Brand logo (right)

2. **Approval Table (FIRMAS Y APROBACIONES)**
   - Role, Name, Job Title, Signature Date, Initials
   - Rows: Creator, Reviewer(s), QAC, Approver(s), Document Control

3. **Signature Blocks**
   - Individual blocks for each approver
   - Includes: Signature area, Approver name, Job title
   - Visual formatting with borders

4. **Revision History Table (CONTROL DE CAMBIOS)**
   - Version, Date, Revision Description, Responsible

## Performance

**Benchmark Results:**
- `/stamp`: 426ms (1.7KB body → 426KB stamped)
- `/publish`: 360ms (includes hash + TSA mock)
- Target: <7000ms ✅

## Error Handling

The service uses custom error classes for proper HTTP status codes:

- `ValidationError` (422): DTO validation failures
- `NotFoundError` (404): S3 file not found
- `ServiceUnavailableError` (503): S3, TSA, or external service failures
- `AuthenticationError` (401): Invalid bearer token

All errors return structured JSON:

```json
{
  "error": {
    "message": "DTO validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "errors": [
        "document.code is required",
        "context.currentPhase must be one of: R-Draft, R-View, ..."
      ]
    }
  }
}
```

## Logging

Structured JSON logs with context:

```json
{
  "timestamp": "2025-10-15T07:55:42.450Z",
  "level": "info",
  "service": "document-publisher",
  "message": "Publish completed",
  "docId": "PAS-L1-GOV-PRC-001",
  "s3Key": "Desarrollo/stamped/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf",
  "duration_ms": 360
}
```

Log levels: `debug`, `info`, `warn`, `error`

## Security

- **Authentication**: Bearer token (optional, disabled in development)
- **Validation**: Comprehensive DTO validation to prevent malformed data
- **Hash Verification**: SHA-256 hash for document integrity
- **TSA Timestamps**: Cryptographic proof of document existence at specific time

## Future Enhancements

- Docker containerization
- Production AWS S3 integration
- Real RFC 3161 TSA integration
- KMS encryption for sensitive documents
- Checklist generation endpoint
- Audit pack generation endpoint
- Document verification endpoint
- Comprehensive test suite (unit + integration)
- Rate limiting and request throttling
- API documentation with Swagger/OpenAPI

## Troubleshooting

### Port already in use

```bash
# Windows
netstat -ano | findstr :8080
taskkill /PID <pid> /F

# Linux/Mac
lsof -i :8080
kill -9 <pid>
```

### DTO validation errors

Check that your DTO includes all required fields:
- `document.code`, `document.title`, `document.semanticVersion`
- `context.currentPhase`, `context.stagePhase`
- `participants.creator`, `participants.reviewers`, `participants.approvers`
- `checklists.creator`, `checklists.review`, etc.
- `revision_history` (at least one entry)

Use `Pack/examples/dto-s3.json` as reference.

### Template Pack not found

Ensure the template folder is at `../template/` relative to publish folder:
```
projects/
├── PDF-template/
│   ├── template/          # Template Pack
│   │   ├── Manifest.json
│   │   ├── HeaderFooter.json
│   │   └── fonts/
│   └── publish/           # This service
```

## License

Internal project - Passfy Documentation System

## Support

For issues or questions, refer to:
- [REQUIREMENTS.md](./REQUIREMENTS.md) - Detailed requirements
- [TODO.txt](./TODO.txt) - Implementation stages
- [PROGRESS.md](./PROGRESS.md) - Development progress
- Server logs in `publish/server.log`
