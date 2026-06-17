import type { GenericNode } from 'myst-common';
import type { VFile } from 'vfile';
import { select } from 'unist-util-select';
import { jatsFileWarn } from './messages.js';
import { normalizeEnumerator } from './enumerator.js';

/** MyST proof kinds (myst-ext-proof). */
export const PROOF_KINDS = [
  'proof',
  'axiom',
  'lemma',
  'definition',
  'criterion',
  'remark',
  'conjecture',
  'corollary',
  'algorithm',
  'example',
  'property',
  'observation',
  'proposition',
  'assumption',
  'theorem',
] as const;

export type ProofKind = (typeof PROOF_KINDS)[number];

const LABEL_KIND_PATTERNS: { prefix: RegExp; kind: ProofKind }[] = [
  { prefix: /^proposition\b/i, kind: 'proposition' },
  { prefix: /^corollary\b/i, kind: 'corollary' },
  { prefix: /^conjecture\b/i, kind: 'conjecture' },
  { prefix: /^definition\b/i, kind: 'definition' },
  { prefix: /^assumption\b/i, kind: 'assumption' },
  { prefix: /^observation\b/i, kind: 'observation' },
  { prefix: /^algorithm\b/i, kind: 'algorithm' },
  { prefix: /^postulate\b/i, kind: 'assumption' },
  { prefix: /^criterion\b/i, kind: 'criterion' },
  { prefix: /^criteria\b/i, kind: 'criterion' },
  { prefix: /^property\b/i, kind: 'property' },
  { prefix: /^theorem\b/i, kind: 'theorem' },
  { prefix: /^example\b/i, kind: 'example' },
  { prefix: /^lemma\b/i, kind: 'lemma' },
  { prefix: /^remark\b/i, kind: 'remark' },
  { prefix: /^axiom\b/i, kind: 'axiom' },
  { prefix: /^proof\b/i, kind: 'proof' },
];

const UNMAPPED_LABEL_PREFIXES = [{ prefix: /^hypothesis\b/i, name: 'hypothesis' }];

const ID_KIND_PREFIXES: { prefix: RegExp; kind: ProofKind }[] = [
  { prefix: /^thm/i, kind: 'theorem' },
  { prefix: /^theorem/i, kind: 'theorem' },
  { prefix: /^lem/i, kind: 'lemma' },
  { prefix: /^lemma/i, kind: 'lemma' },
  { prefix: /^alg/i, kind: 'algorithm' },
  { prefix: /^cor/i, kind: 'corollary' },
  { prefix: /^prp/i, kind: 'proposition' },
  { prefix: /^def/i, kind: 'definition' },
];

const CONTENT_TYPE_KIND: Record<string, ProofKind> = {
  theorem: 'theorem',
  lemma: 'lemma',
  proof: 'proof',
  proposition: 'proposition',
  corollary: 'corollary',
  algorithm: 'algorithm',
  definition: 'definition',
  axiom: 'axiom',
  example: 'example',
  remark: 'remark',
  conjecture: 'conjecture',
  property: 'property',
  observation: 'observation',
  assumption: 'assumption',
  postulate: 'assumption',
  criterion: 'criterion',
};

export function proofKindFromDeclaredType(declaredKind: string | undefined): ProofKind | undefined {
  if (!declaredKind) return undefined;
  const key = declaredKind.trim().toLowerCase().replace(/\s+/g, '-');
  return CONTENT_TYPE_KIND[key];
}

function resolveProofCore(opts: { id?: string; labelText?: string; declaredKind?: string }): {
  kind?: ProofKind;
  enumerator?: string;
  fromLabel: ReturnType<typeof parseLabelPrefix>;
  fromDeclaredKind?: ProofKind;
  fromIdKind?: ProofKind;
  fromIdEnumerator?: string;
} {
  const fromLabel = opts.labelText ? parseLabelPrefix(opts.labelText) : {};
  const fromDeclaredKind = proofKindFromDeclaredType(opts.declaredKind);
  const fromIdKind = kindFromId(opts.id);
  const fromIdEnumerator = enumeratorFromId(opts.id);

  const kind = fromLabel.kind ?? fromDeclaredKind ?? fromIdKind;
  let enumerator = fromLabel.enumerator ?? fromIdEnumerator;

  if (fromLabel.enumerator && fromIdEnumerator && fromLabel.enumerator !== fromIdEnumerator) {
    enumerator = fromLabel.enumerator;
  }

  return {
    kind,
    enumerator,
    fromLabel,
    fromDeclaredKind,
    fromIdKind,
    fromIdEnumerator,
  };
}

