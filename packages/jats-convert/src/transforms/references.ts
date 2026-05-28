import 'dotenv/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { convertPMIDs2DOIs, normalizePMID } from 'jats-fetch';
import type { Body, Reference } from 'jats-tags';
import type { GenericNode, GenericParent } from 'myst-common';
import { copyNode, liftChildren, normalizeLabel } from 'myst-common';
import type { VFile } from 'vfile';
import { select, selectAll } from 'unist-util-select';
import { Session } from 'myst-cli-utils';
import type { Options } from '../types.js';
import { jatsFileError, jatsFileWarn } from '../messages.js';
import { toText } from '../utils.js';

function cacheFolder(dir: string) {
  return path.join(dir, '_build', 'cache');
}

function pmidCacheFile(dir: string) {
  return path.join(cacheFolder(dir), 'jats-pmid-doi.json');
}

type ProcessedReference = {
  cite?: string;
  footnote?: string;
};

/**
 * Convert "note" node into "fn" node with ID
 */
function processRefNote(
  note: GenericNode,
  fnId: string,
): {
  noteId?: string;
  ref: { footnote: string };
  footnote: GenericNode;
} {
  const { identifier } = normalizeLabel(note.id) ?? {};
  const footnote = copyNode(note);
  footnote.type = 'fn';
  footnote.id = fnId;
  return { noteId: identifier, ref: { footnote: fnId }, footnote };
}

const BIBTEX_TYPE: Record<string, string> = {
  journal: 'article',
  book: 'book',
  report: 'techreport',
  confproc: 'inproceedings',
  other: 'misc',
  web: 'misc',
  webpage: 'misc',
  miscellaneous: 'misc',
  undeclared: 'misc',
  preprint: 'article',
  eprint: 'article',
  software: 'misc',
  data: 'misc',
  patent: 'misc',
  thesis: 'phdthesis',
};

type Counts = {
  dois: number;
  bibtex: number;
  unprocessed: number;
  lostRefs: string[];
  lostRefItems: string[];
};

