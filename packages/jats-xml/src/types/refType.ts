/**
 * https://jats.nlm.nih.gov/archiving/tag-library/1.3/attribute/ref-type.html
 */
export enum RefType {
  /** Affiliation */
  'aff' = 'aff',
  /** Appendix */
  'app' = 'app',
  /** Author notes */
  'author-note' = 'author-note',
  /** Points to the description of or identifier for a grant or award (<award-id>), also, possibly to an entire awards group (<award-group>) */
  'award' = 'award',
  /** Bibliographic reference (typically to a <ref> element, but it may point to a <element-citation> or <mixed-citation> if there are multiple citations inside the <ref> element) */
  'bibr' = 'bibr',
  /** Biography (typically of a contributor) */
  'bio' = 'bio',
  /** Textbox or sidebar */
  'boxed-text' = 'boxed-text',
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
  'disp-formula' = 'disp-formula',
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
  'supplementary-material' = 'supplementary-material',
  /** Table or group of tables (to a <table-wrap> or <table-wrap-group> element) */
  'table' = 'table',
  /** Table footnote */
  'table-fn' = 'table-fn',
}