type ProofCore = ReturnType<typeof resolveProofCore>;

type ProofEntity = 'Statement' | 'Proof figure';

function proofNote(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join('; ');
}

function finalizeProofResolution(opts: {
  file?: VFile;
  source: string;
  entity: ProofEntity;
  id?: string;
  labelText?: string;
  declaredKind?: string;
  declaredKindAttr?: 'content-type' | 'fig-type';
  core: ProofCore;
  kind?: ProofKind;
}): { kind?: ProofKind; enumerator?: string } {
  const { file, source, entity, core } = opts;
  const kind = opts.kind;
  let enumerator = core.enumerator;
  const declaredNote = opts.declaredKind
    ? `${opts.declaredKindAttr ?? 'content-type'}=${opts.declaredKind}`
    : undefined;

  if (core.fromLabel.unmappedPrefix) {
    jatsFileWarn(file, `${entity} label prefix has no MyST proof kind mapping`, {
      source,
      note: proofNote([
        `prefix=${core.fromLabel.unmappedPrefix}`,
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
        declaredNote,
      ]),
    });
  }

  if (!opts.labelText) {
    jatsFileWarn(file, `${entity} missing label`, {
      source,
      note: proofNote([opts.id ? `id=${opts.id}` : undefined, declaredNote]),
    });
  } else if (!enumerator) {
    jatsFileWarn(file, `Could not determine ${entity.toLowerCase()} enumerator from label or id`, {
      source,
      note: proofNote([opts.id ? `id=${opts.id}` : undefined, `label=${opts.labelText}`]),
    });
  }

  if (
    core.fromLabel.enumerator &&
    core.fromIdEnumerator &&
    core.fromLabel.enumerator !== core.fromIdEnumerator
  ) {
    jatsFileWarn(file, `${entity} id and label enumerators do not match`, {
      source,
      note: proofNote([
        `label-enumerator=${core.fromLabel.enumerator}`,
        `id-enumerator=${core.fromIdEnumerator}`,
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
      ]),
    });
    enumerator = core.fromLabel.enumerator;
  }

  if (!kind) {
    jatsFileWarn(file, `${entity} has no proof kind`, {
      source,
      note: proofNote([
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
        declaredNote,
      ]),
    });
  }

  return { kind, enumerator };
}

export function resolveProofFigure(opts: {
  id?: string;
  labelText?: string;
  figType?: string;
  file?: VFile;
}): { kind?: ProofKind; enumerator?: string } {
  const source = 'fig';
  const figKind = proofKindFromDeclaredType(opts.figType);
  const core = resolveProofCore({
    id: opts.id,
    labelText: opts.labelText,
    declaredKind: opts.figType,
  });

  let kind = figKind ?? core.kind;

  if (core.fromLabel.kind && figKind && core.fromLabel.kind !== figKind) {
    jatsFileWarn(opts.file, 'Proof figure label kind does not match fig-type', {
      source,
      note: proofNote([
        `fig-type=${opts.figType}`,
        `label-kind=${core.fromLabel.kind}`,
        opts.id ? `id=${opts.id}` : undefined,
        opts.labelText ? `label=${opts.labelText}` : undefined,
      ]),
    });
    kind = figKind;
  }

  return finalizeProofResolution({
    file: opts.file,
    source,
    entity: 'Proof figure',
    id: opts.id,
    labelText: opts.labelText,
    declaredKind: opts.figType,
    declaredKindAttr: 'fig-type',
    core,
    kind,
  });
}