function bibtexFromCite(
  key: string,
  cite: GenericNode,
  counts: Counts,
  file?: VFile,
  doi?: string,
) {
  let entryType = BIBTEX_TYPE[cite['publication-type']] ?? 'misc';
  if (select('part-title,chapter-title', cite)) {
    entryType = 'inbook';
  }
  const bibtexLines = [`@${entryType}{${key}`];
  const authors: string[] = [];
  const editors: string[] = [];
  let fpage: string | undefined;
  let lpage: string | undefined;
  let maybeFpage: string | undefined;
  let patentTitle = '';
  const skipped: string[] = [];
  cite.children?.forEach((child) => {
    if (child.type === 'label') return;
    if (child.type === 'pub-id') return;
    if (
      child.type === 'text' &&
      toText(child).match(/^([\s.;,:\-–()&]|p|ed|eds|in|and|st|nd|rd|th)*$/i)
    )
      return;
    if (child.type === 'article-title') {
      // This would be nicer if we did JATS -> LaTeX
      bibtexLines.push(`  title = {${toText(child)}}`);
    } else if (child.type === 'year') {
      bibtexLines.push(`  year = {${toText(child)}}`);
    } else if (child.type === 'source') {
      const field =
        entryType === 'book' ? 'title' : entryType === 'inbook' ? 'booktitle' : 'journal';
      bibtexLines.push(`  ${field} = {${toText(child)}}`);
    } else if (['part-title', 'chapter-title', 'data-title'].includes(child.type)) {
      bibtexLines.push(`  title = {${toText(child)}}`);
    } else if (child.type === 'patent') {
      // We need to improve this, there is critical patent info in text nodes...
      patentTitle = `${patentTitle}${toText(child)}`;
    } else if (child.type === 'issue') {
      bibtexLines.push(`  number = {${toText(child)}}`);
    } else if (child.type === 'volume') {
      bibtexLines.push(`  volume = {${toText(child)}}`);
    } else if (child.type === 'conf-name') {
      bibtexLines.push(`  booktitle = {${toText(child)}}`);
    } else if (child.type === 'institution') {
      bibtexLines.push(`  institution = {${toText(child)}}`);
    } else if (child.type === 'uri') {
      bibtexLines.push(`  howpublished = {\\url{${child['xlink:href']}}}`);
    } else if (child.type === 'date-in-citation') {
      if (child['content-type'] === 'access-date') {
        bibtexLines.push(`  note = {Accessed: ${toText(child)}}`);
      } else {
        bibtexLines.push(`  note = {${toText(child)}}`);
      }
    } else if (child.type === 'fpage') {
      fpage = toText(child);
    } else if (child.type === 'lpage') {
      lpage = toText(child);
    } else if (child.type === 'edition') {
      bibtexLines.push(`  edition = {${toText(child)}}`);
    } else if (child.type === 'publisher-name') {
      bibtexLines.push(`  publisher = {${toText(child)}}`);
    } else if (['publisher-loc', 'conf-loc'].includes(child.type)) {
      bibtexLines.push(`  address = {${toText(child)}}`);
    } else if (child.type === 'person-group') {
      const names = selectAll('name,string-name,collab,etal', child).map((n) => {
        if (n.type === 'etal') return 'others';
        if (n.type === 'collab') return `{${toText(n)}}`;
        if (!select('surname', n) || !select('given-names', n)) return `${toText(n)}`;
        return `${toText(select('surname', n))}, ${toText(select('given-names', n))}`;
      });
      if (child['person-group-type'] === 'editor') {
        editors.push(...names);
      } else {
        authors.push(...names);
      }
    } else if (['name', 'string-name'].includes(child.type)) {
      if (!select('surname', child) || !select('given-names', child)) {
        authors.push(`${toText(child)}`);
      } else {
        authors.push(
          `${toText(select('surname', child))}, ${toText(select('given-names', child))}`,
        );
      }
    } else if (child.type === 'collab') {
      authors.push(`{${toText(child)}}`);
    } else if (child.type === 'etal') {
      authors.push('others');
      // } else if (!['text', 'bold', 'italic', 'comment'].includes(child.type)) {
    } else if (child.type === 'text') {
      if (toText(child).match(/, [0-9]+\./)) {
        maybeFpage = toText(child).slice(2, -1);
      } else if (
        cite['publication-type'] === 'patent' &&
        toText(child).toLowerCase().includes('patent')
      ) {
        patentTitle = `${toText(child)}${patentTitle}`;
      }
    } else {
      const detail = `${key}:${child.type} -> ${toText(child)}`;
      skipped.push(detail);
      jatsFileWarn(file, 'Skipped unsupported field in bibtex conversion', {
        source: 'jats-convert:references',
        note: detail,
      });
    }
  });
  if (patentTitle && !bibtexLines.find((line) => line.startsWith('  title = ')))
    bibtexLines.push(`  title = {${patentTitle}}`);
  if (maybeFpage && !fpage) fpage = maybeFpage;
  if (fpage) {
    bibtexLines.push(`  pages = {${fpage}${lpage ? `--${lpage}` : ''}}`);
  }
  if (authors.length) {
    bibtexLines.push(`  author = {${authors.join(' and ')}}`);
  }
  if (editors.length) {
    bibtexLines.push(`  editor = {${editors.join(' and ')}}`);
  }
  if (doi) {
    bibtexLines.push(`  doi = {${doi}}`);
  }
  if (bibtexLines.length === 1) {
    counts.unprocessed += 1;
    bibtexLines.push(`  note = {${toText(cite)}}`);
  } else {
    counts.bibtex += 1;
    counts.lostRefItems.push(...skipped);
    // skipped.forEach((line) => {
    //   console.log(`  - "${line}"`);
    // });
  }
  return `${bibtexLines.join(',\n')}\n}`;
}

/**
 * Convert citation node into DOI, PMID, or bibtex entry
 */
function processRefCite(
  cite: GenericNode,
  fallbackKey: string,
  pmidCache: Record<string, string | null>,
  counts: Counts,
  file?: VFile,
  dois?: boolean,
): {
  citeId?: string;
  ref: Omit<ProcessedReference, 'footnote'>;
  bibtex?: string;
} {
  const { identifier } = normalizeLabel(cite.id) ?? {};
  const key = identifier ?? fallbackKey;
  let doi: string | undefined;
  const doiElement = select('ext-link,[pub-id-type=doi]', cite);
  if (doiElement) {
    doi = toText(doiElement);
  }
  if (!doi) {
    const doiMatch = selectAll('text', cite)
      .map((node) => toText(node).match(/10.[0-9]+\/\S+/))
      .find((match) => !!match);
    if (doiMatch) {
      doi = doiMatch[0];
    }
  }
  if (!doi) {
    const pmidElement = select('ext-link,[pub-id-type=pmid]', cite);
    if (pmidElement) {
      const pmid = normalizePMID(new Session(), toText(pmidElement));
      const cachedDoi = pmidCache[pmid];
      if (cachedDoi) {
        doi = cachedDoi;
      }
    }
  }
  if (dois && doi) {
    counts.dois += 1;
    return { citeId: identifier, ref: { cite: `https://doi.org/${doi}` } };
  }
  const bibtex = bibtexFromCite(key, cite, counts, file, doi);
  return { citeId: identifier, ref: { cite: key }, bibtex };
}

/**
 * Process a single reference
 *
 * This reference may contain multiple citations and notes. This function
 * compiles these into a lookup dictionary and lists of bibtex entries
 * and footnotes
 */
