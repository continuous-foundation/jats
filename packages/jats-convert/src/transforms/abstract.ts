import type { GenericParent } from 'myst-common';
import { liftChildren, toText } from 'myst-common';
import { remove } from 'unist-util-remove';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';
import { sectionTransform } from './sections.js';

/**
 * Handle sections and headers in abstract
 *
 * This removes "Abstract" title and prevents block nesting
 * inside the abstract.
 */
export function abstractTransform(tree: GenericParent, file?: VFile) {
  if (tree.children?.length === 1 && tree.children[0].type === 'sec') {
    abstractTransform(tree.children[0] as GenericParent, file);
    return;
  }
  sectionTransform(tree, { file, titleType: 'strong' });
  liftChildren(tree, 'block');
  const title = tree.children?.[0] as GenericParent | undefined;
  if (title?.type !== 'title') return;
  const nextNode = tree.children[1] as GenericParent | undefined;
  if (toText(title).toUpperCase().trim() === 'ABSTRACT') {
    title.type = '__delete__';
  } else if (nextNode?.type === 'p') {
    jatsFileWarn(file, 'Merged abstract title into first paragraph', {
      source: 'jats-convert:abstract',
      note: `title=${toText(title)}`,
    });
    nextNode.children = [...title.children, { type: 'text', value: ' ' }, ...nextNode.children];
    title.type = '__delete__';
  } else {
    jatsFileWarn(file, 'Converted abstract title to paragraph', {
      source: 'jats-convert:abstract',
      note: `title=${toText(title)}`,
    });
    title.type = 'p';
  }
  remove(tree, '__delete__');
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
