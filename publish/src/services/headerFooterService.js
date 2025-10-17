// ==================================================================================
// Header/Footer Stamping Service
// ==================================================================================
// Adds header and footer overlays to body pages
// Uses centralized design values from HeaderFooter.json
// ==================================================================================

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadHeaderFooter, loadRegularFont } from './templateService.js';
import { resolveTemplate, wrapText, getTextContent, drawMultilineText } from '../utils/pdfUtils.js';
import logger from '../utils/logger.js';

/**
 * Apply header and footer to all pages of a PDF
 * Simple overlay approach: adds header/footer to existing body pages
 * Body PDF should already have correct margins from template (left: 71, right: 71)
 *
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

  logger.debug('Processing body pages', {
    bodyPages,
    coverPageCount,
    totalPages,
    margins: headerFooter.page.margins,
    headerPosition: headerFooter.header.y_position,
    footerPosition: headerFooter.footer.y_position
  });

  for (let i = 0; i < bodyPages; i++) {
    const page = pages[i];
    const pageNumber = coverPageCount + i + 1; // Continue from cover pages

    // Apply header overlay
    applyHeader(page, font, dto, headerFooter);

    // Apply footer overlay
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
 * Apply header overlay to a single page
 * Uses full header structure from HeaderFooter.json (same as cover)
 */
function applyHeader(page, font, dto, headerFooter) {
  const { left: leftMargin } = headerFooter.page.margins;

  let currentY = headerFooter.header.y_position + headerFooter.header.height;

  // Render each row from the header configuration
  for (const row of headerFooter.header.rows) {
    let rowHeight = row.height;
    if (rowHeight === 'auto') {
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }

    let currentX = leftMargin;

    // Render columns
    for (const col of row.columns) {
      const colWidth = col.width;

      if (col.type === 'container' && col.rows) {
        let containerY = currentY;
        for (const subRow of col.rows) {
          const subHeight = subRow.height;

          // Draw borders
          drawCellBordersSimple(page, subRow, currentX, containerY, colWidth, subHeight);

          // Draw text
          const textContent = getTextContent(subRow, dto);
          if (textContent && subRow.type !== 'image') {
            const textSize = subRow.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align);
          }

          containerY -= subHeight;
        }
      } else {
        // Draw borders
        drawCellBordersSimple(page, col, currentX, currentY, colWidth, rowHeight);

        // Draw text (skip images for simplicity in header overlay)
        const textContent = getTextContent(col, dto);
        if (textContent && col.type !== 'image') {
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
 * Draw cell borders (simplified version for overlays)
 */
function drawCellBordersSimple(page, cellConfig, x, y, width, height) {
  const borderTop = cellConfig.border_top !== false;
  const borderBottom = cellConfig.border_bottom !== false;
  const borderLeft = cellConfig.border_left !== false;
  const borderRight = cellConfig.border_right !== false;

  const lineColor = rgb(0, 0, 0);
  const lineThickness = 0.5;

  if (borderTop) {
    page.drawLine({
      start: { x, y },
      end: { x: x + width, y },
      color: lineColor,
      thickness: lineThickness,
    });
  }
  if (borderBottom) {
    page.drawLine({
      start: { x, y: y - height },
      end: { x: x + width, y: y - height },
      color: lineColor,
      thickness: lineThickness,
    });
  }
  if (borderLeft) {
    page.drawLine({
      start: { x, y: y - height },
      end: { x, y },
      color: lineColor,
      thickness: lineThickness,
    });
  }
  if (borderRight) {
    page.drawLine({
      start: { x: x + width, y: y - height },
      end: { x: x + width, y },
      color: lineColor,
      thickness: lineThickness,
    });
  }
}

/**
 * Apply footer overlay to a single page
 * Uses design values from HeaderFooter.json
 */
function applyFooter(page, font, dto, headerFooter, pageNumber, totalPages) {
  const footer = headerFooter.footer;
  const { width: pageWidth } = page.getSize();
  const { left: leftMargin, right: rightMargin } = headerFooter.page.margins;

  // Draw separator line using template values
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

  // Build composite footer text from template elements
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
        }
        // Extract only the correlative number (e.g., "R-Final-001" -> "001")
        else if (elem.source.includes('correlativocurrentPhase')) {
          const parts = resolved.split('-');
          footerText += parts[parts.length - 1];
        }
        else {
          footerText += resolved;
        }
      }
    }
  }

  // Draw footer text using template margins and positioning
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
