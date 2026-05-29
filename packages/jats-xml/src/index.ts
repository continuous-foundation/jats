export { default as version } from './version.js';
export { Jats } from './jats.js';
export { recordJatsMessage } from './messages.js';
export {
  knownXmlDefectRepairMessage,
  repairKnownXmlDefects,
  type AppliedXmlDefectRepair,
  type KnownXmlDefectRepair,
  type RepairKnownXmlDefectsResult,
} from './repairKnownXmlDefects.js';
export { sanitizeXmlEntities, type SanitizeXmlEntitiesResult } from './sanitizeXmlEntities.js';
export * from './session.js';
export * from './types.js';
export * from './utils.js';
export * from './validate/index.js';
