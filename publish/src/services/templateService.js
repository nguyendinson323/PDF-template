// ==================================================================================
// Template Service
// ==================================================================================
// Loads Template Pack configurations (Manifest.json, HeaderFooter.json)
// Provides access to fonts
// ==================================================================================

import { readFileSync } from 'fs';
import { join } from 'path';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let manifestCache = null;
let headerFooterCache = null;

/**
 * Load Manifest.json from Template Pack
 */
export function loadManifest() {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    const manifestPath = join(config.template.path, 'Manifest.json');
    const content = readFileSync(manifestPath, 'utf8');
    manifestCache = JSON.parse(content);
    logger.info('Manifest.json loaded', { path: manifestPath });
    return manifestCache;
  } catch (error) {
    logger.error('Failed to load Manifest.json', { error: error.message });
    throw new Error(`Failed to load Manifest.json: ${error.message}`);
  }
}

/**
 * Load HeaderFooter.json from Template Pack
 */
export function loadHeaderFooter() {
  if (headerFooterCache) {
    return headerFooterCache;
  }

  try {
    const headerFooterPath = join(config.template.path, 'HeaderFooter.json');
    const content = readFileSync(headerFooterPath, 'utf8');
    headerFooterCache = JSON.parse(content);
    logger.info('HeaderFooter.json loaded', { path: headerFooterPath });
    return headerFooterCache;
  } catch (error) {
    logger.error('Failed to load HeaderFooter.json', { error: error.message });
    throw new Error(`Failed to load HeaderFooter.json: ${error.message}`);
  }
}

/**
 * Get path to regular font
 */
export function getRegularFontPath() {
  return join(config.template.path, 'fonts', 'Inter-Regular.ttf');
}

/**
 * Get path to bold font
 */
export function getBoldFontPath() {
  return join(config.template.path, 'fonts', 'Inter-Bold.ttf');
}

/**
 * Load font bytes (regular)
 */
export function loadRegularFont() {
  const fontPath = getRegularFontPath();
  return readFileSync(fontPath);
}

/**
 * Load font bytes (bold)
 */
export function loadBoldFont() {
  const fontPath = getBoldFontPath();
  return readFileSync(fontPath);
}

export default {
  loadManifest,
  loadHeaderFooter,
  getRegularFontPath,
  getBoldFontPath,
  loadRegularFont,
  loadBoldFont,
};
