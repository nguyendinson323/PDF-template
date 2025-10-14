const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs').promises;
const path = require('path');
const QRCode = require('qrcode');
const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class CoverGeneratorService {
  constructor() {
    this.templateRoot = config.templates.root;
    this.manifestPath = path.join(this.templateRoot, config.templates.manifest);
    this.headerFooterPath = path.join(this.templateRoot, config.templates.headerFooter);
    this.fontsDir = path.join(this.templateRoot, config.templates.fontsDir);

    // Configuration constants
    this.BORDER_CONFIG = { color: rgb(0, 0, 0), thickness: 0 };
    this.LINE_SPACING = 1.2;
    this.TEXT_MARGIN = 4;
    this.LOGO_MARGIN = 4;
    this.QR_CODE_SIZE = 50;
  }

  /**
   * Generate cover PDF from payload
   */
  async generateCover(payload) {
    const startTime = Date.now();

    try {
      // Load configuration files
      const manifest = await this.loadManifest();
      const headerFooter = await this.loadHeaderFooter();

      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Load fonts
      const fonts = await this.loadFonts(pdfDoc);

      // Create first page
      const pageWidth = manifest.page.width;
      const pageHeight = manifest.page.height;
      let page = pdfDoc.addPage([pageWidth, pageHeight]);

      // Initialize stroke function for borders
      const stroke = this.makeStroker(page, this.BORDER_CONFIG.color, this.BORDER_CONFIG.thickness);

      // Calculate usable area
      const margins = manifest.page.margins;
      const usableWidth = pageWidth - margins.left - margins.right;
      let currentY = pageHeight - margins.top;
      const minY = margins.bottom;

      // Render all tables from manifest
      for (const table of manifest.content.tables) {
        // Check if we need a new page
        const estimatedTableHeight = this.estimateTableHeight(table);
        if (currentY - estimatedTableHeight < minY) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          currentY = pageHeight - margins.top;
        }

        currentY = await this.renderTable(
          page,
          pdfDoc,
          fonts,
          stroke,
          table,
          payload,
          margins.left,
          currentY,
          usableWidth,
          minY,
        );

        currentY -= table.margin_top || 30;
      }

      // Save PDF
      const pdfBytes = await pdfDoc.save();

      const duration = Date.now() - startTime;
      logger.info('Cover PDF generated successfully', {
        pages: pdfDoc.getPageCount(),
        size: pdfBytes.length,
        durationMs: duration,
      });

      return Buffer.from(pdfBytes);
    } catch (error) {
      logger.error('Cover generation failed', { error: error.message, stack: error.stack });
      throw new Error(`Cover generation failed: ${error.message}`);
    }
  }

  /**
   * Render table based on type
   */
  async renderTable(page, pdfDoc, fonts, stroke, table, payload, x, y, width, minY) {
    if (table.type === 'fixed_table') {
      return this.renderFixedTable(page, fonts, stroke, table, payload, x, y, width);
    } else if (table.type === 'signature_blocks') {
      return this.renderSignatureBlocks(page, pdfDoc, fonts, stroke, table, payload, x, y, width);
    } else if (table.type === 'dynamic_table') {
      return this.renderDynamicTable(page, fonts, stroke, table, payload, x, y, width, minY);
    }
    return y;
  }

  /**
   * Render fixed table (FIRMAS Y APROBACIONES)
   */
  async renderFixedTable(page, fonts, stroke, table, payload, tableX, startY, usableWidth) {
    let y = startY;

    // Render title
    if (table.title) {
      const titleH = table.title.height;
      this.strokeRect(stroke, tableX, y - titleH, usableWidth, titleH);
      this.drawAlignedText(
        page,
        fonts.bold,
        table.title.text,
        tableX,
        y - titleH,
        usableWidth,
        titleH,
        table.title.text_size,
        table.title.align,
      );
      y -= titleH;
    }

    // Render header
    const headerH = table.header.height;
    this.strokeRect(stroke, tableX, y - headerH, usableWidth, headerH);

    let accX = tableX;
    for (const col of table.header.columns) {
      this.drawAlignedText(
        page,
        fonts.bold,
        col.text,
        accX,
        y - headerH,
        col.width,
        headerH,
        table.header.text_size,
        table.header.align,
      );
      accX += col.width;
      if (accX < tableX + usableWidth) {
        stroke(accX, y - headerH, accX, y);
      }
    }
    y -= headerH;

    // Render rows
    for (const row of table.rows) {
      const rowH = table.rows_config.height;
      this.strokeRect(stroke, tableX, y - rowH, usableWidth, rowH);

      accX = tableX;
      for (let i = 0; i < row.cells.length; i++) {
        const cell = row.cells[i];
        const colWidth = table.header.columns[i].width;
        const text = this.resolveTemplate(cell.text || cell.source, payload);

        this.drawAlignedText(
          page,
          fonts.regular,
          text,
          accX,
          y - rowH,
          colWidth,
          rowH,
          table.rows_config.text_size,
          table.rows_config.align,
        );

        accX += colWidth;
        if (accX < tableX + usableWidth) {
          stroke(accX, y - rowH, accX, y);
        }
      }
      y -= rowH;
    }

    return y;
  }

  /**
   * Render signature blocks
   */
  async renderSignatureBlocks(page, pdfDoc, fonts, stroke, table, payload, tableX, startY, usableWidth) {
    let minY = startY;

    for (const block of table.blocks) {
      const blockX = tableX + block.x;
      let blockY = startY - block.y;

      for (const row of block.rows) {
        const rowH = row.height;

        if (row.type === 'text') {
          const text = row.text || this.resolveTemplate(row.source, payload);
          const font = row.text_size > 8 ? fonts.bold : fonts.regular;

          this.strokeRect(stroke, blockX, blockY - rowH, block.width, rowH);
          this.drawAlignedText(page, font, text, blockX, blockY - rowH, block.width, rowH, row.text_size, row.align);
        } else if (row.type === 'columns') {
          this.strokeRect(stroke, blockX, blockY - rowH, block.width, rowH);

          let colX = blockX;
          for (const col of row.columns) {
            const text = col.text || this.resolveTemplate(col.source, payload);
            this.drawAlignedText(page, fonts.regular, text, colX, blockY - rowH, col.width, rowH, col.text_size, col.align);

            colX += col.width;
            if (colX < blockX + block.width) {
              stroke(colX, blockY - rowH, colX, blockY);
            }
          }
        } else if (row.type === 'image') {
          this.strokeRect(stroke, blockX, blockY - rowH, block.width, rowH);
          const imageSource = this.resolveTemplate(row.source, payload);
          if (imageSource) {
            await this.renderSignatureImage(page, pdfDoc, imageSource, blockX, blockY - rowH, block.width, rowH);
          }
        }

        blockY -= rowH;
        minY = Math.min(minY, blockY);
      }
    }

    return minY;
  }

  /**
   * Render dynamic table (CONTROL DE CAMBIOS)
   */
  async renderDynamicTable(page, fonts, stroke, table, payload, tableX, startY, usableWidth, minY) {
    let y = startY;

    // Resolve data source
    const dataArray = this.resolveTemplate(table.data_source, payload) || [];

    // Render title
    if (table.title) {
      const titleH = table.title.height;
      this.strokeRect(stroke, tableX, y - titleH, usableWidth, titleH);
      this.drawAlignedText(
        page,
        fonts.bold,
        table.title.text,
        tableX,
        y - titleH,
        usableWidth,
        titleH,
        table.title.text_size,
        table.title.align,
      );
      y -= titleH;
    }

    // Render header
    const headerH = table.header.height;
    this.strokeRect(stroke, tableX, y - headerH, usableWidth, headerH);

    let accX = tableX;
    for (const col of table.header.columns) {
      this.drawAlignedText(
        page,
        fonts.bold,
        col.text,
        accX,
        y - headerH,
        col.width,
        headerH,
        table.header.text_size,
        table.header.align,
      );
      accX += col.width;
      if (accX < tableX + usableWidth) {
        stroke(accX, y - headerH, accX, y);
      }
    }
    y -= headerH;

    // Render data rows
    for (const rowData of dataArray) {
      const baseRowH = table.row_template.height;

      // Calculate actual row height based on content
      let maxRowHeight = baseRowH;
      for (let i = 0; i < table.row_template.cells.length; i++) {
        const cell = table.row_template.cells[i];
        const colWidth = table.header.columns[i].width;
        const text = this.resolveTemplate(cell.source, rowData);

        const textHeight = this.calculateTextHeight(
          fonts.regular,
          text,
          colWidth,
          table.row_template.text_size,
          this.TEXT_MARGIN,
          this.LINE_SPACING,
          baseRowH,
        );

        maxRowHeight = Math.max(maxRowHeight, textHeight);
      }

      const rowH = maxRowHeight;

      // Check if row fits on current page
      if (y - rowH < minY) {
        // Need new page - would require page creation logic here
        logger.warn('Dynamic table overflow detected - pagination not fully implemented');
        break;
      }

      // Render row
      this.strokeRect(stroke, tableX, y - rowH, usableWidth, rowH);

      accX = tableX;
      for (let i = 0; i < table.row_template.cells.length; i++) {
        const cell = table.row_template.cells[i];
        const colWidth = table.header.columns[i].width;
        const text = this.resolveTemplate(cell.source, rowData);

        this.drawMultilineText(
          page,
          fonts.regular,
          text,
          accX,
          y - rowH,
          colWidth,
          rowH,
          table.row_template.text_size,
          table.row_template.align,
        );

        accX += colWidth;
        if (accX < tableX + usableWidth) {
          stroke(accX, y - rowH, accX, y);
        }
      }

      y -= rowH;
    }

    return y;
  }

  /**
   * Resolve template variable {{path.to.value}}
   */
  resolveTemplate(template, payload) {
    if (!template || typeof template !== 'string') return '';
    if (!template.startsWith('{{') || !template.endsWith('}}')) return template;

    const path = template.slice(2, -2).trim();

    // Handle array notation for dynamic tables: {{revision_history}}
    if (!path.includes('[') && !path.includes('.')) {
      return payload[path];
    }

    const keys = path.split('.');
    let current = payload;

    for (const key of keys) {
      if (!current) return '';

      // Handle array index: field[0]
      const arrayMatch = key.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        current = current[arrayKey];
        if (!current || !Array.isArray(current)) return '';
        current = current[parseInt(index, 10)];
      } else {
        current = current[key];
      }
    }

    return current !== undefined && current !== null ? String(current) : '';
  }

  /**
   * Text wrapping
   */
  wrapText(font, text, maxWidth, fontSize, xMargin = 4) {
    if (!text || text.trim() === '') return [];

    const availableWidth = maxWidth - 2 * xMargin;
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);

      if (testWidth <= availableWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);

        // Check if word itself is too long
        const wordWidth = font.widthOfTextAtSize(word, fontSize);
        if (wordWidth > availableWidth) {
          // Character-level wrapping
          let partialWord = '';
          for (const char of word) {
            const testPartial = partialWord + char;
            if (font.widthOfTextAtSize(testPartial, fontSize) <= availableWidth) {
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

    if (currentLine) lines.push(currentLine);
    return lines;
  }

  /**
   * Calculate text height
   */
  calculateTextHeight(font, text, maxWidth, fontSize, xMargin = 4, lineSpacing = 1.2, minHeight = 17) {
    if (!text || text.trim() === '') return minHeight;

    const lines = this.wrapText(font, text, maxWidth, fontSize, xMargin);
    const lineHeight = fontSize * lineSpacing;
    const totalHeight = lines.length * lineHeight + 2 * xMargin;

    return Math.max(totalHeight, minHeight);
  }

  /**
   * Draw aligned text
   */
  drawAlignedText(page, font, text, x, y, width, height, fontSize, align = 'left') {
    if (!text) return;

    const textWidth = font.widthOfTextAtSize(text, fontSize);
    let textX = x + this.TEXT_MARGIN;

    if (align === 'center') {
      textX = x + (width - textWidth) / 2;
    } else if (align === 'right') {
      textX = x + width - textWidth - this.TEXT_MARGIN;
    }

    const textY = y + (height - fontSize) / 2;

    page.drawText(text, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  }

  /**
   * Draw multiline text
   */
  drawMultilineText(page, font, text, x, y, width, height, fontSize, align = 'left') {
    if (!text) return;

    const lines = this.wrapText(font, text, width, fontSize, this.TEXT_MARGIN);
    const lineHeight = fontSize * this.LINE_SPACING;
    const totalTextHeight = lines.length * lineHeight;
    let textY = y + (height - totalTextHeight) / 2 + totalTextHeight - fontSize;

    for (const line of lines) {
      this.drawAlignedText(page, font, line, x, textY - fontSize / 2, width, fontSize, fontSize, align);
      textY -= lineHeight;
    }
  }

  /**
   * Stroke rectangle helper
   */
  strokeRect(stroke, x, y, w, h) {
    stroke(x, y, x + w, y);
    stroke(x, y + h, x + w, y + h);
    stroke(x, y, x, y + h);
    stroke(x + w, y, x + w, y + h);
  }

  /**
   * Create stroker function with edge deduplication
   */
  makeStroker(page, color, thickness) {
    const seen = new Set();
    const round2 = (n) => Math.round(n * 100) / 100;

    return (x1, y1, x2, y2) => {
      const a = `${round2(x1)},${round2(y1)}`;
      const b = `${round2(x2)},${round2(y2)}`;
      const key = a <= b ? `${a}|${b}` : `${b}|${a}`;

      if (seen.has(key)) return;
      seen.add(key);

      page.drawLine({
        start: { x: x1, y: y1 },
        end: { x: x2, y: y2 },
        color,
        thickness,
      });
    };
  }

  /**
   * Render signature image
   */
  async renderSignatureImage(page, pdfDoc, imageSource, x, y, width, height) {
    try {
      // If imageSource is base64 or data URI, embed it
      if (imageSource.startsWith('data:image')) {
        const base64Data = imageSource.split(',')[1];
        const imageBuffer = Buffer.from(base64Data, 'base64');

        let image;
        if (imageSource.includes('image/png')) {
          image = await pdfDoc.embedPng(imageBuffer);
        } else if (imageSource.includes('image/jpeg') || imageSource.includes('image/jpg')) {
          image = await pdfDoc.embedJpg(imageBuffer);
        } else {
          return;
        }

        const dims = image.scale(1);
        const scale = Math.min((width - 2 * this.LOGO_MARGIN) / dims.width, (height - 2 * this.LOGO_MARGIN) / dims.height);
        const scaledWidth = dims.width * scale;
        const scaledHeight = dims.height * scale;

        page.drawImage(image, {
          x: x + (width - scaledWidth) / 2,
          y: y + (height - scaledHeight) / 2,
          width: scaledWidth,
          height: scaledHeight,
        });
      }
    } catch (error) {
      logger.error('Failed to render signature image', { error: error.message });
    }
  }

  /**
   * Estimate table height for pagination
   */
  estimateTableHeight(table) {
    let height = 0;

    if (table.title) height += table.title.height;
    if (table.header) height += table.header.height;

    if (table.type === 'fixed_table') {
      height += table.rows.length * (table.rows_config?.height || 17);
    } else if (table.type === 'signature_blocks') {
      height += 200; // Rough estimate
    } else if (table.type === 'dynamic_table') {
      height += 5 * (table.row_template?.height || 17); // Estimate 5 rows
    }

    height += table.margin_top || 30;
    return height;
  }

  /**
   * Load manifest configuration
   */
  async loadManifest() {
    try {
      const content = await fs.readFile(this.manifestPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load manifest: ${error.message}`);
    }
  }

  /**
   * Load header/footer configuration
   */
  async loadHeaderFooter() {
    try {
      const content = await fs.readFile(this.headerFooterPath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load header/footer config: ${error.message}`);
    }
  }

  /**
   * Load fonts
   */
  async loadFonts(pdfDoc) {
    try {
      const regularPath = path.join(this.fontsDir, 'Inter-Regular.ttf');
      const boldPath = path.join(this.fontsDir, 'Inter-Bold.ttf');

      const regularBytes = await fs.readFile(regularPath);
      const boldBytes = await fs.readFile(boldPath);

      const regular = await pdfDoc.embedFont(regularBytes);
      const bold = await pdfDoc.embedFont(boldBytes);

      return { regular, bold };
    } catch (error) {
      throw new Error(`Failed to load fonts: ${error.message}`);
    }
  }
}

module.exports = CoverGeneratorService;
