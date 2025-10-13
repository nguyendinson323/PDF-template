// create-clean-cover.js — refactored to use cover_design.json + Manifest.json
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

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
function isPlaceholder(text) {
  return text && text.includes('{{') && text.includes('}}');
}

function getTextContent(field) {
  if (field.text && !isPlaceholder(field.text)) {
    return field.text;
  }
  if (field.source && !isPlaceholder(field.source)) {
    return field.source;
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
  
  // Calculate starting Y position (top of text block)
  const totalTextHeight = lines.length * lineHeight;
  const verticalPadding = (height - totalTextHeight) / 2;
  let currentY = yBottom + height - verticalPadding - size * 0.7; // Adjust for baseline
  
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
function drawAlignedText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = 5) {
  const textWidth = font.widthOfTextAtSize(text, size);
  let textX;
  
  // Apply horizontal margins and alignment
  if (align === 'center') {
    // Center the text, but respect margins (shifts center point)
    const availableWidth = width - 2 * xMargin;
    textX = x + xMargin + (availableWidth - textWidth) / 2;
  } else if (align === 'right') {
    // Align to right with margin from right edge
    textX = x + width - xMargin - textWidth;
  } else {
    // Align to left with margin from left edge
    textX = x + xMargin;
  }
  
  // Vertical centering: account for baseline positioning
  // Text baseline is approximately 30% from bottom of font height
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

// ---------- load design files ----------
const headerFooterPath = path.join(__dirname, 'HeaderFooter.json');
const manifestPath = path.join(__dirname, 'Manifest.json');
const headerFooter = JSON.parse(fs.readFileSync(headerFooterPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function createCleanCover() {
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

  // ---------------- COVER HEADER: margin-based dynamic layout ----------------
  let currentY = headerFooter.header.y_position + headerFooter.header.height;
  
  for (const row of headerFooter.header.rows) {
    // Calculate row height - if "auto", sum heights from container column
    let rowHeight = row.height;
    if (rowHeight === "auto") {
      // Find container column and sum its rows' heights
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }
    let currentX = leftMargin;
    
    for (const col of row.columns) {
      const colWidth = col.width;
      
      // Handle nested containers
      if (col.type === 'container' && col.rows) {
        let containerY = currentY;
        for (const subRow of col.rows) {
          const subHeight = subRow.height;
          
            if (subRow.type === 'columns' && subRow.columns) {
            let subX = currentX;
            for (const subCol of subRow.columns) {
              drawCellBorders(stroke, subCol, subX, containerY, subCol.width, subHeight);
              
              // Draw text if not a placeholder
              const textContent = getTextContent(subCol);
              if (textContent && subCol.type !== 'image') {
                const textSize = subCol.text_size || 9;
                drawMultilineText(page, font, textContent, subX, containerY - subHeight, subCol.width, subHeight, textSize, subCol.align, 4, 1.2);
              }
              
              subX += subCol.width;
            }
  } else {
            drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);
            
            // Draw text if not a placeholder
            const textContent = getTextContent(subRow);
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
          
          // Draw text if not a placeholder
          const textContent = getTextContent(subCol);
          if (textContent && subCol.type !== 'image') {
            const textSize = subCol.text_size || 9;
            drawMultilineText(page, font, textContent, subX, currentY - rowHeight, subCol.width, rowHeight, textSize, subCol.align, 4, 1.2);
          }
          
          subX += subCol.width;
        }
      } else {
        // Regular column
        drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);
        
        // Draw text if not a placeholder
        const textContent = getTextContent(col);
        if (textContent && col.type !== 'image') {
          const textSize = col.text_size || 9;
          drawMultilineText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align, 4, 1.2);
        }
      }
      
      currentX += colWidth;
    }
    
    currentY -= rowHeight;
  }

  // ---------------- CONTENT TABLES (from Manifest.json) ----------------
  const tables = manifest.content?.tables || [];

  // == FIRMAS Y APROBACIONES Table ==
  const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
  if (firmas) {
    currentY -= (firmas.margin_top || 0);
    const tableX = leftMargin;
    const titleH = firmas.title.height;
    const headerH = firmas.header.height;
    const rowH = firmas.rows_config.height;

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

    // Rows
    const dataH = rowH * firmas.rows.length;
    strokeRect(stroke, tableX, currentY - dataH, usableWidth, dataH);
    for (let i = 0; i < firmas.rows.length; i++) {
      if (i > 0) {
      stroke(tableX, currentY - i * rowH, tableX + usableWidth, currentY - i * rowH);
      }
      // Draw row text
      let cellX = tableX;
      for (let j = 0; j < firmas.rows[i].cells.length; j++) {
        const cell = firmas.rows[i].cells[j];
        const colWidth = firmas.header.columns[j].width;
        const textContent = getTextContent(cell);
        if (textContent) {
          drawAlignedText(page, font, textContent, cellX, currentY - (i * rowH) - rowH, colWidth, rowH, firmas.rows_config.text_size, firmas.rows_config.align);
        }
        cellX += colWidth;
      }
    }
    accX = tableX;
    for (const col of firmas.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - dataH, accX, currentY);
      }
    }
    currentY -= dataH;
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

        // Check row type
        if (r.type === 'columns' && r.columns) {
          // Draw as columns
          let colX = blockX;
          for (let i = 0; i < r.columns.length; i++) {
            const col = r.columns[i];
            const colWidth = col.width;
            
            stroke(colX, blockY, colX + colWidth, blockY); // top
            stroke(colX, yBottom, colX + colWidth, yBottom); // bottom
            stroke(colX, yBottom, colX, blockY); // left
            if (i === r.columns.length - 1) {
              stroke(colX + colWidth, yBottom, colX + colWidth, blockY); // right on last column
            }
            
            // Draw text if not a placeholder
            const textContent = getTextContent(col);
            if (textContent) {
              const textSize = col.text_size || 9;
              drawAlignedText(page, font, textContent, colX, yBottom, colWidth, h, textSize, col.align);
            }
            
            colX += colWidth;
          }
        } else {
          // Normal row
          drawCellBorders(stroke, r, blockX, blockY, b.width, h);

          // Draw text if not a placeholder
          const textContent = getTextContent(r);
          if (textContent && r.type !== 'image') {
            const textSize = r.text_size || 9;
            drawAlignedText(page, font, textContent, blockX, yBottom, b.width, h, textSize, r.align);
          }
        }

        blockY = yBottom;
      }
    }

    // Calculate max height for next section
    const maxBlockHeight = Math.max(...signing.blocks.map(b => {
      const totalHeight = b.rows.reduce((sum, r) => sum + r.height, 0);
      return (b.y || 0) + totalHeight;
    }));
    currentY -= maxBlockHeight;
  }

  // == CONTROL DE CAMBIOS ==
  const rev = tables.find(t => t.id === 'control_de_cambios');
  if (rev) {
    currentY -= (rev.margin_top || 0);
    const tableX = leftMargin;
    const titleH = rev.title.height;
    const headerH = rev.header.height;
    const rowH = rev.row_template.height;

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

    // One template row
    strokeRect(stroke, tableX, currentY - rowH, usableWidth, rowH);
    accX = tableX;
    for (const col of rev.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - rowH, accX, currentY);
      }
    }
  }

  // ---------------- FOOTER (from HeaderFooter.json) ----------------
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

  // ---------------- SAVE ----------------
  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'Cover.pdf');
  fs.writeFileSync(outPath, pdfBytes);
}

createCleanCover().catch(e => { console.error('❌ Error creating cover:', e); process.exit(1); });
