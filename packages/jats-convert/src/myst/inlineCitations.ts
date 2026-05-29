import { copyNode, liftChildren, normalizeLabel, type GenericParent } from 'myst-common';
import type { Cite, CiteGroup } from 'myst-spec-ext';
import { remove } from 'unist-util-remove';
import { selectAll } from 'unist-util-select';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';

/**
 * Remove cite node children
 *
 * These children should be auto-computed by MyST
 */
function removeCiteChildren(tree: GenericParent) {
  const cites = selectAll('cite', tree) as Cite[];
  cites.forEach((cite) => {
    delete cite.children;
  });
}

/**
 * Ensure all cite nodes are nested in a citeGroup
 *
 * Existing citeGroups are unchanged; standalone cite nodes
 * become citeGroups with a single child.
 *
 * This function is run to simplify further inline citation transforms
 * so we only need to worry about the citeGroup case, not the
 * standalone cite case.
 */
function allCitesToCiteGroups(tree: GenericParent) {
  const standaloneCites = selectAll(':not(citeGroup) > cite', tree) as Cite[];
  standaloneCites.forEach((node: any) => {
    const cite = copyNode(node) as Cite;
    delete node.enumerator;
    delete node.error;
    delete node.identifier;
    delete node.label;
    delete node.partial;
    delete node.prefix;
    delete node.suffix;
    const citeGroup = node as CiteGroup;
    citeGroup.type = 'citeGroup';
    citeGroup.children = [cite];
  });
}

/**
 * Ensure all citeGroups do not contain citeGroups
 *
 * This unlikely scenario may only be achieved when a JATS citation
 * that is already part of a citeGroup points to multiple references
 * and is resolved to become a citeGroup itself.
 */
function flattenNestedCiteGroups(tree: GenericParent) {
  const nestedCiteGroups = selectAll('citeGroup > citeGroup', tree) as Cite[];
  nestedCiteGroups.forEach((node: any) => {
    node.type = '__lift__';
  });
  liftChildren(tree, '__lift__');
}

/**
 * Combine adjacent citeGroups into single citeGroup
 *
 * This function applies even if the citeGroups have a different kind
 * the kind of the first will be maintained.
 */
function combineAdjacentCiteGroups(tree: GenericParent) {
  const citeGroupParents = selectAll(':has(> citeGroup)', tree) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    parent.children.forEach((child, index) => {
      if (child.type !== 'citeGroup') return;
      const nextChild = parent.children[index + 1];
      if (nextChild?.type !== 'citeGroup') return;
      nextChild.children = [...(child.children ?? []), ...(nextChild.children ?? [])];
      nextChild.kind = child.kind;
      child.type = '__delete__';
    });
  });
  remove(tree, '__delete__');
}

/**
 * Remove commas and semicolons between citeGroup nodes and combine to single citeGroup
 */
function removeCiteSeparators(tree: GenericParent) {
  const citeGroupParents = selectAll(
    ':has(> citeGroup + text + citeGroup)',
    tree,
  ) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    parent.children.forEach((child, index) => {
      if (child.type !== 'citeGroup') return;
      const textChild = parent.children[index + 1];
      if (textChild?.type !== 'text') return;
      if (!textChild.value?.match(/^\s*([,;]|[,;]{0,1}\s*(and))\s*$/)) return;
      const nextChild = parent.children[index + 2];
      if (nextChild?.type !== 'citeGroup') return;
      nextChild.children = [...(child.children ?? []), ...(nextChild.children ?? [])];
      nextChild.kind = child.kind;
      child.type = '__delete__';
      textChild.type = '__delete__';
    });
  });
  remove(tree, '__delete__');
}

/**
 * Remove parentheses surrounding citeGroup node and convert to parenthetical
 */
