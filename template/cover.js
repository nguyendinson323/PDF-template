// cover.js — Generate Cover.pdf using pdfmake (replicates create-clean-cover.js functionality)
const PdfPrinter = require('pdfmake');
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
console.log(`${colors.cyan}  Cover.pdf Generator (pdfmake)${colors.reset}`);
console.log(`${colors.cyan}======================================${colors.reset}\n`);

// ========================================
// UTILITY FUNCTIONS
// ========================================

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
  return '';
}

function getBorderArray(field) {
  return [
    field.border_left !== false,   // left
    field.border_top !== false,    // top
    field.border_right !== false,  // right
    field.border_bottom !== false  // bottom
  ];
}

// ========================================
// TABLE LAYOUT CONSTANTS
// ========================================

const DEFAULT_TABLE_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#000000',
  vLineColor: () => '#000000',
  paddingLeft: () => 2,
  paddingRight: () => 2,
  paddingTop: () => 1,
  paddingBottom: () => 1
};

const TIGHT_LAYOUT = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0.5,
  hLineColor: () => '#000000',
  vLineColor: () => '#000000',
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0
};

// ========================================
// TABLE CELL BUILDER
// ========================================

function createCell(text, config = {}) {
  const cell = {
    text: text || '',
    fontSize: config.fontSize || 9,
    alignment: config.alignment || 'left',
    bold: config.bold || false,
    color: config.color || '#000000',
    border: config.border || [true, true, true, true],
    margin: config.margin || [0, 0, 0, 0]
  };

  // Only add colSpan if explicitly provided and > 1
  if (config.colSpan && config.colSpan > 1) {
    cell.colSpan = config.colSpan;
  }

  return cell;
}

// Create an empty placeholder cell for colSpan
function createEmptyCell() {
  return {
    text: '',
    border: [false, false, false, false]
  };
}

// ========================================
// HEADER SECTION BUILDER
// ========================================

/**
 * Build header section from HeaderFooter-pdfmake.json
 * Returns array of table elements with absolute positioning
 * Note: headerConfig uses pdfmake coordinates (top-left origin)
 */
function buildHeaderSection(headerConfig, leftMargin) {
  const elements = [];
  // currentY in pdfmake coordinates (from top)
  let currentY = headerConfig.y_position;

  for (const row of headerConfig.rows) {
    // Calculate row height
    let rowHeight = row.height;
    if (rowHeight === "auto") {
      const containerCol = row.columns.find(col => col.type === 'container' && col.rows);
      if (containerCol) {
        rowHeight = containerCol.rows.reduce((sum, subRow) => sum + subRow.height, 0);
      }
    }

    const widths = [];
    const tableRow = [];

    for (const col of row.columns) {
      widths.push(col.width);

      if (col.type === 'container' && col.rows) {
        // Nested container - build inner table
        // First pass: determine if we have multi-column rows
        let hasMultiColumn = false;
        let multiColWidths = [];

        for (const subRow of col.rows) {
          if (subRow.type === 'columns' && subRow.columns) {
            hasMultiColumn = true;
            multiColWidths = subRow.columns.map(c => c.width);
            break;
          }
        }

        const innerWidths = hasMultiColumn ? multiColWidths : [col.width];
        const innerRows = [];

        for (const subRow of col.rows) {
          if (subRow.type === 'columns' && subRow.columns) {
            // Multi-column sub-row
            const cells = subRow.columns.map(subCol => createCell(
              getTextContent(subCol),
              {
                fontSize: subCol.text_size || 9,
                alignment: subCol.align || 'left',
                border: getBorderArray(subCol)
              }
            ));
            innerRows.push(cells);
          } else {
            // Single-column sub-row
            if (hasMultiColumn) {
              // Need to span across multiple columns
              const cell = createCell(
                getTextContent(subRow),
                {
                  fontSize: subRow.text_size || 9,
                  alignment: subRow.align || 'left',
                  border: getBorderArray(subRow),
                  colSpan: innerWidths.length
                }
              );
              const rowCells = [cell];
              // Add empty placeholder cells
              for (let i = 1; i < innerWidths.length; i++) {
                rowCells.push(createEmptyCell());
              }
              innerRows.push(rowCells);
            } else {
              // Simple single cell
              innerRows.push([createCell(
                getTextContent(subRow),
                {
                  fontSize: subRow.text_size || 9,
                  alignment: subRow.align || 'left',
                  border: getBorderArray(subRow)
                }
              )]);
            }
          }
        }

        tableRow.push({
          table: {
            widths: innerWidths,
            body: innerRows
          },
          layout: TIGHT_LAYOUT
        });

      } else if (col.type === 'columns' && col.columns) {
        // Inline multi-column - need to handle as nested table or split cells
        // For now, create a nested table for multi-column within a row
        const innerBody = [col.columns.map(subCol => createCell(
          getTextContent(subCol),
          {
            fontSize: subCol.text_size || 9,
            alignment: subCol.align || 'left',
            border: getBorderArray(subCol)
          }
        ))];

        tableRow.push({
          table: {
            widths: col.columns.map(c => c.width),
            body: innerBody
          },
          layout: TIGHT_LAYOUT
        });

      } else {
        // Regular column
        tableRow.push(createCell(
          getTextContent(col),
          {
            fontSize: col.text_size || 9,
            alignment: col.align || 'left',
            border: getBorderArray(col)
          }
        ));
      }
    }

    elements.push({
      table: {
        widths: widths,
        heights: [rowHeight],
        body: [tableRow]
      },
      layout: TIGHT_LAYOUT,
      absolutePosition: { x: leftMargin, y: currentY }
    });

    currentY += rowHeight; // Move down in pdfmake coordinates
  }

  return { elements, finalY: currentY };
}

