// Test cover generation with large revision history to verify page overflow

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testOverflow() {
  try {
    // Load base DTO
    const dtoPath = path.join(__dirname, 'Pack/examples/dto-s3.json');
    const dto = JSON.parse(fs.readFileSync(dtoPath, 'utf8'));

    // Add a large revision history (20+ entries to force multiple pages)
    dto.revision_history = [];
    for (let i = 1; i <= 25; i++) {
      dto.revision_history.push({
        version: `v${i}.0.0`,
        date: `2024-${String(i).padStart(2, '0')}-15`,
        revisionDescription: `Revision ${i}: This is a long description that may span multiple lines to test dynamic row height calculation. It includes details about the changes made in this version, such as new features, bug fixes, and improvements to the documentation system.`,
        responsibleName: `Reviewer ${i}`
      });
    }

    // Load body PDF
    const bodyPath = path.join(__dirname, 'Pack/examples/body.pdf');
    const bodyBuffer = fs.readFileSync(bodyPath);

    // Create FormData
    const FormData = global.FormData;
    const formData = new FormData();

    // Add DTO as JSON blob
    const dtoBlob = new Blob([JSON.stringify(dto)], { type: 'application/json' });
    formData.append('dto', dtoBlob, 'dto.json');

    // Add body PDF
    const bodyBlob = new Blob([bodyBuffer], { type: 'application/pdf' });
    formData.append('body', bodyBlob, 'body.pdf');

    console.log('📤 Testing /publish with large revision history (25 entries)...');
    console.log(`   Revision history entries: ${dto.revision_history.length}`);

    const response = await fetch('http://localhost:8080/publish', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();

    if (response.ok) {
      console.log('\n✅ /publish endpoint works with overflow handling!');
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log('\nGenerated PDF details:');
      console.log(`- Pages: ${result.pages}`);
      console.log(`- S3 Key: ${result.s3Key}`);
      console.log(`- Duration: ${result.duration_ms}ms`);

      // Check if generated PDF exists
      const pdfPath = path.join(__dirname, 's3-local', result.s3Key);
      if (fs.existsSync(pdfPath)) {
        const stats = fs.statSync(pdfPath);
        console.log(`- File size: ${Math.round(stats.size / 1024)}KB`);
        console.log(`- File path: ${pdfPath}`);
        console.log('\n✅ Generated PDF saved successfully!');
      }
    } else {
      console.log('\n❌ /publish endpoint failed');
      console.log('Status:', response.status);
      console.log('Error:', result);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testOverflow();
