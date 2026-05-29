import type { Plugin } from 'unified';
import type { VFile } from 'vfile';
import type { Body } from 'jats-tags';
import type { GenericNode } from 'myst-common';
import { admonitionTransform } from './admonitions.js';
import { graphicToBioRxivUrl } from './biorxiv.js';
import { sectionTransform } from './sections.js';
import { typographyTransform } from './typography.js';

export * from './abbreviations.js';
export * from './abstract.js';
export * from './admonitions.js';
export * from './biorxiv.js';
export * from './footnotes.js';
export * from './references.js';
export * from './sections.js';
export * from './typography.js';

export function basicTransformations(body: Body, file: VFile) {
  sectionTransform(body, { file });
  typographyTransform(body);
  admonitionTransform(body, file);
}

export const basicTransformationsPlugin: Plugin<[], Body, Body> = () => (body, file) => {
  basicTransformations(body, file);
};

export function journalTransforms(fullTree: GenericNode, body: Body, file?: VFile) {
  graphicToBioRxivUrl(fullTree, body, file);
}
