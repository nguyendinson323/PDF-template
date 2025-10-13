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
  
  // Calculate minimum Y position - content must stop before footer area
  // Footer separator is at 84pt, so add padding above it
  const footerTopY = headerFooter.footer.separator_line.y_position + 20; // 84 + 20 = 104pt
  const minY = footerTopY;

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

  // Load fonts
  const fontPath = path.join(__dirname, headerFooter.fonts.regular);
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);
  
  // Helper function to check and handle page overflow
  function checkPageOverflow(requiredHeight) {
    if (currentY - requiredHeight < minY) {
      // Render footer on current page before creating new one
      renderFooter(page);
      
      // Add new page
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);
      
      // Render header on new page
      renderHeader(page);
      
      // Reset currentY to below the header
      currentY = pageHeight - topMargin - 50; // Leave space for simple header
      return true; // Page was added
    }
    return false; // No overflow
  }
  
  // Helper function to render header on continuation pages
  function renderHeader(targetPage) {
    const headerY = pageHeight - topMargin + 30;
    const headerText = 'Document Cover Template - Page continuation';
    const headerSize = 9;
    const headerWidth = font.widthOfTextAtSize(headerText, headerSize);
    const headerX = (pageWidth - headerWidth) / 2;
    
    targetPage.drawText(headerText, {
      x: headerX,
      y: headerY,
      size: headerSize,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
  }
  
  // Helper function to render footer
  function renderFooter(targetPage) {
    const footer = headerFooter.footer;
    
    // Footer separator line - absolute position, ignores bottom margin
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
    
    // Footer text - absolute position from footer.y_position, ignores bottom margin
    const footerY = footer.y_position;
    const footerText = 'Document Cover Template';
    const footerSize = 8;
    const footerWidth = font.widthOfTextAtSize(footerText, footerSize);
    const footerX = (pageWidth - footerWidth) / 2;
    
    targetPage.drawText(footerText, {
      x: footerX,
      y: footerY,
      size: footerSize,
      font: font,
      color: rgb(0.3, 0.3, 0.3)
    });
  }

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
          // Container uses the full calculated row height
          const containerHeight = rowHeight;
          
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
        // Regular column (including images)
        // For image columns, use the full row height to match container height
        drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);
        
        // Draw text if not a placeholder
        const textContent = getTextContent(col);
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
    
    // Pre-calculate total table height to check for overflow
    const estimatedTableHeight = titleH + headerH + (rowH * firmas.rows.length);
    checkPageOverflow(estimatedTableHeight);

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

  // == SIGNING CONTAINER WITH DYNAMIC HEIGHTS ==
  const signing = tables.find(t => t.id === 'signing_container');
  if (signing) {
    currentY -= (signing.margin_top || 0);
    const baseX = leftMargin;
    
    // Estimate signing container height for overflow check
    const estimatedSigningHeight = 200; // Approximate height for signature blocks
    checkPageOverflow(estimatedSigningHeight);

    // Calculate dynamic heights for all blocks (placeholder mode - no payload data)
    const blockDynamicHeights = [];
    
    for (const b of signing.blocks) {
      const rowHeights = [];
      
      for (const r of b.rows) {
        let rowHeight = r.height;
        
        if (r.type === 'columns' && r.columns) {
          // Check all columns for text that might need wrapping
          for (const col of r.columns) {
            const textContent = getTextContent(col);
            if (textContent && col.type !== 'image') {
              const textSize = col.text_size || 9;
              const cellHeight = calculateTextHeight(font, textContent, col.width, textSize, 4, 1.2, r.height);
              rowHeight = Math.max(rowHeight, cellHeight);
            }
          }
        } else if (r.type !== 'image') {
          const textContent = getTextContent(r);
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

    // Render blocks with dynamic heights
    for (let blockIdx = 0; blockIdx < signing.blocks.length; blockIdx++) {
      const b = signing.blocks[blockIdx];
      const rowHeights = blockDynamicHeights[blockIdx];
      const blockX = baseX + (b.x || 0);
      let blockY = currentY - (b.y || 0);

      for (let rowIdx = 0; rowIdx < b.rows.length; rowIdx++) {
        const r = b.rows[rowIdx];
        const h = rowHeights[rowIdx];
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
              drawMultilineText(page, font, textContent, colX, yBottom, colWidth, h, textSize, col.align, 4, 1.2);
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
            drawMultilineText(page, font, textContent, blockX, yBottom, b.width, h, textSize, r.align, 4, 1.2);
          }
        }

        blockY = yBottom;
      }
    }

    // Calculate max height using dynamic heights
    const maxBlockHeight = Math.max(...signing.blocks.map((b, idx) => {
      const totalHeight = blockDynamicHeights[idx].reduce((sum, h) => sum + h, 0);
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
    
    // Pre-calculate revision table height to check for overflow
    const estimatedRevTableHeight = titleH + headerH + rowH;
    checkPageOverflow(estimatedRevTableHeight);

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

  // ---------------- FOOTER ----------------
  // Render footer on all pages
  const totalPages = pdfDoc.getPageCount();
  for (let i = 0; i < totalPages; i++) {
    const currentPage = pdfDoc.getPages()[i];
    renderFooter(currentPage);
  }

  // ---------------- SAVE ----------------
  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'Cover.pdf');
  fs.writeFileSync(outPath, pdfBytes);
}

createCleanCover().catch(e => { console.error('❌ Error creating cover:', e); process.exit(1); });
