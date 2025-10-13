# API Reference - Template Pack Integration

This document provides detailed API specifications for integrating the PDF Template Pack into your microservice.

## Table of Contents

- [Payload Structure](#payload-structure)
- [Template Variable Syntax](#template-variable-syntax)
- [Configuration Reference](#configuration-reference)
- [Helper Functions](#helper-functions)
- [Constants & Settings](#constants--settings)

---

## Payload Structure

### Complete Payload Schema

```json
{
  "document": {
    "brand": {
      "logoUrl": "string (URL)"
    },
    "code": "string",
    "title": "string",
    "semanticVersion": "string (e.g., v1.0.0)",
    "publicationDate": "string (ISO 8601 or YYYY-MM-DD)",
    "qr": {
      "baseUrl": "string (URL)"
    },
    "security": {
      "hashSha256": "string (64 chars hex)",
      "tsaTime": "string (ISO 8601)",
      "tsaSerial": "string"
    }
  },
  "context": {
    "areaCode": "string",
    "areaName": "string",
    "typeCode": "string",
    "typeName": "string",
    "classificationName": "string",
    "criticalityCode": "string",
    "criticalityName": "string",
    "destinationPhase": "string",
    "currentPhase": "string",
    "statuscurrentPhase": "string",
    "correlativocurrentPhase": "string",
    "stagePhase": "string"
  },
  "participants": {
    "creator": {
      "name": "string",
      "jobTitle": "string",
      "signature": "string (data URI or null)"
    },
    "reviewers": [
      {
        "name": "string",
        "jobTitle": "string",
        "signature": "string (data URI or null)"
      }
    ],
    "qac": {
      "name": "string",
      "jobTitle": "string",
      "signature": "string (data URI or null)"
    },
    "approvers": [
      {
        "name": "string",
        "jobTitle": "string",
        "signature": "string (data URI or null)"
      }
    ],
    "dcontrol": {
      "name": "string",
      "jobTitle": "string",
      "signature": "string (data URI or null)"
    }
  },
  "checklists": {
    "creator": {
      "id": "string",
      "date": "string",
      "status": "string"
    },
    "review": [
      {
        "id": "string",
        "date": "string",
        "status": "string"
      }
    ],
    "qac": {
      "id": "string",
      "date": "string",
      "status": "string"
    },
    "approval": [
      {
        "id": "string",
        "date": "string",
        "status": "string"
      }
    ],
    "publish": {
      "id": "string",
      "date": "string",
      "status": "string"
    }
  },
  "revision_history": [
    {
      "version": "string",
      "date": "string",
      "revisionDescription": "string",
      "responsibleName": "string"
    }
  ]
}
```

### Required vs Optional Fields

**Required:**
- `document.code`
- `document.title`
- `document.semanticVersion`
- `document.qr.baseUrl`
- At least one entry in `revision_history`

**Optional:**
- `document.publicationDate` (can be empty for drafts)
- `document.security.*` (only for published documents)
- `participants.*.signature` (null/empty shows placeholder)
- Most context and checklist fields (fallback to empty string)

---

## Template Variable Syntax

### Basic Syntax

Template variables use double-brace notation:
```
{{path.to.value}}
```

### Supported Path Types

**1. Simple Property:**
```javascript
{{document.code}}
// Resolves to: payload.document.code
```

**2. Nested Object:**
```javascript
{{context.areaName}}
// Resolves to: payload.context.areaName
```

**3. Array Index:**
```javascript
{{participants.reviewers[0].name}}
// Resolves to: payload.participants.reviewers[0].name
```

**4. Array Iteration (Tables):**
```javascript
{{revision_history[].version}}
// Used in table row definitions
// Iterates over all elements in revision_history
```

### Variable Resolution Function

```javascript
function resolveTemplate(template, payload) {
  if (!template || typeof template !== 'string') return '';
  if (!template.startsWith('{{') || !template.endsWith('}}')) {
    return template; // Literal string
  }
  
  const path = template.slice(2, -2).trim();
  const keys = path.split('.');
  let current = payload;
  
  for (const key of keys) {
    if (!current) return '';
    
    // Handle array index notation: field[0]
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
```

---

## Configuration Reference

### Manifest.json Structure

```json
{
  "document": {
    "width": 595.28,
    "height": 841.89
  },
  "fields": {
    "field_name": {
      "x": 100,
      "y": 700,
      "width": 200,
      "height": 30,
      "text_size": 12,
      "align": "left",
      "source": "{{document.title}}"
    }
  },
  "tables": {
    "table_name": {
      "x": 56,
      "y": 600,
      "width": 483.28,
      "margin_top": 10,
      "title": {
        "text": "TABLE TITLE",
        "height": 20,
        "text_size": 10
      },
      "header": {
        "height": 25,
        "text_size": 9,
        "columns": [
          {
            "text": "Column 1",
            "width": 100,
            "source": "{{field.path}}"
          }
        ]
      },
      "rows": {
        "height": 30,
        "text_size": 9,
        "columns": [
          {
            "width": 100,
            "source": "{{array[].field}}"
          }
        ]
      }
    }
  }
}
```

### HeaderFooter.json Structure

```json
{
  "page": {
    "width": 595.28,
    "height": 841.89,
    "margins": {
      "top": 56,
      "right": 42,
      "bottom": 84,
      "left": 56
    }
  },
  "fonts": {
    "regular": {
      "path": "./fonts/Inter-Regular.ttf",
      "name": "Inter-Regular"
    },
    "bold": {
      "path": "./fonts/Inter-Bold.ttf",
      "name": "Inter-Bold"
    }
  },
  "header": {
    "enabled": true,
    "y_position": 785.89,
    "height": 56,
    "rows": [
      {
        "height": 56,
        "columns": [
          {
            "type": "image",
            "id": "logo",
            "width": 80,
            "source": "{{document.brand.logoUrl}}"
          }
        ]
      }
    ]
  },
  "footer": {
    "enabled": true,
    "y_position": 20,
    "separator_line": {
      "enabled": true,
      "y_position": 84,
      "color": { "r": 0, "g": 0, "b": 0 },
      "thickness": 1
    },
    "content": {
      "elements": [
        {
          "type": "composite",
          "parts": [
            {
              "type": "text",
              "content": "Page ",
              "font": "regular",
              "size": 8
            },
            {
              "type": "page_number",
              "format": "{v}",
              "font": "bold",
              "size": 8
            }
          ]
        }
      ]
    }
  }
}
```

---

## Helper Functions

### Text Processing

#### wrapText(text, font, fontSize, maxWidth)

Wraps text to fit within a specified width.

**Parameters:**
- `text` (string): Text to wrap
- `font` (PDFFont): pdf-lib font object
- `fontSize` (number): Font size in points
- `maxWidth` (number): Maximum width in points

**Returns:** `string[]` - Array of text lines

**Algorithm:**
1. Split text into words
2. Try to fit words on current line
3. If word doesn't fit, start new line
4. If single word exceeds maxWidth, perform character-level wrapping

```javascript
function wrapText(text, font, fontSize, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Character-level wrapping for long words
        // ...implementation...
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
```

#### calculateTextHeight(text, font, fontSize, maxWidth, lineSpacing = 1.2)

Calculates required height for wrapped text.

**Parameters:**
- `text` (string): Text to measure
- `font` (PDFFont): pdf-lib font object
- `fontSize` (number): Font size in points
- `maxWidth` (number): Maximum width in points
- `lineSpacing` (number): Line spacing multiplier (default: 1.2)

**Returns:** `number` - Required height in points

#### drawMultilineText(page, font, text, x, yBottom, width, height, fontSize, align = 'left')

Renders multi-line text with vertical centering.

**Parameters:**
- `page` (PDFPage): Current PDF page
- `font` (PDFFont): Font to use
- `text` (string): Text to render
- `x` (number): Left position
- `yBottom` (number): Bottom position of cell
- `width` (number): Cell width
- `height` (number): Cell height
- `fontSize` (number): Font size
- `align` (string): Alignment ('left', 'center', 'right')

### Image Processing

#### renderQRCode(page, pdfDoc, qrData, x, y, size)

Generates and embeds QR code.

**Parameters:**
- `page` (PDFPage): Current PDF page
- `pdfDoc` (PDFDocument): PDF document
- `qrData` (string): QR code content
- `x`, `y` (number): Position (bottom-left)
- `size` (number): QR code size in points

**Async:** Yes

#### renderLogo(page, pdfDoc, font, logoUrl, x, y, width, height)

Fetches and embeds logo image.

**Parameters:**
- `page` (PDFPage): Current PDF page
- `pdfDoc` (PDFDocument): PDF document
- `font` (PDFFont): Font for placeholder text
- `logoUrl` (string): Image URL
- `x`, `y` (number): Position (bottom-left)
- `width`, `height` (number): Cell dimensions

**Async:** Yes

**Behavior:**
- Fetches image via HTTP/HTTPS
- Auto-detects JPG/PNG format
- Scales to fit while maintaining aspect ratio
- Falls back to "LOGO" text placeholder on error

### Table Rendering

#### renderTableHeaderOnNewPage(page, font, stroke, tableConfig, tableX, usableWidth, currentY)

Re-renders table title and header on overflow pages.

**Parameters:**
- `page` (PDFPage): Current PDF page
- `font` (PDFFont): Font to use
- `stroke` (function): Stroke function for drawing lines
- `tableConfig` (object): Table configuration from Manifest.json
- `tableX` (number): Table left position
- `usableWidth` (number): Table width
- `currentY` (number): Current Y position

**Returns:** `number` - New Y position after rendering

**Async:** Yes

---

## Constants & Settings

### Sizing Constants

```javascript
const LOGO_TEXT_SIZE = 10;    // Placeholder text size for logo
const LOGO_MARGIN = 4;        // Margin around logo (points)
const QR_CODE_SIZE = 60;      // QR code dimensions (points)
```

### Page Constants

```javascript
const PAGE_WIDTH = 595.28;    // A4 width in points
const PAGE_HEIGHT = 841.89;   // A4 height in points
const POINTS_PER_INCH = 72;   // Conversion factor
```

### Margin Protection

```javascript
// Footer protection boundary
const minY = headerFooter.footer.separator_line.y_position + 20; // 104 pt
```

Content must stop above this Y coordinate to avoid footer overlap.

### Color Definitions

```javascript
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.5, 0.5, 0.5);
const LIGHT_GRAY = rgb(0.7, 0.7, 0.7);
```

---

## Integration Examples

### Basic PDF Generation

```javascript
const { PDFDocument } = require('pdf-lib');
const fontkit = require('fontkit');
const fs = require('fs');

async function generateCover(payload) {
  // Load configuration
  const manifest = JSON.parse(fs.readFileSync('Manifest.json', 'utf8'));
  const headerFooter = JSON.parse(fs.readFileSync('HeaderFooter.json', 'utf8'));
  
  // Create PDF
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  
  // Load fonts
  const fontBytes = fs.readFileSync(headerFooter.fonts.regular.path);
  const font = await pdfDoc.embedFont(fontBytes);
  
  // Create page
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  
  // Render content
  // ... (see generate-golden.js for complete implementation)
  
  // Save PDF
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync('output.pdf', pdfBytes);
}
```

### Custom Field Rendering

```javascript
// Render a field from Manifest.json
function renderField(page, font, fieldConfig, payload) {
  const text = resolveTemplate(fieldConfig.source, payload);
  if (!text) return;
  
  drawMultilineText(
    page, font, text,
    fieldConfig.x,
    fieldConfig.y,
    fieldConfig.width,
    fieldConfig.height,
    fieldConfig.text_size,
    fieldConfig.align
  );
}
```

### Dynamic Table Rendering

```javascript
// Render table with overflow handling
async function renderTable(context, tableConfig, dataArray) {
  const { page, font, stroke, currentY } = context;
  
  // Render title and header
  // ...
  
  // Render rows
  for (const rowData of dataArray) {
    const rowHeight = calculateRowHeight(rowData, tableConfig);
    
    // Check for overflow
    if (currentY - rowHeight < minY) {
      // Create new page and re-render header
      await createNewPageWithHeader(context);
    }
    
    // Render row
    renderTableRow(context, rowData, tableConfig, rowHeight);
    currentY -= rowHeight;
  }
}
```

---

## Error Handling

### Image Loading Errors

```javascript
try {
  const imageBuffer = await fetchImageFromUrl(logoUrl);
  const image = await pdfDoc.embedJpg(imageBuffer);
  // ... render image
} catch (error) {
  console.error('Image load failed:', error.message);
  // Fallback to placeholder
  renderLogoPlaceholder(page, font, x, y, width, height);
}
```

### Missing Data Handling

```javascript
function resolveTemplate(template, payload) {
  // Returns empty string for missing values
  // Never throws errors
  return value !== undefined && value !== null ? String(value) : '';
}
```

### Validation

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

// Validate payload structure
const schema = require('./schema/manifest.schema.json');
const valid = ajv.validate(schema, manifest);

if (!valid) {
  console.error('Validation errors:', ajv.errors);
}
```

---

## Performance Considerations

### Image Caching

Consider caching fetched logo images to avoid repeated HTTP requests:

```javascript
const logoCache = new Map();

async function getCachedLogo(url) {
  if (logoCache.has(url)) {
    return logoCache.get(url);
  }
  
  const buffer = await fetchImageFromUrl(url);
  logoCache.set(url, buffer);
  return buffer;
}
```

### Font Preloading

Load fonts once and reuse:

```javascript
let cachedFont = null;

async function getFont(pdfDoc) {
  if (!cachedFont) {
    const fontBytes = fs.readFileSync('./fonts/Inter-Regular.ttf');
    cachedFont = await pdfDoc.embedFont(fontBytes);
  }
  return cachedFont;
}
```

---

## Version History

- **v1.0.0** (October 2024): Initial release
  - Dynamic table rendering with overflow
  - QR code generation
  - Logo fetching from URLs
  - Multi-page support
  - Row-level overflow detection

---

For complete implementation examples, see `generate-golden.js` in the template directory.