const EMPTY_REF = {
  refLookup: {} as Record<string, ProcessedReference[]>,
  footnotes: [] as GenericNode[],
  bibtexEntries: [] as string[],
};

function processRef(
  ref: GenericParent,
  pmidCache: Record<string, string | null>,
  fnCount: number,
  counts: Counts,
  file?: VFile,
  dois?: boolean,
) {
  // if it's a ref and a citation with doi
  // return { refid: [{ cit doi }], citid: [{ cit doi }] }
  // if it's a ref and a citation with pmid
  // return { refid: [{ cit pmid }], citid: [{ cit pmid }] }
  // if it's a ref and a citation with no id
  // return { refid: [{ cit key }], citid: [{ cit key }] }, [bibtex string]
  // if it's a ref and a citation that's actually a footnote
  // return { refid: [{ fn key }], citid: [{ fn key }] }, [footnote node]
  // if it's a citation with doi/pmid
  // return { citid: [{ cit doi/pmid }] }
  // if it's a citation with no id or a note
  // return { citid: [{ cit key / fn key }] }, [bibtex string / footnote node]
  // if it's a ref with multiple note/cites
  // return { refid: [{}, {}, {}, ...], citid: [{}], citid: [{}], ...}, [bibtex strings...], [footnote nodes...]
  // ref with unlabeled note and other cites — warn, still convert note to footnote
  if (ref.type !== 'ref') {
    jatsFileError(file, 'Unexpected type for reference', {
      source: 'jats-convert:references',
      note: `type=${ref.type}`,
    });
    return EMPTY_REF;
  }
  const { identifier } = normalizeLabel(ref.id) ?? {};
  if (!identifier) {
    jatsFileError(file, 'Encountered ref without id', {
      source: 'jats-convert:references',
    });
    return EMPTY_REF;
  }
  const refLookup: Record<string, ProcessedReference[]> = { [identifier]: [] };
  const footnotes: GenericNode[] = [];
  const bibtexEntries: string[] = [];
  ref.children?.forEach((child) => {
    if (['element-citation', 'mixed-citation', 'citation'].includes(child.type)) {
      if (!toText(child)) {
        jatsFileWarn(file, 'Skipped empty citation in reference', {
          source: 'jats-convert:references',
          note: `ref-id=${identifier} type=${child.type}`,
        });
        return;
      }
      const cite = processRefCite(child, identifier, pmidCache, counts, file, dois);
      refLookup[identifier].push(cite.ref);
      if (cite.citeId) refLookup[cite.citeId] = [cite.ref];
      if (cite.bibtex) bibtexEntries.push(cite.bibtex);
    } else if (child.type === 'note') {
      const noteHasLabel = child.children?.some((c) => c.type === 'label');
      const refHasCitations = ref.children?.some((c) =>
        ['element-citation', 'mixed-citation', 'citation'].includes(c.type),
      );
      if ((ref.children?.length ?? 0) > 1 && !noteHasLabel && refHasCitations) {
        jatsFileWarn(file, 'Reference has unlabeled note alongside citations', {
          source: 'jats-convert:references',
          note: `ref-id=${identifier}`,
        });
      }
      const fn = processRefNote(child, `${fnCount + footnotes.length}`);
      refLookup[identifier].push(fn.ref);
      if (fn.noteId) refLookup[fn.noteId] = [fn.ref];
      footnotes.push(fn.footnote);
    } else if (child.type !== 'label') {
      counts.lostRefs.push(child.type);
      jatsFileWarn(file, 'Unsupported child in reference', {
        source: 'jats-convert:references',
        note: `ref-id=${identifier} type=${child.type}`,
      });
    }
  });
  return { refLookup, footnotes, bibtexEntries };
}

/**
 * This takes a jats object and creates a lookup for resolving citations
 *
 * The keys in the lookup are IDs that may be referenced in citations. These
 * include both ref ids and citation ids. The values in the lookup are lists of
 * objects with either doi, bibtex keys, or footnote key. These must be a list
 * as some references hold multiple citations, and these must include footnotes
 * as sometimes footnotes are in the ref list.
 *
 * This function also writes a bibtex file if necessary and appends footnotes
 * to the jats tree.
 */
