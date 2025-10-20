// Node.js test script endpoints
// Run with: node test-node.js

const BASE_URL = 'http://localhost:8080';
const API_KEY = 'TEST';

async function testEndpoint(name, method, url, body = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📋 Testing: ${name}`);
  console.log(`   ${method} ${url}`);
  console.log('='.repeat(60));

  try {
    const options = {
      method,
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    console.log(`\n✅ Status: ${response.status} ${response.statusText}`);
    console.log('\n📄 Response:');
    console.log(JSON.stringify(data, null, 2));

    return { success: response.ok, data };
  } catch (error) {
    console.log(`\n❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Final - ENDPOINT TESTING');
  console.log('='.repeat(60));

  // Test 1: Verify
  await testEndpoint(
    'POST /verify - Document Verification',
    'POST',
    `${BASE_URL}/verify`,
    {
      docId: 'PAS-L1-GOV-PRC-001',
      version: 'v2.0.0'
    }
  );

  // Test 2: Submit Checklists
  await testEndpoint(
    'POST /checklists - Submit Checklist Entries',
    'POST',
    `${BASE_URL}/publish/documents/PAS-L1-GOV-PRC-001/checklists`,
    {
      version: 'v2.0.0',
      entries: [
        {
          type: 'Creator',
          id: 'CHK-CR-2025-001',
          status: 'Aprobada',
          date: '2025-03-10'
        },
        {
          type: 'Reviewer',
          id: 'CHK-RV-2025-002',
          status: 'Aprobada',
          date: '2025-03-11'
        },
        {
          type: 'QAC',
          id: 'CHK-QA-2025-004',
          status: 'Aprobada',
          date: '2025-03-12'
        },
        {
          type: 'Approver',
          id: 'CHK-AP-2025-005',
          status: 'Aprobada',
          date: '2025-03-12'
        }
      ]
    }
  );

  // Test 3: Generate Audit Pack
  await testEndpoint(
    'POST /audit-pack - Generate Audit Pack',
    'POST',
    `${BASE_URL}/publish/documents/PAS-L1-GOV-PRC-001/audit-pack`,
    {
      version: 'v2.0.0'
    }
  );

  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL TESTS COMPLETED!');
  console.log('='.repeat(60));
  console.log('\n📁 Check generated files:');
  console.log('   - s3-local/checklists/PAS-L1-GOV-PRC-001-v2.0.0.json');
  console.log('   - s3-local/Publicados/audit-packs/PAS-L1-GOV-PRC-001-v2.0.0.pdf');
  console.log('');
}

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  process.exit(1);
});
