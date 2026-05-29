import type { GenericNode, GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import { remove } from 'unist-util-remove';
import { selectAll } from 'unist-util-select';

/**
 * Remove duplicate Data Availability title from data-availability part
 */
export function dataAvailabilityTransform(tree: GenericParent) {
  const dataAvailability = selectAll('sec[sec-type=data-availability]', tree);
  dataAvailability.forEach((node) => {
    const titles = selectAll('title', node) as GenericNode[];
    titles.forEach((title) => {
      if (toText(title).toLowerCase() === 'data availability') {
        title.type = '__delete__';
      }
    });
  });
  remove(tree, '__delete__');
}