/** Title source for a proof rendered from `<fig fig-type="…">`. */
export function proofTitleFromFigCaption(caption: GenericNode | undefined): {
  title?: GenericNode;
  extraCaption: GenericNode[];
} {
  if (!caption) return { extraCaption: [] };
  const captionTitle = select('title', caption) as GenericNode | undefined;
  const paragraphs = (caption.children ?? []).filter(
    (child) => child.type === 'p',
  ) as GenericNode[];
  if (captionTitle) {
    const extraCaption = (caption.children ?? []).filter(
      (child) => child !== captionTitle && child.type !== 'label',
    );
    return { title: captionTitle, extraCaption };
  }
  if (paragraphs.length === 1) {
    return { title: paragraphs[0], extraCaption: [] };
  }
  return { title: undefined, extraCaption: paragraphs };
}

function parseLabelPrefix(labelText: string): {
  kind?: ProofKind;
  enumerator?: string;
  unmappedPrefix?: string;
} {
  const trimmed = labelText.trim();
  for (const { prefix, name } of UNMAPPED_LABEL_PREFIXES) {
    if (prefix.test(trimmed)) {
      const rest = trimmed.replace(prefix, '').trim();
      return {
        kind: undefined,
        enumerator: rest ? normalizeEnumerator(rest) : undefined,
        unmappedPrefix: name,
      };
    }
  }
  for (const { prefix, kind } of LABEL_KIND_PATTERNS) {
    const match = trimmed.match(prefix);
    if (!match) continue;
    const rest = trimmed.slice(match[0].length).trim();
    return { kind, enumerator: rest ? normalizeEnumerator(rest) : undefined };
  }
  return {};
}

function kindFromId(id: string | undefined): ProofKind | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  return ID_KIND_PREFIXES.find(({ prefix }) => prefix.test(trimmed))?.kind;
}

function enumeratorFromId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  for (const { prefix } of ID_KIND_PREFIXES) {
    if (!prefix.test(trimmed)) continue;
    const rest = trimmed
      .replace(prefix, '')
      .replace(/^[-_.]+/, '')
      .trim();
    return rest ? normalizeEnumerator(rest) : undefined;
  }
  return undefined;
}

export function resolveStatementProof(opts: {
  id?: string;
  labelText?: string;
  contentType?: string;
  file?: VFile;
  source?: string;
}): { kind?: ProofKind; enumerator?: string } {
  const source = opts.source ?? 'jats-convert:statement';
  const core = resolveProofCore({
    id: opts.id,
    labelText: opts.labelText,
    declaredKind: opts.contentType,
  });

  if (opts.contentType && !core.fromDeclaredKind) {
    jatsFileWarn(opts.file, 'Unknown statement content-type', {
      source,
      note: proofNote([`content-type=${opts.contentType}`, opts.id ? `id=${opts.id}` : undefined]),
    });
  }

  if (opts.labelText && !core.kind && !core.fromLabel.unmappedPrefix) {
    jatsFileWarn(opts.file, 'Could not determine statement kind from label', {
      source,
      note: proofNote([
        opts.id ? `id=${opts.id}` : undefined,
        `label=${opts.labelText}`,
        opts.contentType ? `content-type=${opts.contentType}` : undefined,
      ]),
    });
  }

  return finalizeProofResolution({
    file: opts.file,
    source,
    entity: 'Statement',
    id: opts.id,
    labelText: opts.labelText,
    declaredKind: opts.contentType,
    declaredKindAttr: 'content-type',
    core,
    kind: core.kind,
  });
}

export const STATEMENT_METADATA_CHILDREN = [
  'abstract',
  'kwd-group',
  'subj-group',
  'attrib',
  'permissions',
] as const;

export function statementMetadataChildTypes(node: GenericNode): string[] {
  const metadata = new Set<string>(STATEMENT_METADATA_CHILDREN);
  const types = (node.children ?? [])
    .filter((child) => metadata.has(child.type))
    .map((child) => child.type);
  return [...new Set(types)];
}
