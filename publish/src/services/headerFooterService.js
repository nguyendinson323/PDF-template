// ==================================================================================
// Header/Footer Stamping Service
// ==================================================================================
// Adds header and footer overlays to body pages
// Uses centralized design values from HeaderFooter.json
// ==================================================================================

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadHeaderFooter, loadRegularFont } from './templateService.js';
import { resolveTemplate, wrapText, getTextContent, drawMultilineText, calculateTextHeight } from '../utils/pdfUtils.js';
import { generateQRCode } from './qrService.js';

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
  const headerFooter = loadHeaderFooter();
  const pdfDoc = await PDFDocument.load(bodyPdfBytes);
  pdfDoc.registerFontkit(fontkit);

  const fontBytes = loadRegularFont();
  const font = await pdfDoc.embedFont(fontBytes);

  const pages = pdfDoc.getPages();
  const bodyPages = pages.length;
  const totalPages = totalDocumentPages || (coverPageCount + bodyPages);

  for (let i = 0; i < bodyPages; i++) {
    const page = pages[i];
    const pageNumber = coverPageCount + i + 1;

    await applyHeader(page, font, dto, headerFooter, pdfDoc);
    applyFooter(page, font, dto, headerFooter, pageNumber, totalPages);
  }

  const stampedBytes = await pdfDoc.save();
  return stampedBytes;
}

/**
 * Apply header overlay to a single page
 * Uses EXACT rendering logic from template (renderCoverHeader)
 */