// ========================================
// STANDARD TABLE BUILDER (Fixed rows)
// ========================================

function buildStandardTable(tableConfig) {
  const body = [];

  // Title row
  if (tableConfig.title && tableConfig.title.text) {
    const titleCell = createCell(
      tableConfig.title.text,
      {
        fontSize: tableConfig.title.text_size || 11,
        alignment: 'center',
        bold: true,
        colSpan: tableConfig.header.columns.length
      }
    );
    // Add empty placeholder cells for colSpan
    const titleRow = [titleCell];
    for (let i = 1; i < tableConfig.header.columns.length; i++) {
      titleRow.push(createEmptyCell());
    }
    body.push(titleRow);
  }

  // Header row
  body.push(
    tableConfig.header.columns.map(col => createCell(
      col.text || '',
      {
        fontSize: tableConfig.header.text_size || 9,
        alignment: 'center',
        bold: true
      }
    ))
  );

  // Data rows
  for (const row of tableConfig.rows) {
    body.push(
      row.cells.map(cell => createCell(
        getTextContent(cell),
        {
          fontSize: tableConfig.rows_config.text_size || 9,
          alignment: tableConfig.rows_config.align || 'left'
        }
      ))
    );
  }

  return {
    table: {
      widths: tableConfig.header.columns.map(col => col.width),
      body: body
    },
    layout: DEFAULT_TABLE_LAYOUT
  };
}

// ========================================
// DYNAMIC TABLE BUILDER (Template row)
// ========================================

function buildDynamicTable(tableConfig) {
  const body = [];

  // Title row
  if (tableConfig.title && tableConfig.title.text) {
    const titleCell = createCell(
      tableConfig.title.text,
      {
        fontSize: tableConfig.title.text_size || 11,
        alignment: 'center',
        bold: true,
        colSpan: tableConfig.header.columns.length
      }
    );
    // Add empty placeholder cells for colSpan
    const titleRow = [titleCell];
    for (let i = 1; i < tableConfig.header.columns.length; i++) {
      titleRow.push(createEmptyCell());
    }
    body.push(titleRow);
  }

  // Header row
  body.push(
    tableConfig.header.columns.map(col => createCell(
      col.text || '',
      {
        fontSize: tableConfig.header.text_size || 9,
        alignment: 'center',
        bold: true
      }
    ))
  );

  // One empty template row
  body.push(
    tableConfig.row_template.cells.map(() => createCell(
      '',
      {
        fontSize: tableConfig.row_template.text_size || 9,
        alignment: tableConfig.row_template.align || 'left'
      }
    ))
  );

  return {
    table: {
      widths: tableConfig.header.columns.map(col => col.width),
      body: body
    },
    layout: DEFAULT_TABLE_LAYOUT
  };
}

// ========================================
// SIGNATURE BLOCKS BUILDER
// ========================================

