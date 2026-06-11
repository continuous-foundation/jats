import type { GenericParent } from 'myst-common';
import type { VFile } from 'vfile';
import { selectAll } from 'unist-util-select';
import { jatsFileWarn } from './messages.js';

export type EnumeratorKind = 'figure' | 'table';

const FIGURE_ID_PREFIX = /^fig/i;
const TABLE_ID_PREFIX = /^(?:tbl|table|tab)/i;

const FIGURE_LABEL_PREFIX = /^(?:figure|fig\.?)\s+/i;
const TABLE_LABEL_PREFIX = /^(?:table|tbl\.?)\s+/i;

/** Normalize a raw enumerator fragment for comparison and output. */
export function normalizeEnumerator(value: string): string | undefined {
  const normalized = value
    .trim()
    .replace(/[''""]+/g, '')
    .replace(/[.,;:]+$/g, '')
    .trim()
    .toUpperCase();
  return normalized || undefined;
}

function stripIdPrefix(id: string, kind: EnumeratorKind): string | undefined {
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  const prefix = kind === 'figure' ? FIGURE_ID_PREFIX : TABLE_ID_PREFIX;
  if (!prefix.test(trimmed)) return undefined;
  const rest = trimmed
    .replace(prefix, '')
    .replace(/^[-_.]+/, '')
    .trim();
  return rest || undefined;
}

function stripLabelPrefix(label: string, kind: EnumeratorKind): string | undefined {
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  const prefix = kind === 'figure' ? FIGURE_LABEL_PREFIX : TABLE_LABEL_PREFIX;
  const match = trimmed.match(prefix);
  if (!match) return undefined;
  const rest = trimmed.slice(match[0].length).trim();
  return rest || undefined;
}

export function enumeratorFromId(id: string, kind: EnumeratorKind): string | undefined {
  const rest = stripIdPrefix(id, kind);
  return rest ? normalizeEnumerator(rest) : undefined;
}

export function enumeratorFromLabel(label: string, kind: EnumeratorKind): string | undefined {
  const rest = stripLabelPrefix(label, kind);
  return rest ? normalizeEnumerator(rest) : undefined;
}

export function resolveEnumerator(opts: {
  id?: string;
  labelText?: string;
  kind: EnumeratorKind;
  source: string;
  file?: VFile;
}): string | undefined {
  const fromId = opts.id ? enumeratorFromId(opts.id, opts.kind) : undefined;
  const fromLabel = opts.labelText ? enumeratorFromLabel(opts.labelText, opts.kind) : undefined;

  if (fromId && fromLabel && fromId !== fromLabel) {
    jatsFileWarn(opts.file, 'Container id and label enumerators do not match', {
      source: opts.source,
      note: [
        `id-enumerator=${fromId}`,
        `label-enumerator=${fromLabel}`,
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
      ]
        .filter(Boolean)
        .join('; '),
    });
    return fromLabel;
  }

  const enumerator = fromLabel ?? fromId;
  if (!enumerator && (opts.id || opts.labelText)) {
    jatsFileWarn(opts.file, 'Could not determine container enumerator from id or label', {
      source: opts.source,
      note: [
        `kind=${opts.kind}`,
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
      ]
        .filter(Boolean)
        .join('; '),
    });
  }
  return enumerator;
}

function hasEnumerator(node: GenericParent): boolean {
  return typeof node.enumerator === 'string' && node.enumerator.length > 0;
}

/** Warn when some but not all containers of a kind have an enumerator. */
export function warnMixedContainerEnumerators(tree: GenericParent, file?: VFile) {
  for (const kind of ['figure', 'table'] as const) {
    const containers = selectAll(`container[kind=${kind}]`, tree) as GenericParent[];
    if (containers.length < 2) continue;
    const enumerated = containers.filter(hasEnumerator).length;
    const nonEnumerated = containers.length - enumerated;
    if (enumerated > 0 && nonEnumerated > 0) {
      jatsFileWarn(file, `Mix of enumerated and non-enumerated ${kind}s`, {
        source: 'jats-convert:enumerator',
        note: `enumerated=${enumerated}; non-enumerated=${nonEnumerated}`,
      });
    }
  }
}
