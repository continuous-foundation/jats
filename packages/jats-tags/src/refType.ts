/**
 * https://jats.nlm.nih.gov/archiving/tag-library/1.3/attribute/ref-type.html
 */
export enum RefType {
  /** Affiliation */
  'aff' = 'aff',
  /** Appendix */
  'app' = 'app',
  /** Author notes */
  'authorNote' = 'author-note',
  /** Points to the description of or identifier for a grant or award (<award-id>), also, possibly to an entire awards group (<award-group>) */
  'award' = 'award',
  /** Bibliographic reference (typically to a <ref> element, but it may point to a <element-citation> or <mixed-citation> if there are multiple citations inside the <ref> element) */
  'bibr' = 'bibr',
  /** Biography (typically of a contributor) */
  'bio' = 'bio',
  /** Textbox or sidebar */
  'boxedText' = 'boxed-text',
  /** Chemical structure (to a <chem-struct> or <chem-struct-wrap> element) */
  'chem' = 'chem',
  /** Collaboration */
  'collab' = 'collab',
  /** Contributor */
  'contrib' = 'contrib',
  /** Corresponding author */
  'corresp' = 'corresp',
  /** The value “custom” is used in versions of JATS that have a static list of values for the @ref-type attribute. To add a value to such a list, the cross reference is given the type “custom” and a separate @custom-type attribute provides the typing value. There is no need for this mechanism in Archiving, since there are no restrictions on the value of @ref-type, but “custom” and @custom-type have both been included in Archiving so that documents valid to a stricter version of the JATS Tag Set will also be valid to Archiving. */
  'custom' = 'custom',
  /** Display formula */
  'dispFormula' = 'disp-formula',
  /** Figure or group of figures (to a <fig> or <fig-group> element) */
  'fig' = 'fig',
  /** Footnote */
  'fn' = 'fn',
  /** Keyword */
  'kwd' = 'kwd',
  /** List or list item (to a <list> or <list-item> element; also, possibly to a <def-list> or <def-item> element) */
  'list' = 'list',
  /** Plate */
  'plate' = 'plate',
  /** Scheme */
  'scheme' = 'scheme',
  /** Section */
  'sec' = 'sec',
  /** Statement */
  'statement' = 'statement',
  /** Supplementary information */
  'supplementaryMaterial' = 'supplementary-material',
  /** Table or group of tables (to a <table-wrap> or <table-wrap-group> element) */
  'table' = 'table',
  /** Table footnote */
  'tableFn' = 'table-fn',
  /** the following are _not_ a recommended ref-types, but are used encountered in JATS*/
  'ref' = 'ref',
  'media' = 'media',
  'video' = 'video',
}

const REF_TYPE_VALUES = new Set<string>(Object.values(RefType));

/** Potential non-standard ref-type spellings seen in publisher JATS. */
const REF_TYPE_ALIASES: Record<string, RefType> = {
  figure: RefType.fig,
  figures: RefType.fig,
  tab: RefType.table,
  tbl: RefType.table,
  tables: RefType.table,
  section: RefType.sec,
  sections: RefType.sec,
  equation: RefType.dispFormula,
  equations: RefType.dispFormula,
  eq: RefType.dispFormula,
  formula: RefType.dispFormula,
  formulas: RefType.dispFormula,
  footnote: RefType.fn,
  footnotes: RefType.fn,
};

function normalizeRefTypeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
}

/** Map a raw `@ref-type` attribute to a {@link RefType}, if recognized. */
export function coerceRefType(value: string | undefined): RefType | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (REF_TYPE_VALUES.has(trimmed)) {
    return trimmed as RefType;
  }
  const normalized = normalizeRefTypeKey(trimmed);
  if (REF_TYPE_VALUES.has(normalized)) {
    return normalized as RefType;
  }
  return REF_TYPE_ALIASES[normalized];
}
