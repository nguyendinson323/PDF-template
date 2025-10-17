// Create a long body PDF with multiple pages for testing overflow handling
// Uses centralized design values from HeaderFooter.json
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createLongBodyPDF() {
  // Load HeaderFooter.json from template folder to get page and margin parameters
  const headerFooterPath = join(__dirname, '..', 'template', 'HeaderFooter.json');
  const headerFooter = JSON.parse(readFileSync(headerFooterPath, 'utf8'));

  const { width: pageWidth, height: pageHeight } = headerFooter.page;
  const { top, bottom, left, right } = headerFooter.page.margins;
  const headerYPosition = headerFooter.header.y_position;
  const footerSeparatorY = headerFooter.footer.separator_line.y_position;

  // Calculate dynamic header height based on header configuration
  const calculateHeaderHeight = (headerConfig) => {
    let totalHeight = 0;
    for (const row of headerConfig.rows) {
      let rowHeight = row.height;
      if (rowHeight === 'auto') {
        const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
        if (containerCol) {
          rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
        }
      }
      totalHeight += rowHeight;
    }
    return totalHeight;
  };

  const headerHeight = calculateHeaderHeight(headerFooter.header);

  // Calculate content area: dynamically based on actual header height
  const contentStartY = headerYPosition - headerHeight - 10; // Start right after header
  const contentEndY = footerSeparatorY + 10;   // End 10pt above footer separator
  const contentHeight = contentStartY - contentEndY;

  console.log('Creating long body PDF with template parameters:');
  console.log(`  Page: ${pageWidth} x ${pageHeight} points`);
  console.log(`  Margins: left=${left}, right=${right}, top=${top}, bottom=${bottom}`);
  console.log(`  Header: position=${headerYPosition}, height=${headerHeight}pt`);
  console.log(`  Content area: y=${contentEndY} to y=${contentStartY} (height: ${contentHeight}pt)`);

  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  // Generate VERY long content - will span many pages (10+)
  const loremIpsumBase = `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt. Neque porro quisquam est, qui dolorem ipsum quia dolor sit amet, consectetur, adipisci velit, sed quia non numquam eius modi tempora incidunt ut labore et dolore magnam aliquam quaerat voluptatem. Ut enim ad minima veniam, quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus.`;

  // Repeat the lorem ipsum many times to create VERY long content
  const loremIpsum = loremIpsumBase;

  const sections = [
    {
      title: '1. INTRODUCTION',
      content: loremIpsum + ' ' + loremIpsum
    },
    {
      title: '2. INTRODUCTION',
      content: loremIpsum + ' ' + loremIpsum
    },
    {
      title: '3. SCOPE AND PURPOSE',
      content: loremIpsum + ' This section describes the scope and purpose of this document. ' + loremIpsum
    }
  ];

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let currentY = contentStartY;
  let pageCount = 1;

  const lineHeight = 14;
  const titleSize = 14;
  const textSize = 11;
  const paragraphSpacing = 10;
  const sectionSpacing = 20;

  // Helper function to add new page when needed
  const checkAndAddNewPage = (neededSpace) => {
    if (currentY - neededSpace < contentEndY) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      currentY = contentStartY;
      pageCount++;
      console.log(`  Added page ${pageCount}`);
      return true;
    }
    return false;
  };

  // Helper function to wrap and draw text
  const drawWrappedText = (text, fontSize, font, isBold = false) => {
    const words = text.split(' ');
    const maxWidth = pageWidth - left - right;
    let line = '';

    for (const word of words) {
      const testLine = line + (line ? ' ' : '') + word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth > maxWidth && line) {
        // Draw current line
        checkAndAddNewPage(lineHeight);
        currentPage.drawText(line, {
          x: left,
          y: currentY,
          size: fontSize,
          font: isBold ? boldFont : font,
        });
        currentY -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }

    // Draw remaining line
    if (line) {
      checkAndAddNewPage(lineHeight);
      currentPage.drawText(line, {
        x: left,
        y: currentY,
        size: fontSize,
        font: isBold ? boldFont : font,
      });
      currentY -= lineHeight;
    }
  };

  // Draw document title
  currentPage.drawText('DOCUMENT CONTROL PROCEDURE', {
    x: left,
    y: currentY,
    size: 18,
    font: boldFont,
  });
  currentY -= 30;

  // Draw subtitle
  currentPage.drawText('Comprehensive Guidelines and Best Practices', {
    x: left,
    y: currentY,
    size: 12,
    font: timesRomanFont,
  });
  currentY -= 40;

  // Draw all sections
  for (const section of sections) {
    // Check if we need a new page for the section title
    checkAndAddNewPage(titleSize + sectionSpacing);

    // Draw section title
    currentPage.drawText(section.title, {
      x: left,
      y: currentY,
      size: titleSize,
      font: boldFont,
    });
    currentY -= titleSize + paragraphSpacing;

    // Draw section content (wrapped)
    drawWrappedText(section.content, textSize, timesRomanFont);
    currentY -= sectionSpacing;
  }

  // Add metadata info at the end
  checkAndAddNewPage(100);
  currentY -= 20;
  currentPage.drawText('--- End of Document ---', {
    x: left,
    y: currentY,
    size: 10,
    font: timesRomanFont,
  });
  currentY -= 20;
  currentPage.drawText(`Total body pages generated: ${pageCount}`, {
    x: left,
    y: currentY,
    size: 10,
    font: timesRomanFont,
  });

  const pdfBytes = await pdfDoc.save();

  // Save to Pack/examples
  try {
    mkdirSync(join(__dirname, 'Pack', 'examples'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  writeFileSync(join(__dirname, 'Pack', 'examples', 'body.pdf'), pdfBytes);
  console.log(`✅ Long body PDF created: Pack/examples/body.pdf`);
  console.log(`   Total pages: ${pageCount}`);

  // Also save to s3-local
  const testPath = 'Desarrollo/bodies/PAS-L1-GOV-PRC-001-v2.0.0-R-Final-001-long.pdf';
  const fullPath = join(__dirname, 's3-local', testPath);
  try {
    mkdirSync(join(__dirname, 's3-local', 'Desarrollo', 'bodies'), { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  writeFileSync(fullPath, pdfBytes);
  console.log(`✅ Long body PDF copied to: s3-local/${testPath}`);
}

createLongBodyPDF().catch(console.error);
