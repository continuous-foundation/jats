import { fileWarn, RuleId } from 'myst-common';
import type { VFile } from 'vfile';

export type JatsPrologWarning = {
  reason: string;
  note?: string;
};

export function recordJatsPrologWarning(
  warnings: JatsPrologWarning[] | undefined,
  vfile: VFile | undefined,
  reason: string,
  note?: string,
) {
  if (vfile) {
    fileWarn(vfile, reason, {
      source: 'jats-xml',
      ruleId: RuleId.jatsParses,
      note,
    });
    return;
  }
  warnings?.push({ reason, note });
}

export function flushJatsPrologWarnings(
  jats: { prologWarnings?: JatsPrologWarning[] },
  file?: VFile,
) {
  if (!file || !jats.prologWarnings?.length) return;
  jats.prologWarnings.forEach(({ reason, note }) => {
    fileWarn(file, reason, {
      source: 'jats-xml',
      ruleId: RuleId.jatsParses,
      note,
    });
  });
  jats.prologWarnings = [];
}
