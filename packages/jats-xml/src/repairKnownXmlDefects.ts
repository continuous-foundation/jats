/**
 * Literal find/replace fixes for malformed JATS seen in the wild.
 * Each entry emits at most one vfile message when it matches.
 */
export type KnownXmlDefectRepair = {
  from: string;
  to: string;
};

const KNOWN_XML_DEFECT_REPAIRS: KnownXmlDefectRepair[] = [
  {
    from: '<fn id="n1"fn-type="equal">',
    to: '<fn id="n1" fn-type="equal">',
  },
];

/**
 * Truncated accent markup in surnames, e.g. Meth&#x2019;{e</surname> where a closing
 * brace was lost from LaTeX-style &#x2019;{e} (right single quote + braced letter).
 */
const TRUNCATED_ACUTE_ACCENT_SURNAME_RE = /&#(?:x2019|8217|2019);\{([a-zA-Z])(?=\s*<\/surname>)/g;

const ACUTE_ACCENT: Record<string, string> = {
  a: 'á',
  e: 'é',
  i: 'í',
  o: 'ó',
  u: 'ú',
  A: 'Á',
  E: 'É',
  I: 'Í',
  O: 'Ó',
  U: 'Ú',
};

const TRUNCATED_ACUTE_ACCENT_SURNAME_REPAIR: KnownXmlDefectRepair = {
  from: 'truncated accent in <surname> (e.g. Meth&#x2019;{e)',
  to: 'accented character (e.g. Methé)',
};

export function knownXmlDefectRepairMessage(from: string, to: string): string {
  return `replaced ${from} with ${to}`;
}

export type AppliedXmlDefectRepair = {
  repair: KnownXmlDefectRepair;
  count: number;
};

export type RepairKnownXmlDefectsResult = {
  xml: string;
  applied: AppliedXmlDefectRepair[];
};

function repairTruncatedAcuteAccentsInSurname(xml: string): {
  xml: string;
  count: number;
} {
  let count = 0;
  const next = xml.replace(TRUNCATED_ACUTE_ACCENT_SURNAME_RE, (match, letter: string) => {
    const accented = ACUTE_ACCENT[letter];
    if (!accented) return match;
    count += 1;
    return accented;
  });
  return { xml: next, count };
}

/**
 * Apply KNOWN_XML_DEFECT_REPAIRS in order. Each rule uses a single literal
 * `from` → `to` substitution (all occurrences of `from`).
 */
export function repairKnownXmlDefects(xml: string): RepairKnownXmlDefectsResult {
  const applied: AppliedXmlDefectRepair[] = [];
  let next = xml;
  for (const repair of KNOWN_XML_DEFECT_REPAIRS) {
    if (!next.includes(repair.from)) continue;
    const parts = next.split(repair.from);
    const count = parts.length - 1;
    next = parts.join(repair.to);
    applied.push({ repair, count });
  }
  const accentRepair = repairTruncatedAcuteAccentsInSurname(next);
  next = accentRepair.xml;
  if (accentRepair.count > 0) {
    applied.push({ repair: TRUNCATED_ACUTE_ACCENT_SURNAME_REPAIR, count: accentRepair.count });
  }
  return { xml: next, applied };
}
