// ==================================================================================
// PDF Utilities
// ==================================================================================
// Reused rendering functions from template/generate-golden.js
// Text wrapping, alignment, height calculation
// ==================================================================================

import { rgb } from 'pdf-lib';

const LINE_SPACING = 1.2;
const TEXT_MARGIN = 4;

/**
 * Resolve template placeholders like {{document.code}}
 */
export function resolveTemplate(template, data) {
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

/**
 * Check if text contains placeholders
 */
export function isPlaceholder(text) {
  return text && text.includes('{{') && text.includes('}}');
}

/**
 * Get text content from field (resolving placeholders)
 */
export function getTextContent(field, payload) {
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

/**
 * Wrap text to fit within maxWidth
 */
export function wrapText(font, text, maxWidth, fontSize, xMargin = TEXT_MARGIN) {
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
      const wordWidth = font.widthOfTextAtSize(word, fontSize);
      if (wordWidth > availableWidth) {
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

/**
 * Calculate required height for text with wrapping
 */
export function calculateTextHeight(font, text, maxWidth, fontSize, xMargin = TEXT_MARGIN, lineSpacing = LINE_SPACING, minHeight = 17) {
  if (!text || text.trim() === '') return minHeight;

  const lines = wrapText(font, text, maxWidth, fontSize, xMargin);
  const lineHeight = fontSize * lineSpacing;
  const totalHeight = lines.length * lineHeight + 4;

  return Math.max(totalHeight, minHeight);
}

/**
 * Draw multi-line text with wrapping
 */
export function drawMultilineText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = TEXT_MARGIN, lineSpacing = LINE_SPACING) {
  if (!text || text.trim() === '') return;

  const lines = wrapText(font, text, width, size, xMargin);
  const lineHeight = size * lineSpacing;
  const totalTextHeight = lines.length * lineHeight;
  const verticalPadding = (height - totalTextHeight) / 2;
  let currentY = yBottom + verticalPadding + (lines.length - 1) * lineHeight + size * 0.25;

  for (const line of lines) {
    const textWidth = font.widthOfTextAtSize(line, size);
    let textX;

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
      color: rgb(0, 0, 0),
    });

    currentY -= lineHeight;
  }
}

/**
 * Draw aligned text (single line)
 */
export function drawAlignedText(page, font, text, x, yBottom, width, height, size, align = 'left', xMargin = TEXT_MARGIN) {
  const textWidth = font.widthOfTextAtSize(text, size);
  let textX;

  if (align === 'center') {
    const availableWidth = width - 2 * xMargin;
    textX = x + xMargin + (availableWidth - textWidth) / 2;
  } else if (align === 'right') {
    textX = x + width - xMargin - textWidth;
  } else {
    textX = x + xMargin;
  }

  const textY = yBottom + height / 2 - size * 0.3;

  page.drawText(text, {
    x: textX,
    y: textY,
    size: size,
    font: font,
    color: { type: 'RGB', red: 0, green: 0, blue: 0 },
  });
}

/**
 * Round to 2 decimal places
 */
export const round2 = n => Math.round(n * 100) / 100;

/**
 * Create edge key for deduplication
 */
export function edgeKey(x1, y1, x2, y2) {
  const a = `${round2(x1)},${round2(y1)}`;
  const b = `${round2(x2)},${round2(y2)}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Make stroker function (deduplicates borders)
 */
export function makeStroker(page, color, thickness = 0.5) {
  const seen = new Set();
  return function stroke(x1, y1, x2, y2) {
    const k = edgeKey(x1, y1, x2, y2);
    if (seen.has(k)) return;
    seen.add(k);
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      color,
      thickness,
    });
  };
}

/**
 * Stroke rectangle
 */
export function strokeRect(stroke, x, y, w, h) {
  stroke(x, y, x + w, y);
  stroke(x, y + h, x + w, y + h);
  stroke(x, y, x, y + h);
  stroke(x + w, y, x + w, y + h);
}

/**
 * Draw cell borders (respecting border flags)
 */
export function drawCellBorders(stroke, field, x, y, width, height) {
  const drawTop = field.border_top !== false;
  const drawBottom = field.border_bottom !== false;
  const drawLeft = field.border_left !== false;
  const drawRight = field.border_right !== false;

  if (drawTop) stroke(x, y, x + width, y);
  if (drawBottom) stroke(x, y - height, x + width, y - height);
  if (drawLeft) stroke(x, y - height, x, y);
  if (drawRight) stroke(x + width, y - height, x + width, y);
}

export default {
  resolveTemplate,
  isPlaceholder,
  getTextContent,
  wrapText,
  calculateTextHeight,
  drawMultilineText,
  drawAlignedText,
  round2,
  edgeKey,
  makeStroker,
  strokeRect,
  drawCellBorders,
};
