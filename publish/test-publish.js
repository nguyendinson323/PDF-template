// Test /publish endpoint with complete DTO
import { readFileSync } from 'fs';

// Use dto-s3.json which has complete data
const dtoJson = readFileSync('Pack/examples/dto-s3.json', 'utf8');
const bodyPdf = readFileSync('Pack/examples/body.pdf');

const formData = new FormData();
formData.append('dto', new Blob([dtoJson], { type: 'application/json' }), 'dto.json');
formData.append('body', new Blob([bodyPdf], { type: 'application/pdf' }), 'body.pdf');

const response = await fetch('http://localhost:8080/publish', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
console.log('Response:', JSON.stringify(result, null, 2));

if (result.status === 'published') {
  console.log('✅ /publish endpoint works!');
  console.log(`S3 Key: ${result.s3Key}`);
  if (result.sha256) console.log(`SHA-256: ${result.sha256}`);
  if (result.tsaTime) console.log(`TSA: ${result.tsaTime}`);
  console.log(`QR URL: ${result.qrUrl}`);
} else {
  console.log('❌ /publish failed:', result);
}
