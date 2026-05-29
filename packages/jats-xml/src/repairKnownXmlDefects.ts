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
  return { xml: next, applied };
}
