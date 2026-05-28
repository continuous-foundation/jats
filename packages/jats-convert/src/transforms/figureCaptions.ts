import type { Plugin } from 'unified';
import type { GenericParent } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { remove } from 'unist-util-remove';
import { Tags } from 'jats-tags';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';
import { copyNode } from '../utils.js';

/**
 * Move figure > caption > titles up to the figure
 */
export function figCaptionTitleTransform(tree: GenericParent, file?: VFile) {
  const figures = selectAll(Tags.fig, tree) as GenericParent[];
  figures.forEach((figure) => {
    const captionTitle = select('caption > title', figure);
    if (!captionTitle) return;
    jatsFileWarn(file, 'Moved figure title from caption to figure', {
      source: 'jats-convert:figureCaptions',
      note: figure.id ? `id=${figure.id}` : undefined,
    });
    figure.children = [copyNode(captionTitle), ...figure.children];
    captionTitle.type = '__delete__';
  });
  remove(tree, '__delete__');
}

export const figCaptionTitlePlugin: Plugin<[], GenericParent, GenericParent> = () => (tree) => {
  figCaptionTitleTransform(tree);
};
