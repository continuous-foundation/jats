import type { GenericParent } from 'myst-common';
import { doi } from 'doi-utils';
import { isUrl } from 'myst-cli-utils';
import { selectAll } from 'unist-util-select';
import { toText } from '../utils.js';
import type { ProjectFrontmatter } from 'myst-frontmatter';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';

export type AbbreviationMergeConflict = {
  key: string;
  existing: string;
  incoming: string;
};

export type FrontmatterAbbreviations = Record<string, string | null>;

export function warnAbbreviationMergeConflict(
  file: VFile | undefined,
  conflict: AbbreviationMergeConflict,
) {
  jatsFileWarn(file, 'Conflicting abbreviation expansion for same key', {
    source: 'jats-convert:abbreviations',
    note: `${conflict.key}: kept "${conflict.existing}", ignored "${conflict.incoming}"`,
  });
}

/**
 * Merge abbreviation maps. Case variants with the same expansion collapse to the
 * existing key spelling; different expansions under the same letters keep both keys.
 * Exact key collisions keep the target value and call `onConflict`.
 */
export function mergeAbbreviations(
  target: FrontmatterAbbreviations | undefined,
  incoming: Record<string, string>,
  onConflict?: (conflict: AbbreviationMergeConflict) => void,
): FrontmatterAbbreviations {
  const merged: FrontmatterAbbreviations = { ...(target ?? {}) };
  Object.entries(incoming).forEach(([key, value]) => {
    const existingKey = Object.keys(merged).find(
      (existing) => existing.toLowerCase() === key.toLowerCase(),
    );
    if (!existingKey) {
      merged[key] = value;
      return;
    }
    if (merged[existingKey] === value) {
      return;
    }
    if (existingKey === key) {
      const existing = merged[key];
      if (existing == null) {
        merged[key] = value;
        return;
      }
      onConflict?.({ key, existing, incoming: value });
      return;
    }
    merged[key] = value;
  });
  return merged;
}

/**
 * Attempt to pull abbreviations out of tree
 *
 * This looks for parenthesized letters and tries to match them to the
 * previous words.
 */
export function abbreviationsFromTree(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
  file?: VFile,
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
  frontmatter.abbreviations = mergeAbbreviations(
    frontmatter.abbreviations,
    abbreviations,
    (conflict) => warnAbbreviationMergeConflict(file, conflict),
  );
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
        const expansion = possibleWords.slice(i).join(' ');
        // Supplementary-style labels (e.g. segments (S1-S3)) are not phrase abbreviations.
        const multiWordOrHyphenated = expansion.includes(' ') || expansion.includes('-');
        if (!multiWordOrHyphenated && abbr.includes('-')) {
          continue;
        }
        if (abbr.toLowerCase() === expansion.toLowerCase()) {
          continue;
        }
        abbreviations[abbr] = expansion;
        break;
      }
    }
  });
  return abbreviations;
}
