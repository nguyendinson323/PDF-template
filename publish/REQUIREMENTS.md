# Document Publisher Microservice - Requirements

## Project Overview

A **stateless, server-to-server microservice** that generates official PDFs with cover pages, headers/footers, SHA-256 hash, RFC 3161 timestamps, and uploads to AWS S3.

**Key Principle**: This microservice **CONSUMES** the Template Pack from `../template/` folder. It does NOT reimplement the PDF generation logic.

---

## Architecture

```
Backend (Materio) → REST API → PDF Generation → S3 Upload
                       ↓
                  Template Pack
              (Manifest.json,
               HeaderFooter.json,
               generate-golden.js)
```

---

## API Endpoints

### 1. `GET /health`
- **Purpose**: Health check endpoint
- **Response**: `{ "status": "ok", "timestamp": "..." }`
- **Auth**: None

### 2. `POST /stamp`
- **Purpose**: Generate stamped PDF from S3 body reference
- **Content-Type**: `application/json`
- **Auth**: Bearer token
- **Input**: DTO with `bodySource.s3Key` pointing to existing PDF in S3
- **Process**:
  1. Download body PDF from S3 (using `bodySource.bucket` and `bodySource.s3Key`)
  2. Generate cover page using Template Pack
  3. Apply header/footer stamping to all body pages
  4. Merge cover + body
  5. Upload to `document.s3Refs.stamped` path
- **Output**:
  ```json
  {
    "status": "completed",
    "s3Key": "Desarrollo/stamped/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf",
    "pages": 15,
    "timestamp": "2025-03-12T10:30:00Z"
  }
  ```

### 3. `POST /publish`
- **Purpose**: Generate official published PDF with TSA and hash
- **Content-Type**: `multipart/form-data`
- **Auth**: Bearer token
- **Input**:
  - `dto`: JSON file (DTO structure)
  - `body`: PDF file (body content)
- **Process**:
  1. Read uploaded body PDF
  2. Generate cover page using Template Pack
  3. Apply header/footer stamping
  4. Merge cover + body
  5. Compute SHA-256 hash
  6. Get TSA timestamp (RFC 3161)
  7. Embed PAdES DocTimeStamp (for official publish only)
  8. Upload to `document.s3Refs.official` path (for V-* phases)
- **Output**:
  ```json
  {
    "status": "published",
    "s3Key": "Publicados/official/PAS-L1-GOV-PRC-001-v2.0.0.pdf",
    "sha256": "a3f2b9c8d1e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0",
    "tsaTime": "2025-03-12T10:30:00Z",
    "tsaSerial": "TSA-2025-001",
    "qrUrl": "https://verify.passfy.io/docPAS-L1-GOV-PRC-001v2.0.0",
    "pages": 15,
    "timestamp": "2025-03-12T10:30:00Z"
  }
  ```

---

## Data Contract (DTO)

### Document Object
```javascript
{
  "code": "PAS-L1-GOV-PRC-001",              // Unique document code
  "title": "Document Control Procedure",     // Document title
  "publicationDate": "2025-03-12",           // ISO 8601 date
  "semanticVersion": "v2.0.0",               // Semantic version
  "brand": { "logoUrl": "https://..." },     // Company logo URL
  "qr": { "baseUrl": "https://verify..." },  // QR base URL
  "security": {
    "hashSha256": "",                        // Computed by microservice
    "tsaTime": "",                           // From TSA response
    "tsaSerial": ""                          // From TSA response
  },
  "storage": { "s3Key": "" },                // Set by microservice
  "folderPath": "/GOV/PRC/...",              // Document folder path
  "s3Refs": {
    "body": "Desarrollo/bodies/{docId}-{semanticVersion}-{currentPhase}-{correlative}.pdf",
    "stamped": "Desarrollo/stamped/{docId}-{semanticVersion}-{currentPhase}-{correlative}.pdf",
    "official": "Publicados/official/{docId}-{semanticVersion}.pdf"
  }
}
```

