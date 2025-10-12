const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
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

// Helper function to resolve template variables
function resolveTemplate(template, data, context = '') {
  if (!template || typeof template !== 'string') {
    return template || '';
  }

  return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
    try {
      const keys = path.trim().split('.');
      let value = data;

      for (const key of keys) {
        if (key.includes('[')) {
          // Handle array indexing like "reviewers[0]"
          const [arrayKey, indexStr] = key.split(/[\[\]]/);
          const index = parseInt(indexStr);
          if (value[arrayKey] && Array.isArray(value[arrayKey]) && value[arrayKey][index]) {
            value = value[arrayKey][index];
          } else {
            return '';  // Array element not found
          }
        } else {
          value = value ? value[key] : undefined;
        }

        if (value === undefined || value === null) {
          console.log(`${colors.yellow}⚠${colors.reset} Template variable not found: ${path} (in ${context})`);
          return '';
        }
      }

      return String(value);
    } catch (error) {
      console.log(`${colors.red}✗${colors.reset} Error resolving template ${path}: ${error.message}`);
      return '';
    }
  });
}

// Helper function to convert hex color to RGB
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
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

    // Load Cover.pdf as template
    const coverBytes = fs.readFileSync(path.join(__dirname, 'Cover.pdf'));
    const pdfDoc = await PDFDocument.load(coverBytes);

    // Register fontkit for custom font embedding
    pdfDoc.registerFontkit(fontkit);

    // Load Manifest.json
    const manifestContent = fs.readFileSync(path.join(__dirname, 'Manifest.json'), 'utf8');
    const manifest = JSON.parse(manifestContent);

    // Embed fonts
    const fontRegularBytes = fs.readFileSync(path.join(__dirname, manifest.fonts.regular));
    const fontBoldBytes = fs.readFileSync(path.join(__dirname, manifest.fonts.bold));
    const fontRegular = await pdfDoc.embedFont(fontRegularBytes);
    const fontBold = await pdfDoc.embedFont(fontBoldBytes);

    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();

    console.log(`  ${colors.cyan}•${colors.reset} Page size: ${width}×${height} points`);

    // Render all text fields from manifest
    let fieldsRendered = 0;
    for (const field of manifest.fields || []) {
      try {
        const value = resolveTemplate(field.source, payload, field.id);

        if (!value && value !== 0) {
          // Skip empty fields (might be conditional)
          continue;
        }

        const font = field.style.font === 'bold' ? fontBold : fontRegular;
        const color = field.style.color ? hexToRgb(field.style.color) : rgb(0, 0, 0);

        // Calculate text alignment
        let x = field.position.x;
        if (field.style.align === 'center' && field.position.width) {
          const textWidth = font.widthOfTextAtSize(value, field.style.size);
          x = field.position.x + (field.position.width - textWidth) / 2;
        } else if (field.style.align === 'right' && field.position.width) {
          const textWidth = font.widthOfTextAtSize(value, field.style.size);
          x = field.position.x + field.position.width - textWidth;
        }

        // Draw text
        page.drawText(value, {
          x: x,
          y: field.position.y,
          size: field.style.size,
          font: font,
          color: color,
          maxWidth: field.position.width || undefined,
          lineHeight: field.style.size * 1.2
        });

        fieldsRendered++;
      } catch (error) {
        console.log(`  ${colors.yellow}⚠${colors.reset} Error rendering field ${field.id}: ${error.message}`);
      }
    }

    console.log(`  ${colors.green}✓${colors.reset} Rendered ${fieldsRendered} text fields`);

    // Render fixed table (firmas_y_aprobaciones)
    const firmasTable = manifest.tables.find(t => t.id === 'firmas_y_aprobaciones');
    if (firmasTable) {
      // Render title row
      if (firmasTable.titleRow) {
        const titleY = firmasTable.position.y - firmasTable.titleRow.height / 2;
        const titleWidth = fontBold.widthOfTextAtSize(firmasTable.titleRow.text, firmasTable.titleRow.size);
        const titleX = firmasTable.position.x + (firmasTable.width / 2) - (titleWidth / 2);

        page.drawText(firmasTable.titleRow.text, {
          x: titleX,
          y: titleY - firmasTable.titleRow.size / 2,
          size: firmasTable.titleRow.size,
          font: fontBold,
          color: rgb(0, 0, 0)
        });
      }

      // Render header row
      if (firmasTable.headerRow && firmasTable.columns) {
        let headerX = firmasTable.position.x;
        const headerY = firmasTable.position.y - (firmasTable.titleRow?.height || 0) - firmasTable.headerRow.height / 2;

        for (const column of firmasTable.columns) {
          if (column.header) {
            const headerTextWidth = fontBold.widthOfTextAtSize(column.header, firmasTable.headerRow.size);
            const centeredX = headerX + (column.width / 2) - (headerTextWidth / 2);

            page.drawText(column.header, {
              x: centeredX,
              y: headerY - firmasTable.headerRow.size / 2,
              size: firmasTable.headerRow.size,
              font: fontBold,
              color: rgb(0, 0, 0)
            });
          }
          headerX += column.width;
        }
      }

      let rowsRendered = 0;
      let currentY = firmasTable.position.y - (firmasTable.titleRow?.height || 0) - (firmasTable.headerRow?.height || 0);

      for (const row of firmasTable.rows || []) {
        let currentX = firmasTable.position.x;

        for (let i = 0; i < row.cells.length; i++) {
          const cell = row.cells[i];
          const column = firmasTable.columns[i];
          const value = resolveTemplate(cell.source, payload, `firmas_table_row_${rowsRendered}_cell_${i}`);

          if (value) {
            page.drawText(value, {
              x: currentX + 2,  // Small padding
              y: currentY - (row.height / 2) - (cell.size / 2),
              size: cell.size,
              font: fontRegular,
              color: rgb(0, 0, 0),
              maxWidth: column.width - 4  // Account for padding
            });
          }

          currentX += column.width;
        }

        currentY -= row.height;
        rowsRendered++;
      }

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${rowsRendered} rows in approval table`);
    }

    // Render signing blocks
    const signingContainer = manifest.tables.find(t => t.id === 'signing_container');
    if (signingContainer) {
      let blocksRendered = 0;

      for (const block of signingContainer.blocks || []) {
        const blockX = signingContainer.position.x + block.position.x;
        let blockY = signingContainer.position.y - block.position.y;

        for (const row of block.rows || []) {
          // Skip drawing signature images (would need image decoding)
          if (row.type === 'image') {
            blockY -= row.height;
            continue;
          }

          if (row.text) {
            // Static text
            page.drawText(row.text, {
              x: blockX + 2,
              y: blockY - (row.height / 2) - (row.size / 2),
              size: row.size,
              font: fontRegular,
              color: rgb(0, 0, 0)
            });
          } else if (row.source) {
            // Dynamic text
            const value = resolveTemplate(row.source, payload, `${block.id}_${row.height}`);
            if (value) {
              let textX = blockX + 2;
              if (row.align === 'right') {
                const textWidth = fontRegular.widthOfTextAtSize(value, row.size);
                textX = blockX + block.width - textWidth - 2;
              } else if (row.align === 'center') {
                const textWidth = fontRegular.widthOfTextAtSize(value, row.size);
                textX = blockX + (block.width - textWidth) / 2;
              }

              page.drawText(value, {
                x: textX,
                y: blockY - (row.height / 2) - (row.size / 2),
                size: row.size,
                font: fontRegular,
                color: rgb(0, 0, 0)
              });
            }
          } else if (row.columns) {
            // Multi-column row
            let colX = blockX;
            for (const col of row.columns) {
              const value = col.text || resolveTemplate(col.source || '', payload, `${block.id}_col`);
              if (value) {
                page.drawText(value, {
                  x: colX + 2,
                  y: blockY - (row.height / 2) - (col.size / 2),
                  size: col.size,
                  font: fontRegular,
                  color: rgb(0, 0, 0)
                });
              }
              colX += col.width;
            }
          }

          blockY -= row.height;
        }

        blocksRendered++;
      }

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${blocksRendered} signature blocks`);
    }

    // Render dynamic table (control_de_cambios)
    const revisionTable = manifest.tables.find(t => t.id === 'control_de_cambios');
    if (revisionTable && payload.revision_history) {
      // Render title row
      if (revisionTable.titleRow) {
        const titleY = revisionTable.position.y - revisionTable.titleRow.height / 2;
        const titleWidth = fontBold.widthOfTextAtSize(revisionTable.titleRow.text, revisionTable.titleRow.size);
        const titleX = revisionTable.position.x + (revisionTable.width / 2) - (titleWidth / 2);

        page.drawText(revisionTable.titleRow.text, {
          x: titleX,
          y: titleY - revisionTable.titleRow.size / 2,
          size: revisionTable.titleRow.size,
          font: fontBold,
          color: rgb(0, 0, 0)
        });
      }

      // Render header row
      if (revisionTable.headerRow && revisionTable.columns) {
        let headerX = revisionTable.position.x;
        const headerY = revisionTable.position.y - (revisionTable.titleRow?.height || 0) - revisionTable.headerRow.height / 2;

        for (const column of revisionTable.columns) {
          if (column.header) {
            const headerTextWidth = fontBold.widthOfTextAtSize(column.header, revisionTable.headerRow.size);
            const centeredX = headerX + (column.width / 2) - (headerTextWidth / 2);

            page.drawText(column.header, {
              x: centeredX,
              y: headerY - revisionTable.headerRow.size / 2,
              size: revisionTable.headerRow.size,
              font: fontBold,
              color: rgb(0, 0, 0)
            });
          }
          headerX += column.width;
        }
      }

      let rowsRendered = 0;
      let currentY = revisionTable.position.y - (revisionTable.titleRow?.height || 0) - (revisionTable.headerRow?.height || 0);

      for (const revisionEntry of payload.revision_history) {
        let currentX = revisionTable.position.x;

        for (let i = 0; i < revisionTable.rowTemplate.cells.length; i++) {
          const cellTemplate = revisionTable.rowTemplate.cells[i];
          const column = revisionTable.columns[i];
          const value = resolveTemplate(cellTemplate.source, revisionEntry, `revision_row_${rowsRendered}_cell_${i}`);

          if (value) {
            // Handle text wrapping for description column
            const maxWidth = column.width - 4;
            page.drawText(value, {
              x: currentX + 2,
              y: currentY - (revisionTable.rowTemplate.height / 2) - (cellTemplate.size / 2),
              size: cellTemplate.size,
              font: fontRegular,
              color: rgb(0, 0, 0),
              maxWidth: maxWidth,
              lineHeight: cellTemplate.size * 1.2
            });
          }

          currentX += column.width;
        }

        currentY -= revisionTable.rowTemplate.height;
        rowsRendered++;
      }

      console.log(`  ${colors.green}✓${colors.reset} Rendered ${rowsRendered} rows in revision table`);
    }

    // Note: QR code and logo rendering would require additional libraries (qrcode, axios)
    console.log(`  ${colors.yellow}ℹ${colors.reset} QR code and logo rendering not implemented (requires additional libraries)`);

    // Save the PDF
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log(`  ${colors.green}✓${colors.reset} Saved: ${outputFile}\n`);

    return true;
  } catch (error) {
    console.log(`  ${colors.red}✗${colors.reset} Error: ${error.message}\n`);
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