function removeCiteParentheses(tree: GenericParent) {
  const citeGroupParents = selectAll(':has(> text + citeGroup + text)', tree) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    parent.children.forEach((child, index) => {
      if (child.type !== 'text' || !child.value?.match(/[([]$/)) return;
      const closer = child.value[child.value.length - 1] === '(' ? ')' : ']';
      const citeChild = parent.children[index + 1];
      if (citeChild?.type !== 'citeGroup') return;
      const nextChild = parent.children[index + 2];
      if (nextChild?.type !== 'text' || nextChild.value?.[0] !== closer) return;
      child.value = child.value.slice(0, -1);
      if (!child.value) child.type = '__delete__';
      citeChild.kind = 'parenthetical';
      citeChild.children?.forEach((cite) => {
        if (cite.type === 'cite') cite.kind = 'parenthetical';
      });
      nextChild.value = nextChild.value.slice(1);
      if (!nextChild.value) nextChild.type = '__delete__';
    });
  });
  remove(tree, '__delete__');
}

/**
 * When citations are separated by a hyphen, expand to fill in all intermediate citations
 */
function expandHyphenatedCites(tree: GenericParent, referenceList: string[], file?: VFile) {
  const citeGroupParents = selectAll(
    ':has(> citeGroup + text + citeGroup)',
    tree,
  ) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    parent.children.forEach((child, index) => {
      if (child.type !== 'citeGroup') return;
      if (child.children?.length !== 1) return;
      const firstCite = child.children?.[0] as Cite;
      const textChild = parent.children[index + 1];
      if (textChild?.type !== 'text') return;
      if (!textChild.value?.match(/^\s*[–-]\s*$/)) return;
      const nextChild = parent.children[index + 2];
      if (nextChild?.type !== 'citeGroup') return;
      if (nextChild.children?.length !== 1) return;
      const lastCite = nextChild.children?.[0] as Cite;
      const firstInd = referenceList.indexOf(firstCite.label);
      const lastInd = referenceList.indexOf(lastCite.label);
      if (firstInd === -1 || lastInd === -1 || lastInd <= firstInd) {
        jatsFileWarn(file, 'Could not expand hyphenated citation range', {
          source: 'jats-convert:inlineCitations',
          note: `from=${firstCite.label ?? ''} to=${lastCite.label ?? ''}`.trim(),
        });
        return;
      }
      const allCites = referenceList.slice(firstInd, lastInd + 1).map((citeLabel): Cite => {
        const { label, identifier } = normalizeLabel(citeLabel) ?? {};
        return { type: 'cite', kind: firstCite.kind, label: label ?? citeLabel, identifier };
      });
      nextChild.children = allCites;
      nextChild.kind = child.kind;
      child.type = '__delete__';
      textChild.type = '__delete__';
    });
  });
  remove(tree, '__delete__');
}

/**
 * Remove superscript around citations
 */
function removeCiteSuperscript(tree: GenericParent) {
  const citeGroupParents = selectAll(':has(> citeGroup)', tree) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    if (parent.type !== 'superscript') return;
    if (parent.children.length !== 1) return;
    parent.type = '__lift__';
  });
  liftChildren(tree, '__lift__');
}

/**
 * Ensure there are spaces before citations
 *
 * This is a problem, for example, when citations are removed from superscript and there
 * was no space before the citation.
 */
function ensureSpaceBeforeCite(tree: GenericParent) {
  const citeGroupParents = selectAll(':has(> text + citeGroup)', tree) as GenericParent[];
  citeGroupParents.forEach((parent) => {
    parent.children.forEach((child, index) => {
      if (child.type !== 'text') return;
      const citeChild = parent.children[index + 1];
      if (citeChild?.type !== 'citeGroup') return;
      if (child.value?.match(/\s+$/)) return;
      if (child.value?.match(/[[(]$/)) return;
      child.value = `${child.value} `;
    });
  });
}

export function inlineCitationsTransform(
  tree: GenericParent,
  referenceIds: string[],
  file?: VFile,
) {
  let before = '';
  let current = JSON.stringify(tree);
  // Keep running these transforms until the tree no longer changes
  while (before !== current) {
    before = current;
    removeCiteChildren(tree);
    allCitesToCiteGroups(tree);
    flattenNestedCiteGroups(tree);
    combineAdjacentCiteGroups(tree);
    expandHyphenatedCites(tree, referenceIds, file);
    removeCiteSeparators(tree);
    removeCiteParentheses(tree);
    removeCiteSuperscript(tree);
    ensureSpaceBeforeCite(tree);
    current = JSON.stringify(tree);
  }
}
