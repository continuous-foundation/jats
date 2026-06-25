import type { GenericNode, GenericParent } from 'myst-common';
import type { ProjectFrontmatter } from 'myst-frontmatter';
import { select, selectAll } from 'unist-util-select';
import type { VFile } from 'vfile';
import { remove } from 'unist-util-remove';
import { jatsFileWarn } from '../messages.js';
import { toText } from '../utils.js';
import { mergeAbbreviations, warnAbbreviationMergeConflict } from '../myst/abbreviations.js';

const KNOWN_DEF_LIST_TITLES = new Set(['abbreviations', 'acronyms']);

function normalizeListTitle(text: string): string {
  return text.trim().toLowerCase();
}

function titleFromNode(node: GenericNode): string | undefined {
  const title = select('title', node);
  const text = title ? toText(title).trim() : '';
  return text || undefined;
}

/** Prefer `<def-list><title>`, else parent `<sec><title>`. */
function defListContextTitle(defList: GenericNode, parent?: GenericParent): string | undefined {
  return titleFromNode(defList) ?? (parent?.type === 'sec' ? titleFromNode(parent) : undefined);
}

function abbreviationsFromDefList(defList: GenericNode): Record<string, string> {
  const abbreviations: Record<string, string> = {};
  selectAll('def-item', defList).forEach((item) => {
    const term = select('term', item);
    const def = select('def', item);
    if (!term || !def) return;
    const abbr = toText(term).trim();
    const expansion = toText(def).trim();
    if (!abbr || !expansion) return;
    abbreviations[abbr] = expansion;
  });
  return abbreviations;
}

function isAbbreviationsOnlySec(sec: GenericNode): boolean {
  const allowed = new Set(['label', 'title', 'def-list']);
  return (sec.children ?? []).every((child) => allowed.has(child.type));
}

