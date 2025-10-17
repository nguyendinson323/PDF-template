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
import { applyHeaderFooter } from './headerFooterService.js';
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

  // Apply headers and footers using centralized service
  const coverPageCount = pdfDoc.getPageCount();
  const totalPages = totalDocumentPages || coverPageCount;

  // Save PDF bytes without footers first
  const pdfBytesWithoutFooters = await pdfDoc.save();

  // Apply headers and footers using headerFooterService
  const pdfBytes = await applyHeaderFooter(pdfBytesWithoutFooters, dto, 0, totalPages);

  logger.info('Cover page generated', {
    docId: dto.document.code,
    pages: coverPageCount,
    size: pdfBytes.length,
  });

  return pdfBytes;
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
 * Uses EXACT rendering logic from headerFooterService applyHeader()
 */
async function renderCoverHeader(context) {
  const { page, font, stroke, payload, headerFooter, leftMargin, pdfDoc } = context;
  let { currentY } = context;

  for (let rowIndex = 0; rowIndex < headerFooter.header.rows.length; rowIndex++) {
    const row = headerFooter.header.rows[rowIndex];

    let rowHeight = row.height;
    if (rowHeight === "auto") {
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }

    // Calculate dynamic height (from headerFooterService logic)
    let calculatedHeight = rowHeight;
    for (const col of row.columns) {
      if (col.type === 'container' && col.rows) {
        let containerTotalHeight = 0;
        for (const subRow of col.rows) {
          let subRowHeight = subRow.height;

          if (subRow.type === 'columns' && subRow.columns) {
            for (const subCol of subRow.columns) {
              const textContent = getTextContent(subCol, payload);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
                subRowHeight = Math.max(subRowHeight, cellHeight);
              }
            }
          } else {
            const textContent = getTextContent(subRow, payload);
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
          const textContent = getTextContent(subCol, payload);
          if (textContent && subCol.type !== 'image') {
            const textSize = subCol.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
            calculatedHeight = Math.max(calculatedHeight, cellHeight);
          }
        }
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

    // Render columns (exact headerFooterService logic)
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
              const textContent = getTextContent(subCol, payload);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize);
                subHeight = Math.max(subHeight, cellHeight);
              }
            }
          } else {
            const textContent = getTextContent(subRow, payload);
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
              drawCellBorders(stroke, subCol, subX, containerY, subCol.width, subHeight);

              let textContent = getTextContent(subCol, payload);

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
            drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);

            let textContent = getTextContent(subRow, payload);
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
          drawCellBorders(stroke, subCol, subX, currentY, subCol.width, rowHeight);

          let textContent = getTextContent(subCol, payload);
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
        drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);

        if (col.type === 'image' && col.source) {
          if (col.id === 'qr_code') {
            const qrSize = 50;
            const qrX = currentX + (colWidth - qrSize) / 2;
            const qrY = currentY - (rowHeight + qrSize) / 2;
            const qrUrl = buildQRURL(payload);
            const qrBuffer = await generateQRCode(qrUrl, 150);
            const qrImage = await pdfDoc.embedPng(qrBuffer);
            page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });
          } else {
            // Logo placeholder
            const logoMargin = 4;
            const logoWidth = colWidth - (logoMargin * 2);
            const logoHeight = rowHeight - (logoMargin * 2);
            const logoX = currentX + logoMargin;
            const logoY = currentY - rowHeight + logoMargin;
            renderLogoPlaceholder(page, font, logoX, logoY, logoWidth, logoHeight);
          }
        } else {
          let textContent = getTextContent(col, payload);
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
 * Build dynamic rows for FIRMAS Y APROBACIONES table
 * Supports arrays for ALL participant types (creator, reviewers, qac, approvers, dcontrol, etc.)
 * Returns array of objects with row data and merge information
 */
function buildFirmasRows(rowTemplates, payload) {
  const rows = [];

  for (const rowTemplate of rowTemplates) {
    const action = rowTemplate.cells[0].text;

    // Extract participant and checklist data from template sources
    const participantMatch = rowTemplate.cells[1]?.source?.match(/participants\.(\w+)(\[0\])?\.name/);
    const checklistMatch = rowTemplate.cells[3]?.source?.match(/checklists\.(\w+)(\[0\])?\.id/);

    if (!participantMatch) {
      // Fallback: render as-is if no participant source found
      const rowData = rowTemplate.cells.map(cell => {
        if (cell.text) return cell.text;
        if (cell.source) return resolveTemplate(cell.source, payload) || '';
        return '';
      });
      rows.push({
        data: rowData,
        mergeFirstCell: false,
        mergeGroup: null,
        mergeRowCount: 1
      });
      continue;
    }

    const participantKey = participantMatch[1]; // e.g., 'creator', 'reviewers', 'qac', 'approvers', 'dcontrol'
    const checklistKey = checklistMatch?.[1] || participantKey; // e.g., 'creator', 'review', 'qac', 'approval', 'publish'

    const participantData = payload.participants?.[participantKey];
    const checklistData = payload.checklists?.[checklistKey];

    if (!participantData) {
      // No data for this participant type, skip
      continue;
    }

    // Check if participantData is an array or single object
    const participants = Array.isArray(participantData) ? participantData : [participantData];
    const checklists = Array.isArray(checklistData) ? checklistData : [checklistData];

    // Generate rows for all participants
    participants.forEach((participant, idx) => {
      const checklist = checklists[idx] || checklists[0] || {};

      rows.push({
        data: [
          action,
          participant.name || '',
          participant.jobTitle || '',
          checklist.id || '',
          checklist.date || '',
          checklist.status || ''
        ],
        mergeFirstCell: idx > 0, // Merge Acción cell for rows after the first
        mergeGroup: action,
        mergeRowCount: participants.length
      });
    });
  }

  return rows;
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

  // Build dynamic rows based on data
  const dynamicRows = buildFirmasRows(firmas.rows, payload);

  // Precalculate row heights
  const rowHeights = [];
  for (let i = 0; i < dynamicRows.length; i++) {
    const row = dynamicRows[i];
    let maxHeight = minRowH;

    for (let j = 0; j < row.data.length; j++) {
      const colWidth = firmas.header.columns[j].width;
      const textContent = row.data[j];

      if (textContent) {
        const cellHeight = calculateTextHeight(font, textContent, colWidth, firmas.rows_config.text_size);
        maxHeight = Math.max(maxHeight, cellHeight);
      }
    }

    rowHeights.push(maxHeight);
  }

  // Render rows with merged cell support
  let i = 0;
  while (i < dynamicRows.length) {
    const row = dynamicRows[i];
    const rowHeight = rowHeights[i];

    // Calculate merge group total height if this is the start of a merge
    let mergeGroupHeight = rowHeight;
    let mergeGroupRowCount = 1;

    if (row.mergeGroup && !row.mergeFirstCell) {
      // This is the first row in a merge group
      mergeGroupRowCount = row.mergeRowCount;
      mergeGroupHeight = 0;
      for (let k = 0; k < mergeGroupRowCount && (i + k) < dynamicRows.length; k++) {
        mergeGroupHeight += rowHeights[i + k];
      }
    }

    // Check if row (or merge group) fits on current page
    if (currentY - mergeGroupHeight < minY) {
      // Doesn't fit - create new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

      currentY = headerFooter.header.y_position + headerFooter.header.height;
      currentY = await renderCoverHeader({ ...context, page, stroke, currentY });
      currentY -= (firmas.margin_top || 0);
      currentY = await renderTableHeaderOnNewPage(page, font, stroke, firmas, tableX, usableWidth, currentY);
    }

    // Render merge group or single row
    if (row.mergeGroup && !row.mergeFirstCell) {
      // Render merged cell group
      const mergeTopY = currentY;
      const mergeBottomY = currentY - mergeGroupHeight;
      const firstColWidth = firmas.header.columns[0].width;

      // Draw outer border for entire merge group
      strokeRect(stroke, tableX, mergeBottomY, usableWidth, mergeGroupHeight);

      // Draw merged "Acción" cell (first column spanning multiple rows)
      const actionText = row.data[0];
      if (actionText) {
        drawMultilineText(page, font, actionText, tableX, mergeBottomY, firstColWidth, mergeGroupHeight, firmas.rows_config.text_size, firmas.rows_config.align);
      }

      // Draw vertical separator after "Acción" column
      stroke(tableX + firstColWidth, mergeTopY, tableX + firstColWidth, mergeBottomY);

      // Render each row in the merge group (excluding first column)
      let groupY = mergeTopY;
      for (let k = 0; k < mergeGroupRowCount && (i + k) < dynamicRows.length; k++) {
        const groupRow = dynamicRows[i + k];
        const groupRowHeight = rowHeights[i + k];

        // Draw horizontal separator (except for first row in group)
        // Start from after the merged "Acción" column to avoid overlapping
        if (k > 0) {
          stroke(tableX + firstColWidth, groupY, tableX + usableWidth, groupY);
        }

        // Draw cells (starting from column 1, skipping merged "Acción" column)
        let cellX = tableX + firstColWidth;
        for (let j = 1; j < groupRow.data.length; j++) {
          const textContent = groupRow.data[j];
          const colWidth = firmas.header.columns[j].width;

          if (textContent) {
            drawMultilineText(page, font, textContent, cellX, groupY - groupRowHeight, colWidth, groupRowHeight, firmas.rows_config.text_size, firmas.rows_config.align);
          }

          // Draw vertical separator
          if (j < groupRow.data.length - 1) {
            stroke(cellX + colWidth, groupY, cellX + colWidth, groupY - groupRowHeight);
          }

          cellX += colWidth;
        }

        groupY -= groupRowHeight;
      }

      currentY -= mergeGroupHeight;
      i += mergeGroupRowCount;
    } else {
      // Render single row (no merging)
      strokeRect(stroke, tableX, currentY - rowHeight, usableWidth, rowHeight);

      if (i > 0) {
        stroke(tableX, currentY, tableX + usableWidth, currentY);
      }

      let cellX = tableX;
      for (let j = 0; j < row.data.length; j++) {
        const textContent = row.data[j];
        const colWidth = firmas.header.columns[j].width;

        if (textContent) {
          drawMultilineText(page, font, textContent, cellX, currentY - rowHeight, colWidth, rowHeight, firmas.rows_config.text_size, firmas.rows_config.align);
        }

        if (j < row.data.length - 1) {
          stroke(cellX + colWidth, currentY, cellX + colWidth, currentY - rowHeight);
        }

        cellX += colWidth;
      }

      currentY -= rowHeight;
      i++;
    }
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
