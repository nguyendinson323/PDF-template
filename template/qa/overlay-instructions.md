# Overlay & Debug Instructions for Alignment Validation

This document provides procedures for validating PDF alignment, positioning, and layout accuracy.

## Table of Contents

- [Overview](#overview)
- [Validation Methods](#validation-methods)
- [Coordinate System Reference](#coordinate-system-reference)
- [Manual Inspection Checklist](#manual-inspection-checklist)
- [Automated Validation](#automated-validation)
- [Common Alignment Issues](#common-alignment-issues)
- [Debugging Tools](#debugging-tools)

---

## Overview

The Template Pack has a precision requirement of **±2 pt tolerance** for all positioned elements. This document describes how to verify that generated PDFs meet this specification.

### What to Validate

- Field positioning (x, y coordinates)
- Element dimensions (width, height)
- Table alignment and column widths
- Text alignment within cells
- Image placement and sizing
- Multi-page consistency
- Footer positioning

---

## Validation Methods

### Method 1: PDF Overlay Comparison

**Tools Required:**
- Adobe Acrobat Pro or similar PDF editor with layer support
- Golden reference PDFs from `qa/golden/`

**Steps:**

1. **Open Golden PDF:**
   - Open a golden reference PDF in your PDF editor

2. **Import Test PDF as Overlay:**
   - Generate a new PDF from the same payload
   - Import the new PDF as an overlay/layer on top of the golden PDF

3. **Toggle Layers:**
   - Switch between layers to compare positioning
   - Look for any shifts or misalignments

4. **Measure Differences:**
   - Use measurement tools to check any discrepancies
   - Acceptable: ±2 pt tolerance
   - Unacceptable: >2 pt misalignment

**What to Look For:**
- Text should align exactly
- Table borders should overlap perfectly
- Images should be in identical positions
- Page breaks should occur at the same locations

---

### Method 2: Visual Grid Overlay

**Enable Debug Grid in Code:**

Add this helper function to `generate-golden.js` for debugging:

```javascript
function drawDebugGrid(page, spacing = 50) {
  const { width, height } = page.getSize();
  
  // Draw vertical lines
  for (let x = 0; x <= width; x += spacing) {
    page.drawLine({
      start: { x, y: 0 },
      end: { x, y: height },
      color: rgb(0.9, 0.9, 0.9),
      thickness: 0.5
    });
    
    // Label every 100pt
    if (x % 100 === 0) {
      page.drawText(String(x), {
        x: x + 2,
        y: height - 20,
        size: 8,
        color: rgb(0.7, 0.7, 0.7)
      });
    }
  }
  
  // Draw horizontal lines
  for (let y = 0; y <= height; y += spacing) {
    page.drawLine({
      start: { x: 0, y },
      end: { x: width, y },
      color: rgb(0.9, 0.9, 0.9),
      thickness: 0.5
    });
    
    // Label every 100pt
    if (y % 100 === 0) {
      page.drawText(String(y), {
        x: 5,
        y: y + 2,
        size: 8,
        color: rgb(0.7, 0.7, 0.7)
      });
    }
  }
}

// Call at page creation:
// drawDebugGrid(page);
```

**Usage:**
1. Add debug grid to generated PDF
2. Verify element positions match Manifest.json coordinates
3. Check margins and spacing

---

### Method 3: Coordinate Verification

**Manual Coordinate Check:**

Use PDF measurement tools to verify key positions:

| Element | Expected Position | Tolerance |
|---------|------------------|-----------|
| Page margins | Top: 56pt, Bottom: 84pt, Left: 56pt, Right: 42pt | ±2pt |
| Footer separator | Y: 84pt from bottom | ±2pt |
| Footer content | Y: 20pt from bottom | ±2pt |
| Header top | Y: 785.89pt from bottom | ±2pt |
| Table positions | Per Manifest.json | ±2pt |

---

## Coordinate System Reference

### PDF Coordinate System

```
    Y
    ↑
841.89 ┌─────────────────────┐
    │                     │
    │                     │
    │   Page Content      │
    │                     │
  0 └─────────────────────┘→ X
    0                  595.28
```

**Key Points:**
- Origin: Bottom-left corner (0, 0)
- X increases to the right
- Y increases upward
- Units: Points (pt), where 1 pt = 1/72 inch
- A4 Page: 595.28 × 841.89 pt

### Margin Reference

```
              56pt
         ┌──────────┐
      56pt│        │42pt
         │ Content │
         │  Area   │
         └──────────┘
              84pt
```

**Usable Content Area:**
- Left: 56pt
- Right: 595.28 - 42 = 553.28pt
- Top: 841.89 - 56 = 785.89pt
- Bottom: 84pt (above footer)
- Width: 483.28pt
- Height: 701.89pt

---

## Manual Inspection Checklist

### Cover Page Elements

- [ ] **Company Logo**
  - Positioned in header
  - Properly scaled (maintains aspect ratio)
  - Centered in allocated space
  - Margin: 4pt on all sides

- [ ] **QR Code**
  - Positioned in header
  - Size: 60×60 pt
  - Centered in allocated space
  - Scannable and correct data

- [ ] **Document Title**
  - Correct position from Manifest.json
  - Text wraps properly if long
  - Vertically centered in cell
  - No text overflow/cutoff

- [ ] **Document Code**
  - Correct position
  - Proper alignment
  - Readable font size

- [ ] **Tables (Approvals, Signatures, Revisions)**
  - Title centered and properly sized
  - Header row aligned
  - Column separators at correct positions
  - Row heights accommodate content
  - Text wraps within cells
  - No overlapping borders
  - Vertical centering of multi-line text

### Multi-Page Elements

- [ ] **Headers**
  - Present on all pages
  - Identical positioning across pages
  - Logo and QR code on continuation pages
  - All dynamic content rendered

- [ ] **Footers**
  - Present on all pages
  - Separator line at Y: 84pt
  - Content at Y: 20pt
  - Page numbers correct ({v} of {h})
  - Security hash truncated properly
  - TSA info displayed correctly

- [ ] **Page Overflow**
  - Content stops above footer (minY: 104pt)
  - No content overlaps footer
  - Table headers re-rendered on new pages
  - Table titles re-rendered on new pages
  - Consistent table styling across pages

### Text Rendering

- [ ] **Alignment**
  - Left-aligned text starts at correct X
  - Center-aligned text centered in cell
  - Right-aligned text ends at correct X

- [ ] **Wrapping**
  - Words break at spaces when possible
  - Long words break at character level
  - No words cut off mid-character

- [ ] **Vertical Centering**
  - Single-line text centered in cell height
  - Multi-line text centered as block
  - Proper baseline positioning

### Images

- [ ] **Logo**
  - Loads from URL successfully
  - Falls back to "LOGO" placeholder if URL fails
  - Scaled to fit cell with aspect ratio preserved
  - Centered in cell

- [ ] **QR Code**
  - Generated with correct data
  - Proper error correction level (M)
  - Size: 60×60 pt
  - Embedded as PNG

---

## Automated Validation

### Using Validation Script

Create a validation script `validate-output.js`:

```javascript
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');

async function validatePDF(pdfPath, expectedConfig) {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  const errors = [];
  
  // Validate page count
  const pageCount = pdfDoc.getPageCount();
  if (expectedConfig.minPages && pageCount < expectedConfig.minPages) {
    errors.push(`Expected at least ${expectedConfig.minPages} pages, got ${pageCount}`);
  }
  
  // Validate page size
  const firstPage = pdfDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  
  if (Math.abs(width - 595.28) > 2) {
    errors.push(`Page width ${width} differs from expected 595.28`);
  }
  
  if (Math.abs(height - 841.89) > 2) {
    errors.push(`Page height ${height} differs from expected 841.89`);
  }
  
  return errors;
}

// Usage:
// const errors = await validatePDF('output.pdf', { minPages: 1 });
// if (errors.length > 0) console.error('Validation failed:', errors);
```

---

## Common Alignment Issues

### Issue 1: Text Not Vertically Centered

**Symptom:** Text appears too high or too low in cell

**Check:**
- Verify `drawMultilineText` calculation
- Confirm line height multiplier (1.2)
- Check baseline offset (fontSize * 0.25)

**Fix:**
```javascript
// Correct vertical centering:
const totalTextHeight = lines.length * lineHeight;
const startY = yBottom + (height - totalTextHeight) / 2 + lineHeight;
```

### Issue 2: Table Columns Misaligned

**Symptom:** Column separators don't line up

**Check:**
- Sum of column widths = table width
- Rounding errors in accumulation
- Border deduplication logic

**Fix:**
- Use `round2()` for all coordinates
- Verify column width calculations

### Issue 3: Footer Overlapping Content

**Symptom:** Content appears over footer

**Check:**
- `minY` calculation (should be 104pt)
- Overflow detection trigger point
- Footer `y_position` (should be 20pt)

**Fix:**
```javascript
const minY = headerFooter.footer.separator_line.y_position + 20; // 104pt
if (currentY - requiredHeight < minY) {
  // Create new page
}
```

### Issue 4: Page Numbers Incorrect

**Symptom:** Wrong page numbers in footer

**Check:**
- Footer rendering happens after all pages created
- Page iteration starts at 0
- Using correct variables: `pageIndex + 1` and `totalPages`

**Fix:**
```javascript
for (let i = 0; i < pages.length; i++) {
  await renderFooter(pages[i], i + 1, pages.length);
}
```

---

## Debugging Tools

### Enable Console Logging

Add debug output in `generate-golden.js`:

```javascript
// Before rendering element:
console.log(`Rendering field at x:${x}, y:${y}, w:${width}, h:${height}`);

// After text wrapping:
console.log(`Text wrapped to ${lines.length} lines, height: ${calculatedHeight}pt`);

// On page overflow:
console.log(`Page overflow at y:${currentY}, creating new page`);
```

### Visual Debugging

**Draw Bounding Boxes:**

```javascript
function drawBoundingBox(page, x, y, width, height, color = rgb(1, 0, 0)) {
  page.drawRectangle({
    x, y, width, height,
    borderColor: color,
    borderWidth: 1
  });
}

// Use to visualize field boundaries:
// drawBoundingBox(page, fieldX, fieldY, fieldWidth, fieldHeight);
```

### Coordinate Inspector

Add coordinate labels to elements:

```javascript
function labelCoordinate(page, font, x, y, label) {
  page.drawText(`${label}:(${x},${y})`, {
    x: x + 2,
    y: y + 2,
    size: 6,
    font: font,
    color: rgb(1, 0, 0)
  });
}

// Usage:
// labelCoordinate(page, font, tableX, tableY, 'Table');
```

---

## Test Procedure

### Standard Validation Process

1. **Generate Golden PDFs:**
   ```bash
   npm run generate-golden
   ```

2. **Visual Inspection:**
   - Open each PDF in `qa/golden/`
   - Check all elements render correctly
   - Verify text is readable and properly positioned
   - Confirm images display correctly

3. **Measure Key Positions:**
   - Use PDF measurement tool
   - Check margins: 56, 42, 84, 56
   - Verify footer at Y=20pt
   - Confirm header positioning

4. **Multi-Page Tests:**
   - Open `test-009-multipage.pdf`
   - Verify headers on all pages
   - Verify footers on all pages
   - Check page numbers (1 of 3, 2 of 3, 3 of 3)
   - Confirm table overflow handling

5. **Cross-Payload Comparison:**
   - Compare positioning across different test payloads
   - Ensure consistent layout
   - Verify dynamic content doesn't break layout

6. **Overlay Comparison:**
   - Overlay new PDF with golden PDF
   - Check for any position shifts
   - Measure any discrepancies

---

## Acceptance Criteria

### Pass Criteria

- All elements within ±2pt of specified positions
- No text overflow or cutoff
- All tables render completely
- Headers and footers on all pages
- Page numbers correct
- QR codes scannable
- Logos display (or show placeholder)
- Multi-page documents break correctly
- No content overlaps footer

### Fail Criteria

- Position error >2pt
- Text cut off or overflowing
- Missing headers/footers
- Incorrect page numbers
- Content overlapping footer
- Tables incomplete or misaligned
- Images not loading when URL is valid

---

## Regression Testing

After any code changes:

1. Regenerate all golden PDFs
2. Compare with previous version
3. Document any intentional changes
4. Verify all test cases still pass
5. Update this document if validation procedures change

---

## Contact & Support

For alignment issues or validation questions, provide:
- PDF file exhibiting the issue
- Payload JSON used
- Expected vs. actual coordinates
- Screenshots with measurements

---

**Last Updated:** October 2024  
**Version:** 1.0.0

