import type { MessageInfo } from 'myst-common';
import { fileWarn, RuleId } from 'myst-common';
import type { VFile } from 'vfile';

const DEFAULT_SOURCE = 'jats-convert';

export type JatsMessageOpts = Omit<MessageInfo, 'source' | 'ruleId'> & {
  note?: string;
  source?: string;
};

export function jatsFileWarn(file: VFile | undefined, reason: string, opts?: JatsMessageOpts) {
  if (!file) return;
  fileWarn(file, reason, {
    ...opts,
    source: opts?.source ?? DEFAULT_SOURCE,
    ruleId: RuleId.jatsParses,
  });
}
