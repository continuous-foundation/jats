import type { GenericNode, GenericParent } from 'myst-common';
import { copyNode } from 'myst-common';
import type { Back, Body } from 'jats-tags';
import { selectAll } from 'unist-util-select';

/**
 * Copy footnotes and sections from back into body tree
 *
 * Back is not modified.
 */
export function backToBodyTransform(body: Body, back?: Back) {
  if (!back) return;
  const backNodes = back.children?.filter((node) => {
    return ['fn-group', 'sec', 'ack', 'app-group'].includes(node.type);
  });
  if (!body?.children || backNodes.length === 0) return;
  body.children.push({ type: 'hr' }, ...copyNode(backNodes));
}

/**
 * Leave table footnotes in legend if they are not referenced anywhere
 */
export function tableFootnotesToLegend(tree: GenericParent) {
  const tableFns = selectAll('legend > footnoteDefinition', tree) as GenericNode[];
  const fnRefs = (selectAll('footnoteReference', tree) as GenericNode[]).map(
    ({ identifier }) => identifier,
  );
  tableFns.forEach((tableFn) => {
    if (tableFn.identifier && fnRefs.includes(tableFn.identifier)) return;
    tableFn.type = 'paragraph';
  });
}