function buildSignatureBlocks(signing, leftMargin) {
  const elements = [];

  // Group blocks by Y position
  const blocksByY = {};
  for (const block of signing.blocks) {
    const y = block.y || 0;
    if (!blocksByY[y]) blocksByY[y] = [];
    blocksByY[y].push(block);
  }

  const yPositions = Object.keys(blocksByY).map(Number).sort((a, b) => a - b);

  for (const yOffset of yPositions) {
    const rowBlocks = blocksByY[yOffset].sort((a, b) => a.x - b.x);
    const columns = [];
    let lastX = 0;

    for (const block of rowBlocks) {
      // Add spacing column if needed
      if (block.x > lastX) {
        columns.push({
          width: block.x - lastX,
          text: ''
        });
      }

      // Build block stack
      const blockStack = [];
      for (const row of block.rows) {
        if (row.type === 'columns' && row.columns) {
          // Multi-column row
          blockStack.push({
            table: {
              widths: row.columns.map(c => c.width),
              heights: [row.height],
              body: [[
                ...row.columns.map(col => createCell(
                  getTextContent(col),
                  {
                    fontSize: col.text_size || 9,
                    alignment: col.align || 'left',
                    border: getBorderArray(col)
                  }
                ))
              ]]
            },
            layout: TIGHT_LAYOUT
          });
        } else if (row.type === 'image') {
          // Image placeholder
          blockStack.push({
            table: {
              widths: [block.width],
              heights: [row.height],
              body: [[createCell(
                '[Image]',
                {
                  fontSize: 8,
                  alignment: 'center',
                  color: '#999999'
                }
              )]]
            },
            layout: DEFAULT_TABLE_LAYOUT
          });
        } else {
          // Regular text row
          blockStack.push({
            table: {
              widths: [block.width],
              heights: [row.height],
              body: [[createCell(
                getTextContent(row),
                {
                  fontSize: row.text_size || 9,
                  alignment: row.align || 'left',
                  border: getBorderArray(row)
                }
              )]]
            },
            layout: TIGHT_LAYOUT
          });
        }
      }

      columns.push({
        width: block.width,
        stack: blockStack
      });

      lastX = block.x + block.width;
    }

    elements.push({
      columns: columns,
      columnGap: 0,
      absolutePosition: { x: leftMargin, y: yOffset }
    });
  }

  // Calculate total height
  const maxHeight = Math.max(...signing.blocks.map(b => {
    const totalHeight = b.rows.reduce((sum, r) => sum + r.height, 0);
    return (b.y || 0) + totalHeight;
  }));

  return { elements, height: maxHeight };
}

// ========================================
// MAIN FUNCTION
// ========================================

