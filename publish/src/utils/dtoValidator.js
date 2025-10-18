// ==================================================================================
// DTO Validator
// ==================================================================================
// Validates DTO structure according to contract-m1.json
// Validates enums, phases, required fields
// ==================================================================================

import { ValidationError } from './errors.js';

// Valid enums from contract-m1.json
const VALID_PHASES = [
  'R-Draft', 'R-View', 'R-Approval', 'R-qac', 'R-Final',
  'V-Test', 'V-Major', 'V-Minor', 'V-Patch', 'V-Deprecated', 'V-Cancelled', 'V-Obsolete'
];

const VALID_STAGE_PHASES = [
  'En Desarrollo', 'Desarrollo', 'Vigente', 'Sustituido', 'Anulado', 'Archivado'
];

const VALID_CRITICALITY_CODES = ['L1', 'L2', 'L3'];
const VALID_CRITICALITY_NAMES = ['Alta', 'Media', 'Baja'];
const VALID_CLASSIFICATIONS = ['Publica', 'Interna', 'Confidencial'];

/**
 * Validate document object
 */
function validateDocument(document) {
  const errors = [];

  if (!document) {
    errors.push('document object is required');
    return errors;
  }

  // Required fields
  if (!document.code) errors.push('document.code is required');
  if (!document.title) errors.push('document.title is required');
  if (!document.semanticVersion) errors.push('document.semanticVersion is required');
  if (!document.publicationDate) errors.push('document.publicationDate is required');

  // Brand
  if (!document.brand || !document.brand.logoUrl) {
    errors.push('document.brand.logoUrl is required');
  }

  // QR
  if (!document.qr || !document.qr.baseUrl) {
    errors.push('document.qr.baseUrl is required');
  }

  // s3Refs
  if (document.s3Refs) {
    if (!document.s3Refs.body) errors.push('document.s3Refs.body is required');
    if (!document.s3Refs.stamped) errors.push('document.s3Refs.stamped is required');
    if (!document.s3Refs.official) errors.push('document.s3Refs.official is required');
  }

  return errors;
}

/**
 * Validate context object
 */
function validateContext(context) {
  const errors = [];

  if (!context) {
    errors.push('context object is required');
    return errors;
  }

  // Required fields
  if (!context.areaCode) errors.push('context.areaCode is required');
  if (!context.areaName) errors.push('context.areaName is required');
  if (!context.typeCode) errors.push('context.typeCode is required');
  if (!context.typeName) errors.push('context.typeName is required');
  if (!context.currentPhase) errors.push('context.currentPhase is required');
  if (!context.stagePhase) errors.push('context.stagePhase is required');
  if (!context.destinationPhase) errors.push('context.destinationPhase is required');

  // Validate enums
  if (context.currentPhase && !VALID_PHASES.includes(context.currentPhase)) {
    errors.push(`context.currentPhase must be one of: ${VALID_PHASES.join(', ')}`);
  }

  if (context.stagePhase && !VALID_STAGE_PHASES.includes(context.stagePhase)) {
    errors.push(`context.stagePhase must be one of: ${VALID_STAGE_PHASES.join(', ')}`);
  }

  if (context.destinationPhase && !VALID_PHASES.includes(context.destinationPhase)) {
    errors.push(`context.destinationPhase must be one of: ${VALID_PHASES.join(', ')}`);
  }

  if (context.criticalityCode && !VALID_CRITICALITY_CODES.includes(context.criticalityCode)) {
    errors.push(`context.criticalityCode must be one of: ${VALID_CRITICALITY_CODES.join(', ')}`);
  }

  if (context.criticalityName && !VALID_CRITICALITY_NAMES.includes(context.criticalityName)) {
    errors.push(`context.criticalityName must be one of: ${VALID_CRITICALITY_NAMES.join(', ')}`);
  }

  if (context.classificationName && !VALID_CLASSIFICATIONS.includes(context.classificationName)) {
    errors.push(`context.classificationName must be one of: ${VALID_CLASSIFICATIONS.join(', ')}`);
  }

  return errors;
}

/**
 * Validate a single participant entry (name and jobTitle)
 */
function validateParticipantEntry(participant, path) {
  const errors = [];
  if (!participant.name) errors.push(`${path}.name is required`);
  if (!participant.jobTitle) errors.push(`${path}.jobTitle is required`);
  return errors;
}

/**
 * Validate participant field - handles both array and object types
 */
