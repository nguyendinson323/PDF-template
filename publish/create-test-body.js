// Create a simple test body PDF for testing
// Uses centralized design values from HeaderFooter.json
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createTestBodyPDF() {
  // Load HeaderFooter.json from template folder to get page and margin parameters
  const headerFooterPath = join(__dirname, '..', 'template', 'HeaderFooter.json');
  const headerFooter = JSON.parse(readFileSync(headerFooterPath, 'utf8'));

  const { width: pageWidth, height: pageHeight } = headerFooter.page;
  const { top, bottom, left, right } = headerFooter.page.margins;
  const headerYPosition = headerFooter.header.y_position;
  const footerSeparatorY = headerFooter.footer.separator_line.y_position;

  // Calculate content area: between header (y=660) and footer separator (y=84)
  const contentStartY = headerYPosition - 20; // Start 20pt below header
  const contentEndY = footerSeparatorY + 10;   // End 10pt above footer separator

  console.log('Creating body PDF with template parameters:');
  console.log(`  Page: ${pageWidth} x ${pageHeight} points`);
  console.log(`  Margins: left=${left}, right=${right}, top=${top}, bottom=${bottom}`);
  console.log(`  Content area: y=${contentEndY} to y=${contentStartY} (height: ${contentStartY - contentEndY}pt)`);

  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Add 3 pages with some content
  for (let i = 1; i <= 3; i++) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Title at top of content area (left-aligned with left margin)
    const titleSize = 16;
    const title = `Test Body PDF - Page ${i}`;

    page.drawText(title, {
      x: left,
      y: contentStartY,
      size: titleSize,
      font: timesRomanFont,
    });

    // Body text below title (left-aligned with left margin)
    let currentY = contentStartY - 30;

    page.drawText('This is a test document body.', {
      x: left,
      y: currentY,
      size: 12,
      font: timesRomanFont,
    });

    currentY -= 20;

    page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', {
      x: left,
      y: currentY,
      size: 12,
      font: timesRomanFont,
    });

    // Add more content to demonstrate the content area
    currentY -= 30;
    page.drawText('Content respects template margins:', {
      x: left,
      y: currentY,
      size: 10,
      font: timesRomanFont,
    });

    currentY -= 15;
    page.drawText(`- Left margin: ${left}pt`, {
      x: left,
      y: currentY,
      size: 10,
      font: timesRomanFont,
    });

    currentY -= 15;
    page.drawText(`- Right margin: ${right}pt`, {
      x: left,
      y: currentY,
      size: 10,
      font: timesRomanFont,
    });

    currentY -= 15;
    page.drawText(`- Content width: ${pageWidth - left - right}pt`, {
      x: left,
      y: currentY,
      size: 10,
      font: timesRomanFont,
    });
  }

  const pdfBytes = await pdfDoc.save();

  // Save to Pack/examples
  try {
    mkdirSync(join(__dirname, 'Pack', 'examples'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  writeFileSync(join(__dirname, 'Pack', 'examples', 'body.pdf'), pdfBytes);
  console.log('✅ Test body PDF created: Pack/examples/body.pdf');

  // Also copy to s3-local for /stamp testing
  const testPath = 'Desarrollo/bodies/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf';
  const fullPath = join(__dirname, 's3-local', testPath);
  try {
    mkdirSync(join(__dirname, 's3-local', 'Desarrollo', 'bodies'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  writeFileSync(fullPath, pdfBytes);
  console.log(`✅ Test body PDF copied to: s3-local/${testPath}`);
}

createTestBodyPDF().catch(console.error);
