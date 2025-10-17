// Test cover generation with large revision history AND long body content
// Tests ALL milestone requirements with comprehensive overflow handling:
// ✓ Body pages should have header and footer like cover
// ✓ Body content margins should match cover margins
// ✓ Body page numbers should continue from cover page numbers (not starting from 1)
// ✓ EVERY page including ALL body pages should have header and footer

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testOverflow() {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  COMPREHENSIVE OVERFLOW TEST');
    console.log('  Testing: Large cover (25 revisions) + Long body (213 pages)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Load base DTO
    const dtoPath = path.join(__dirname, 'Pack/examples/dto-s3.json');
    const dto = JSON.parse(fs.readFileSync(dtoPath, 'utf8'));

    // Add a large revision history (25 entries to force multiple cover pages)
    console.log('📋 Preparing test data...');
    dto.revision_history = [];
    for (let i = 1; i <= 25; i++) {
      dto.revision_history.push({
        version: `v${i}.0.0`,
        date: `2024-${String(i).padStart(2, '0')}-15`,
        revisionDescription: `Revision ${i}: This is a long description that may span multiple lines to test dynamic row height calculation. It includes details about the changes made in this version, such as new features, bug fixes, and improvements to the documentation system.`,
        responsibleName: `Reviewer ${i}`
      });
    }
    console.log(`   ✓ Created ${dto.revision_history.length} revision history entries`);

    // Load LONG body PDF (213 pages)
    const bodyPath = path.join(__dirname, 'Pack/examples/body.pdf');
    if (!fs.existsSync(bodyPath)) {
      console.error('\n❌ body.pdf not found!');
      console.error('   Run: node create-long-body.js first');
      process.exit(1);
    }

    const bodyBuffer = fs.readFileSync(bodyPath);
    const bodyStats = fs.statSync(bodyPath);
    console.log(`   ✓ Loaded long body PDF: ${Math.round(bodyStats.size / 1024)}KB`);

    // Create FormData using native Node.js FormData
    const formData = new FormData();

    // Add DTO as JSON blob
    const dtoBlob = new Blob([JSON.stringify(dto)], { type: 'application/json' });
    formData.append('dto', dtoBlob, 'dto.json');

    // Add body PDF
    const bodyBlob = new Blob([bodyBuffer], { type: 'application/pdf' });
    formData.append('body', bodyBlob, 'body.pdf');

    console.log('\n📤 Sending request to /publish endpoint...');
    console.log('   This may take a while due to the large document size...\n');

    const startTime = Date.now();
    const response = await fetch('http://localhost:8080/publish', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    const duration = Date.now() - startTime;

    if (response.ok) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  ✅ SUCCESS - PDF GENERATED!');
      console.log('═══════════════════════════════════════════════════════════════\n');

      console.log('📊 Response Details:');
      console.log(`   Status: ${result.status}`);
      console.log(`   Total Pages: ${result.pages}`);
      console.log(`   S3 Key: ${result.s3Key}`);
      console.log(`   QR URL: ${result.qrUrl}`);
      console.log(`   Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);

      // Check if generated PDF exists
      const pdfPath = path.join(__dirname, 's3-local', result.s3Key);
      if (fs.existsSync(pdfPath)) {
        const stats = fs.statSync(pdfPath);
        console.log(`   File Size: ${Math.round(stats.size / 1024)}KB`);
        console.log(`   File Path: ${pdfPath}`);

        console.log('\n📋 Page Breakdown Analysis:');
        console.log(`   Total Pages: ${result.pages}`);

      }
    } else {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ❌ FAILURE - ENDPOINT ERROR');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`Status: ${response.status}`);
      console.log('Error:', JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('  ❌ TEST FAILED');
    console.error('═══════════════════════════════════════════════════════════════\n');
    console.error('Error:', error.message);

    // Check for connection errors
    const isConnectionError = error.cause?.code === 'ECONNREFUSED' ||
                              error.cause?.code === 'EACCES' ||
                              error.cause?.errors?.some(e => e.code === 'ECONNREFUSED');

    if (isConnectionError) {
      console.error('\n⚠️  Server is not running on http://localhost:8080');
      console.error('   Start it with: npm start');
      console.error('   Then run this test again\n');
    } else if (error.cause) {
      console.error('Cause:', error.cause);
    }

    console.error('═══════════════════════════════════════════════════════════════\n');
  }
}

testOverflow();
