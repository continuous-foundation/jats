import { characterEntities } from 'character-entities';

/**
 * Names of HTML/XML character references recognized when deciding whether `&` starts
 * a valid entity (e.g. `&amp;`, `&ndash;`, `&#38;`, `&#x26;`).
 */
const VALID_ENTITY_NAMES = Object.keys(characterEntities).map((name) =>
  name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
);

/**
 * `&` not followed by a known named entity or numeric reference — e.g. "Bill & Melinda".
 * Matches the escape step from common JATS preprocessors before XML parse.
 */
const BARE_AMPERSAND_RE = new RegExp(
  `&(?!(?:${VALID_ENTITY_NAMES.join('|')}|#(?:x[0-9a-fA-F]+|\\d+));)`,
  'g',
);

export type SanitizeXmlEntitiesResult = {
  xml: string;
  /** How many bare `&` were rewritten to `&#38;`. */
  escapedBareAmpersandCount: number;
};

/**
 * Escape bare ampersands so xml-js (and other XML parsers) do not fail with
 * "Invalid character in entity name" / unterminated reference errors.
 *
 * Existing `&amp;`, `&ndash;`, `&#123;`, etc. are left unchanged; xml-js expands
 * those when parsing.
 */
export function sanitizeXmlEntities(xml: string): SanitizeXmlEntitiesResult {
  let escapedBareAmpersandCount = 0;
  const sanitized = xml.replace(BARE_AMPERSAND_RE, () => {
    escapedBareAmpersandCount += 1;
    return '&#38;';
  });
  return { xml: sanitized, escapedBareAmpersandCount };
}
