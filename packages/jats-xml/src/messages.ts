import { fileError, fileWarn, RuleId } from 'myst-common';
import type { VFile } from 'vfile';

export function recordJatsMessage(
  vfile: VFile | undefined,
  reason: string,
  opts?: { note?: string; fatal?: boolean },
) {
  if (!vfile) return;
  const info = { source: 'jats-xml', ruleId: RuleId.jatsParses, note: opts?.note };
  if (opts?.fatal) fileError(vfile, reason, info);
  else fileWarn(vfile, reason, info);
}