### Context Object
```javascript
{
  "areaCode": "GOV",                         // Area code
  "areaName": "Governance",                  // Area name (human-readable)
  "typeCode": "PRC",                         // Document type code
  "typeName": "Procedimiento",               // Type name (Spanish)
  "criticalityCode": "L1",                   // L1, L2, L3
  "criticalityName": "Alta",                 // Alta, Media, Baja
  "classificationName": "Interna",           // Publica, Interna, Confidencial

  "currentPhase": "R-Final",                 // Current workflow phase
  "statuscurrentPhase": "Aprobada",          // Phase status
  "correlativocurrentPhase": "R-Final-001",  // Phase correlative

  "stagePhase": "Desarrollo",                // Stage: En Desarrollo, Desarrollo, Vigente, etc.
  "destinationPhase": "V-Major",             // Target phase: V-Test, V-Major, etc.

  "hasDiffReport": true,                     // Diff report flag
  "checklistsAllApproved": true              // Checklists approval flag
}
```

### Body Source (for /stamp endpoint)
```javascript
{
  "bucket": "passfy-docs-bucket",
  "s3Key": "Desarrollo/bodies/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf"
}
```

### Participants, Checklists, Revision History
```javascript
{
  "participants": {
    "creator": { "name": "...", "jobTitle": "..." },
    "reviewers": [{ "name": "...", "jobTitle": "..." }],
    "qac": { "name": "...", "jobTitle": "..." },
    "approvers": [{ "name": "...", "jobTitle": "..." }],
    "dcontrol": { "name": "...", "jobTitle": "..." }
  },
  "checklists": {
    "creator": { "id": "...", "date": "...", "status": "..." },
    "review": [{ "id": "...", "date": "...", "status": "..." }],
    "qac": { "id": "...", "date": "...", "status": "..." },
    "approval": [{ "id": "...", "date": "...", "status": "..." }],
    "publish": { "id": "...", "date": "...", "status": "..." }
  },
  "revision_history": [
    { "version": "v2.0.0", "date": "2025-03-12", "revisionDescription": "...", "responsibleName": "..." }
  ]
}
```

---

## Business Rules

### Phase and Stage Mapping

**R-* Phases** (Review/Draft phases):
- `stagePhase` MUST be `"En Desarrollo"`
- Examples: R-Draft, R-View, R-Approval, R-qac, R-Final

**V-Test, V-Major, V-Minor, V-Patch** (Version phases):
- `stagePhase`: `"Desarrollo"` → before publish (no TSA/hash)
- `stagePhase`: `"Vigente"` → after publish (with TSA/hash)

**V-Deprecated**:
- `stagePhase`: `"Desarrollo"` → `"Sustituido"` after replacement published

**V-Cancelled**:
- `stagePhase`: `"En Desarrollo"` → `"Anulado"` after cancellation

**V-Obsolete**:
- `stagePhase`: `"En Desarrollo"` → `"Archivado"` after archival

### S3 Path Structure

**Development Paths** (R-* and V-* before publish):
- Bodies: `Desarrollo/bodies/{docId}-{semanticVersion}-{currentPhase}-{correlative}.pdf`
- Stamped: `Desarrollo/stamped/{docId}-{semanticVersion}-{currentPhase}-{correlative}.pdf`

**Official Path** (V-* after publish):
- `Publicados/official/{docId}-{semanticVersion}.pdf`

### QR Code Generation
- Format: `{document.qr.baseUrl}{document.code}{document.semanticVersion}`
- Example: `https://verify.passfy.io/docPAS-L1-GOV-PRC-001v2.0.0`
- For published docs, optionally append hash: `...v2.0.0-a3f2b9c8`

### Hash and TSA Rules
- **R-* phases**: NO hash, NO TSA (leave empty)
- **V-* phases before publish**: NO hash, NO TSA
- **V-* phases after /publish**: Compute SHA-256, get TSA, embed PAdES

---

## Template Pack Integration

