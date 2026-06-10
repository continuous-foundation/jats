import type { GenericParent } from 'myst-common';
import { doi } from 'doi-utils';
import { isUrl } from 'myst-cli-utils';
import { selectAll } from 'unist-util-select';
import { toText } from '../utils.js';
import type { ProjectFrontmatter } from 'myst-frontmatter';

/**
 * Attempt to pull abbreviations out of tree
 *
 * This looks for parenthesized letters and tries to match them to the
 * previous words.
 */
export function abbreviationsFromTree(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
) {
  let abbreviations: Record<string, string> = {};
  const paragraphs = selectAll('paragraph', tree);
  paragraphs.forEach((paragraph) => {
    const text = toText(paragraph);
    abbreviations = {
      ...abbreviations,
      ...abbreviationsFromText(text),
    };
  });
  frontmatter.abbreviations = { ...frontmatter.abbreviations, ...abbreviations };
}

function maybeStopWord(word: string) {
  return word.length < 5;
}

/** Parenthetical text used as a literal label in quotes is not an abbreviation, e.g. test set ("Test"). */
function isQuotedParentheticalLabel(abbr: string) {
  const t = abbr.trim();
  if (!t) return false;
  const mark = /\p{Quotation_Mark}/u;
  return mark.test(t[0] ?? '') || mark.test(t[t.length - 1] ?? '');
}

type AbbrPossibility = { prev?: string; next: string[] };

function exploreAbbrPossibilities(letter: string, possibilities: AbbrPossibility[]) {
  const newPossibilities: AbbrPossibility[] = [];
  possibilities.forEach(({ prev, next }) => {
    if (prev?.includes(letter)) {
      newPossibilities.push({
        prev: prev.slice(prev.indexOf(letter) + 1),
        next,
      });
    }
    for (const [i, n] of next.entries()) {
      if (n.startsWith(letter)) {
        newPossibilities.push({
          prev: next[i].slice(1),
          next: next.slice(i + 1),
        });
      }
      if (!prev || !maybeStopWord(n)) {
        break;
      }
    }
  });
  return newPossibilities;
}

export function abbreviationsFromText(text: string): Record<string, string> {
  const abbreviations: Record<string, string> = {};
  const textList = text.split(' ');
  textList.forEach((word, index) => {
    const abbr = word.match(/^\(([^\s)]{2,})\).{0,1}/)?.[1];
    if (
      !abbr ||
      isQuotedParentheticalLabel(abbr) ||
      doi.validate(abbr.trim()) ||
      isUrl(abbr.trim())
    )
      return;
    const possibleWords: string[] = [];
    let wordIndex = index - 1;
    while (textList[wordIndex] && possibleWords.filter((w) => w.length > 4).length < abbr.length) {
      possibleWords.unshift(textList[wordIndex]);
      wordIndex--;
    }
    for (const i of Array(possibleWords.length).keys()) {
      let possibilities: AbbrPossibility[] = [
        {
          next: possibleWords.slice(i).map((w) => w.toLowerCase()),
        },
      ];
      abbr
        .split('')
        .filter((letter) => letter.match(/^[a-zA-Z]$/))
        .forEach((letter) => {
          possibilities = exploreAbbrPossibilities(letter.toLowerCase(), possibilities);
        });
      if (possibilities.filter(({ next }) => next.length === 0).length) {
        abbreviations[abbr] = possibleWords.slice(i).join(' ');
        break;
      }
    }
  });
  return abbreviations;
}
