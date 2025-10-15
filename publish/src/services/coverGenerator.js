// ==================================================================================
// Cover Page Generator
// ==================================================================================
// Generates PDF cover page using Template Pack
// Implements dynamic table rendering with page overflow handling
// Based on template/generate-golden.js
// ==================================================================================

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadManifest, loadHeaderFooter, loadRegularFont } from './templateService.js';
import { generateQRCode, buildQRURL } from './qrService.js';
import {
  resolveTemplate,
  getTextContent,
  calculateTextHeight,
  drawMultilineText,
  drawAlignedText,
  makeStroker,
  strokeRect,
  drawCellBorders,
  round2,
  wrapText,
} from '../utils/pdfUtils.js';
import logger from '../utils/logger.js';

const BORDER_CONFIG = { color: rgb(0, 0, 0), thickness: 0.5 };
const BLOCK_SPACING = 30;

/**
 * Generate cover page PDF from DTO
 * @param {Object} dto - Document DTO
 * @param {number} totalDocumentPages - Optional total pages in final document (cover + body)
 */
export async function generateCover(dto, totalDocumentPages = null) {
  logger.info('Generating cover page', { docId: dto.document.code, totalDocumentPages });

  const manifest = loadManifest();
  const headerFooter = loadHeaderFooter();

  const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
  const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
  const usableWidth = pageWidth - leftMargin - rightMargin;
  const footerTopY = headerFooter.footer.separator_line.y_position + 20;
  const minY = footerTopY;

  // Create PDF document
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

  // Load font
  const fontBytes = loadRegularFont();
  const font = await pdfDoc.embedFont(fontBytes);

  let currentY = headerFooter.header.y_position + headerFooter.header.height;

  // Build context for rendering functions
  const buildContext = () => ({
    page,
    font,
    stroke,
    payload: dto,
    headerFooter,
    manifest,
    pageWidth,
    pageHeight,
    leftMargin,
    rightMargin,
    usableWidth,
    topMargin,
    bottomMargin,
    minY,
    currentY,
    pdfDoc,
  });

  // Render cover header
  currentY = await renderCoverHeader(buildContext());

  // Render tables from Manifest
  const tables = manifest.content?.tables || [];

  // 1. FIRMAS Y APROBACIONES Table
  const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
  if (firmas) {
    const result = await renderApprovalTable({ ...buildContext(), currentY, firmas });
    currentY = result.currentY;
    page = result.page;
    stroke = result.stroke;
  }

  // 2. Signature Blocks
  const signing = tables.find(t => t.id === 'signing_container');
  if (signing) {
    currentY = renderSignatureBlocks({ ...buildContext(), page, stroke, currentY, signing });
  }

  // 3. CONTROL DE CAMBIOS Table
  const rev = tables.find(t => t.id === 'control_de_cambios');
  if (rev) {
    const result = await renderRevisionTable({ ...buildContext(), page, stroke, currentY, rev });
    currentY = result.currentY;
    page = result.page;
    stroke = result.stroke;
  }

  // Render footers on all pages with correct page numbers
  const coverPageCount = pdfDoc.getPageCount();
  const totalPages = totalDocumentPages || coverPageCount;
  for (let i = 0; i < coverPageCount; i++) {
    renderFooter(pdfDoc.getPages()[i], font, dto, headerFooter, pageWidth, leftMargin, rightMargin, i + 1, totalPages);
  }

  // Save and return PDF bytes
  const pdfBytes = await pdfDoc.save();
  logger.info('Cover page generated', {
    docId: dto.document.code,
    pages: pdfDoc.getPageCount(),
    size: pdfBytes.length,
  });

  return pdfBytes;
}

/**
 * Render footer on a page with page numbers
 */
function renderFooter(page, font, payload, headerFooter, pageWidth, leftMargin, rightMargin, pageNumber, totalPages) {
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
      thickness: footer.separator_line.thickness
    });
  }

  // Build composite footer text from elements
  const elements = footer.content?.elements || [];
  let footerText = '';

  for (const elem of elements) {
    if (elem.text) {
      // Replace page number placeholders
      let text = elem.text;
      text = text.replace('{v}', pageNumber.toString());
      text = text.replace('{h}', totalPages.toString());
      footerText += text;
    } else if (elem.source) {
      const resolved = resolveTemplate(elem.source, payload);
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

  // Draw footer text with wrapping support
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
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });

    currentY -= footerSize * 1.2;
  }
}

