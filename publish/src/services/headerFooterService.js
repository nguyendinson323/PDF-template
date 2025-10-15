// ==================================================================================
// Header/Footer Stamping Service
// ==================================================================================
// Creates new pages with cover template structure and embeds body content
// ==================================================================================

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadHeaderFooter, loadRegularFont } from './templateService.js';
import { resolveTemplate, wrapText, makeStroker, drawCellBorders, getTextContent, drawMultilineText } from '../utils/pdfUtils.js';
import { generateQRCode, buildQRURL } from './qrService.js';
import logger from '../utils/logger.js';

/**
 * Apply header and footer to all pages of a PDF
 * Creates new pages with cover template structure and embeds body content
 * @param {Buffer} bodyPdfBytes - The PDF body to embed
 * @param {Object} dto - The document DTO
 * @param {number} coverPageCount - Number of pages in the cover (for continuous page numbering)
 * @param {number} totalDocumentPages - Total pages in the complete document (cover + body)
 */
export async function applyHeaderFooter(bodyPdfBytes, dto, coverPageCount = 0, totalDocumentPages = null) {
  logger.info('Applying header/footer to body pages', { docId: dto.document.code });

  const headerFooter = loadHeaderFooter();
  const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
  const { left: leftMargin, right: rightMargin } = margins;

  // Body content area: same as where tables start on cover
  const contentMarginTop = 30; // Same as FIRMAS table margin_top
  const contentStartY = headerFooter.header.y_position + headerFooter.header.height - contentMarginTop;
  const contentEndY = headerFooter.footer.separator_line.y_position;
  const usableWidth = pageWidth - leftMargin - rightMargin;
  const usableHeight = contentStartY - contentEndY;

  // Load the original body PDF to extract pages from
  const originalBodyDoc = await PDFDocument.load(bodyPdfBytes);
  const bodyPages = originalBodyDoc.getPageCount();
  const totalPages = totalDocumentPages || (coverPageCount + bodyPages);

  logger.debug('Processing body pages', {
    bodyPages,
    coverPageCount,
    totalPages,
    usableArea: { width: usableWidth, height: usableHeight }
  });

  // Create a new PDF document for the stamped body
  const newDoc = await PDFDocument.create();
  newDoc.registerFontkit(fontkit);

  const fontBytes = loadRegularFont();
  const font = await newDoc.embedFont(fontBytes);

  // Generate QR code once for all pages
  const qrUrl = buildQRURL(dto);
  const qrBuffer = await generateQRCode(qrUrl, 150);
  const qrImage = await newDoc.embedPng(qrBuffer);

  // Process each body page
  for (let i = 0; i < bodyPages; i++) {
    const pageNumber = coverPageCount + i + 1;

    // Create a new page with template dimensions
    const newPage = newDoc.addPage([pageWidth, pageHeight]);
    const stroke = makeStroker(newPage, rgb(0, 0, 0), 0.5);

    // Render the cover-style header on this page
    await renderBodyPageHeader(newPage, font, dto, headerFooter, leftMargin, qrImage, stroke);

    // Embed the original body page content in the content area
    // Start at same Y as FIRMAS table, end at footer separator
    const [embeddedPage] = await newDoc.embedPdf(originalBodyDoc, [i]);

    // Draw the embedded page in the content area
    newPage.drawPage(embeddedPage, {
      x: leftMargin,
      y: contentEndY,
      width: usableWidth,
      height: usableHeight,
    });

    // Render footer
    renderBodyPageFooter(newPage, font, dto, headerFooter, pageWidth, leftMargin, rightMargin, pageNumber, totalPages);
  }

  const stampedBytes = await newDoc.save();
  logger.info('Header/footer applied to body pages', {
    docId: dto.document.code,
    pages: bodyPages,
    size: stampedBytes.length,
  });

  return stampedBytes;
}

/**
 * Render header on body page (same structure as cover)
 */
async function renderBodyPageHeader(page, font, dto, headerFooter, leftMargin, qrImage, stroke) {
  let currentY = headerFooter.header.y_position + headerFooter.header.height;

  // Render each row from the header template
  for (const row of headerFooter.header.rows) {
    const rowHeight = row.height === 'auto' ? 57 : row.height; // Use calculated height for auto
    let currentX = leftMargin;

    // Render columns in the row
    for (const col of row.columns) {
      const colWidth = col.width;

      // Draw cell borders
      drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);

      // Render content based on type
      if (col.type === 'image' && col.id === 'qr_code') {
        // Draw QR code
        const qrSize = 50;
        const qrX = currentX + (colWidth - qrSize) / 2;
        const qrY = currentY - (rowHeight + qrSize) / 2;
        page.drawImage(qrImage, {
          x: qrX,
          y: qrY,
          width: qrSize,
          height: qrSize,
        });
      } else if (col.type === 'image' && col.id === 'company_logo') {
        // Draw logo placeholder
        const logoX = currentX + 4;
        const logoY = currentY - rowHeight + 4;
        const logoWidth = colWidth - 8;
        const logoHeight = rowHeight - 8;
        page.drawRectangle({
          x: logoX,
          y: logoY,
          width: logoWidth,
          height: logoHeight,
          borderColor: rgb(0.7, 0.7, 0.7),
          borderWidth: 1,
        });
        const placeholderText = 'LOGO';
        const textWidth = font.widthOfTextAtSize(placeholderText, 15);
        const textX = logoX + (logoWidth - textWidth) / 2;
        const textY = logoY + (logoHeight - 15) / 2;
        page.drawText(placeholderText, {
          x: textX,
          y: textY,
          size: 15,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      } else if (col.type === 'container' && col.rows) {
        // Handle container with sub-rows
        let containerY = currentY;
        for (const subRow of col.rows) {
          const subHeight = subRow.height;
          drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);

          const textContent = getTextContent(subRow, dto);
          if (textContent && subRow.type !== 'image') {
            const textSize = subRow.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align);
          }

          containerY -= subHeight;
        }
      } else if (row.type === 'columns' && col.columns) {
        // Handle nested columns
        let colX = currentX;
        for (const nestedCol of col.columns) {
          const nestedWidth = nestedCol.width;
          drawCellBorders(stroke, nestedCol, colX, currentY, nestedWidth, rowHeight);

          const textContent = getTextContent(nestedCol, dto);
          if (textContent) {
            const textSize = nestedCol.text_size || 9;
            drawMultilineText(page, font, textContent, colX, currentY - rowHeight, nestedWidth, rowHeight, textSize, nestedCol.align);
          }
          colX += nestedWidth;
        }
      } else {
        // Regular text cell
        const textContent = getTextContent(col, dto);
        if (textContent) {
          const textSize = col.text_size || 9;
          drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align);
        }
      }

      currentX += colWidth;
    }

    currentY -= rowHeight;
  }
}

/**
 * Render footer on body page
 */
function renderBodyPageFooter(page, font, dto, headerFooter, pageWidth, leftMargin, rightMargin, pageNumber, totalPages) {
  const footer = headerFooter.footer;

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