function findParent(target: GenericNode, root: GenericParent): GenericParent | undefined {
  for (const child of root.children ?? []) {
    if (child === target) return root;
    if (child.children) {
      const found = findParent(target, child as GenericParent);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Convert JATS `<def-list>` items into frontmatter abbreviations.
 *
 * Known when `<def-list>` or parent `<sec>` title is "Abbreviations" or "Acronyms"
 * (case-insensitive). Other titles still convert, with a warning.
 */
export function defListAbbreviationTransform(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
  file?: VFile,
) {
  const defLists = selectAll('def-list', tree) as GenericNode[];
  const nodesToRemove = new Set<GenericNode>();

  defLists.forEach((defList) => {
    const parent = findParent(defList, tree);
    const title = defListContextTitle(defList, parent);
    const known = title ? KNOWN_DEF_LIST_TITLES.has(normalizeListTitle(title)) : false;
    const extracted = abbreviationsFromDefList(defList);

    if (Object.keys(extracted).length === 0) {
      jatsFileWarn(file, 'Could not parse def-list for abbreviations', {
        source: 'jats-convert:abbreviations',
        note: title ?? 'no title',
      });
      return;
    }

    if (!known) {
      jatsFileWarn(file, 'Converting def-list to abbreviations with unknown title', {
        source: 'jats-convert:abbreviations',
        note: title ?? 'no title',
      });
    }

    frontmatter.abbreviations = mergeAbbreviations(
      frontmatter.abbreviations,
      extracted,
      (conflict) => warnAbbreviationMergeConflict(file, conflict),
    );
    nodesToRemove.add(defList);
    if (parent?.type === 'sec' && isAbbreviationsOnlySec(parent)) {
      nodesToRemove.add(parent);
    }
  });

  nodesToRemove.forEach((node) => {
    node.type = '__delete__';
  });
  remove(tree, { cascade: false }, '__delete__');
}

/**
 * If there is a section titled abbreviations, try to move abbreviations to frontmatter
 *
 * There must be nothing else in the abbreviations section and the text must be
 * semicolon-delimited pairs of comma-separated value/definition.
 *
 * For example:
 *
 * # Abbreviations
 *
 * ACC1, acetyl-CoA carboxylase-1; BHT, butylated hydroxytoluene;
 * CER, ceramides; FASN, fatty acid synthase; FDR, false discovery rate.
 */
export function abbreviationSectionTransform(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
  file?: VFile,
) {
  const blocks = selectAll('block', tree) as GenericParent[];
  blocks.forEach((block) => {
    if (block.children?.length !== 2) return;
    if (block.children[0].type !== 'heading') return;
    if (toText(block.children[0]).toLowerCase() !== 'abbreviations') return;
    if (block.children[1].type !== 'paragraph') {
      jatsFileWarn(file, 'Could not parse Abbreviations section for frontmatter', {
        source: 'jats-convert:abbreviations',
        note: 'expected heading plus single paragraph',
      });
      return;
    }
    const abbreviations = toText(block.children[1]).replace(/\.$/, '').split(/;\s*/g);
    const entries: ([string, string] | undefined)[] = abbreviations.map((abbr) => {
      const parts = abbr.split(/[,:]\s*/g);
      if (parts.length !== 2) return undefined;
      // Spaces in abbreviation value are not allowed
      if (parts[0].match(/\s/)) return undefined;
      return [parts[0], parts[1]];
    });
    if (entries.findIndex((entry) => !entry) !== -1) {
      jatsFileWarn(file, 'Could not parse Abbreviations section for frontmatter', {
        source: 'jats-convert:abbreviations',
        note: 'invalid abbreviation entry format',
      });
      return;
    }
    const newAbbreviations = Object.fromEntries(entries as [string, string][]);
    frontmatter.abbreviations = mergeAbbreviations(
      frontmatter.abbreviations,
      newAbbreviations,
      (conflict) => warnAbbreviationMergeConflict(file, conflict),
    );
    block.type = '__delete__';
  });
  remove(tree, '__delete__');
}

/**
 * If there is a footnote that starts with "abbreviations:" try to move abbreviatons to frontmatter
 *
 */
export function abbreviationFootnoteTransform(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
  file?: VFile,
) {
  const fnDefs = selectAll('footnoteDefinition', tree) as GenericParent[];
  const fnRefs = (selectAll('footnoteReference', tree) as GenericNode[]).map(
    ({ identifier }) => identifier,
  );
  fnDefs.forEach((fnDef) => {
    if (fnDef.identifier && fnRefs.includes(fnDef.identifier)) return;
    const abbrPrefix = 'abbreviations: ';
    if (!toText(fnDef).toLowerCase().startsWith(abbrPrefix)) return;
    if (fnDef.children?.length !== 1 || fnDef.children[0].type !== 'paragraph') {
      jatsFileWarn(file, 'Could not parse abbreviations footnote for frontmatter', {
        source: 'jats-convert:abbreviations',
        note: fnDef.identifier
          ? `id=${fnDef.identifier} expected single paragraph`
          : 'expected single paragraph',
      });
      return;
    }
    const fnText = toText(fnDef.children[0]);
    const abbreviations = fnText.slice(abbrPrefix.length).replace(/\.$/, '').split(/;\s*/g);
    const entries: ([string, string] | undefined)[] = abbreviations.map((abbr) => {
      const parts = abbr.split(/[,:]\s*/g);
      if (parts.length !== 2) return undefined;
      // Spaces in abbreviation value are not allowed
      if (parts[0].match(/\s/)) return undefined;
      return [parts[0], parts[1]];
    });
    if (entries.findIndex((entry) => !entry) !== -1) {
      jatsFileWarn(file, 'Could not parse abbreviations footnote for frontmatter', {
        source: 'jats-convert:abbreviations',
        note: fnDef.identifier ? `id=${fnDef.identifier}` : undefined,
      });
      return;
    }
    const newAbbreviations = Object.fromEntries(entries as [string, string][]);
    frontmatter.abbreviations = mergeAbbreviations(
      frontmatter.abbreviations,
      newAbbreviations,
      (conflict) => warnAbbreviationMergeConflict(file, conflict),
    );
    fnDef.type = '__delete__';
  });
  remove(tree, '__delete__');
}
