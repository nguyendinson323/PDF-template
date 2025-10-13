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

function drawAlignedText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = 2) {
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

    // ---------------- COVER HEADER ----------------
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
                
                const textContent = getTextContent(subCol, payload);
                if (textContent && subCol.type !== 'image') {
                  const textSize = subCol.text_size || 9;
                  drawAlignedText(page, font, textContent, subX, containerY - subHeight, subCol.width, subHeight, textSize, subCol.align);
                }
                
                subX += subCol.width;
              }
            } else {
              drawCellBorders(stroke, subRow, currentX, containerY, colWidth, subHeight);
              
              const textContent = getTextContent(subRow, payload);
              if (textContent && subRow.type !== 'image') {
                const textSize = subRow.text_size || 9;
                drawAlignedText(page, font, textContent, currentX, containerY - subHeight, colWidth, subHeight, textSize, subRow.align);
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
              drawAlignedText(page, font, textContent, subX, currentY - rowHeight, subCol.width, rowHeight, textSize, subCol.align);
            }
            
            subX += subCol.width;
          }
        } else {
          // Regular column
          drawCellBorders(stroke, col, currentX, currentY, colWidth, rowHeight);
          
          const textContent = getTextContent(col, payload);
          if (textContent && col.type !== 'image') {
            const textSize = col.text_size || 9;
            drawAlignedText(page, font, textContent, currentX, currentY - rowHeight, colWidth, rowHeight, textSize, col.align);
          }
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
        let cellX = tableX;
        for (let j = 0; j < firmas.rows[i].cells.length; j++) {
          const cell = firmas.rows[i].cells[j];
          const colWidth = firmas.header.columns[j].width;
          const textContent = getTextContent(cell, payload);
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

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${firmas.rows.length} rows in approval table`);
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

      // Dynamic rows from payload
      if (payload.revision_history && payload.revision_history.length > 0) {
        const dataH = rowH * payload.revision_history.length;
        strokeRect(stroke, tableX, currentY - dataH, usableWidth, dataH);
        
        for (let i = 0; i < payload.revision_history.length; i++) {
          if (i > 0) {
            stroke(tableX, currentY - i * rowH, tableX + usableWidth, currentY - i * rowH);
          }
          
          let cellX = tableX;
          const revisionEntry = payload.revision_history[i];
          
          for (let j = 0; j < rev.row_template.cells.length; j++) {
            const cellTemplate = rev.row_template.cells[j];
            const colWidth = rev.header.columns[j].width;
            const value = resolveTemplate(cellTemplate.source, revisionEntry);
            
            if (value) {
              drawAlignedText(page, font, value, cellX, currentY - (i * rowH) - rowH, colWidth, rowH, rev.row_template.text_size, rev.row_template.align);
            }
            
            cellX += colWidth;
          }
        }
        
        accX = tableX;
        for (const col of rev.header.columns) {
          accX += col.width;
          if (round2(accX) < round2(tableX + usableWidth)) {
            stroke(accX, currentY - dataH, accX, currentY);
          }
        }
        currentY -= dataH;

        console.log(`  ${colors.green}✓${colors.reset} Rendered ${payload.revision_history.length} rows in revision table`);
      } else {
        // Draw one template row
        strokeRect(stroke, tableX, currentY - rowH, usableWidth, rowH);
        accX = tableX;
        for (const col of rev.header.columns) {
          accX += col.width;
          if (round2(accX) < round2(tableX + usableWidth)) {
            stroke(accX, currentY - rowH, accX, currentY);
          }
        }
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
