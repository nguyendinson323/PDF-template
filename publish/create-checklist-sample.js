// Create a dummy checklists-sample.pdf for testing audit pack generation
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createChecklistSample() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();

  // Title
  page.drawText('CHECKLISTS - SAMPLE', {
    x: 50,
    y: height - 50,
    size: 20,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  // Description
  page.drawText('This is a dummy checklist PDF for testing audit pack generation.', {
    x: 50,
    y: height - 100,
    size: 12,
    font: font,
    color: rgb(0.3, 0.3, 0.3),
  });

  // Sample checklist content
  const checklists = [
    { type: 'Creator', id: 'CHK-CR-2025-001', status: 'Aprobada', date: '2025-03-10' },
    { type: 'Reviewer 1', id: 'CHK-RV-2025-002', status: 'Aprobada', date: '2025-03-11' },
    { type: 'Reviewer 2', id: 'CHK-RV-2025-003', status: 'Aprobada', date: '2025-03-11' },
    { type: 'QAC', id: 'CHK-QA-2025-004', status: 'Aprobada', date: '2025-03-12' },
    { type: 'Approver 1', id: 'CHK-AP-2025-005', status: 'Aprobada', date: '2025-03-12' },
    { type: 'Approver 2', id: 'CHK-AP-2025-006', status: 'Aprobada', date: '2025-03-12' },
  ];

  let y = height - 150;
  page.drawText('Checklist ID', {
    x: 50,
    y,
    size: 10,
    font: boldFont,
  });
  page.drawText('Type', {
    x: 200,
    y,
    size: 10,
    font: boldFont,
  });
  page.drawText('Status', {
    x: 350,
    y,
    size: 10,
    font: boldFont,
  });
  page.drawText('Date', {
    x: 450,
    y,
    size: 10,
    font: boldFont,
  });

  y -= 20;
  for (const checklist of checklists) {
    page.drawText(checklist.id, {
      x: 50,
      y,
      size: 9,
      font: font,
    });
    page.drawText(checklist.type, {
      x: 200,
      y,
      size: 9,
      font: font,
    });
    page.drawText(checklist.status, {
      x: 350,
      y,
      size: 9,
      font: font,
    });
    page.drawText(checklist.date, {
      x: 450,
      y,
      size: 9,
      font: font,
    });
    y -= 20;
  }

  // Footer
  page.drawText('--- End of Checklists ---', {
    x: 50,
    y: 100,
    size: 10,
    font: font,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();

  // Save to Pack/examples/checklists-sample.pdf
  const examplesDir = join(__dirname, 'Pack', 'examples');
  mkdirSync(examplesDir, { recursive: true });

  const outputPath = join(examplesDir, 'checklists-sample.pdf');
  writeFileSync(outputPath, pdfBytes);

  console.log(`✅ Checklist sample PDF created: ${outputPath}`);
  console.log(`   Size: ${pdfBytes.length} bytes`);
}

createChecklistSample().catch(console.error);
