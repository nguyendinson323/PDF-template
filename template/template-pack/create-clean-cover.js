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
const headerFooterPath = path.join(__dirname, 'HeaderFooter.json');
const manifestPath = path.join(__dirname, 'Manifest.json');
const headerFooter = JSON.parse(fs.readFileSync(headerFooterPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

async function createCleanCover() {
  const { width: pageWidth, height: pageHeight, margins } = headerFooter.page;
  const { top: topMargin, bottom: bottomMargin, left: leftMargin, right: rightMargin } = margins;
  const usableWidth = pageWidth - leftMargin - rightMargin;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const stroke = makeStroker(page, BORDER_CONFIG.color, BORDER_CONFIG.thickness);

  // ---------------- COVER HEADER: margin-based dynamic layout ----------------
  let currentY = headerFooter.header.y_position + headerFooter.header.height;
  
  for (const row of headerFooter.header.rows) {
    const rowHeight = row.height;
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
              const drawTop = subCol.border_top !== false;
              const drawBottom = subCol.border_bottom !== false;
              const drawLeft = subCol.border_left !== false;
              const drawRight = subCol.border_right !== false;
              
              if (drawTop) stroke(subX, containerY, subX + subCol.width, containerY);
              if (drawBottom) stroke(subX, containerY - subHeight, subX + subCol.width, containerY - subHeight);
              if (drawLeft) stroke(subX, containerY - subHeight, subX, containerY);
              if (drawRight) stroke(subX + subCol.width, containerY - subHeight, subX + subCol.width, containerY);
              
              subX += subCol.width;
            }
          } else {
            const drawTop = subRow.border_top !== false;
            const drawBottom = subRow.border_bottom !== false;
            const drawLeft = subRow.border_left !== false;
            const drawRight = subRow.border_right !== false;
            
            if (drawTop) stroke(currentX, containerY, currentX + colWidth, containerY);
            if (drawBottom) stroke(currentX, containerY - subHeight, currentX + colWidth, containerY - subHeight);
            if (drawLeft) stroke(currentX, containerY - subHeight, currentX, containerY);
            if (drawRight) stroke(currentX + colWidth, containerY - subHeight, currentX + colWidth, containerY);
          }
          
          containerY -= subHeight;
        }
      } else if (col.type === 'columns' && col.columns) {
        let subX = currentX;
        for (const subCol of col.columns) {
          const drawTop = subCol.border_top !== false;
          const drawBottom = subCol.border_bottom !== false;
          const drawLeft = subCol.border_left !== false;
          const drawRight = subCol.border_right !== false;
          
          if (drawTop) stroke(subX, currentY, subX + subCol.width, currentY);
          if (drawBottom) stroke(subX, currentY - rowHeight, subX + subCol.width, currentY - rowHeight);
          if (drawLeft) stroke(subX, currentY - rowHeight, subX, currentY);
          if (drawRight) stroke(subX + subCol.width, currentY - rowHeight, subX + subCol.width, currentY);
          
          subX += subCol.width;
        }
      } else {
        // Regular column
        const drawTop = col.border_top !== false;
        const drawBottom = col.border_bottom !== false;
        const drawLeft = col.border_left !== false;
        const drawRight = col.border_right !== false;
        
        if (drawTop) stroke(currentX, currentY, currentX + colWidth, currentY);
        if (drawBottom) stroke(currentX, currentY - rowHeight, currentX + colWidth, currentY - rowHeight);
        if (drawLeft) stroke(currentX, currentY - rowHeight, currentX, currentY);
        if (drawRight) stroke(currentX + colWidth, currentY - rowHeight, currentX + colWidth, currentY);
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
