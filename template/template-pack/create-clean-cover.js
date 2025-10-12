// create-clean-cover.js — refactored to avoid double stroking
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
const BORDER_CONFIG = { color: rgb(0.3, 0.3, 0.3), thickness: 0 }; // hairline

// ---------- design ----------
const designPath = path.join(__dirname, '..', 'cover_design.json');
const design = JSON.parse(fs.readFileSync(designPath, 'utf8')); // :contentReference[oaicite:0]{index=0}

async function createCleanCover() {
  const { width: pageWidth, height: pageHeight } = design.page;
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

  const { top: topMargin, left: leftMargin, right: rightMargin } = design.page.margins;
  const usableWidth = pageWidth - leftMargin - rightMargin;

  // ---------------- HEADER: draw only requested edges per field, with dedupe
  for (const f of design.header.fields) {
    const x = f.x1, y = f.y2, w = f.x2 - f.x1, h = f.y1 - f.y2;
    if (f.border_top !== false)    stroke(x, y + h, x + w, y + h);
    if (f.border_bottom !== false) stroke(x, y,     x + w, y);
    if (f.border_left !== false)   stroke(x, y,     x,     y + h);
    if (f.border_right !== false)  stroke(x + w, y, x + w, y + h);
  }

  // ---------------- CONTENT TABLES
  const tables = design.content.tables || [];

  // == FIRMAS Y APROBACIONES: draw grid once ==
  const firmas = tables.find(t => t.id === 'firmas_y_aprobaciones');
  let firmasBottomY = null;
  if (firmas) {
    const topY = pageHeight - topMargin;
    const tableTop = topY - (firmas.margin_top || 0);

    // Title box
    const titleH = firmas.title.height;
    strokeRect(stroke, leftMargin, tableTop - titleH, usableWidth, titleH);

    // Header grid
    const headerH = firmas.header.height;
    const headerTop = tableTop - titleH;
    const headerY = headerTop - headerH;
    strokeRect(stroke, leftMargin, headerY, usableWidth, headerH);

    // Header verticals at column boundaries
    let accX = leftMargin;
    for (const col of firmas.header.columns) {
      accX += col.width;
      // skip last boundary that equals outer right edge
      if (round2(accX) < round2(leftMargin + usableWidth)) {
        stroke(accX, headerY, accX, headerY + headerH);
      }
    }

    // Data grid
    const rowH = firmas.rows[0].height;
    const rowsCount = firmas.rows.length;
    const dataH = rowH * rowsCount;
    const dataY = headerY - dataH;

    // outer box
    strokeRect(stroke, leftMargin, dataY, usableWidth, dataH);
    // horizontals
    for (let i = 1; i < rowsCount; i++) {
      const y = dataY + i * rowH;
      stroke(leftMargin, y, leftMargin + usableWidth, y);
    }
    // verticals same as header
    accX = leftMargin;
    for (const col of firmas.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(leftMargin + usableWidth)) {
        stroke(accX, dataY, accX, dataY + dataH);
      }
    }

    firmasBottomY = dataY; // top of section 2 will start from here
  }

  // == SIGNING CONTAINER ==
  const signing = tables.find(t => t.id === 'signing_container');
  let section2Top = null;
  let signingMaxHeight = 0;
  if (signing && firmasBottomY !== null) {
    section2Top = firmasBottomY - (signing.margin_top || 0);

    for (const b of signing.blocks) {
      const baseX = leftMargin + (b.x || 0);
      let rowTopY = section2Top - (b.y || 0);
      let blockHeight = 0;

      for (const r of b.rows) {
        const h = r.height;
        const yBottom = rowTopY - h;

        // top edge
        if (r.border_top !== false) stroke(baseX, rowTopY, baseX + b.width, rowTopY);
        // bottom edge
        if (r.border_bottom !== false) stroke(baseX, yBottom, baseX + b.width, yBottom);
        // sides
        stroke(baseX, rowTopY, baseX, yBottom);
        stroke(baseX + b.width, rowTopY, baseX + b.width, yBottom);

        // inner column divider for "columns" row
        if (r.type === 'columns' && r.columns && r.columns.length > 1) {
          let cx = baseX + r.columns[0].width;
          stroke(cx, rowTopY, cx, yBottom);
        }

        rowTopY = yBottom;
        blockHeight += h;
      }
      signingMaxHeight = Math.max(signingMaxHeight, (b.y || 0) + blockHeight);
    }
  }

  // == CONTROL DE CAMBIOS: draw grid once ==
  const rev = tables.find(t => t.id === 'control_de_cambios');
  if (rev) {
    let section3Top;
    if (signing && section2Top !== null) {
      section3Top = section2Top - signingMaxHeight - (rev.margin_top || 0);
    } else if (firmasBottomY !== null) {
      section3Top = firmasBottomY - (rev.margin_top || 0);
    } else {
      section3Top = pageHeight - topMargin - (rev.margin_top || 0);
    }

    const titleH = rev.title.height;
    strokeRect(stroke, leftMargin, section3Top - titleH, usableWidth, titleH);

    const headerH = rev.header.height;
    const headerTop = section3Top - titleH;
    const headerY = headerTop - headerH;
    strokeRect(stroke, leftMargin, headerY, usableWidth, headerH);

    // header verticals
    let accX = leftMargin;
    for (const col of rev.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(leftMargin + usableWidth)) {
        stroke(accX, headerY, accX, headerY + headerH);
      }
    }

    // one template row box + verticals
    const rowH = rev.row_template.height;
    const rowY = headerY - rowH;
    strokeRect(stroke, leftMargin, rowY, usableWidth, rowH);
    accX = leftMargin;
    for (const col of rev.header.columns) {
      accX += col.width;
      if (round2(accX) < round2(leftMargin + usableWidth)) {
        stroke(accX, rowY, accX, rowY + rowH);
      }
    }
  }

  // ---------------- FOOTER
  const foot = design.footer;
  const ln = foot.separator_line;
  // separator line
  stroke(ln.x1, ln.y1, ln.x2, ln.y2);
  // optional container border
  const c = foot.container;
  if (c.border !== false) {
    strokeRect(stroke, c.x1, c.y2, c.x2 - c.x1, c.y1 - c.y2);
  }

  // ---------------- SAVE
  const pdfBytes = await pdfDoc.save();
  const outPath = path.join(__dirname, 'Cover.pdf');
  fs.writeFileSync(outPath, pdfBytes);

  console.log('Cover.pdf created:', outPath, `${(pdfBytes.length / 1024).toFixed(2)} KB`);
}

createCleanCover().catch(e => { console.error(e); process.exit(1); });
