import 'dotenv/config.js';
import fs from 'node:fs';
import path from 'node:path';
// import OpenAI from 'openai';
import { convertPMIDs2DOIs, normalizePMID } from 'jats-fetch';
import type { Reference } from 'jats-tags';
import type { GenericNode, GenericParent } from 'myst-common';
import { copyNode, liftChildren, normalizeLabel, toText } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { Session } from 'myst-cli-utils';
import type { Jats } from 'jats-xml';
import type { Options } from '../types.js';

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
  const noteId = note.id;
  const footnote = copyNode(note);
  footnote.type = 'fn';
  footnote.id = fnId;
  return { noteId, ref: { footnote: fnId }, footnote };
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

function bibtexFromCite(key: string, cite: GenericNode, counts: Counts) {
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
      skipped.push(`${key}:${child.type} -> ${toText(child)}`);
      // console.log(`skipped: ${child.type} @ ${key} - "${toText(child)}"`);
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
  if (bibtexLines.length === 1) {
    counts.unprocessed += 1;
    // console.log(`This needs addressing: ${key}`);
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
): {
  citeId?: string;
  ref: Omit<ProcessedReference, 'footnote'>;
  bibtex?: string;
} {
  const citeId = cite.id;
  const key = citeId ?? fallbackKey;
  const doiElement = select('ext-link,[pub-id-type=doi]', cite);
  if (doiElement) {
    counts.dois += 1;
    return { citeId, ref: { cite: `https://doi.org/${toText(doiElement)}` } };
  }
  const doiMatch = selectAll('text', cite)
    .map((node) => toText(node).match(/10.[0-9]+\/\S+/))
    .find((match) => !!match);
  if (doiMatch) {
    counts.dois += 1;
    return { citeId, ref: { cite: `https://doi.org/${doiMatch[0]}` } };
  }
  const pmidElement = select('ext-link,[pub-id-type=pmid]', cite);
  if (pmidElement) {
    const pmid = normalizePMID(new Session(), toText(pmidElement));
    if (pmidCache[pmid]) {
      counts.dois += 1;
      return { citeId, ref: { cite: `https://doi.org/${pmidCache[pmid]}` } };
    }
  }
  const bibtex = bibtexFromCite(key, cite, counts);
  return { citeId, ref: { cite: key }, bibtex };
}

/**
 * Process a single reference
 *
 * This reference may contain multiple citations and notes. This function
 * compiles these into a lookup dictionary and lists of bibtex entries
 * and footnotes
 */
function processRef(
  ref: GenericParent,
  pmidCache: Record<string, string | null>,
  fnCount: number,
  counts: Counts,
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
  // ref with unlabeled note and other cites - ignore note
  if (ref.type !== 'ref') {
    throw new Error(`Unexpected type for reference: ${ref.type}`);
  }
  if (!ref.id) {
    throw new Error(`Encountered "ref" without id`);
  }
  const refLookup: Record<string, ProcessedReference[]> = { [ref.id]: [] };
  const footnotes: GenericNode[] = [];
  const bibtexEntries: string[] = [];
  ref.children?.forEach((child) => {
    if (['element-citation', 'mixed-citation'].includes(child.type)) {
      if (!toText(child)) return;
      const cite = processRefCite(child, ref.id, pmidCache, counts);
      refLookup[ref.id].push(cite.ref);
      if (cite.citeId) refLookup[cite.citeId] = [cite.ref];
      if (cite.bibtex) bibtexEntries.push(cite.bibtex);
    } else if (child.type === 'note') {
      // Ignore notes unless they are the only child or labeled
      // if (ref.children.length === 1 || child.children?.map((c) => c.type).includes('label')) {
      const fn = processRefNote(child, `${fnCount + footnotes.length}`);
      refLookup[ref.id].push(fn.ref);
      if (fn.noteId) refLookup[fn.noteId] = [fn.ref];
      footnotes.push(fn.footnote);
      // } else {
      //   console.log(`ignoring reference note: "${toText(child)}"`);
      // }
    } else if (child.type !== 'label') {
      counts.lostRefs.push(child.type);
      // console.log(`unsupported reference item of type: ${child.type}`);
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
 * This function also (1) writes a bibtex file if necessary and appends footnotes
 * to the jats tree.
 */
export async function processJatsReferences(jats: Jats, opts?: Options) {
  const dir = opts?.dir ?? '.';
  const bibfile = path.join(dir, 'main.bib');
  // writeBibtex = typeof writeBibtex === 'boolean' ? writeBibtex : !fs.existsSync(bibfile);
  const writeBibtex = !fs.existsSync(bibfile);
  const refs = jats.references;
  let refLookup: Record<string, ProcessedReference[]> = {};
  const footnotes: GenericNode[] = [];
  const bibtexEntries: string[] = [];
  const pmidCache = await getPMIDLookup(refs, dir);
  const counts: Counts = {
    dois: 0,
    bibtex: 0,
    unprocessed: 0,
    lostRefs: [],
    lostRefItems: [],
  };
  refs.forEach((ref) => {
    const {
      refLookup: newRefLookup,
      footnotes: newFootnotes,
      bibtexEntries: newBibtexEntries,
    } = processRef(ref, pmidCache, footnotes.length + 1, counts);
    refLookup = { ...refLookup, ...newRefLookup };
    bibtexEntries.push(...newBibtexEntries);
    footnotes.push(...newFootnotes);
  });
  if (opts?.logInfo) {
    opts.logInfo.references = {
      total: refs.length,
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
  if (bibtexEntries.length && writeBibtex) {
    fs.writeFileSync(bibfile, bibtexEntries.join('\n\n'));
  }
  if (footnotes.length) {
    jats.body?.children.push({ type: 'fn-group', children: footnotes });
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
async function getPMIDLookup(refs: Reference[], dir: string) {
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
 * Resolve citations and references from JATS
 *
 * This function iterates over all the 'cite' nodes and resolves the corresponding reference.
 * It prioritizes DOIs, updating the cite nodes with those if available and discarding
 * any additional info contained in the Reference. If it cannot determine the DOI, it
 * uses OpenAI to generate a bibtex entry from the Reference.
 *
 * References not associated with a 'cite' node are ignored.
 */
export async function resolveJatsCitations(
  tree: GenericParent,
  refLookup: Record<string, ProcessedReference[]>,
) {
  const citeNodes = selectAll('cite', tree) as GenericNode[];
  citeNodes.forEach((citeNode) => {
    if (!citeNode.identifier || !refLookup[citeNode.identifier]) return;
    const children: GenericNode[] = refLookup[citeNode.identifier]
      .filter(({ footnote }) => !!footnote)
      .map(({ footnote }) => {
        const { label, identifier } = normalizeLabel(footnote) ?? {};
        return {
          type: 'footnoteReference',
          label,
          identifier,
        };
      });
    const newCiteNodes = refLookup[citeNode.identifier]
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
