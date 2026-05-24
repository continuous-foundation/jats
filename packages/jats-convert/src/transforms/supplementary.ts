import type { Body } from 'jats-tags';
import { selectAll } from 'unist-util-select';
import { remove } from 'unist-util-remove';
import { copyNode } from '../utils.js';

/**
 * Move any supplementary-material marked as position=float to end of document
 */
export function floatToEndTransform(body: Body) {
  const floatSupplementaryMaterial = selectAll('supplementary-material[_position=float]', body);
  if (floatSupplementaryMaterial.length === 0) return;
  body.children?.push({ type: 'hr' });
  floatSupplementaryMaterial.forEach((node) => {
    const copy = copyNode(node);
    delete copy._position;
    body?.children?.push(copy);
    node.type = '__delete__';
  });
  remove(body, '__delete__');
}