/**
 * Re-render table title and header on a new page
 */
async function renderTableHeaderOnNewPage(page, font, stroke, tableConfig, tableX, usableWidth, currentY) {
  let y = currentY;
  const titleH = tableConfig.title.height;
  const headerH = tableConfig.header.height;

  // Render table title
  strokeRect(stroke, tableX, y - titleH, usableWidth, titleH);
  if (tableConfig.title.text) {
    drawAlignedText(page, font, tableConfig.title.text, tableX, y - titleH, usableWidth, titleH, tableConfig.title.text_size, 'center');
  }
  y -= titleH;

  // Render table header
  strokeRect(stroke, tableX, y - headerH, usableWidth, headerH);
  let accX = tableX;
  for (const col of tableConfig.header.columns) {
    if (col.text) {
      drawAlignedText(page, font, col.text, accX, y - headerH, col.width, headerH, tableConfig.header.text_size, 'center');
    }
    accX += col.width;
    if (round2(accX) < round2(tableX + usableWidth)) {
      stroke(accX, y - headerH, accX, y);
    }
  }
  y -= headerH;

  return y;
}

/**
 * Render cover header with logo, title, QR code
 */
async function renderCoverHeader(context) {
  const { page, font, stroke, payload, headerFooter, leftMargin, pdfDoc } = context;
  let { currentY } = context;

  for (const row of headerFooter.header.rows) {
    let rowHeight = row.height;
    if (rowHeight === 'auto') {
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }

    // Calculate dynamic height
    let calculatedHeight = rowHeight;
    for (const col of row.columns) {
      if (col.type === 'container' && col.rows) {
        let containerTotalHeight = 0;
        for (const subRow of col.rows) {
          let subRowHeight = subRow.height;
          const textContent = getTextContent(subRow, payload);
          if (textContent && subRow.type !== 'image') {
            const textSize = subRow.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, col.width, textSize);
            subRowHeight = Math.max(subRowHeight, cellHeight);
          }
          containerTotalHeight += subRowHeight;
        }
        calculatedHeight = Math.max(calculatedHeight, containerTotalHeight);
      } else if (col.type !== 'image') {
        const textContent = getTextContent(col, payload);
        if (textContent) {
          const textSize = col.text_size || 9;
          const cellHeight = calculateTextHeight(font, textContent, col.width, textSize);
          calculatedHeight = Math.max(calculatedHeight, cellHeight);
        }
      }
    }

    rowHeight = calculatedHeight;
    let currentX = leftMargin;

    // Render columns
    for (const col of row.columns) {
      const colWidth = col.width;

      if (col.type === 'container' && col.rows) {
        let containerY = currentY;
        for (const subRow of col.rows) {
          let subHeight = subRow.height;
          const textContent = getTextContent(subRow, payload);
          if (textContent && subRow.type !== 'image') {
            const textSize = subRow.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, colWidth, textSize);
            subHeight = Math.max(subHeight, cellHeight);
          }

          drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);

          if (textContent && subRow.type !== 'image') {
            const textSize = subRow.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align);
          }

          containerY -= subHeight;
        }
      } else {
        drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);

        if (col.type === 'image' && col.source) {
          const imageData = resolveTemplate(col.source, payload);

          if (col.id === 'qr_code') {
            // Generate and render QR code
            const qrUrl = buildQRURL(payload);
            const qrBuffer = await generateQRCode(qrUrl, 150);
            const qrImage = await pdfDoc.embedPng(qrBuffer);

            const qrSize = 50;
            const qrX = currentX + (colWidth - qrSize) / 2;
            const qrY = currentY - (rowHeight + qrSize) / 2;

            page.drawImage(qrImage, {
              x: qrX,
              y: qrY,
              width: qrSize,
              height: qrSize,
            });
          } else if (col.id === 'company_logo') {
            // Render logo placeholder
            renderLogoPlaceholder(page, font, currentX + 4, currentY - rowHeight + 4, colWidth - 8, rowHeight - 8);
          }
        } else {
          const textContent = getTextContent(col, payload);
          if (textContent) {
            const textSize = col.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align);
          }
        }
      }

      currentX += colWidth;
    }

    currentY -= rowHeight;
  }

  return currentY;
}