### Files to Use
From `../template/` folder:
1. `Manifest.json` - Cover page table structure
2. `HeaderFooter.json` - Header/footer layout for body pages
3. `fonts/Inter-Regular.ttf` and `fonts/Inter-Bold.ttf`
4. **Core Logic**: Reuse rendering functions from `generate-golden.js`:
   - `resolveTemplate()` - Replace `{{placeholders}}`
   - `renderCoverHeader()` - Render cover header
   - `renderApprovalTable()` - Render FIRMAS Y APROBACIONES table
   - `renderSignatureBlocks()` - Render signature blocks
   - `renderRevisionTable()` - Render CONTROL DE CAMBIOS table
   - Text wrapping, border drawing, multi-page handling

### Placeholder Resolution
Use the mapping from `Pack/contract/cover_placeholders_mapping.json`:
- `{{document.code}}` → `dto.document.code`
- `{{document.title}}` → `dto.document.title`
- `{{context.areaCode}}` → `dto.context.areaCode`
- `{{participants.creator.name}}` → `dto.participants.creator.name`
- `{{revision_history[].version}}` → Loop through `dto.revision_history[]`
- etc.

---

## Technical Stack

### Core Technologies
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **PDF Library**: pdf-lib (already used in template)
- **Font Handling**: @pdf-lib/fontkit
- **QR Code**: qrcode library
- **AWS SDK**: @aws-sdk/client-s3, @aws-sdk/client-kms
- **Crypto**: Node.js crypto module (SHA-256)
- **TSA**: Mock for development, real RFC 3161 client for production

### Dependencies to Add
```json
{
  "express": "^4.18.0",
  "multer": "^1.4.5-lts.1",
  "dotenv": "^16.0.0",
  "@aws-sdk/client-s3": "^3.0.0",
  "@aws-sdk/client-kms": "^3.0.0",
  "pdf-lib": "^1.17.1",
  "@pdf-lib/fontkit": "^1.1.1",
  "qrcode": "^1.5.4"
}
```

---

## Environment Configuration

Create `.env` file:
```env
# Server
PORT=8080
NODE_ENV=development

# AWS S3
AWS_REGION=us-east-1
S3_BUCKET=passfy-docs-bucket
S3_USE_LOCAL=true
S3_LOCAL_PATH=./s3-local

# AWS KMS (for SSE-KMS encryption)
KMS_KEY_ID=alias/passfy-docs-key

# TSA (Time Stamp Authority)
TSA_URL=https://freetsa.org/tsr
TSA_USE_MOCK=true

# Template Pack
TEMPLATE_PATH=../template

# Auth (simple for development)
AUTH_ENABLED=false
AUTH_BEARER_TOKEN=TEST

# Logging
LOG_LEVEL=debug
```

---

## Security Requirements

1. **Authentication**: Bearer token (JWT in production)
2. **S3 Encryption**: SSE-KMS for all uploads
3. **Object Lock**: Enable for official publications (compliance mode)
4. **TLS**: 1.2+ for all external connections
5. **No Secrets in Logs**: Sanitize all log outputs
6. **Input Validation**: Validate all DTO fields against schema

---

## Performance Requirements

- **Response Time**: p95 ≤ 7 seconds per job (2-5 MB PDFs)
- **Concurrency**: Support ≥50 parallel requests
- **Memory**: Efficient buffer handling for large PDFs
- **Timeouts**: 30s for S3 operations, 10s for TSA

---

## Error Handling

### HTTP Status Codes
- `200 OK` - Success
- `400 Bad Request` - Invalid DTO structure
- `401 Unauthorized` - Missing/invalid auth token
- `404 Not Found` - Body PDF not found in S3
- `422 Unprocessable Entity` - DTO validation failed
- `500 Internal Server Error` - PDF generation failed
- `502 Bad Gateway` - TSA unavailable
- `503 Service Unavailable` - S3 unavailable

### Error Response Format
```json
{
  "error": {
    "code": "INVALID_DTO",
    "message": "Missing required field: document.code",
    "details": { "field": "document.code" },
    "timestamp": "2025-03-12T10:30:00Z"
  }
}
```

---

## Testing Strategy

### Unit Tests
- DTO validation
- Placeholder resolution
- Path generation (S3 keys)
- Hash computation

