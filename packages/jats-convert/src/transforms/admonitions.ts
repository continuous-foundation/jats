import type { Plugin } from 'unified';
import type { GenericParent } from 'myst-common';
import { jatsFileWarn } from '../messages.js';
import { select, selectAll } from 'unist-util-select';
import { remove } from 'unist-util-remove';
import { Tags } from 'jats-tags';
import type { VFile } from 'vfile';

type BoxedTextTitle = {
  title: GenericParent;
  nodeToReplace: GenericParent;
};

/**
 * Find the admonition title for a boxed-text.
 */
function findBoxedTextTitle(boxedText: GenericParent): BoxedTextTitle | undefined {
  const directCaption = boxedText.children?.find((child) => child.type === Tags.caption) as
    | GenericParent
    | undefined;
  if (directCaption) {
    const title = select(Tags.title, directCaption) as GenericParent | undefined;
    if (title) return { title, nodeToReplace: directCaption };
  }

  const directTitle = boxedText.children?.find((child) => child.type === Tags.title) as
    | GenericParent
    | undefined;
  if (directTitle) return { title: directTitle, nodeToReplace: directTitle };

  const secTitle = select(`${Tags.sec} > ${Tags.title}`, boxedText) as GenericParent | undefined;
  if (secTitle) return { title: secTitle, nodeToReplace: secTitle };

  const secHeading = select(`${Tags.sec} > heading`, boxedText) as GenericParent | undefined;
  if (secHeading) return { title: secHeading, nodeToReplace: secHeading };

  return undefined;
}

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
    const found = findBoxedTextTitle(boxedText);
    if (!found) {
      jatsFileWarn(file, 'Encountered boxed-text without title', {
        source: 'jats-convert:admonitions',
        node: boxedText,
      });
    } else {
      const { title, nodeToReplace } = found;
      nodeToReplace.type = 'admonitionTitle';
      nodeToReplace.children = title.children;
    }
  });
  // Delete any remaining boxed-text caption nodes
  const noCaptions = selectAll(`${Tags.boxedText} > ${Tags.caption}`, tree) as GenericParent[];
  noCaptions.forEach((caption) => {
    jatsFileWarn(file, 'Removed boxed-text caption after title extraction', {
      source: 'jats-convert:admonitions',
    });
    caption.type = '__delete__';
  });
  remove(tree, '__delete__');
}

export const admonitionPlugin: Plugin<[], GenericParent, GenericParent> = () => (tree, file) => {
  admonitionTransform(tree, file);
};