/**
 * Render logo placeholder
 */
function renderLogoPlaceholder(page, font, x, y, width, height) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
  });

  const placeholderText = 'LOGO';
  const textWidth = font.widthOfTextAtSize(placeholderText, 15);
  const textX = x + (width - textWidth) / 2;
  const textY = y + (height - 15) / 2;

  page.drawText(placeholderText, {
    x: textX,
    y: textY,
    size: 15,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

/**
 * Render approval table (FIRMAS Y APROBACIONES) with page overflow handling
 */
async function renderApprovalTable(context) {
  const { font, payload, leftMargin, usableWidth, firmas, pdfDoc, headerFooter, pageWidth, pageHeight, minY } = context;
  let { currentY, page, stroke } = context;

  currentY -= (firmas.margin_top || 0);
  const tableX = leftMargin;
  const titleH = firmas.title.height;
  const headerH = firmas.header.height;
  const minRowH = firmas.rows_config.height;

  // Title
  strokeRect(stroke, tableX, currentY - titleH, usableWidth, titleH);
  if (firmas.title.text) {
    drawAlignedText(page, font, firmas.title.text, tableX, currentY - titleH, usableWidth, titleH, firmas.title.text_size, 'center');
  }
  currentY -= titleH;

  // Header
  strokeRect(stroke, tableX, currentY - headerH, usableWidth, headerH);
  let accX = tableX;
  for (const col of firmas.header.columns) {
    if (col.text) {
      drawAlignedText(page, font, col.text, accX, currentY - headerH, col.width, headerH, firmas.header.text_size, 'center');
    }
    accX += col.width;
    if (round2(accX) < round2(tableX + usableWidth)) {
      stroke(accX, currentY - headerH, accX, currentY);
    }
  }
  currentY -= headerH;

  // Render rows with overflow detection
  for (let i = 0; i < firmas.rows.length; i++) {
    let maxHeight = minRowH;

    // Calculate this row's height
    for (let j = 0; j < firmas.rows[i].cells.length; j++) {
      const cell = firmas.rows[i].cells[j];
      const colWidth = firmas.header.columns[j].width;
      const textContent = getTextContent(cell, payload);

      if (textContent) {
        const cellHeight = calculateTextHeight(font, textContent, colWidth, firmas.rows_config.text_size);
        maxHeight = Math.max(maxHeight, cellHeight);
      }
    }

    // Check if row fits on current page
    if (currentY - maxHeight < minY) {
      // Row doesn't fit - create new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

      // Render document header on new page
      currentY = headerFooter.header.y_position + headerFooter.header.height;
      currentY = await renderCoverHeader({ ...context, page, stroke, currentY });

      // Apply table margin_top on new page
      currentY -= (firmas.margin_top || 0);

      // Re-render table title and header on new page
      currentY = await renderTableHeaderOnNewPage(page, font, stroke, firmas, tableX, usableWidth, currentY);
    }

    // Draw row border
    strokeRect(stroke, tableX, currentY - maxHeight, usableWidth, maxHeight);

    // Draw horizontal separator (except first row)
    if (i > 0) {
      stroke(tableX, currentY, tableX + usableWidth, currentY);
    }

    // Draw cells
    let cellX = tableX;
    for (let j = 0; j < firmas.rows[i].cells.length; j++) {
      const cell = firmas.rows[i].cells[j];
      const colWidth = firmas.header.columns[j].width;
      const textContent = getTextContent(cell, payload);
      if (textContent) {
        drawMultilineText(page, font, textContent, cellX, currentY - maxHeight, colWidth, maxHeight, firmas.rows_config.text_size, firmas.rows_config.align);
      }

      // Draw vertical separator
      if (j < firmas.rows[i].cells.length - 1) {
        stroke(cellX + colWidth, currentY, cellX + colWidth, currentY - maxHeight);
      }

      cellX += colWidth;
    }

    currentY -= maxHeight;
  }

  return { currentY, page, stroke };
}

/**
 * Render signature blocks with dynamic height calculation
 */
function renderSignatureBlocks(context) {
  const { page, font, stroke, payload, leftMargin, signing } = context;
  let { currentY } = context;

  currentY -= (signing.margin_top || 0);
  const baseX = leftMargin;
  const blockDynamicHeights = [];

  // Calculate dynamic heights for each block
  for (const b of signing.blocks) {
    const rowHeights = [];

    for (const r of b.rows) {
      let rowHeight = r.height;

      if (r.type === 'columns' && r.columns) {
        for (const col of r.columns) {
          const textContent = getTextContent(col, payload);
          if (textContent && col.type !== 'image') {
            const textSize = col.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, col.width, textSize, 4, 1.2, r.height);
            rowHeight = Math.max(rowHeight, cellHeight);
          }
        }
      } else if (r.type !== 'image') {
        const textContent = getTextContent(r, payload);
        if (textContent) {
          const textSize = r.text_size || 9;
          const cellHeight = calculateTextHeight(font, textContent, b.width, textSize, 4, 1.2, r.height);
          rowHeight = Math.max(rowHeight, cellHeight);
        }
      }

      rowHeights.push(rowHeight);
    }

    blockDynamicHeights.push(rowHeights);
  }

  // Group blocks by y position
  const blockRows = new Map();
  signing.blocks.forEach((b, idx) => {
    const yPos = b.y || 0;
    if (!blockRows.has(yPos)) {
      blockRows.set(yPos, []);
    }
    blockRows.get(yPos).push({ block: b, idx, heights: blockDynamicHeights[idx] });
  });

  const sortedYPositions = Array.from(blockRows.keys()).sort((a, b) => a - b);

  // Calculate dynamic y offsets
  const rowYOffsets = new Map();
  let cumulativeOffset = 0;

  for (const yPos of sortedYPositions) {
    rowYOffsets.set(yPos, cumulativeOffset);
    const blocksInRow = blockRows.get(yPos);
    const maxHeightInRow = Math.max(...blocksInRow.map(item =>
      item.heights.reduce((sum, h) => sum + h, 0)
    ));
    cumulativeOffset += maxHeightInRow + BLOCK_SPACING;
  }

  // Render blocks
  for (let blockIdx = 0; blockIdx < signing.blocks.length; blockIdx++) {
    const b = signing.blocks[blockIdx];
    const rowHeights = blockDynamicHeights[blockIdx];
    const blockX = baseX + (b.x || 0);
    const dynamicYOffset = rowYOffsets.get(b.y || 0);
    let blockY = currentY - dynamicYOffset;

    for (let rowIdx = 0; rowIdx < b.rows.length; rowIdx++) {
      const r = b.rows[rowIdx];
      const h = rowHeights[rowIdx];
      const yBottom = blockY - h;

      if (r.type === 'columns' && r.columns) {
        let colX = blockX;
        for (let i = 0; i < r.columns.length; i++) {
          const col = r.columns[i];
          const colWidth = col.width;

          stroke(colX, blockY, colX + colWidth, blockY);
          stroke(colX, yBottom, colX + colWidth, yBottom);
          stroke(colX, yBottom, colX, blockY);
          if (i === r.columns.length - 1) {
            stroke(colX + colWidth, yBottom, colX + colWidth, blockY);
          }

          const textContent = getTextContent(col, payload);
          if (textContent) {
            const textSize = col.text_size || 9;
            drawMultilineText(page, font, textContent, colX, yBottom, colWidth, h, textSize, col.align);
          }

          colX += colWidth;
        }
      } else {
        drawCellBorders(stroke, r, blockX, blockY, b.width, h);

        const textContent = getTextContent(r, payload);
        if (textContent && r.type !== 'image') {
          const textSize = r.text_size || 9;
          drawMultilineText(page, font, textContent, blockX, yBottom, b.width, h, textSize, r.align);
        }
      }

      blockY = yBottom;
    }
  }

  const maxBlockHeight = cumulativeOffset - BLOCK_SPACING;
  currentY -= maxBlockHeight;

  return currentY;
}

/**
 * Render revision history table (CONTROL DE CAMBIOS) with page overflow handling
 */
async function renderRevisionTable(context) {
  const { font, payload, leftMargin, usableWidth, rev, pdfDoc, headerFooter, pageWidth, pageHeight, minY } = context;
  let { currentY, page, stroke } = context;

  currentY -= (rev.margin_top || 0);
  const tableX = leftMargin;
  const titleH = rev.title.height;
  const headerH = rev.header.height;
  const minRowH = rev.row_template.height;

  // Title
  strokeRect(stroke, tableX, currentY - titleH, usableWidth, titleH);
  if (rev.title.text) {
    drawAlignedText(page, font, rev.title.text, tableX, currentY - titleH, usableWidth, titleH, rev.title.text_size, 'center');
  }
  currentY -= titleH;

  // Header
  strokeRect(stroke, tableX, currentY - headerH, usableWidth, headerH);
  let accX = tableX;
  for (const col of rev.header.columns) {
    if (col.text) {
      drawAlignedText(page, font, col.text, accX, currentY - headerH, col.width, headerH, rev.header.text_size, 'center');
    }
    accX += col.width;
    if (round2(accX) < round2(tableX + usableWidth)) {
      stroke(accX, currentY - headerH, accX, currentY);
    }
  }
  currentY -= headerH;

  // Render rows with overflow detection
  if (payload.revision_history && payload.revision_history.length > 0) {
    for (let i = 0; i < payload.revision_history.length; i++) {
      const revisionEntry = payload.revision_history[i];
      let maxHeight = minRowH;

      // Calculate this row's height
      for (let j = 0; j < rev.row_template.cells.length; j++) {
        const cellTemplate = rev.row_template.cells[j];
        const colWidth = rev.header.columns[j].width;
        const value = resolveTemplate(cellTemplate.source, revisionEntry);

        if (value) {
          const cellHeight = calculateTextHeight(font, value, colWidth, rev.row_template.text_size);
          maxHeight = Math.max(maxHeight, cellHeight);
        }
      }

      // Check if row fits on current page
      if (currentY - maxHeight < minY) {
        // Row doesn't fit - create new page
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

        // Render document header on new page
        currentY = headerFooter.header.y_position + headerFooter.header.height;
        currentY = await renderCoverHeader({ ...context, page, stroke, currentY });

        // Apply table margin_top on new page
        currentY -= (rev.margin_top || 0);

        // Re-render table title and header on new page
        currentY = await renderTableHeaderOnNewPage(page, font, stroke, rev, tableX, usableWidth, currentY);
      }

      // Draw row border
      strokeRect(stroke, tableX, currentY - maxHeight, usableWidth, maxHeight);

      // Draw horizontal separator (except first row)
      if (i > 0) {
        stroke(tableX, currentY, tableX + usableWidth, currentY);
      }

      // Draw cells
      let cellX = tableX;
      for (let j = 0; j < rev.row_template.cells.length; j++) {
        const cellTemplate = rev.row_template.cells[j];
        const colWidth = rev.header.columns[j].width;
        const value = resolveTemplate(cellTemplate.source, revisionEntry);

        if (value) {
          drawMultilineText(page, font, value, cellX, currentY - maxHeight, colWidth, maxHeight, rev.row_template.text_size, rev.row_template.align);
        }

        // Draw vertical separator
        if (j < rev.row_template.cells.length - 1) {
          stroke(cellX + colWidth, currentY, cellX + colWidth, currentY - maxHeight);
        }

        cellX += colWidth;
      }

      currentY -= maxHeight;
    }
  } else {
    // Empty row if no revision history
    strokeRect(stroke, tableX, currentY - minRowH, usableWidth, minRowH);
    accX = tableX;
    for (const col of rev.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - minRowH, accX, currentY);
      }
    }
    currentY -= minRowH;
  }

  return { currentY, page, stroke };
}

export default {
  generateCover,
};
