# Final: Verification, Checklists & Audit Pack

## Overview

Final adds three new endpoints for document verification, checklist submission, and audit pack generation.

## New Endpoints

### 1. POST /verify
Verifies official document integrity by computing SHA-256 hash and returning TSA information.

**Request:**
```json
{
  "docId": "PAS-L1-GOV-PRC-001",
  "version": "v2.0.0"
}
```

**Response:**
```json
{
  "docId": "PAS-L1-GOV-PRC-001",
  "version": "v2.0.0",
  "sha256": "<computed hash>",
  "tsaTime": "mock",
  "tsaSerial": "TSA-MOCK-001"
}
```

### 2. POST /publish/documents/:docId/checklists
Accepts and stores checklist entries for a document.

**Request:**
```json
{
  "version": "v2.0.0",
  "entries": [
    {
      "type": "QAC",
      "id": "CHK-QA-2025-004",
      "status": "Aprobada",
      "date": "2025-03-12"
    }
  ]
}
```

**Response:**
```json
{
  "status": "accepted",
  "docId": "PAS-L1-GOV-PRC-001",
  "version": "v2.0.0",
  "entriesCount": 1
}
```

### 3. POST /publish/documents/:docId/audit-pack
Concatenates official document and checklist PDFs into an audit pack.

**Request:**
```json
{
  "version": "v2.0.0"
}
```

**Response:**
```json
{
  "s3Key": "Publicados/audit-packs/PAS-L1-GOV-PRC-001-v2.0.0.pdf",
  "sizeBytes": 123456
}
```

## Test Commands

### Verify document
```bash
curl -s -X POST http://localhost:8080/verify \
  -H "x-api-key: TEST" \
  -H "Content-Type: application/json" \
  -d '{"docId":"PAS-L1-GOV-PRC-001","version":"v2.0.0"}' | jq
```

### Submit checklists
```bash
curl -s -X POST http://localhost:8080/publish/documents/PAS-L1-GOV-PRC-001/checklists \
  -H "x-api-key: TEST" \
  -H "Content-Type: application/json" \
  -d '{"version":"v2.0.0","entries":[{"type":"QAC","id":"CHK-QA-2025-004","status":"Aprobada","date":"2025-03-12"}]}' | jq
```

### Generate Audit Pack
```bash
curl -s -X POST http://localhost:8080/publish/documents/PAS-L1-GOV-PRC-001/audit-pack \
  -H "x-api-key: TEST" \
  -H "Content-Type: application/json" \
  -d '{"version":"v2.0.0"}' | jq
```

## Test Data Files

- **Official document**: `s3-local/Publicados/official/PAS-L1-GOV-PRC-001-v2.0.0.pdf`
- **Checklist sample**: `Pack/examples/checklists-sample.pdf`

## Folder Structure

```
s3-local/
├── Desarrollo/
│   ├── bodies/
│   └── stamped/
├── Publicados/
│   ├── official/
│   └── audit-packs/
└── checklists/
```

## Running Tests

1. **Start the server:**
   ```bash
   npm start
   ```

2. **Test using cURL** (see commands above)

3. **Test using Postman:**
   - Import `postman-collection.json`
   - Run the collection

## OpenAPI Documentation

OpenAPI specification is available in `openapi.yaml`. You can view it using:
- Swagger UI
- Postman (import OpenAPI file)
- VS Code OpenAPI extensions

## Implementation Notes

- **TSA Mock Mode**: `TSA_USE_MOCK=true` returns mock TSA values
- **Local Storage**: All files stored in `s3-local/` directory
- **Authentication**: Disabled in development (`AUTH_ENABLED=false`)
- **API Key**: Default key is `TEST` (set via `AUTH_BEARER_TOKEN`)

## Deliverables

✅ `/verify` endpoint - Document verification with SHA-256 hash
✅ `/checklists` endpoint - Checklist submission and storage
✅ `/audit-pack` endpoint - PDF concatenation for audit packs
✅ OpenAPI documentation (`openapi.yaml`)
✅ Postman collection (`postman-collection.json`)
✅ Test data file (`Pack/examples/checklists-sample.pdf`)
✅ Comprehensive documentation (this file)
