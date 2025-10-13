const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

// Check if running in Windows CMD (no color support)
const isWindowsCmd = process.platform === 'win32' && !process.env.WT_SESSION;

// Color codes - disabled for Windows CMD
const colors = isWindowsCmd ? {
  reset: '',
  green: '',
  red: '',
  yellow: '',
  blue: '',
  cyan: ''
} : {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}======================================${colors.reset}`);
console.log(`${colors.cyan}  Template Pack Validator${colors.reset}`);
console.log(`${colors.cyan}======================================${colors.reset}\n`);

const ajv = new Ajv({ allErrors: true, strict: false });

let hasErrors = false;

// Helper function to print success message
function printSuccess(message) {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

// Helper function to print error message
function printError(message) {
  console.log(`${colors.red}✗${colors.reset} ${message}`);
  hasErrors = true;
}

// Helper function to print warning message
function printWarning(message) {
  console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

// Helper function to print info message
function printInfo(message) {
  console.log(`${colors.blue}ℹ${colors.reset} ${message}`);
}

// Check if file exists
function checkFileExists(filePath, description) {
  if (fs.existsSync(filePath)) {
    printSuccess(`${description} exists`);
    return true;
  } else {
    printError(`${description} not found: ${filePath}`);
    return false;
  }
}

// Validate JSON file against schema
function validateJsonFile(jsonPath, schemaPath, description) {
  printInfo(`Validating ${description}...`);

  try {
    // Load schema
    if (!checkFileExists(schemaPath, `Schema for ${description}`)) {
      return false;
    }
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    const schema = JSON.parse(schemaContent);

    // Load JSON file
    if (!checkFileExists(jsonPath, description)) {
      return false;
    }
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    const data = JSON.parse(jsonContent);

    // Validate
    const validate = ajv.compile(schema);
    const valid = validate(data);

    if (valid) {
      printSuccess(`${description} is valid`);
      return true;
    } else {
      printError(`${description} validation failed:`);
      validate.errors.forEach(error => {
        console.log(`  ${colors.red}•${colors.reset} ${error.instancePath || '/'}: ${error.message}`);
        if (error.params) {
          console.log(`    ${colors.yellow}${JSON.stringify(error.params)}${colors.reset}`);
        }
      });
      return false;
    }
  } catch (error) {
    printError(`Error validating ${description}: ${error.message}`);
    return false;
  }
}

// Validate test payload JSON files
function validateTestPayloads() {
  printInfo('Validating test payload files...');

  const payloadsDir = path.join(__dirname, 'qa', 'payloads');

  if (!fs.existsSync(payloadsDir)) {
    printError(`Payloads directory not found: ${payloadsDir}`);
    return false;
  }

  const payloadFiles = fs.readdirSync(payloadsDir).filter(f => f.endsWith('.json'));

  if (payloadFiles.length === 0) {
    printWarning('No payload files found in qa/payloads/');
    return false;
  }

  printInfo(`Found ${payloadFiles.length} test payload files`);

  let allValid = true;
  payloadFiles.forEach(file => {
    const filePath = path.join(payloadsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      // Basic structure validation
      const requiredFields = ['document', 'context', 'participants', 'checklists', 'revision_history'];
      const missingFields = requiredFields.filter(field => !data[field]);

      if (missingFields.length > 0) {
        printError(`${file}: Missing required fields: ${missingFields.join(', ')}`);
        allValid = false;
      } else {
        // Deep validation
        if (!data.document.code) {
          printWarning(`${file}: Missing document.code`);
        }
        if (!data.document.title) {
          printWarning(`${file}: Missing document.title`);
        }
        if (!data.document.semanticVersion) {
          printWarning(`${file}: Missing document.semanticVersion`);
        }
        if (!data.revision_history || data.revision_history.length === 0) {
          printWarning(`${file}: revision_history is empty`);
        }
        
        printSuccess(`${file} has valid structure`);
      }
    } catch (error) {
      printError(`${file}: ${error.message}`);
      allValid = false;
    }
  });

  return allValid;
}

// Check golden PDF files
function checkGoldenPDFs() {
  printInfo('Checking golden PDF files...');

  const goldenDir = path.join(__dirname, 'qa', 'golden');
  const payloadsDir = path.join(__dirname, 'qa', 'payloads');

  if (!fs.existsSync(goldenDir)) {
    printError(`Golden directory not found: ${goldenDir}`);
    return false;
  }

  if (!fs.existsSync(payloadsDir)) {
    printError(`Payloads directory not found: ${payloadsDir}`);
    return false;
  }

  const goldenFiles = fs.readdirSync(goldenDir).filter(f => f.endsWith('.pdf'));
  const payloadFiles = fs.readdirSync(payloadsDir).filter(f => f.endsWith('.json'));

  printInfo(`Found ${goldenFiles.length} golden PDF files`);
  printInfo(`Found ${payloadFiles.length} payload files`);

  let allValid = true;

  // Check if each payload has a corresponding golden PDF
  payloadFiles.forEach(payloadFile => {
    const baseName = payloadFile.replace('.json', '');
    const expectedPdf = `${baseName}.pdf`;
    
    if (goldenFiles.includes(expectedPdf)) {
      const pdfPath = path.join(goldenDir, expectedPdf);
      const stats = fs.statSync(pdfPath);
      
      if (stats.size < 1000) {
        printWarning(`${expectedPdf}: File seems too small (${stats.size} bytes)`);
      } else {
        printSuccess(`${expectedPdf} exists (${(stats.size / 1024).toFixed(2)} KB)`);
      }
    } else {
      printWarning(`Missing golden PDF for ${payloadFile}: ${expectedPdf}`);
    }
  });

  return allValid;
}

// Check font files
function checkFonts() {
  printInfo('Checking font files...');

  const regularFont = path.join(__dirname, 'fonts', 'Inter-Regular.ttf');
  const boldFont = path.join(__dirname, 'fonts', 'Inter-Bold.ttf');

  const regularExists = checkFileExists(regularFont, 'Inter-Regular.ttf');
  const boldExists = checkFileExists(boldFont, 'Inter-Bold.ttf');

  if (regularExists && boldExists) {
    // Check file sizes (TTF files should be reasonably large)
    const regularSize = fs.statSync(regularFont).size;
    const boldSize = fs.statSync(boldFont).size;

    if (regularSize < 10000) {
      printWarning('Inter-Regular.ttf seems too small, may be corrupted');
    } else {
      printSuccess(`Inter-Regular.ttf size: ${(regularSize / 1024).toFixed(2)} KB`);
    }

    if (boldSize < 10000) {
      printWarning('Inter-Bold.ttf seems too small, may be corrupted');
    } else {
      printSuccess(`Inter-Bold.ttf size: ${(boldSize / 1024).toFixed(2)} KB`);
    }
  }

  return regularExists && boldExists;
}

// Main validation
console.log(`${colors.blue}1. Core Template Files${colors.reset}`);
console.log('─'.repeat(40));
checkFileExists(path.join(__dirname, 'Cover.pdf'), 'Cover.pdf');
checkFileExists(path.join(__dirname, 'create-cover.js'), 'create-cover.js');
checkFileExists(path.join(__dirname, 'generate-golden.js'), 'generate-golden.js');
checkFileExists(path.join(__dirname, 'var_cover.json'), 'var_cover.json');
console.log();

console.log(`${colors.blue}2. Font Files${colors.reset}`);
console.log('─'.repeat(40));
checkFonts();
console.log();

console.log(`${colors.blue}3. JSON Configuration Files${colors.reset}`);
console.log('─'.repeat(40));
validateJsonFile(
  path.join(__dirname, 'Manifest.json'),
  path.join(__dirname, 'schema', 'manifest.schema.json'),
  'Manifest.json'
);
console.log();

validateJsonFile(
  path.join(__dirname, 'HeaderFooter.json'),
  path.join(__dirname, 'schema', 'header-footer.schema.json'),
  'HeaderFooter.json'
);
console.log();

console.log(`${colors.blue}4. Test Payload Files${colors.reset}`);
console.log('─'.repeat(40));
validateTestPayloads();
console.log();

console.log(`${colors.blue}5. Golden PDF Files${colors.reset}`);
console.log('─'.repeat(40));
checkGoldenPDFs();
console.log();

console.log(`${colors.blue}6. Directory Structure${colors.reset}`);
console.log('─'.repeat(40));
checkFileExists(path.join(__dirname, 'qa'), 'qa/ directory');
checkFileExists(path.join(__dirname, 'qa', 'payloads'), 'qa/payloads/ directory');
checkFileExists(path.join(__dirname, 'qa', 'golden'), 'qa/golden/ directory');
checkFileExists(path.join(__dirname, 'schema'), 'schema/ directory');
checkFileExists(path.join(__dirname, 'fonts'), 'fonts/ directory');
console.log();

console.log(`${colors.blue}7. Documentation Files${colors.reset}`);
console.log('─'.repeat(40));
checkFileExists(path.join(__dirname, 'README.md'), 'README.md');
checkFileExists(path.join(__dirname, 'API_REFERENCE.md'), 'API_REFERENCE.md');
checkFileExists(path.join(__dirname, 'qa', 'overlay-instructions.md'), 'qa/overlay-instructions.md');
console.log();

console.log(`${colors.cyan}======================================${colors.reset}`);
if (hasErrors) {
  console.log(`${colors.red}✗ Validation FAILED${colors.reset}`);
  console.log(`${colors.cyan}======================================${colors.reset}\n`);
  process.exit(1);
} else {
  console.log(`${colors.green}✓ All validations PASSED${colors.reset}`);
  console.log(`${colors.cyan}======================================${colors.reset}\n`);
  process.exit(0);
}
