// create-clean-cover.js — refactored to use cover_design.json + Manifest.json
const { PDFDocument, rgb } = require('pdf-lib');
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

// ---------- load design files ----------
const coverDesignPath = path.join(__dirname, '..', 'cover_design.json');
const manifestPath = path.join(__dirname, 'Manifest.json');
const coverDesign = JSON.parse(fs.readFileSync(coverDesignPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function createCleanCover() {
  console.log('🚀 Creating clean Cover.pdf (BORDERS ONLY - NO TEXT)...');
  console.log(`📖 Loading design from: cover_design.json + Manifest.json`);

  const { width: pageWidth, height: pageHeight, margins } = coverDesign.page;
  const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
  const usableWidth = pageWidth - leftMargin - rightMargin;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

  console.log('📐 Page setup:');
  console.log(`  - Page: ${pageWidth}pt × ${pageHeight}pt`);
  console.log(`  - Margins: top=${topMargin}pt, bottom=${bottomMargin}pt, left=${leftMargin}pt, right=${rightMargin}pt`);
  console.log(`  - Usable width: ${usableWidth.toFixed(2)}pt`);

  // ---------------- COVER HEADER: fields with absolute positioning ----------------
  console.log('\n📋 Drawing Cover header (fields with absolute coordinates)...');

  const headerFields = coverDesign.header.fields;
  
  for (const field of headerFields) {
    const x1 = field.x1;
    const y1 = field.y1;
    const x2 = field.x2;
    const y2 = field.y2;
    const width = x2 - x1;
    const height = y1 - y2;

    // Determine which borders to draw
    const drawTop = field.border_top !== false;
    const drawBottom = field.border_bottom !== false;
    const drawLeft = field.border_left !== false;
    const drawRight = field.border_right !== false;

    // Draw borders
    if (drawTop) stroke(x1, y1, x2, y1);
    if (drawBottom) stroke(x1, y2, x2, y2);
    if (drawLeft) stroke(x1, y2, x1, y1);
    if (drawRight) stroke(x2, y2, x2, y1);
  }

  console.log(`  ✅ Cover header complete (${headerFields.length} fields with absolute positioning)`);

  // Calculate currentY position for content tables (below header region)
  let currentY = coverDesign.header.region.y;

  // ---------------- CONTENT TABLES (from Manifest.json) ----------------
  const tables = manifest.content?.tables || [];

  // == FIRMAS Y APROBACIONES Table ==
  console.log('\n📋 Drawing FIRMAS Y APROBACIONES table borders...');
  const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
  if (firmas) {
    currentY -= (firmas.margin_top || 0);
    const tableX = leftMargin;
    const titleH = firmas.title.height;
    const headerH = firmas.header.height;
    const rowH = firmas.rows[0].height;

    // Title
    strokeRect(stroke, tableX, currentY - titleH, usableWidth, titleH);
    currentY -= titleH;

    // Header
    strokeRect(stroke, tableX, currentY - headerH, usableWidth, headerH);
    let accX = tableX;
    for (const col of firmas.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - headerH, accX, currentY);
      }
    }
    currentY -= headerH;

    // Rows
    const dataH = rowH * firmas.rows.length;
    strokeRect(stroke, tableX, currentY - dataH, usableWidth, dataH);
    for (let i = 1; i < firmas.rows.length; i++) {
      stroke(tableX, currentY - i * rowH, tableX + usableWidth, currentY - i * rowH);
    }
    accX = tableX;
    for (const col of firmas.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(tableX + usableWidth)) {
        stroke(accX, currentY - dataH, accX, currentY);
      }
    }
    currentY -= dataH;

    console.log(`  ✅ FIRMAS Y APROBACIONES borders complete (title + header + ${firmas.rows.length} rows)`);
  }

  // == SIGNING CONTAINER ==
  console.log('\n✍️  Drawing Signing blocks borders...');
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
            
            colX += colWidth;
          }
        } else {
          // Normal row
          if (r.border_top !== false) stroke(blockX, blockY, blockX + b.width, blockY);
          if (r.border_bottom !== false) stroke(blockX, yBottom, blockX + b.width, yBottom);
          stroke(blockX, blockY, blockX, yBottom);
          stroke(blockX + b.width, blockY, blockX + b.width, yBottom);
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

    console.log(`  ✅ Signing blocks borders complete (${signing.blocks.length} blocks)`);
  }

  // == CONTROL DE CAMBIOS ==
  console.log('\n📝 Drawing CONTROL DE CAMBIOS table borders...');
  const rev = tables.find(t => t.id === 'control_de_cambios');
  if (rev) {
    currentY -= (rev.margin_top || 0);
    const tableX = leftMargin;
    const titleH = rev.title.height;
    const headerH = rev.header.height;
    const rowH = rev.row_template.height;

    // Title
    strokeRect(stroke, tableX, currentY - titleH, usableWidth, titleH);
    currentY -= titleH;

    // Header
    strokeRect(stroke, tableX, currentY - headerH, usableWidth, headerH);
    let accX = tableX;
    for (const col of rev.header.columns) {
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

    console.log(`  ✅ CONTROL DE CAMBIOS borders complete (title + header + 1 template row)`);
  }

  // ---------------- FOOTER (from cover_design.json) ----------------
  console.log('\n📋 Drawing Footer...');

  // Footer separator line (blue)
  const footer = coverDesign.footer;
  if (footer.separator_line) {
    page.drawLine({
      start: { x: footer.separator_line.x1, y: footer.separator_line.y1 },
      end: { x: footer.separator_line.x2, y: footer.separator_line.y2 },
      color: rgb(0, 0, 1),
      thickness: footer.separator_line.thickness
    });
  }

  console.log(`  ✅ Footer separator line complete`);

  // ---------------- SAVE ----------------
  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'Cover.pdf');
  fs.writeFileSync(outPath, pdfBytes);

  console.log('\n✅ Cover.pdf created successfully (BORDERS ONLY - NO TEXT)!');
  console.log(`   📄 Location: ${outPath}`);
  console.log(`   📦 Size: ${(pdfBytes.length / 1024).toFixed(2)} KB`);
  console.log('\n⚠️  IMPORTANT: This PDF contains ONLY borders and lines.');
  console.log('   Header/Footer design from: cover_design.json');
  console.log('   Body content tables from: Manifest.json');
}

createCleanCover().catch(e => { console.error('❌ Error creating cover:', e); process.exit(1); });
