// ==================================================================================
// Golden PDF Generator - Passfy Document Control Template Pack
// ==================================================================================
// Generates test PDFs from payload data with dynamic table handling
// ==================================================================================

const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ==================================================================================
// CONFIGURATION
// ==================================================================================

const BORDER_CONFIG = { 
  color: rgb(0, 0, 0), 
  thickness: 0 
};

const LINE_SPACING = 1.2;
const TEXT_MARGIN = 4;
const BLOCK_SPACING = 30;

// ==================================================================================
// UTILITY FUNCTIONS - Geometry & Stroke
// ==================================================================================

const round2 = n => Math.round(n * 100) / 100;

function edgeKey(x1, y1, x2, y2) {
  const a = `${round2(x1)},${round2(y1)}`;
  const b = `${round2(x2)},${round2(y2)}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

function makeStroker(page, color, thickness = 0) {
  const seen = new Set();
  return function stroke(x1, y1, x2, y2) {
    const k = edgeKey(x1, y1, x2, y2);
    if (seen.has(k)) return;
    seen.add(k);
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, color, thickness });
  };
}

function strokeRect(stroke, x, y, w, h) {
  stroke(x, y, x + w, y);
  stroke(x, y + h, x + w, y + h);
  stroke(x, y, x, y + h);
  stroke(x + w, y, x + w, y + h);
}

function drawCellBorders(stroke, field, x, y, width, height) {
  const drawTop = field.border_top !== false;
  const drawBottom = field.border_bottom !== false;
  const drawLeft = field.border_left !== false;
  const drawRight = field.border_right !== false;
  
  if (drawTop) stroke(x, y, x + width, y);
  if (drawBottom) stroke(x, y - height, x + width, y - height);
  if (drawLeft) stroke(x, y - height, x, y);
  if (drawRight) stroke(x + width, y - height, x + width, y);
}

// ==================================================================================
// UTILITY FUNCTIONS - Template Resolution
// ==================================================================================

function resolveTemplate(template, data) {
  if (!template || typeof template !== 'string') {
    return template || '';
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    try {
      const keys = path.trim().split('.');
      let value = data;

      for (const key of keys) {
        if (key.includes('[')) {
          const [arrayKey, indexStr] = key.split(/[\[\]]/);
          const index = parseInt(indexStr);
          if (value[arrayKey] && Array.isArray(value[arrayKey]) && value[arrayKey][index]) {
            value = value[arrayKey][index];
          } else {
            return '';
          }
        } else {
          value = value ? value[key] : undefined;
        }

        if (value === undefined || value === null) {
          return '';
        }
      }

      return String(value);
    } catch (error) {
      return '';
    }
  });
}

function isPlaceholder(text) {
  return text && text.includes('{{') && text.includes('}}');
}

function getTextContent(field, payload) {
  if (field.text && !isPlaceholder(field.text)) {
    return field.text;
  }
  if (field.source) {
    const resolved = resolveTemplate(field.source, payload);
    if (resolved && !isPlaceholder(resolved)) {
      return resolved;
    }
  }
  return null;
}

// ==================================================================================
// TEXT RENDERING - Wrapping & Measurement
// ==================================================================================

function wrapText(font, text, maxWidth, fontSize, xMargin = TEXT_MARGIN) {
  if (!text || text.trim() === '') return [];
  
  const availableWidth = maxWidth - (2 * xMargin);
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= availableWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      const wordWidth = font.widthOfTextAtSize(word, fontSize);
      if (wordWidth > availableWidth) {
        let partialWord = '';
        for (const char of word) {
          const testPartial = partialWord + char;
          const partialWidth = font.widthOfTextAtSize(testPartial, fontSize);
          if (partialWidth <= availableWidth) {
            partialWord = testPartial;
          } else {
            if (partialWord) lines.push(partialWord);
            partialWord = char;
          }
        }
        currentLine = partialWord;
      } else {
        currentLine = word;
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

function calculateTextHeight(font, text, maxWidth, fontSize, xMargin = TEXT_MARGIN, lineSpacing = LINE_SPACING, minHeight = 17) {
  if (!text || text.trim() === '') return minHeight;
  
  const lines = wrapText(font, text, maxWidth, fontSize, xMargin);
  const lineHeight = fontSize * lineSpacing;
  const totalHeight = lines.length * lineHeight + 4;
  
  return Math.max(totalHeight, minHeight);
}

function drawMultilineText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = TEXT_MARGIN, lineSpacing = LINE_SPACING) {
  if (!text || text.trim() === '') return;
  
  const lines = wrapText(font, text, width, size, xMargin);
  const lineHeight = size * lineSpacing;
  const totalTextHeight = lines.length * lineHeight;
  const verticalPadding = (height - totalTextHeight) / 2;
  let currentY = yBottom + verticalPadding + (lines.length - 1) * lineHeight + size * 0.25;
  
  for (const line of lines) {
    const textWidth = font.widthOfTextAtSize(line, size);
    let textX;
    
    if (align === 'center') {
      const availableWidth = width - 2 * xMargin;
      textX = x + xMargin + (availableWidth - textWidth) / 2;
    } else if (align === 'right') {
      textX = x + width - xMargin - textWidth;
    } else {
      textX = x + xMargin;
    }
    
    page.drawText(line, {
      x: textX,
      y: currentY,
      size: size,
      font: font,
      color: rgb(0, 0, 0)
    });
    
    currentY -= lineHeight;
  }
}

function drawAlignedText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = TEXT_MARGIN) {
  const textWidth = font.widthOfTextAtSize(text, size);
  let textX;
  
  if (align === 'center') {
    const availableWidth = width - 2 * xMargin;
    textX = x + xMargin + (availableWidth - textWidth) / 2;
  } else if (align === 'right') {
    textX = x + width - xMargin - textWidth;
  } else {
    textX = x + xMargin;
  }
  
  const textY = yBottom + height / 2 - size * 0.3;
  
  page.drawText(text, {
    x: textX,
    y: textY,
    size: size,
    font: font,
    color: rgb(0, 0, 0)
  });
}

// ==================================================================================
// RENDERING FUNCTIONS - Header
// ==================================================================================

function renderCoverHeader(context) {
  const { page, font, stroke, payload, headerFooter, leftMargin } = context;
  let { currentY } = context;
  
  for (const row of headerFooter.header.rows) {
    let rowHeight = row.height;
    if (rowHeight === "auto") {
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
    
    // Render columns
    for (const col of row.columns) {
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
            for (const subCol of subRow.columns) {
              drawCellBorders(stroke, subCol, subX, containerY, subCol.width, subHeight);
              
              const textContent = getTextContent(subCol, payload);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                drawMultilineText(page, font, textContent, subX, containerY - subHeight, subCol.width, subHeight, textSize, subCol.align);
              }
              
              subX += subCol.width;
            }
          } else {
            drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);
            
            const textContent = getTextContent(subRow, payload);
            if (textContent && subRow.type !== 'image') {
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
          
          const textContent = getTextContent(subCol, payload);
          if (textContent && subCol.type !== 'image') {
            const textSize = subCol.text_size || 9;
            drawMultilineText(page, font, textContent, subX, currentY - rowHeight, subCol.width, rowHeight, textSize, subCol.align);
          }
          
          subX += subCol.width;
        }
      } else {
        drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);
        
        const textContent = getTextContent(col, payload);
        if (textContent && col.type !== 'image') {
          const textSize = col.text_size || 9;
          drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align);
        }
      }
      
      currentX += colWidth;
    }
    
    currentY -= rowHeight;
  }
  
  return currentY;
}

// ==================================================================================
// RENDERING FUNCTIONS - Approval Table
// ==================================================================================

function renderApprovalTable(context) {
  const { page, font, stroke, payload, leftMargin, usableWidth, firmas } = context;
  let { currentY } = context;
  
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

  // Calculate row heights
  const rowHeights = [];
  for (let i = 0; i < firmas.rows.length; i++) {
    let maxHeight = minRowH;
    
    for (let j = 0; j < firmas.rows[i].cells.length; j++) {
      const cell = firmas.rows[i].cells[j];
      const colWidth = firmas.header.columns[j].width;
      const textContent = getTextContent(cell, payload);
      
      if (textContent) {
        const cellHeight = calculateTextHeight(font, textContent, colWidth, firmas.rows_config.text_size);
        maxHeight = Math.max(maxHeight, cellHeight);
      }
    }
    
    rowHeights.push(maxHeight);
  }
  
  const dataH = rowHeights.reduce((sum, h) => sum + h, 0);
  strokeRect(stroke, tableX, currentY - dataH, usableWidth, dataH);
  
  let rowY = currentY;
  for (let i = 0; i < firmas.rows.length; i++) {
    const rowH = rowHeights[i];
    
    if (i > 0) {
      stroke(tableX, rowY, tableX + usableWidth, rowY);
    }
    
    let cellX = tableX;
    for (let j = 0; j < firmas.rows[i].cells.length; j++) {
      const cell = firmas.rows[i].cells[j];
      const colWidth = firmas.header.columns[j].width;
      const textContent = getTextContent(cell, payload);
      if (textContent) {
        drawMultilineText(page, font, textContent, cellX, rowY - rowH, colWidth, rowH, firmas.rows_config.text_size, firmas.rows_config.align);
      }
      cellX += colWidth;
    }
    
    rowY -= rowH;
  }
  
  accX = tableX;
  for (const col of firmas.header.columns) {
    accX += col.width;
    if (round2(accX) < round2(tableX + usableWidth)) {
      stroke(accX, currentY - dataH, accX, currentY);
    }
  }
  currentY -= dataH;

  return currentY;
}

// ==================================================================================
// RENDERING FUNCTIONS - Signature Blocks
// ==================================================================================

function renderSignatureBlocks(context) {
  const { page, font, stroke, payload, leftMargin, signing } = context;
  let { currentY } = context;
  
  currentY -= (signing.margin_top || 0);
  const baseX = leftMargin;
  const blockDynamicHeights = [];
  
  // Calculate dynamic heights
  for (const b of signing.blocks) {
    const rowHeights = [];
    
    for (const r of b.rows) {
      let rowHeight = r.height;
      
      if (r.type === 'columns' && r.columns) {
        for (const col of r.columns) {
          const textContent = getTextContent(col, payload);
          if (textContent && col.type !== 'image') {
            const textSize = col.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, col.width, textSize, TEXT_MARGIN, LINE_SPACING, r.height);
            rowHeight = Math.max(rowHeight, cellHeight);
          }
        }
      } else if (r.type !== 'image') {
        const textContent = getTextContent(r, payload);
        if (textContent) {
          const textSize = r.text_size || 9;
          const cellHeight = calculateTextHeight(font, textContent, b.width, textSize, TEXT_MARGIN, LINE_SPACING, r.height);
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
    blockRows.get(yPos).push({ block: b, idx: idx, heights: blockDynamicHeights[idx] });
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

// ==================================================================================
// RENDERING FUNCTIONS - Revision Table
// ==================================================================================

function renderRevisionTable(context) {
  const { page, font, stroke, payload, leftMargin, usableWidth, rev } = context;
  let { currentY } = context;
  
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

  // Dynamic rows
  if (payload.revision_history && payload.revision_history.length > 0) {
    const rowHeights = [];
    for (let i = 0; i < payload.revision_history.length; i++) {
      const revisionEntry = payload.revision_history[i];
      let maxHeight = minRowH;
      
      for (let j = 0; j < rev.row_template.cells.length; j++) {
        const cellTemplate = rev.row_template.cells[j];
        const colWidth = rev.header.columns[j].width;
        const value = resolveTemplate(cellTemplate.source, revisionEntry);
        
        if (value) {
          const cellHeight = calculateTextHeight(font, value, colWidth, rev.row_template.text_size);
          maxHeight = Math.max(maxHeight, cellHeight);
        }
      }
      
      rowHeights.push(maxHeight);
    }
    
    const dataH = rowHeights.reduce((sum, h) => sum + h, 0);
    strokeRect(stroke, tableX, currentY - dataH, usableWidth, dataH);
    
    let rowY = currentY;
    for (let i = 0; i < payload.revision_history.length; i++) {
      const rowH = rowHeights[i];
      
      if (i > 0) {
        stroke(tableX, rowY, tableX + usableWidth, rowY);
      }
      
      let cellX = tableX;
      const revisionEntry = payload.revision_history[i];
      
      for (let j = 0; j < rev.row_template.cells.length; j++) {
        const cellTemplate = rev.row_template.cells[j];
        const colWidth = rev.header.columns[j].width;
        const value = resolveTemplate(cellTemplate.source, revisionEntry);
        
        if (value) {
          drawMultilineText(page, font, value, cellX, rowY - rowH, colWidth, rowH, rev.row_template.text_size, rev.row_template.align);
        }
        
        cellX += colWidth;
      }
      
      rowY -= rowH;
    }
    
    accX = tableX;
    for (const col of rev.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - dataH, accX, currentY);
      }
    }
    currentY -= dataH;
  } else {
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

  return currentY;
}

// ==================================================================================
// PAGE MANAGEMENT - Headers & Footers
// ==================================================================================

function createPageHeaderRenderer(config) {
  const { pageHeight, topMargin, font, payload } = config;
  
  return function renderHeader(targetPage) {
    const headerY = pageHeight - topMargin + 30;
    const headerText = `${resolveTemplate('{{document.code}}', payload)} - ${resolveTemplate('{{document.title}}', payload)} - Page continuation`;
    const headerSize = 9;
    const headerWidth = font.widthOfTextAtSize(headerText, headerSize);
    const headerX = (config.pageWidth - headerWidth) / 2;
    
    targetPage.drawText(headerText, {
      x: headerX,
      y: headerY,
      size: headerSize,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
  };
}

function createPageFooterRenderer(config) {
  const { pageWidth, leftMargin, rightMargin, font, payload, headerFooter, pdfDoc } = config;
  
  return function renderFooter(targetPage, pageNumber, totalPages) {
    const footer = headerFooter.footer;
    
    // Draw separator line
    if (footer.separator_line && footer.separator_line.enabled) {
      const lineY = footer.separator_line.y_position;
      const lineX1 = leftMargin + footer.separator_line.margin_left;
      const lineX2 = pageWidth - rightMargin - footer.separator_line.margin_right;
      
      targetPage.drawLine({
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
    
    // Draw footer text
    const footerY = footer.y_position;
    const footerSize = footer.content?.text_size || 7;
    const availableWidth = pageWidth - (footer.content?.margin_left || 0) - (footer.content?.margin_right || 0);
    
    // Wrap text if needed
    const lines = wrapText(font, footerText, availableWidth, footerSize, 0);
    
    let currentY = footerY;
    for (const line of lines) {
      const lineWidth = font.widthOfTextAtSize(line, footerSize);
      const footerX = footer.content?.align === 'center' 
        ? (pageWidth - lineWidth) / 2 
        : (footer.content?.margin_left || leftMargin);
      
      targetPage.drawText(line, {
        x: footerX,
        y: currentY,
        size: footerSize,
        font: font,
        color: rgb(0.3, 0.3, 0.3)
      });
      
      currentY -= footerSize * 1.2; // Line spacing
    }
  };
}

// ==================================================================================
// MAIN PDF GENERATION
// ==================================================================================

async function generateGoldenPdf(payloadFile) {
  const payloadPath = path.join(__dirname, 'qa', 'payloads', payloadFile);
  const outputFile = payloadFile.replace('.json', '.pdf');
  const outputPath = path.join(__dirname, 'qa', 'golden', outputFile);

  try {
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    const headerFooter = JSON.parse(fs.readFileSync(path.join(__dirname, 'HeaderFooter.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'Manifest.json'), 'utf8'));

    const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
    const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
    const usableWidth = pageWidth - leftMargin - rightMargin;
    const footerTopY = headerFooter.footer.separator_line.y_position + 20;
    const minY = footerTopY;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    let page = pdfDoc.addPage([pageWidth, pageHeight]);
    let stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

    const fontBytes = fs.readFileSync(path.join(__dirname, headerFooter.fonts.regular));
    const font = await pdfDoc.embedFont(fontBytes);
    
    const renderHeader = createPageHeaderRenderer({ pageHeight, topMargin, pageWidth, font, payload });
    const renderFooter = createPageFooterRenderer({ pageWidth, leftMargin, rightMargin, font, payload, headerFooter, pdfDoc });
    
    // Centralized page overflow handler
    function addNewPage() {
      // Don't render footer here - we'll render all footers at the end with correct page numbers
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);
      renderHeader(page);
      return pageHeight - topMargin - 50;
    }
    
    function ensureSpace(requiredHeight) {
      if (currentY - requiredHeight < minY) {
        currentY = addNewPage();
      }
    }

    let currentY = headerFooter.header.y_position + headerFooter.header.height;
    
    // Build context for rendering functions
    const buildContext = () => ({
      page, font, stroke, payload, headerFooter, manifest,
      pageWidth, pageHeight, leftMargin, rightMargin, usableWidth,
      topMargin, bottomMargin, minY,
      currentY
    });

    // Render cover header
    currentY = renderCoverHeader(buildContext());
    
    // Get table configurations
    const tables = manifest.content?.tables || [];
    const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
    const signing = tables.find(t => t.id === 'signing_container');
    const rev = tables.find(t => t.id === 'control_de_cambios');
    
    // Render approval table with overflow check
    if (firmas) {
      ensureSpace(150); // Estimated minimum height for approval table
      currentY = renderApprovalTable({ ...buildContext(), currentY, firmas });
    }
    
    // Render signature blocks with overflow check
    if (signing) {
      ensureSpace(200); // Estimated minimum height for signature blocks
      currentY = renderSignatureBlocks({ ...buildContext(), currentY, signing });
    }
    
    // Render revision table with overflow check
    if (rev) {
      const estimatedHeight = payload.revision_history?.length 
        ? rev.title.height + rev.header.height + (rev.row_template.height * payload.revision_history.length)
        : 100;
      ensureSpace(estimatedHeight);
      currentY = renderRevisionTable({ ...buildContext(), currentY, rev });
    }

    // Render footers on all pages with correct page numbers
    const totalPages = pdfDoc.getPageCount();
    for (let i = 0; i < totalPages; i++) {
      renderFooter(pdfDoc.getPages()[i], i + 1, totalPages);
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    return { success: true, file: outputFile, pages: totalPages };
  } catch (error) {
    return { success: false, file: outputFile, error: error.message };
  }
}

// ==================================================================================
// BATCH PROCESSING
// ==================================================================================

async function main() {
  const payloadsDir = path.join(__dirname, 'qa', 'payloads');
  const goldenDir = path.join(__dirname, 'qa', 'golden');

  if (!fs.existsSync(goldenDir)) {
    fs.mkdirSync(goldenDir, { recursive: true });
  }

  const payloadFiles = fs.readdirSync(payloadsDir).filter(f => f.endsWith('.json'));
  const results = [];

  for (const payloadFile of payloadFiles) {
    const result = await generateGoldenPdf(payloadFile);
    results.push(result);
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  console.log('='.repeat(60));
  console.log('Golden PDF Generation Complete');
  console.log('='.repeat(60));
  console.log(`Total: ${results.length} | Success: ${successCount} | Failed: ${failureCount}`);
  
  if (failureCount > 0) {
    console.log('\nFailed files:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.file}: ${r.error}`);
    });
  }
  
  console.log('='.repeat(60) + '\n');

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