async function applyHeader(page, font, dto, headerFooter, pdfDoc) {
  const { left: leftMargin } = headerFooter.page.margins;
  const stroke = makeStroker(page);

  let currentY = headerFooter.header.y_position + headerFooter.header.height;

  for (let rowIndex = 0; rowIndex < headerFooter.header.rows.length; rowIndex++) {
    const row = headerFooter.header.rows[rowIndex];

    let rowHeight = row.height;
    if (rowHeight === "auto") {
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }

    // Calculate dynamic height (from template logic)
    let calculatedHeight = rowHeight;
    for (const col of row.columns) {
      if (col.type === 'container' && col.rows) {
        let containerTotalHeight = 0;
        for (const subRow of col.rows) {
          let subRowHeight = subRow.height;

          if (subRow.type === 'columns' && subRow.columns) {
            for (const subCol of subRow.columns) {
              const textContent = getTextContent(subCol, dto);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
                subRowHeight = Math.max(subRowHeight, cellHeight);
              }
            }
          } else {
            const textContent = getTextContent(subRow, dto);
            if (textContent && subRow.type !== 'image') {
              const textSize = subRow.text_size || 9;
              const cellHeight = calculateTextHeight(font, textContent, col.width, textSize);
              subRowHeight = Math.max(subRowHeight, cellHeight);
            }
          }

          containerTotalHeight += subRowHeight;
        }
        calculatedHeight = Math.max(calculatedHeight, containerTotalHeight);
      } else if (col.type === 'columns' && col.columns) {
        for (const subCol of col.columns) {
          const textContent = getTextContent(subCol, dto);
          if (textContent && subCol.type !== 'image') {
            const textSize = subCol.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
            calculatedHeight = Math.max(calculatedHeight, cellHeight);
          }
        }
      } else if (col.type !== 'image') {
        const textContent = getTextContent(col, dto);
        if (textContent) {
          const textSize = col.text_size || 9;
          const cellHeight = calculateTextHeight(font, textContent, col.width, textSize);
          calculatedHeight = Math.max(calculatedHeight, cellHeight);
        }
      }
    }

    rowHeight = calculatedHeight;
    let currentX = leftMargin;

    // Render columns (exact template logic)
    for (let colIndex = 0; colIndex < row.columns.length; colIndex++) {
      const col = row.columns[colIndex];
      const colWidth = col.width;

      if (col.type === 'container' && col.rows) {
        let containerY = currentY;
        const subRowHeights = [];

        for (const subRow of col.rows) {
          let subHeight = subRow.height;

          if (subRow.type === 'columns' && subRow.columns) {
            for (const subCol of subRow.columns) {
              const textContent = getTextContent(subCol, dto);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
                subHeight = Math.max(subHeight, cellHeight);
              }
            }
          } else {
            const textContent = getTextContent(subRow, dto);
            if (textContent && subRow.type !== 'image') {
              const textSize = subRow.text_size || 9;
              const cellHeight = calculateTextHeight(font, textContent, colWidth, textSize);
              subHeight = Math.max(subHeight, cellHeight);
            }
          }

          subRowHeights.push(subHeight);
        }

        for (let i = 0; i < col.rows.length; i++) {
          const subRow = col.rows[i];
          const subHeight = subRowHeights[i];

          if (subRow.type === 'columns' && subRow.columns) {
            let subX = currentX;
            for (let subColIdx = 0; subColIdx < subRow.columns.length; subColIdx++) {
              const subCol = subRow.columns[subColIdx];
              drawCellBordersWithStroke(stroke, subCol, subX, containerY, subCol.width, subHeight);

              let textContent = getTextContent(subCol, dto);

              if (textContent && subCol.type !== 'image') {
                // Extract correlative number
                if (subCol.id === 'correlative_current_phase' && subCol.source?.includes('correlativocurrentPhase')) {
                  const parts = textContent.split('-');
                  textContent = parts[parts.length - 1];
                }
                const textSize = subCol.text_size || 9;
                drawMultilineText(page, font, textContent, subX, containerY - subHeight, subCol.width, subHeight, textSize, subCol.align);
              }

              subX += subCol.width;
            }
          } else {
            drawCellBordersWithStroke(stroke, subRow, currentX, containerY, colWidth, subHeight);

            let textContent = getTextContent(subRow, dto);
            if (textContent && subRow.type !== 'image') {
              // Extract correlative number
              if (subRow.id === 'correlative_current_phase' && subRow.source?.includes('correlativocurrentPhase')) {
                const parts = textContent.split('-');
                textContent = parts[parts.length - 1];
              }
              const textSize = subRow.text_size || 9;
              drawMultilineText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align);
            }
          }

          containerY -= subHeight;
        }
      } else if (col.type === 'columns' && col.columns) {
        let subX = currentX;
        for (const subCol of col.columns) {
          drawCellBordersWithStroke(stroke, subCol, subX, currentY, subCol.width, rowHeight);

          let textContent = getTextContent(subCol, dto);
          if (textContent && subCol.type !== 'image') {
            // Extract correlative number
            if (subCol.id === 'correlative_current_phase' && subCol.source?.includes('correlativocurrentPhase')) {
              const parts = textContent.split('-');
              textContent = parts[parts.length - 1];
            }
            const textSize = subCol.text_size || 9;
            drawMultilineText(page, font, textContent, subX, currentY - rowHeight, subCol.width, rowHeight, textSize, subCol.align);
          }

          subX += subCol.width;
        }
      } else {
        drawCellBordersWithStroke(stroke, col, currentX, currentY, colWidth, rowHeight);

        if (col.type === 'image' && col.source) {
          const imageData = resolveTemplate(col.source, dto);

          if (col.id === 'qr_code') {
            const qrSize = 50;
            const qrX = currentX + (colWidth - qrSize) / 2;
            const qrY = currentY - (rowHeight + qrSize) / 2;
            const qrBuffer = await generateQRCode(imageData, 150);
            const qrImage = await pdfDoc.embedPng(qrBuffer);
            page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
          } else {
            // Logo placeholder
            const logoMargin = 4;
            const logoWidth = colWidth - (logoMargin * 2);
            const logoHeight = rowHeight - (logoMargin * 2);
            const logoX = currentX + logoMargin;
            const logoY = currentY - rowHeight + logoMargin;
            page.drawRectangle({ x: logoX, y: logoY, width: logoWidth, height: logoHeight, borderColor: rgb(0.7, 0.7, 0.7), borderWidth: 1 });
            const placeholderText = 'LOGO';
            const textWidth = font.widthOfTextAtSize(placeholderText, 15);
            page.drawText(placeholderText, { x: logoX + (logoWidth - textWidth) / 2, y: logoY + (logoHeight - 15) / 2, size: 15, font, color: rgb(0.5, 0.5, 0.5) });
          }
        } else {
          let textContent = getTextContent(col, dto);
          if (textContent) {
            // Extract correlative number
            if (col.id === 'correlative_current_phase' && col.source?.includes('correlativocurrentPhase')) {
              const parts = textContent.split('-');
              textContent = parts[parts.length - 1];
            }
            const textSize = col.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align);
          }
        }
      }

      currentX += colWidth;
    }

    currentY -= rowHeight;
  }
}

/**
 * Make stroker function (from template)
 */
function makeStroker(page) {
  const round2 = n => Math.round(n * 100) / 100;
  const edgeKey = (x1, y1, x2, y2) => {
    const a = `${round2(x1)},${round2(y1)}`;
    const b = `${round2(x2)},${round2(y2)}`;
    return a <= b ? `${a}|${b}` : `${b}|${a}`;
  };

  const seen = new Set();
  return function stroke(x1, y1, x2, y2) {
    const k = edgeKey(x1, y1, x2, y2);
    if (seen.has(k)) return;
    seen.add(k);
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color: rgb(0, 0, 0), thickness: 0.5 });
  };
}

/**
 * Draw cell borders using stroke function (from template)
 */
function drawCellBordersWithStroke(stroke, field, x, y, width, height) {
  const drawTop = field.border_top !== false;
  const drawBottom = field.border_bottom !== false;
  const drawLeft = field.border_left !== false;
  const drawRight = field.border_right !== false;

  if (drawTop) stroke(x, y, x + width, y);
  if (drawBottom) stroke(x, y - height, x + width, y - height);
  if (drawLeft) stroke(x, y - height, x, y);
  if (drawRight) stroke(x + width, y - height, x + width, y);
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
      color: rgb(0, 0, 0),
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
