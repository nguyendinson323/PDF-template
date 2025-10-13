# PDF Template Pack - Document Cover & Header/Footer

This Template Pack provides a complete solution for generating dynamic PDF document covers with headers and footers. It is designed to be consumed by the Document Control microservice for automated document generation.

## Table of Contents

- [Overview](#overview)
- [Template Pack Structure](#template-pack-structure)
- [Configuration Files](#configuration-files)
- [Dynamic Features](#dynamic-features)
- [Installation & Usage](#installation--usage)
- [QA & Testing](#qa--testing)
- [Integration Guide](#integration-guide)
- [Technical Specifications](#technical-specifications)

---

## Overview

The Template Pack consists of:
- **Cover.pdf**: Clean PDF template for document covers
- **Manifest.json**: Defines dynamic field positioning and styling for cover elements
- **HeaderFooter.json**: Defines page structure, margins, and header/footer configuration
- **Fonts**: Embedded TTF fonts (Inter-Regular.ttf, Inter-Bold.ttf)
- **Schemas**: JSON Schema validation files
- **QA Kit**: Test payloads and golden reference PDFs

All components are ready for automated consumption by microservices.

---

## Template Pack Structure

```
template/
├── Cover.pdf                      # Base cover template
├── Manifest.json                  # Cover field definitions
├── HeaderFooter.json              # Page structure & header/footer config
├── var_cover.json                 # Variable mapping reference
├── fonts/
│   ├── Inter-Regular.ttf          # Regular font
│   └── Inter-Bold.ttf             # Bold font
├── schema/
│   ├── manifest.schema.json       # Manifest validation schema
│   └── header-footer.schema.json  # Header/footer validation schema
├── qa/
│   ├── payloads/                  # Test JSON payloads (test-001 to test-009)
│   ├── golden/                    # Golden reference PDFs
│   └── overlay-instructions.md    # Alignment validation guide
├── generate-golden.js             # Golden PDF generator script
├── create-cover.js                # Cover generator script
├── validate-schemas.js            # Schema validation script
├── package.json                   # Node.js dependencies
└── README.md                      # This file
```

---

## Configuration Files

### 1. Manifest.json

Defines all dynamic fields on the document cover:

**Field Types:**
- **Text fields**: Document code, title, version, dates, classifications, participant names
- **Image fields**: Company logo (from URL), QR code (dynamically generated)
- **Tables**: 
  - Approvals table (FIRMAS Y APROBACIONES)
  - Signature blocks (SIGNING CONTAINER)
  - Revision history (CONTROL DE CAMBIOS)

**Key Properties:**
- `x`, `y`: Position in points (bottom-left origin)
- `width`, `height`: Dimensions in points
- `text_size`: Font size in points
- `align`: Text alignment (left, center, right)
- `margin_top`: Spacing above element

### 2. HeaderFooter.json

Defines page structure and recurring elements:

**Structure:**
- **Page**: Dimensions (A4: 595.28 x 841.89 pt), margins
- **Header**: Logo, document info, QR code
- **Footer**: Page numbers, security hash, TSA information, separator line

**Key Features:**
- Absolute positioning with `y_position`
- Composite text elements with variable substitution
- Dynamic page number formatting (`{v}` for current page, `{h}` for total pages)
- Security hash truncation for display

### 3. var_cover.json

Maps template placeholders to payload data paths:

```json
{
  "companyLogo": "document.brand.logoUrl",
  "imageQrcode": "document.qr.baseUrl + document.code + document.semanticVersion",
  "docTitle": "document.title",
  "nameCreator": "participants.creator.name",
  ...
}
```

---

## Dynamic Features

### Text Wrapping & Dynamic Heights

The system automatically handles:
- **Word-level wrapping**: Breaks text at word boundaries
- **Character-level wrapping**: For long words exceeding column width
- **Dynamic row heights**: Tables expand based on content
- **Vertical centering**: Multi-line text properly aligned in cells

### Multi-Page Overflow

**Row-Level Overflow Detection:**
- Monitors available space before rendering each table row
- Creates new page when a row doesn't fit
- Re-renders document header on new pages
- Re-renders table title and header on continuation pages
- Maintains consistent margins and spacing across all pages

**Footer Handling:**
- Footers rendered at absolute `y_position` (independent of bottom margin)
- Correct page numbers on all pages
- Consistent security information across pages

### Image Handling

**Company Logo:**
- Fetched from URL specified in `document.brand.logoUrl`
- Automatically scaled to fit cell while maintaining aspect ratio
- Supports JPG and PNG formats
- Falls back to "LOGO" placeholder text if URL fails
- Centralized sizing via `LOGO_MARGIN` constant

**QR Code:**
- Dynamically generated from `document.qr.baseUrl + document.code + document.semanticVersion`
- Error correction level: M (Medium)
- Centralized sizing via `QR_CODE_SIZE` constant
- Embedded as PNG image

### Template Variable Resolution

Supports dot-notation paths to access nested data:
```javascript
{{document.title}}                    // Simple path
{{participants.creator.name}}         // Nested object
{{participants.reviewers[0].name}}    // Array index
{{revision_history[].version}}        // Array iteration (for tables)
```

---

## Installation & Usage

### Prerequisites

- Node.js 14+ 
- npm or yarn

### Setup

```bash
cd template
npm install
```

### Scripts

**Generate Golden PDFs:**
```bash
npm run generate-golden
```
Generates reference PDFs from all test payloads in `qa/payloads/`.

**Validate Schemas:**
```bash
npm run validate-schemas
```
Validates Manifest.json and HeaderFooter.json against their schemas.

**Create Cover:**
```bash
node create-cover.js
```
Generates a cover PDF from the base template and configuration files.

### Dependencies

- **pdf-lib**: PDF creation and manipulation
- **fontkit**: Font embedding and text measurement
- **qrcode**: QR code generation
- **ajv**: JSON Schema validation

---

## QA & Testing

### Test Payloads

Nine comprehensive test cases covering:

1. **test-001-short-title-en.json**: Basic English document
2. **test-002-long-title-es.json**: Long Spanish title
3. **test-003-multiple-revisions.json**: Extensive revision history
4. **test-004-minimal-data.json**: Minimal required fields
5. **test-005-full-data-with-signatures.json**: Complete data with all signatures
6. **test-006-special-characters.json**: Unicode and special characters
7. **test-007-long-descriptions.json**: Long text descriptions
8. **test-008-unpublished-status.json**: Draft/unpublished document
9. **test-009-multipage.json**: Multi-page overflow testing (3+ pages)

### Golden PDFs

Reference PDFs generated from test payloads, used for:
- Visual regression testing
- Layout validation
- Integration verification
- Comparison against microservice output

### Alignment Validation

See [qa/overlay-instructions.md](qa/overlay-instructions.md) for detailed procedures on:
- PDF overlay comparison techniques
- Coordinate verification methods
- Manual inspection checklists
- Debugging tools and techniques
- Acceptance criteria (±2pt tolerance)

---

## Integration Guide

### Consuming the Template Pack

**1. Load Configuration:**
```javascript
const manifest = JSON.parse(fs.readFileSync('Manifest.json', 'utf8'));
const headerFooter = JSON.parse(fs.readFileSync('HeaderFooter.json', 'utf8'));
```

**2. Prepare Payload:**
Ensure payload matches the structure defined in `var_cover.json`:
```json
{
  "document": {
    "brand": { "logoUrl": "https://..." },
    "code": "DOC-001",
    "title": "Document Title",
    "semanticVersion": "v1.0.0",
    "publicationDate": "2024-10-13",
    "qr": { "baseUrl": "https://qr.example.com/" },
    "security": {
      "hashSha256": "a1b2c3...",
      "tsaTime": "2024-10-13T10:00:00Z",
      "tsaSerial": "TSA-001"
    }
  },
  "context": { ... },
  "participants": { ... },
  "checklists": { ... },
  "revision_history": [ ... ]
}
```

**3. Generate PDF:**
The `generate-golden.js` script demonstrates the complete generation process:
- Template variable resolution
- Dynamic table rendering with overflow
- Image fetching and embedding
- Multi-page handling
- Footer rendering with page numbers

**4. Variable Resolution:**
Use the `resolveTemplate()` function to map template paths to payload values:
```javascript
function resolveTemplate(template, payload) {
  if (!template || typeof template !== 'string') return '';
  if (!template.startsWith('{{') || !template.endsWith('}}')) return template;
  
  const path = template.slice(2, -2).trim();
  // ... navigate payload using path
}
```

---

## Technical Specifications

### Coordinate System

- **Origin**: Bottom-left corner of page
- **Units**: Points (1 pt = 1/72 inch)
- **Page Size**: A4 (595.28 x 841.89 pt)
- **Precision**: ±2 pt tolerance

### Margins

- **Top**: 56 pt
- **Bottom**: 84 pt (protected for footer)
- **Left**: 56 pt
- **Right**: 42 pt

### Footer Positioning

- **Separator Line**: 84 pt from bottom
- **Footer Content**: 104 pt from bottom (absolute positioning)
- Content must stop above `minY = 104 pt` to avoid overlap

### Fonts

- **Inter-Regular.ttf**: Body text, regular content
- **Inter-Bold.ttf**: Headings, table headers, emphasis
- **Encoding**: UTF-8 support for international characters

### Constants (Centralized)

```javascript
const LOGO_TEXT_SIZE = 10;    // Logo placeholder text size
const LOGO_MARGIN = 4;        // Margin around logo in points
const QR_CODE_SIZE = 60;      // QR code image size in points
```

### Color Scheme

- **Text**: RGB(0, 0, 0) - Black
- **Borders**: RGB(0, 0, 0) - Black, 1pt width
- **Placeholders**: RGB(0.5, 0.5, 0.5) - Gray
- **Border Frames**: RGB(0.7, 0.7, 0.7) - Light gray

### Performance

- Logo images fetched via HTTP/HTTPS
- QR codes generated on-the-fly
- Efficient edge tracking for border deduplication
- Asynchronous operations for image handling

---

## Advanced Features

### Edge-Based Border Rendering

The system uses edge deduplication to avoid double-drawing borders:
```javascript
function edgeKey(x1, y1, x2, y2) {
  const a = `${round2(x1)},${round2(y1)}`;
  const b = `${round2(x2)},${round2(y2)}`;
  return a <= b ? `${a}|${b}` : `${b}|${a}`;
}
```

### Context Object Pattern

Shared rendering state managed via context object:
```javascript
const context = {
  page, font, pdfDoc, stroke, 
  currentY, minY, 
  headerFooter, manifest, payload,
  renderCoverHeader, 
  checkPageOverflow, 
  ensureSpace
};
```

### Modular Helper Functions

- `wrapText()`: Text wrapping with word/character breaking
- `calculateTextHeight()`: Dynamic height calculation
- `drawMultilineText()`: Multi-line text rendering with alignment
- `renderQRCode()`: QR code generation and embedding
- `renderLogo()`: Logo fetching and rendering
- `renderTableHeaderOnNewPage()`: Consistent table header re-rendering

---

## Troubleshooting

### Common Issues

**1. Logo Not Displaying:**
- Verify `logoUrl` is accessible (HTTPS)
- Check image format (JPG/PNG supported)
- System falls back to "LOGO" text if fetch fails

**2. Text Overflow:**
- System automatically wraps text and adjusts row heights
- Very long words may be character-wrapped
- Page overflow creates new pages automatically

**3. Footer Overlap:**
- Content respects `minY = 104 pt` boundary
- Footer positioned absolutely at `y_position`
- Check `HeaderFooter.json` for correct footer positioning

**4. Page Numbers Incorrect:**
- Ensure footer rendering happens after all pages are created
- Use `{v}` for current page, `{h}` for total pages
- Footer loop must iterate through all pages

---

## Support & Maintenance

### Schema Validation

Always validate configuration changes:
```bash
npm run validate-schemas
```

### Regenerate Golden PDFs

After template modifications:
```bash
npm run generate-golden
```

Compare new outputs with previous golden PDFs to verify changes.

---

## License & Credits

This Template Pack was developed for the Document Control microservice as part of the corporate documentation system.

**Technologies:**
- pdf-lib (PDF manipulation)
- fontkit (Font handling)
- qrcode (QR code generation)
- Node.js (Runtime)

**Fonts:**
- Inter by Rasmus Andersson (SIL Open Font License)

---

## Contact

For integration support or template customization, please contact the Document Control team.

**Last Updated**: October 2024  
**Version**: 1.0.0

