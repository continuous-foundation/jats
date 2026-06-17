import type { GenericNode, GenericParent } from 'myst-common';
import { liftChildren, toText } from 'myst-common';
import { remove } from 'unist-util-remove';
import { selectAll } from 'unist-util-select';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';
import { sectionTransform } from './sections.js';

/** Normalized titles treated as redundant section labels when multiple titles exist. */
const GENERIC_ABSTRACT_TITLES = new Set([
  'abstract',
  'abstracts',
  'summary',
  'brief summary',
  'working paper',
]);

export function normalizeAbstractTitle(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:.]+$/g, '');
}

export function isGenericAbstractTitle(text: string): boolean {
  return GENERIC_ABSTRACT_TITLES.has(normalizeAbstractTitle(text));
}

function isDirectAbstractTitle(tree: GenericParent, title: GenericNode): boolean {
  return tree.type === 'abstract' && (tree.children?.includes(title) ?? false);
}

function titleShouldDiscard(
  tree: GenericParent,
  title: GenericNode,
  titleCount: number,
  atAbstractRoot: boolean,
): boolean {
  if (atAbstractRoot && isDirectAbstractTitle(tree, title) && titleCount === 1) {
    return true;
  }
  return isGenericAbstractTitle(toText(title));
}

function boldTitleParagraph(title: GenericNode): GenericNode {
  return {
    type: 'p',
    children: [{ type: 'bold', children: title.children ?? [] }],
  };
}

/** `unist-util-remove` returns null when all children are removed but does not clear the tree. */
function removeDeletedNodes(tree: GenericParent) {
  if (remove(tree, '__delete__') === null) {
    tree.children = [];
  }
}

function firstTitle(node: GenericNode): GenericNode | undefined {
  const children = node.children ?? [];
  let index = 0;
  if (children[0]?.type === 'label') index = 1;
  const title = children[index];
  return title?.type === 'title' ? title : undefined;
}

type AbstractChildSection = {
  generic: boolean;
  label?: string;
  nodes: GenericNode[];
};

function sectionTitleLabel(section: AbstractChildSection): string | undefined {
  if (section.label) return section.label;
  const first = section.nodes[0];
  if (first?.type === 'title') return toText(first);
  if (first?.type === 'sec') {
    const title = firstTitle(first);
    return title ? toText(title) : undefined;
  }
  return undefined;
}

function partitionAbstractChildSections(children: GenericNode[]): AbstractChildSection[] {
  const sections: AbstractChildSection[] = [];
  let index = 0;
  while (index < children.length) {
    const node = children[index]!;
    if (node.type === 'sec') {
      const title = firstTitle(node);
      const generic = title != null && isGenericAbstractTitle(toText(title));
      sections.push({
        generic,
        label: generic ? toText(title) : undefined,
        nodes: [node],
      });
      index += 1;
      continue;
    }
    if (node.type === 'title') {
      const generic = isGenericAbstractTitle(toText(node));
      const nodes: GenericNode[] = [node];
      index += 1;
      while (
        index < children.length &&
        children[index]?.type !== 'title' &&
        children[index]?.type !== 'sec'
      ) {
        nodes.push(children[index]!);
        index += 1;
      }
      sections.push({ generic, label: generic ? toText(node) : undefined, nodes });
      continue;
    }
    sections.push({ generic: false, nodes: [node] });
    index += 1;
  }
  return sections;
}

/**
 * When multiple titled sections exist, move generic abstract labels (Abstract, Summary, etc.)
 * to the top so the main abstract text precedes supplementary headings.
 */
function reorderGenericAbstractSections(tree: GenericParent, file?: VFile) {
  const children = tree.children;
  if (!children || children.length < 2) return;

  const sections = partitionAbstractChildSections(children);
  const genericSections = sections.filter((section) => section.generic);
  if (genericSections.length === 0 || sections[0]?.generic) return;

  const otherSections = sections.filter((section) => !section.generic);
  tree.children = [
    ...genericSections.flatMap((section) => section.nodes),
    ...otherSections.flatMap((section) => section.nodes),
  ];

  const movedLabels = genericSections
    .map((section) => section.label)
    .filter((label): label is string => !!label);
  const otherLabels = otherSections
    .map((section) => sectionTitleLabel(section))
    .filter((label): label is string => !!label);
  let note: string | undefined;
  if (movedLabels.length) {
    const moved = movedLabels.map((label) => `"${label}"`).join(', ');
    if (otherLabels.length) {
      const before = otherLabels.map((label) => `"${label}"`).join(', ');
      note = `Moved ${moved} before ${before}`;
    } else {
      note = `Moved ${moved} to the top`;
    }
  }
  jatsFileWarn(file, 'Reordered abstract sections to place generic title first', { note });
}

/**
 * Handle sections and headers in abstract
 *
 * Drops redundant abstract titles and prevents block nesting inside the abstract.
 */
export function abstractTransform(
  tree: GenericParent,
  file?: VFile,
  atAbstractRoot = tree.type === 'abstract',
) {
  if (atAbstractRoot && tree.children?.length === 1 && tree.children[0].type === 'sec') {
    abstractTransform(tree.children[0] as GenericParent, file, false);
    return;
  }

  const titles = selectAll('title', tree) as GenericNode[];
  const titleCount = titles.length;
  if (titleCount > 1) {
    reorderGenericAbstractSections(tree, file);
  }

  titles.forEach((title) => {
    if (titleShouldDiscard(tree, title, titleCount, atAbstractRoot)) {
      title.type = '__delete__';
    }
  });
  removeDeletedNodes(tree);

  sectionTransform(tree, { file, titleType: 'strong' });
  liftChildren(tree, 'block');

  if (atAbstractRoot) {
    tree.children = tree.children?.map((child) =>
      child.type === 'title' ? boldTitleParagraph(child) : child,
    );
  }

  removeDeletedNodes(tree);
}

/**
 * Pull the first two sentences from an abstract to use as description
 *
 * The end of a sentence is defined as "<lower-case word>. <Upper-case word>"
 * This means that a name like "Mr. Smith" will not count as the end of a sentence.
 * However it also means a sentence that ends in an upper-case word (or a number)
 * will not count as a new sentence, so the description may be more than two
 * sentences.
 *
 * If the abstract is 2 sentences or less (computed as described above), the
 * entire abstract will be returned as the description.
 */
export function descriptionFromAbstract(abstract: string) {
  const noNewLineAbstract = abstract.replaceAll(/\s+/g, ' ');
  const sentenceRegex = /^(.*?\s[a-z]+\.)\s+([A-Z][A-Za-z]*,{0,1}\s.*)$/;
  const firstSentenceMatch = noNewLineAbstract.match(sentenceRegex);
  const firstSentence = firstSentenceMatch?.[1];
  const rest = firstSentenceMatch?.[2];
  if (!firstSentence || !rest) return noNewLineAbstract;
  const secondSentenceMatch = rest.match(sentenceRegex);
  const secondSentence = secondSentenceMatch?.[1];
  if (!secondSentence) return noNewLineAbstract;
  return `${firstSentence} ${secondSentence}`;
}
