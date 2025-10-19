#!/bin/bash

# Milestone 3 Test Script
# Tests /verify, /checklists, and /audit-pack endpoints

BASE_URL="http://localhost:8080"
API_KEY="TEST"

echo "=========================================="
echo "  MILESTONE 3 - ENDPOINT TESTS"
echo "=========================================="
echo ""

# Test 1: Verify endpoint
echo "📋 Test 1: POST /verify"
echo "Verifying document..."
echo ""

curl -s -X POST "${BASE_URL}/verify" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"docId":"PAS-L1-GOV-PRC-001","version":"v2.0.0"}' | jq

echo ""
echo "=========================================="
echo ""

# Test 2: Submit checklists
echo "📋 Test 2: POST /publish/documents/:docId/checklists"
echo "Submitting checklists..."
echo ""

curl -s -X POST "${BASE_URL}/publish/documents/PAS-L1-GOV-PRC-001/checklists" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "v2.0.0",
    "entries": [
      {
        "type": "Creator",
        "id": "CHK-CR-2025-001",
        "status": "Aprobada",
        "date": "2025-03-10"
      },
      {
        "type": "Reviewer",
        "id": "CHK-RV-2025-002",
        "status": "Aprobada",
        "date": "2025-03-11"
      },
      {
        "type": "QAC",
        "id": "CHK-QA-2025-004",
        "status": "Aprobada",
        "date": "2025-03-12"
      },
      {
        "type": "Approver",
        "id": "CHK-AP-2025-005",
        "status": "Aprobada",
        "date": "2025-03-12"
      }
    ]
  }' | jq

echo ""
echo "=========================================="
echo ""

# Test 3: Generate audit pack
echo "📋 Test 3: POST /publish/documents/:docId/audit-pack"
echo "Generating audit pack..."
echo ""

curl -s -X POST "${BASE_URL}/publish/documents/PAS-L1-GOV-PRC-001/audit-pack" \
  -H "x-api-key: ${API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"version":"v2.0.0"}' | jq

echo ""
echo "=========================================="
echo ""
echo "✅ All tests completed!"
echo ""
echo "Check the following files:"
echo "  - s3-local/checklists/PAS-L1-GOV-PRC-001-v2.0.0.json"
echo "  - s3-local/Publicados/audit-packs/PAS-L1-GOV-PRC-001-v2.0.0.pdf"
echo ""
