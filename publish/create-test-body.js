// Create a simple test body PDF for testing
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function createTestBodyPDF() {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

  // Add 3 pages with some content
  for (let i = 1; i <= 3; i++) {
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const { width, height } = page.getSize();

    const fontSize = 30;
    const text = `Test Body PDF - Page ${i}`;
    const textWidth = timesRomanFont.widthOfTextAtSize(text, fontSize);

    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size: fontSize,
      font: timesRomanFont,
    });

    // Add some content
    page.drawText('This is a test document body.', {
      x: 50,
      y: height / 2 - 50,
      size: 12,
      font: timesRomanFont,
    });

    page.drawText('Lorem ipsum dolor sit amet, consectetur adipiscing elit.', {
      x: 50,
      y: height / 2 - 70,
      size: 12,
      font: timesRomanFont,
    });
  }

  const pdfBytes = await pdfDoc.save();

  // Save to Pack/examples
  try {
    mkdirSync('Pack/examples', { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  writeFileSync(join('Pack', 'examples', 'body.pdf'), pdfBytes);
  console.log('✅ Test body PDF created: Pack/examples/body.pdf');

  // Also copy to s3-local for /stamp testing
  const testPath = 'Desarrollo/bodies/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001.pdf';
  const fullPath = join('s3-local', testPath);
  try {
    mkdirSync(join('s3-local', 'Desarrollo', 'bodies'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  writeFileSync(fullPath, pdfBytes);
  console.log(`✅ Test body PDF copied to: s3-local/${testPath}`);
}

createTestBodyPDF().catch(console.error);
