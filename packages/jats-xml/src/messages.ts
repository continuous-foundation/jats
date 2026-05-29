import { fileWarn, RuleId } from 'myst-common';
import type { VFile } from 'vfile';

export function recordJatsMessage(
  vfile: VFile | undefined,
  reason: string,
  opts?: { note?: string },
) {
  if (!vfile) return;
  fileWarn(vfile, reason, { source: 'jats-xml', ruleId: RuleId.jatsParses, note: opts?.note });
}