const headerFooterPath = path.join(__dirname, 'HeaderFooter-pdfmake.json');
const manifestPath = path.join(__dirname, 'Manifest-pdfmake.json');
const headerFooter = JSON.parse(fs.readFileSync(headerFooterPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function createCoverWithPdfmake() {
  try {
    const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
    const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
    const usableWidth = pageWidth - leftMargin - rightMargin;

    // Define fonts
    const fonts = {
      Inter: {
        normal: path.join(__dirname, 'fonts', 'Inter-Regular.ttf'),
        bold: path.join(__dirname, 'fonts', 'Inter-Bold.ttf')
      }
    };

    const printer = new PdfPrinter(fonts);

    console.log(`  ${colors.cyan}•${colors.reset} Page size: ${pageWidth}×${pageHeight} points`);
    console.log(`  ${colors.cyan}•${colors.reset} Usable width: ${usableWidth} points`);

    // Build document definition with NO page margins (we'll position absolutely)
    const docDefinition = {
      pageSize: { width: pageWidth, height: pageHeight },
      pageMargins: [0, 0, 0, 0],
      defaultStyle: {
        font: 'Inter',
        fontSize: 9
      },
      content: []
    };

    // ---------------- HEADER SECTION ----------------
    console.log(`  ${colors.blue}Building header section...${colors.reset}`);
    const { elements: headerElements, finalY: headerEndY } = buildHeaderSection(
      headerFooter.header,
      leftMargin
    );
    docDefinition.content.push(...headerElements);
    console.log(`  ${colors.green}✓${colors.reset} Header built (ends at Y=${headerEndY.toFixed(2)})`);

    // Current Y position for flowing content (after header)
    // In pdfmake coordinates, we move down by adding to Y
    let currentY = headerEndY;

    // ---------------- CONTENT TABLES ----------------
    const tables = manifest.content?.tables || [];

    // == FIRMAS Y APROBACIONES ==
    const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
    if (firmas) {
      console.log(`  ${colors.blue}Building approval table...${colors.reset}`);
      currentY -= (firmas.margin_top || 0);

      const firmasTable = buildStandardTable(firmas);
      firmasTable.absolutePosition = { x: leftMargin, y: currentY };
      docDefinition.content.push(firmasTable);

      // Calculate table height
      const titleH = firmas.title?.height || 0;
      const headerH = firmas.header.height;
      const dataH = firmas.rows_config.height * firmas.rows.length;
      currentY -= (titleH + headerH + dataH);

      console.log(`  ${colors.green}✓${colors.reset} Approval table built (${firmas.rows.length} rows)`);
    }

    // == SIGNING CONTAINER ==
    const signing = tables.find(t => t.id === 'signing_container');
    if (signing) {
      console.log(`  ${colors.blue}Building signature blocks...${colors.reset}`);
      currentY -= (signing.margin_top || 0);

      const { elements: sigElements, height: sigHeight } = buildSignatureBlocks(signing, leftMargin);

      // Adjust positions relative to currentY
      for (const elem of sigElements) {
        elem.absolutePosition.y = currentY - elem.absolutePosition.y;
      }

      docDefinition.content.push(...sigElements);
      currentY -= sigHeight;

      console.log(`  ${colors.green}✓${colors.reset} Signature blocks built (${signing.blocks.length} blocks)`);
    }

    // == CONTROL DE CAMBIOS ==
    const rev = tables.find(t => t.id === 'control_de_cambios');
    if (rev) {
      console.log(`  ${colors.blue}Building revision history table...${colors.reset}`);
      currentY -= (rev.margin_top || 0);

      const revTable = buildDynamicTable(rev);
      revTable.absolutePosition = { x: leftMargin, y: currentY };
      docDefinition.content.push(revTable);

      const titleH = rev.title?.height || 0;
      const headerH = rev.header.height;
      const rowH = rev.row_template.height;
      currentY -= (titleH + headerH + rowH);

      console.log(`  ${colors.green}✓${colors.reset} Revision history table built`);
    }

    // ---------------- FOOTER ----------------
    const footer = headerFooter.footer;
    if (footer.separator_line && footer.separator_line.enabled) {
      console.log(`  ${colors.blue}Adding footer separator line...${colors.reset}`);

      const lineY = footer.separator_line.y_position;
      const lineX1 = leftMargin + (footer.separator_line.margin_left || 0);
      const lineX2 = pageWidth - rightMargin - (footer.separator_line.margin_right || 0);

      docDefinition.content.push({
        canvas: [
          {
            type: 'line',
            x1: 0,
            y1: 0,
            x2: lineX2 - lineX1,
            y2: 0,
            lineWidth: footer.separator_line.thickness || 1,
            lineColor: footer.separator_line.color === 'blue' ? '#0000FF' : '#000000'
          }
        ],
        absolutePosition: { x: lineX1, y: lineY }
      });

      console.log(`  ${colors.green}✓${colors.reset} Footer separator added at Y=${lineY}`);
    }

    // ---------------- GENERATE PDF ----------------
    console.log(`\n  ${colors.cyan}Generating PDF...${colors.reset}`);

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const outputPath = path.join(__dirname, 'Cover.pdf');
    const writeStream = fs.createWriteStream(outputPath);

    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    writeStream.on('finish', () => {
      console.log(`  ${colors.green}✓${colors.reset} PDF saved: Cover.pdf`);
      console.log(`\n${colors.cyan}======================================${colors.reset}`);
      console.log(`${colors.green}✓ Cover.pdf generated successfully${colors.reset}`);
      console.log(`${colors.cyan}======================================${colors.reset}\n`);
    });

    writeStream.on('error', (err) => {
      console.error(`  ${colors.red}✗${colors.reset} Error writing PDF: ${err.message}`);
      process.exit(1);
    });

  } catch (error) {
    console.error(`${colors.red}✗ Error:${colors.reset} ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
createCoverWithPdfmake().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset} ${error.message}`);
  process.exit(1);
});