### Integration Tests
- Mock S3 (using local filesystem)
- Mock TSA (return fake timestamp)
- Template Pack integration
- Cover + body merge

### Test Cases
1. `/stamp` with valid S3 body reference
2. `/publish` with multipart upload
3. R-* phase (no hash/TSA)
4. V-* phase publish (with hash/TSA)
5. Multi-page revision history (overflow)
6. Missing fields graceful handling
7. S3 upload failure retry
8. TSA timeout handling

---

## Logging and Monitoring

### Structured Logs (JSON)
```json
{
  "timestamp": "2025-03-12T10:30:00Z",
  "level": "info",
  "service": "document-publisher",
  "endpoint": "/stamp",
  "docId": "PAS-L1-GOV-PRC-001",
  "phase": "R-Final",
  "duration_ms": 3450,
  "s3_upload_ms": 1200,
  "pdf_generation_ms": 2100,
  "status": "success"
}
```

### Metrics to Track
- Request count by endpoint
- Response time (p50, p95, p99)
- Error rate by error type
- S3 upload time
- TSA call time
- PDF generation time
- Concurrent requests

---

## Deliverables

1. **Source Code**:
   - Express.js server with 3 endpoints
   - Template Pack integration
   - S3 upload module
   - TSA mock module
   - Hash computation

2. **Configuration**:
   - `.env.example`
   - `package.json` with all dependencies

3. **Documentation**:
   - `README.md` - Setup and run instructions
   - `API.md` - API documentation
   - This `REQUIREMENTS.md`

4. **Tests**:
   - Unit tests for core functions
   - Integration tests with mocks
   - Test payloads (use examples from Pack/)

5. **Docker**:
   - `Dockerfile` (Node.js slim)
   - `.dockerignore`
   - `docker-compose.yml` (with LocalStack for S3)

6. **Postman**:
   - Import `Pack/postman/DocumentPublisher.postman_collection.json`
   - Test all endpoints

---

## Success Criteria

✅ `/health` endpoint returns 200 OK

✅ `/stamp` generates PDF with cover + body from S3 reference

✅ `/publish` generates PDF with cover + body + hash + TSA

✅ Cover page matches Manifest.json layout exactly

✅ Header/footer applied to all body pages

✅ Revision history table handles overflow (new page)

✅ QR code generated correctly

✅ SHA-256 hash computed and embedded

✅ TSA timestamp embedded (mock for dev)

✅ S3 upload successful with SSE-KMS

✅ All Spanish labels preserved from contract

✅ No errors with example DTOs (dto-s3.json, dto-multipart.json)

✅ Postman collection works end-to-end

---

## Non-Functional Requirements

- **Stateless**: No database, no session state
- **Idempotent**: Same input = same output (future enhancement)
- **Scalable**: Horizontal scaling in Kubernetes
- **Observable**: Structured logs + metrics
- **Secure**: Auth, encryption, safe error handling
- **Maintainable**: Clean code, comments, modular design
- **Bilingual**: Support EN/ES labels (use Spanish from contract)

---

## Phase Planning

**Phase 1** (Current Milestone):
- ✅ Understand requirements
- ⏳ Implement `/health` endpoint
- ⏳ Implement `/stamp` endpoint (S3 body reference)
- ⏳ Implement `/publish` endpoint (multipart)
- ⏳ Template Pack integration
- ⏳ S3 mock (local filesystem)
- ⏳ TSA mock
- ⏳ Test with dto-s3.json and dto-multipart.json

**Phase 2** (Future):
- Idempotency support
- Real TSA integration
- Object Lock configuration
- Production AWS deployment
- Checklist generation
- Audit pack concatenation
- Verification endpoint

---

## References

- Template Pack: `../template/`
- Contract: `Pack/contract/contract-m1.json`
- Placeholder Mapping: `Pack/contract/cover_placeholders_mapping.json`
- Example DTOs: `Pack/examples/`
- Postman Collection: `Pack/postman/DocumentPublisher.postman_collection.json`
- Milestone Guide: `milestone.txt`
- Ship Instructions: `Pack/README_SHIP.md`
