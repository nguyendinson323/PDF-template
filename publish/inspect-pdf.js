import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'fs';

const pdfPath = 'Pack/examples/test-header-output.pdf';
const pdfBytes = readFileSync(pdfPath);
const pdfDoc = await PDFDocument.load(pdfBytes);
const pages = pdfDoc.getPages();

console.log('Total pages:', pages.length);
console.log('\nPage 1 (first page of stamped body):');
const page4 = pages[0];
const { width, height } = page4.getSize();
console.log('  Size:', width, 'x', height);

// Check if page has any text operations
const dict = page4.node.normalizedEntries();
console.log('  Has Contents:', dict.Contents ? 'yes' : 'no');
console.log('  Has Resources:', dict.Resources ? 'yes' : 'no');

// Try to extract text content (simplified)
const contents = page4.node.Contents();
if (contents) {
  let contentStr = '';
  if (contents.asStream) {
    const stream = contents.asStream();
    const bytes = stream.contents;
    contentStr = new TextDecoder().decode(bytes);
  }

  console.log('  Content stream length:', contentStr.length);
  console.log('  Contains "Codigo":', contentStr.includes('Codigo'));
  console.log('  Contains "digo:":', contentStr.includes('digo:'));
  console.log('  Contains "PAS-L1-GOV":', contentStr.includes('PAS-L1-GOV'));
  console.log('  Contains "Document Control":', contentStr.includes('Document Control'));

  // Check for text operators
  const hasTextOps = contentStr.includes(' Tj') || contentStr.includes(' TJ');
  console.log('  Has text operations:', hasTextOps);

  // Show a sample of content around position 698 (where Codigo should be)
  const matches = contentStr.match(/698[^\n]*?Tj/g);
  if (matches) {
    console.log('\n  Text operations near y=698:');
    matches.slice(0, 5).forEach(m => console.log('   ', m));
  }
}
