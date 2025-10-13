// generate-golden.js — Generate golden PDFs from test payloads
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.cyan}======================================${colors.reset}`);
console.log(`${colors.cyan}  Golden PDF Generator${colors.reset}`);
console.log(`${colors.cyan}======================================${colors.reset}\n`);

// ---------- stroke utilities (dedupe shared edges) ----------
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
  stroke(x, y, x + w, y);           // bottom
  stroke(x, y + h, x + w, y + h);   // top
  stroke(x, y, x, y + h);           // left
  stroke(x + w, y, x + w, y + h);   // right
}

// ---------- config ----------
const BORDER_CONFIG = { color: rgb(0, 0, 0), thickness: 0 }; // hairline

// ---------- helper functions ----------
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

// Text wrapping utility - breaks text into lines that fit within maxWidth
function wrapText(font, text, maxWidth, fontSize, xMargin = 4) {
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
      // Check if single word is too long
      const wordWidth = font.widthOfTextAtSize(word, fontSize);
      if (wordWidth > availableWidth) {
        // Word is too long, need to break it character by character
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

// Calculate required height for wrapped text
function calculateTextHeight(font, text, maxWidth, fontSize, xMargin = 4, lineSpacing = 1.2, minHeight = 17) {
  if (!text || text.trim() === '') return minHeight;
  
  const lines = wrapText(font, text, maxWidth, fontSize, xMargin);
  const lineHeight = fontSize * lineSpacing;
  const totalHeight = lines.length * lineHeight + 4; // Add padding
  
  return Math.max(totalHeight, minHeight);
}

// Draw multi-line text with wrapping
function drawMultilineText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = 4, lineSpacing = 1.2) {
  if (!text || text.trim() === '') return;
  
  const lines = wrapText(font, text, width, size, xMargin);
  const lineHeight = size * lineSpacing;
  
  // Calculate starting Y position for proper vertical centering
  const totalTextHeight = lines.length * lineHeight;
  const verticalPadding = (height - totalTextHeight) / 2;
  
  // Start from the center, accounting for baseline which is ~25% from bottom of em-box
  // For the first line, we position it so the text block is centered
  let currentY = yBottom + verticalPadding + (lines.length - 1) * lineHeight + size * 0.25;
  
  for (const line of lines) {
    const textWidth = font.widthOfTextAtSize(line, size);
    let textX;
    
    // Apply horizontal margins and alignment
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

// Single-line text drawing for non-wrapping cells
function drawAlignedText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = 4) {
  const textWidth = font.widthOfTextAtSize(text, size);
  let textX;
  
  // Apply horizontal margins and alignment
  if (align === 'center') {
    const availableWidth = width - 2 * xMargin;
    textX = x + xMargin + (availableWidth - textWidth) / 2;
  } else if (align === 'right') {
    textX = x + width - xMargin - textWidth;
  } else {
    textX = x + xMargin;
  }
  
  // Vertical centering: account for baseline positioning
  const textY = yBottom + height / 2 - size * 0.3;
  
  page.drawText(text, {
    x: textX,
    y: textY,
    size: size,
    font: font,
    color: rgb(0, 0, 0)
  });
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

// Generate golden PDF for a single payload
async function generateGoldenPdf(payloadFile) {
  const payloadPath = path.join(__dirname, 'qa', 'payloads', payloadFile);
  const outputFile = payloadFile.replace('.json', '.pdf');
  const outputPath = path.join(__dirname, 'qa', 'golden', outputFile);

  console.log(`${colors.blue}Processing:${colors.reset} ${payloadFile}`);

  try {
    // Load payload
    const payloadContent = fs.readFileSync(payloadPath, 'utf8');
    const payload = JSON.parse(payloadContent);

    // Load design files
    const headerFooterPath = path.join(__dirname, 'HeaderFooter.json');
    const manifestPath = path.join(__dirname, 'Manifest.json');
    const headerFooter = JSON.parse(fs.readFileSync(headerFooterPath, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
    const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
    const usableWidth = pageWidth - leftMargin - rightMargin;

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

    // Load fonts
    const fontPath = path.join(__dirname, headerFooter.fonts.regular);
    const fontBytes = fs.readFileSync(fontPath);
    const font = await pdfDoc.embedFont(fontBytes);

    console.log(`  ${colors.cyan}•${colors.reset} Page size: ${pageWidth}×${pageHeight} points`);

    // ---------------- COVER HEADER WITH DYNAMIC HEIGHTS ----------------
    let currentY = headerFooter.header.y_position + headerFooter.header.height;
    
    for (const row of headerFooter.header.rows) {
      // Calculate row height - if "auto", sum heights from container column
      let rowHeight = row.height;
      if (rowHeight === "auto") {
        const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
        if (containerCol) {
          rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
        }
      }
      
      // Calculate dynamic height based on content
      let calculatedHeight = rowHeight;
      for (const col of row.columns) {
        if (col.type === 'container' && col.rows) {
          // For containers, sum up the dynamic heights of all sub-rows
          let containerTotalHeight = 0;
          for (const subRow of col.rows) {
            let subRowHeight = subRow.height;
            
            if (subRow.type === 'columns' && subRow.columns) {
              for (const subCol of subRow.columns) {
                const textContent = getTextContent(subCol, payload);
                if (textContent && subCol.type !== 'image') {
                  const textSize = subCol.text_size || 9;
                  const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize, 4, 1.2, subRow.height);
                  subRowHeight = Math.max(subRowHeight, cellHeight);
                }
              }
            } else {
              const textContent = getTextContent(subRow, payload);
              if (textContent && subRow.type !== 'image') {
                const textSize = subRow.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, col.width, textSize, 4, 1.2, subRow.height);
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
              const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize, 4, 1.2, rowHeight);
              calculatedHeight = Math.max(calculatedHeight, cellHeight);
            }
          }
        } else if (col.type !== 'image') {
          const textContent = getTextContent(col, payload);
          if (textContent) {
            const textSize = col.text_size || 9;
            const cellHeight = calculateTextHeight(font, textContent, col.width, textSize, 4, 1.2, rowHeight);
            calculatedHeight = Math.max(calculatedHeight, cellHeight);
          }
        }
      }
      
      rowHeight = calculatedHeight;
      let currentX = leftMargin;
      
      for (const col of row.columns) {
        const colWidth = col.width;
        
        // Handle nested containers
        if (col.type === 'container' && col.rows) {
          let containerY = currentY;
          
          // Calculate dynamic heights for each sub-row in the container
          const subRowHeights = [];
          for (const subRow of col.rows) {
            let subHeight = subRow.height;
            
            if (subRow.type === 'columns' && subRow.columns) {
              // Check all columns in this sub-row
              for (const subCol of subRow.columns) {
                const textContent = getTextContent(subCol, payload);
                if (textContent && subCol.type !== 'image') {
                  const textSize = subCol.text_size || 9;
                  const cellHeight = calculateTextHeight(font, textContent, subCol.width, textSize, 4, 1.2, subRow.height);
                  subHeight = Math.max(subHeight, cellHeight);
                }
              }
            } else {
              const textContent = getTextContent(subRow, payload);
              if (textContent && subRow.type !== 'image') {
                const textSize = subRow.text_size || 9;
                const cellHeight = calculateTextHeight(font, textContent, colWidth, textSize, 4, 1.2, subRow.height);
                subHeight = Math.max(subHeight, cellHeight);
              }
            }
            
            subRowHeights.push(subHeight);
          }
          
          // Render sub-rows with dynamic heights
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
                  drawMultilineText(page, font, textContent, subX, containerY - subHeight, subCol.width, subHeight, textSize, subCol.align, 4, 1.2);
                }
                
                subX += subCol.width;
              }
            } else {
              drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);
              
              const textContent = getTextContent(subRow, payload);
              if (textContent && subRow.type !== 'image') {
                const textSize = subRow.text_size || 9;
                drawMultilineText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align, 4, 1.2);
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
              drawMultilineText(page, font, textContent, subX, currentY - rowHeight, subCol.width, rowHeight, textSize, subCol.align, 4, 1.2);
            }
            
            subX += subCol.width;
          }
        } else {
          // Regular column (including images)
          // For image columns, use the full row height to match container height
          drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);
          
          const textContent = getTextContent(col, payload);
          if (textContent && col.type !== 'image') {
            const textSize = col.text_size || 9;
            drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align, 4, 1.2);
          }
          // Note: Images will be rendered with rowHeight, ensuring they match the container height
        }
        
        currentX += colWidth;
      }
      
      currentY -= rowHeight;
    }

    console.log(`  ${colors.green}✓${colors.reset} Rendered header`);

    // ---------------- CONTENT TABLES ----------------
    const tables = manifest.content?.tables || [];

    // == FIRMAS Y APROBACIONES Table ==
    const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
    if (firmas) {
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

      // Rows with dynamic heights
      const rowHeights = [];
      for (let i = 0; i < firmas.rows.length; i++) {
        let maxHeight = minRowH;
        
        for (let j = 0; j < firmas.rows[i].cells.length; j++) {
          const cell = firmas.rows[i].cells[j];
          const colWidth = firmas.header.columns[j].width;
          const textContent = getTextContent(cell, payload);
          
          if (textContent) {
            const cellHeight = calculateTextHeight(font, textContent, colWidth, firmas.rows_config.text_size, 4, 1.2, minRowH);
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
            drawMultilineText(page, font, textContent, cellX, rowY - rowH, colWidth, rowH, firmas.rows_config.text_size, firmas.rows_config.align, 4, 1.2);
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

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${firmas.rows.length} rows in approval table (dynamic heights)`);
    }

    // == SIGNING CONTAINER ==
    const signing = tables.find(t => t.id === 'signing_container');
    if (signing) {
      currentY -= (signing.margin_top || 0);
      const baseX = leftMargin;

      for (const b of signing.blocks) {
        const blockX = baseX + (b.x || 0);
        let blockY = currentY - (b.y || 0);

        for (const r of b.rows) {
          const h = r.height;
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
                drawAlignedText(page, font, textContent, colX, yBottom, colWidth, h, textSize, col.align);
              }
              
              colX += colWidth;
            }
          } else {
            drawCellBorders(stroke, r, blockX, blockY, b.width, h);

            const textContent = getTextContent(r, payload);
            if (textContent && r.type !== 'image') {
              const textSize = r.text_size || 9;
              drawAlignedText(page, font, textContent, blockX, yBottom, b.width, h, textSize, r.align);
            }
          }

          blockY = yBottom;
        }
      }

      const maxBlockHeight = Math.max(...signing.blocks.map(b => {
        const totalHeight = b.rows.reduce((sum, r) => sum + r.height, 0);
        return (b.y || 0) + totalHeight;
      }));
      currentY -= maxBlockHeight;

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${signing.blocks.length} signature blocks`);
    }

    // == CONTROL DE CAMBIOS ==
    const rev = tables.find(t => t.id === 'control_de_cambios');
    if (rev) {
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

      // Dynamic rows from payload with dynamic heights
      if (payload.revision_history && payload.revision_history.length > 0) {
        // Calculate row heights based on content
        const rowHeights = [];
        for (let i = 0; i < payload.revision_history.length; i++) {
          const revisionEntry = payload.revision_history[i];
          let maxHeight = minRowH;
          
          // Check each cell to find the tallest content
          for (let j = 0; j < rev.row_template.cells.length; j++) {
            const cellTemplate = rev.row_template.cells[j];
            const colWidth = rev.header.columns[j].width;
            const value = resolveTemplate(cellTemplate.source, revisionEntry);
            
            if (value) {
              const cellHeight = calculateTextHeight(font, value, colWidth, rev.row_template.text_size, 4, 1.2, minRowH);
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
              // Use multiline text for cells that need wrapping
              drawMultilineText(page, font, value, cellX, rowY - rowH, colWidth, rowH, rev.row_template.text_size, rev.row_template.align, 4, 1.2);
            }
            
            cellX += colWidth;
          }
          
          rowY -= rowH;
        }
        
        // Draw vertical lines
        accX = tableX;
        for (const col of rev.header.columns) {
          accX += col.width;
          if (round2(accX) < round2(tableX + usableWidth)) {
            stroke(accX, currentY - dataH, accX, currentY);
          }
        }
        currentY -= dataH;

        console.log(`  ${colors.green}✓${colors.reset} Rendered ${payload.revision_history.length} rows in revision table (dynamic heights)`);
      } else {
        // Draw one template row
        strokeRect(stroke, tableX, currentY - minRowH, usableWidth, minRowH);
        accX = tableX;
        for (const col of rev.header.columns) {
          accX += col.width;
          if (round2(accX) < round2(tableX + usableWidth)) {
            stroke(accX, currentY - minRowH, accX, currentY);
          }
        }
        currentY -= minRowH;
        console.log(`  ${colors.yellow}ℹ${colors.reset} No revision history data, rendered empty template row`);
      }
    }

    // ---------------- FOOTER ----------------
    const footer = headerFooter.footer;
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

    console.log(`  ${colors.green}✓${colors.reset} Rendered footer`);

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`  ${colors.green}✓${colors.reset} Saved: ${outputFile}\n`);

    return true;
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}`);
    console.log(`  ${colors.red}  ${colors.reset} ${error.stack}\n`);
    return false;
  }
}

// Main execution
async function main() {
  const payloadsDir = path.join(__dirname, 'qa', 'payloads');
  const goldenDir = path.join(__dirname, 'qa', 'golden');

  // Ensure golden directory exists
  if (!fs.existsSync(goldenDir)) {
    fs.mkdirSync(goldenDir, { recursive: true });
  }

  // Get all payload files
  const payloadFiles = fs.readdirSync(payloadsDir).filter(f => f.endsWith('.json'));

  console.log(`Found ${payloadFiles.length} test payload files\n`);

  let successCount = 0;
  let failureCount = 0;

  // Process each payload
  for (const payloadFile of payloadFiles) {
    const success = await generateGoldenPdf(payloadFile);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  // Summary
  console.log(`${colors.cyan}======================================${colors.reset}`);
  console.log(`${colors.green}✓${colors.reset} Successfully generated: ${successCount}`);
  if (failureCount > 0) {
    console.log(`${colors.red}✗${colors.reset} Failed: ${failureCount}`);
  }
  console.log(`${colors.cyan}======================================${colors.reset}\n`);

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset} ${error.message}`);
  process.exit(1);
});
