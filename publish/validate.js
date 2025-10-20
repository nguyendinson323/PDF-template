// Validation script for Final implementation
// Checks if all required files and folders exist

import { existsSync, statSync } from 'fs';
import { join } from 'path';

const checks = [
  // Source files
  { path: 'src/routes/verify.js', type: 'file', desc: 'Verify endpoint route' },
  { path: 'src/routes/checklists.js', type: 'file', desc: 'Checklists endpoint route' },
  { path: 'src/routes/auditPack.js', type: 'file', desc: 'Audit pack endpoint route' },

  // Documentation
  { path: 'openapi.yaml', type: 'file', desc: 'OpenAPI specification' },
  { path: 'postman-collection.json', type: 'file', desc: 'Postman collection' },
  { path: 'final.md', type: 'file', desc: 'Final documentation' },

  // Test files
  { path: 'Pack/examples/checklists-sample.pdf', type: 'file', desc: 'Checklist sample PDF' },
  { path: 'test.sh', type: 'file', desc: 'Bash test script' },
  { path: 'test-node.js', type: 'file', desc: 'Node.js test script' },

  // Test data
  { path: 's3-local/Publicados/official/PAS-L1-GOV-PRC-001-v2.0.0.pdf', type: 'file', desc: 'Official test document' },

  // Required folders
  { path: 's3-local/Publicados/official', type: 'dir', desc: 'Official documents folder' },
  { path: 's3-local/Publicados/audit-packs', type: 'dir', desc: 'Audit packs folder', create: true },
  { path: 's3-local/checklists', type: 'dir', desc: 'Checklists folder', create: true },
];

console.log('\n' + '='.repeat(60));
console.log('📋 Final - VALIDATION');
console.log('='.repeat(60) + '\n');

let allValid = true;
let validCount = 0;
let invalidCount = 0;

for (const check of checks) {
  const fullPath = join(process.cwd(), check.path);
  const exists = existsSync(fullPath);

  if (exists) {
    const stats = statSync(fullPath);
    const isCorrectType = check.type === 'dir' ? stats.isDirectory() : stats.isFile();

    if (isCorrectType) {
      console.log(`✅ ${check.desc}`);
      console.log(`   ${check.path}`);
      if (check.type === 'file') {
        console.log(`   Size: ${stats.size} bytes`);
      }
      validCount++;
    } else {
      console.log(`❌ ${check.desc}`);
      console.log(`   ${check.path}`);
      console.log(`   Expected ${check.type} but found ${stats.isDirectory() ? 'directory' : 'file'}`);
      allValid = false;
      invalidCount++;
    }
  } else {
    if (check.create) {
      console.log(`⚠️  ${check.desc} (will be created at runtime)`);
      console.log(`   ${check.path}`);
      validCount++;
    } else {
      console.log(`❌ ${check.desc}`);
      console.log(`   ${check.path}`);
      console.log(`   File/folder does not exist`);
      allValid = false;
      invalidCount++;
    }
  }
  console.log('');
}

console.log('='.repeat(60));
console.log(`Results: ${validCount} valid, ${invalidCount} invalid`);
console.log('='.repeat(60) + '\n');

if (allValid) {
  console.log('✅ All required files and folders are in place!\n');
  console.log('Next steps:');
  console.log('1. Restart the server: npm start');
  console.log('2. Run tests: node test-node.js');
  console.log('');
  process.exit(0);
} else {
  console.log('❌ Some files are missing. Please check the errors above.\n');
  process.exit(1);
}
