// ==================================================================================
// Header/Footer Stamping Service
// ==================================================================================
// Applies headers and footers to existing PDF pages
// ==================================================================================

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadHeaderFooter, loadRegularFont } from './templateService.js';
import { resolveTemplate, wrapText } from '../utils/pdfUtils.js';
import logger from '../utils/logger.js';

/**
 * Apply header and footer to all pages of a PDF
 * @param {Buffer} bodyPdfBytes - The PDF body to stamp
 * @param {Object} dto - The document DTO
 * @param {number} coverPageCount - Number of pages in the cover (for continuous page numbering)
 * @param {number} totalDocumentPages - Total pages in the complete document (cover + body)
 */
export async function applyHeaderFooter(bodyPdfBytes, dto, coverPageCount = 0, totalDocumentPages = null) {
  logger.info('Applying header/footer', { docId: dto.document.code });

  const headerFooter = loadHeaderFooter();
  const pdfDoc = await PDFDocument.load(bodyPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = loadRegularFont();
  const font = await pdfDoc.embedFont(fontBytes);

  const pages = pdfDoc.getPages();
  const bodyPages = pages.length;
  const totalPages = totalDocumentPages || (coverPageCount + bodyPages);

  logger.debug('Processing pages', {
    bodyPages,
    coverPageCount,
    totalPages
  });

  for (let i = 0; i < bodyPages; i++) {
    const page = pages[i];
    const pageNumber = coverPageCount + i + 1; // Continue from cover pages

    // Apply header
    applyHeader(page, font, dto, headerFooter);

    // Apply footer
    applyFooter(page, font, dto, headerFooter, pageNumber, totalPages);
  }

  const stampedBytes = await pdfDoc.save();
  logger.info('Header/footer applied', {
    docId: dto.document.code,
    pages: bodyPages,
    size: stampedBytes.length,
  });

  return stampedBytes;
}

/**
 * Apply header to a single page
 */
function applyHeader(page, font, dto, headerFooter) {
  // Simple header for body pages (not the full cover header)
  const { width: pageWidth } = page.getSize();
  const { left: leftMargin, right: rightMargin } = headerFooter.page.margins;

  // Render a simple header with document code and title
  const headerY = headerFooter.header.y_position + headerFooter.header.height - 30;
  const headerText = `${dto.document.code} - ${dto.document.title}`;
  const headerSize = 9;

  const maxWidth = pageWidth - leftMargin - rightMargin;
  const textWidth = font.widthOfTextAtSize(headerText, headerSize);

  let displayText = headerText;
  if (textWidth > maxWidth) {
    // Truncate if too long
    displayText = headerText.substring(0, 50) + '...';
  }

  const textX = (pageWidth - font.widthOfTextAtSize(displayText, headerSize)) / 2;

  page.drawText(displayText, {
    x: textX,
    y: headerY,
    size: headerSize,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
}

/**
 * Apply footer to a single page
 */
function applyFooter(page, font, dto, headerFooter, pageNumber, totalPages) {
  const footer = headerFooter.footer;
  const { width: pageWidth } = page.getSize();
  const { left: leftMargin, right: rightMargin } = headerFooter.page.margins;

  // Draw separator line
  if (footer.separator_line && footer.separator_line.enabled) {
    const lineY = footer.separator_line.y_position;
    const lineX1 = leftMargin + footer.separator_line.margin_left;
    const lineX2 = pageWidth - rightMargin - footer.separator_line.margin_right;

    page.drawLine({
      start: { x: lineX1, y: lineY },
      end: { x: lineX2, y: lineY },
      color: rgb(0, 0, 1),
      thickness: footer.separator_line.thickness,
    });
  }

  // Build composite footer text
  const elements = footer.content?.elements || [];
  let footerText = '';

  for (const elem of elements) {
    if (elem.text) {
      let text = elem.text;
      text = text.replace('{v}', pageNumber.toString());
      text = text.replace('{h}', totalPages.toString());
      footerText += text;
    } else if (elem.source) {
      const resolved = resolveTemplate(elem.source, dto);
      if (resolved) {
        // Truncate hash to last 8 characters for display
        if (elem.source.includes('hashSha256') && resolved.length > 8) {
          footerText += resolved.substring(resolved.length - 8);
        } else {
          footerText += resolved;
        }
      }
    }
  }

  // Draw footer text
  const footerY = footer.y_position;
  const footerSize = footer.content?.text_size || 7;
  const marginLeft = footer.content?.margin_left || leftMargin;
  const marginRight = footer.content?.margin_right || rightMargin;
  const availableWidth = pageWidth - marginLeft - marginRight;

  // Wrap text if needed
  const lines = wrapText(font, footerText, availableWidth, footerSize, 0);

  let currentY = footerY;
  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, footerSize);
    const footerX = footer.content?.align === 'center'
      ? marginLeft + (availableWidth - lineWidth) / 2
      : marginLeft;

    page.drawText(line, {
      x: footerX,
      y: currentY,
      size: footerSize,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= footerSize * 1.2;
  }
}

export default {
  applyHeaderFooter,
};
