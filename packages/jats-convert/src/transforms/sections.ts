import type { Plugin } from 'unified';
import type { GenericNode, GenericParent } from 'myst-common';
import { liftChildren, toText } from 'myst-common';
import { blockNestingTransform } from 'myst-transforms';
import { select, selectAll } from 'unist-util-select';
import { remove } from 'unist-util-remove';

const SECTION_TYPES = ['sec', 'ack', 'app'];

function isSection(node: GenericNode) {
  return SECTION_TYPES.includes(node.type);
}

function liftApps(tree: GenericNode) {
  selectAll('app-group', tree).forEach((group) => {
    group.type = '__lift__';
  });
  liftChildren(tree, '__lift__');
}

function recurseSections(tree: GenericNode, depth = 1, titleType?: 'heading' | 'strong'): void {
  const sections = tree.children?.filter((n) => isSection(n));
  if (!sections || sections.length === 0) return;
  sections.forEach((sec) => {
    let firstChild = sec.children?.[0];
    // Section labels are ignored
    if (firstChild?.type === 'label') {
      firstChild.type = '__delete__';
      firstChild = sec.children?.[1];
    }
    if (firstChild?.type === 'title') {
      if (sec.type === 'ack' && toText(firstChild).toLowerCase().startsWith('ack')) {
        firstChild.type = '__delete__';
      } else if (titleType === 'strong') {
        firstChild.type = 'p';
        firstChild.children = [{ type: 'bold', children: firstChild.children }];
      } else {
        firstChild.type = 'heading';
        firstChild.id = sec.id;
        firstChild.depth = depth;
      }
    }
    if (sec.type === 'ack') sec.part = 'acknowledgments';
    if (sec.type === 'app') sec.part = 'appendix';
    sec.type = 'sec';
    recurseSections(sec, depth + 1, titleType);
  });
}

/**
 * Clean up nested sections
 *
 * - Identify sections with titles
 * - Convert those titles to headings
 * - Give headings depth value based on nesting
 * - Flatten the sections
 */
export function sectionTransform(tree: GenericParent, titleType?: 'heading' | 'strong') {
  const workTree = isSection(tree) ? { type: 'root', children: [tree] } : tree;
  liftApps(workTree);
  recurseSections(workTree, 1, titleType);
  remove(workTree, '__delete__');
  const topSections = workTree.children?.filter((n) => isSection(n));
  topSections?.forEach((sec) => {
    sec.type = 'block';
  });
  while (select('sec', workTree)) {
    liftChildren(workTree as any, 'sec');
  }
  blockNestingTransform(workTree as any);
}

export const sectionPlugin: Plugin<[], GenericParent, GenericParent> = () => (tree) => {
  sectionTransform(tree);
};