function validateParticipantField(field, fieldName) {
  const errors = [];

  if (!field) {
    errors.push(`participants.${fieldName} is required`);
    return errors;
  }

  // Handle array type
  if (Array.isArray(field)) {
    if (field.length === 0) {
      errors.push(`participants.${fieldName} must be a non-empty array`);
    } else {
      field.forEach((entry, index) => {
        errors.push(...validateParticipantEntry(entry, `participants.${fieldName}[${index}]`));
      });
    }
  }
  // Handle object type
  else if (typeof field === 'object') {
    errors.push(...validateParticipantEntry(field, `participants.${fieldName}`));
  }
  // Invalid type
  else {
    errors.push(`participants.${fieldName} must be an object or array`);
  }

  return errors;
}

/**
 * Validate participants object
 */
function validateParticipants(participants) {
  const errors = [];

  if (!participants) {
    errors.push('participants object is required');
    return errors;
  }

  // Validate each participant field (supports both array and object)
  errors.push(...validateParticipantField(participants.creator, 'creator', participants));
  errors.push(...validateParticipantField(participants.reviewers, 'reviewers', participants));
  errors.push(...validateParticipantField(participants.qac, 'qac', participants));
  errors.push(...validateParticipantField(participants.approvers, 'approvers', participants));
  errors.push(...validateParticipantField(participants.dcontrol, 'dcontrol', participants));

  return errors;
}

/**
 * Validate checklists object
 */
function validateChecklists(checklists) {
  const errors = [];

  if (!checklists) {
    errors.push('checklists object is required');
    return errors;
  }

  // Required checklist fields
  const requiredChecklists = ['creator', 'review', 'qac', 'approval', 'publish'];

  for (const checklistType of requiredChecklists) {
    if (!checklists[checklistType]) {
      errors.push(`checklists.${checklistType} is required`);
    }
  }

  return errors;
}

/**
 * Validate revision history
 */
function validateRevisionHistory(revisionHistory) {
  const errors = [];

  if (!Array.isArray(revisionHistory)) {
    errors.push('revision_history must be an array');
    return errors;
  }

  if (revisionHistory.length === 0) {
    errors.push('revision_history must contain at least one entry');
  }

  // Validate each entry
  revisionHistory.forEach((entry, index) => {
    if (!entry.version) {
      errors.push(`revision_history[${index}].version is required`);
    }
    if (!entry.date) {
      errors.push(`revision_history[${index}].date is required`);
    }
    if (!entry.revisionDescription) {
      errors.push(`revision_history[${index}].revisionDescription is required`);
    }
    if (!entry.responsibleName) {
      errors.push(`revision_history[${index}].responsibleName is required`);
    }
  });

  return errors;
}

/**
 * Main DTO validation function
 * Throws ValidationError if validation fails
 */
export function validateDTO(dto) {
  const allErrors = [];

  // Validate each section
  allErrors.push(...validateDocument(dto.document));
  allErrors.push(...validateContext(dto.context));
  allErrors.push(...validateParticipants(dto.participants));
  allErrors.push(...validateChecklists(dto.checklists));
  allErrors.push(...validateRevisionHistory(dto.revision_history));

  // If errors found, throw ValidationError
  if (allErrors.length > 0) {
    throw new ValidationError('DTO validation failed', { errors: allErrors });
  }

  return true;
}

/**
 * Generate S3 path for body
 */
export function generateBodyPath(dto) {
  const { code, semanticVersion } = dto.document;
  const { currentPhase, correlativocurrentPhase } = dto.context;
  return `Desarrollo/bodies/${code}-${semanticVersion}-${currentPhase}-${correlativocurrentPhase}.pdf`;
}

/**
 * Generate S3 path for stamped
 */
export function generateStampedPath(dto) {
  const { code, semanticVersion } = dto.document;
  const { currentPhase, correlativocurrentPhase } = dto.context;
  return `Desarrollo/stamped/${code}-${semanticVersion}-${currentPhase}-${correlativocurrentPhase}.pdf`;
}

/**
 * Generate S3 path for official
 */
export function generateOfficialPath(dto) {
  const { code, semanticVersion } = dto.document;
  return `Publicados/official/${code}-${semanticVersion}.pdf`;
}

/**
 * Check if phase requires hash/TSA (V-* phases when published)
 */
export function requiresHashAndTSA(currentPhase) {
  return currentPhase && currentPhase.startsWith('V-');
}

export default {
  validateDTO,
  generateBodyPath,
  generateStampedPath,
  generateOfficialPath,
  requiresHashAndTSA,
};