export function processJatsReferences(body: Body, references: Reference[], opts?: Options) {
  const dir = opts?.dir ?? '.';
  const bibfile = path.join(dir, 'main.bib');
  const pmidCache = opts?.pmidCache ?? {};
  let refLookup: Record<string, ProcessedReference[]> = {};
  const footnotes: GenericNode[] = [];
  const bibtexEntries: string[] = [];
  const counts: Counts = {
    dois: 0,
    bibtex: 0,
    unprocessed: 0,
    lostRefs: [],
    lostRefItems: [],
  };
  references.forEach((ref) => {
    const {
      refLookup: newRefLookup,
      footnotes: newFootnotes,
      bibtexEntries: newBibtexEntries,
    } = processRef(ref, pmidCache, footnotes.length + 1, counts, opts?.vfile, opts?.dois);
    refLookup = { ...refLookup, ...newRefLookup };
    bibtexEntries.push(...newBibtexEntries);
    footnotes.push(...newFootnotes);
  });
  if (opts?.logInfo) {
    opts.logInfo.references = {
      total: references.length,
      dois: counts.dois,
      bibtex: counts.bibtex,
      footnotes: footnotes.length,
      unprocessed: counts.unprocessed,
    };
    if (counts.lostRefs.length) {
      opts.logInfo.lostRefs = [...new Set(counts.lostRefs)];
    }
    if (counts.lostRefItems.length) {
      opts.logInfo.lostItems = counts.lostRefItems;
    }
  }
  const refKeys = [...Object.keys(refLookup)];
  refKeys.forEach((key) => {
    if (refLookup[key].length > 0) return;
    refKeys
      .filter((subKey) => {
        if (!subKey.startsWith(key)) return false;
        return subKey.slice(key.length).match(/^[a-z]$/);
      })
      .forEach((subKey) => {
        refLookup[key].push(...refLookup[subKey]);
      });
  });
  if (bibtexEntries.length && opts?.bibtex) {
    fs.writeFileSync(bibfile, bibtexEntries.join('\n\n'));
  }
  if (footnotes.length) {
    body.children.push({ type: 'fn-group', children: footnotes });
  }
  return refLookup;
}

/**
 * Generate a DOI lookup dictionary for a list of References with PubMed IDs
 *
 * This will load lookup dictionary cached on path, if available,
 * then query (and cache) NIH APIs for other PMIDs
 *
 * Returns PMID -> DOI lookup dictionary
 */
export async function getPMIDLookup(refs: Reference[], dir: string) {
  const pmids = refs
    .map((ref) => {
      const pmidElement = select('ext-link,[pub-id-type=pmid]', ref);
      return pmidElement ? toText(pmidElement) : undefined;
    })
    .filter((pmid): pmid is string => !!pmid);
  let cache = loadPMIDCache(dir);
  const pmidsToFetch = pmids.filter((pmid) => cache[pmid] === undefined);
  if (pmidsToFetch.length > 0) {
    const lookup = await convertPMIDs2DOIs(new Session(), pmidsToFetch);
    cache = { ...cache, ...lookup };
    savePMIDCache(cache, dir);
  }
  return cache;
}

function loadPMIDCache(dir: string): Record<string, string | null> {
  if (!fs.existsSync(pmidCacheFile(dir))) return {};
  return JSON.parse(fs.readFileSync(pmidCacheFile(dir)).toString());
}

function savePMIDCache(cache: Record<string, string | null>, dir: string) {
  fs.mkdirSync(cacheFolder(dir), { recursive: true });
  fs.writeFileSync(pmidCacheFile(dir), JSON.stringify(cache, null, 2));
  return JSON.parse(fs.readFileSync(pmidCacheFile(dir)).toString());
}

/**
 * Resolve cite nodes using reference lookup
 *
 * Cite node may be converted to citeGroup or footnoteReference, depending
 * on the content in the reference lookup dictionary
 */
export async function resolveJatsCitations(
  tree: GenericParent,
  refLookup: Record<string, ProcessedReference[]>,
  file?: VFile,
) {
  const citeNodes = selectAll('cite', tree) as GenericNode[];
  citeNodes.forEach((citeNode) => {
    if (!citeNode.identifier) {
      jatsFileWarn(file, 'Cite node missing identifier', {
        source: 'jats-convert:references',
      });
      return;
    }
    const resolved = refLookup[citeNode.identifier];
    if (!resolved?.length) {
      jatsFileWarn(file, 'Unresolved bibliographic citation', {
        source: 'jats-convert:references',
        note: `identifier=${citeNode.identifier}`,
      });
      return;
    }
    const children: GenericNode[] = resolved
      .filter(({ footnote }) => !!footnote)
      .map(({ footnote }) => {
        const { label, identifier } = normalizeLabel(footnote) ?? {};
        return {
          type: 'footnoteReference',
          label,
          identifier,
        };
      });
    const newCiteNodes = resolved
      .filter(({ cite }) => !!cite)
      .map(({ cite }) => {
        const { label, identifier } = normalizeLabel(cite) ?? {};
        return {
          type: 'cite',
          kind: 'parenthetical',
          label,
          identifier,
        };
      });
    if (newCiteNodes.length) {
      children.push({
        type: 'citeGroup',
        kind: 'parenthetical',
        children: newCiteNodes,
      });
    }
    citeNode.children = children;
    citeNode.type = '__remove__';
  });
  liftChildren(tree, '__remove__');
}
