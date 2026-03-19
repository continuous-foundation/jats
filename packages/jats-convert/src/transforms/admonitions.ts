import type { Plugin } from 'unified';
import type { GenericParent } from 'myst-common';
import { RuleId, fileWarn } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { remove } from 'unist-util-remove';
import { Tags } from 'jats-tags';
import type { VFile } from 'vfile';

/**
 * Convert boxed-text caption to admonitionTitle (with content from caption > title)
 *
 * If boxed-text caption does not have a title, warn.
 *
 * After converting, delete any remaining boxed-text captions.
 *
 * If there are no caption nodes but there is a title node, use that as the admonition title.
 */
export function admonitionTransform(tree: GenericParent, file: VFile) {
  const boxedTexts = selectAll(Tags.boxedText, tree) as GenericParent[];
  boxedTexts.forEach((boxedText) => {
    const caption = select(`${Tags.caption}`, boxedText) as GenericParent;
    const title = caption
      ? (select(Tags.title, caption) as GenericParent)
      : (select(Tags.title, boxedText) as GenericParent);
    if (!title) {
      fileWarn(file, 'Encountered boxed-text without title', {
        node: boxedText,
        ruleId: RuleId.jatsParses,
      });
    } else {
      const nodeToReplace = caption ?? title;
      nodeToReplace.type = 'admonitionTitle';
      nodeToReplace.children = title.children;
    }
  });
  // Delete any remaining boxed-text caption nodes
  const noCaptions = selectAll(`${Tags.boxedText} > ${Tags.caption}`, tree) as GenericParent[];
  noCaptions.forEach((caption) => {
    caption.type = '__delete__';
  });
  remove(tree, '__delete__');
}

export const admonitionPlugin: Plugin<[], GenericParent, GenericParent> = () => (tree, file) => {
  admonitionTransform(tree, file);
};
