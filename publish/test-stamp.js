// Test /stamp endpoint
import { readFileSync } from 'fs';

const dto = JSON.parse(readFileSync('Pack/examples/dto-s3.json', 'utf8'));

const response = await fetch('http://localhost:8080/stamp', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(dto),
});

const result = await response.json();
console.log('Response:', JSON.stringify(result, null, 2));

if (result.status === 'completed') {
  console.log('✅ /stamp endpoint works!');
  console.log(`S3 Key: ${result.s3Key}`);
} else {
  console.log('❌ /stamp failed:', result);
}
