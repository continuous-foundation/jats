import type { GenericNode, GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import { xml2js } from 'xml-js';
import { doi } from 'doi-utils';
import type { Element, DeclarationAttributes } from 'xml-js';
import { validatePageFrontmatter, type PageFrontmatter } from 'myst-frontmatter';
import { select as unistSelect, selectAll } from 'unist-util-select';
import { Tags } from 'jats-tags';
import { findArticleId, processAffiliation, processContributor } from './utils.js';
import type {
  Front,
  Body,
  Back,
  SubArticle,
  RefList,
  Reference,
  TitleGroup,
  ArticleTitle,
  Subtitle,
  Permissions,
  PubDate,
  License,
  Abstract,
  ContribGroup,
  Contrib,
  Affiliation,
  KeywordGroup,
  Keyword,
  ArticleCategories,
  ArticleMeta,
  LinkMixin,
} from 'jats-tags';
import type { Logger } from 'myst-cli-utils';
import { tic } from 'myst-cli-utils';
import type { VFile } from 'vfile';
import { type JatsPrologWarning, recordJatsPrologWarning } from './messages.js';
import { knownXmlDefectRepairMessage, repairKnownXmlDefects } from './repairKnownXmlDefects.js';
import { sanitizeXmlEntities } from './sanitizeXmlEntities.js';
import { articleMetaOrder, tableWrapOrder } from './order.js';
import {
  serializeJatsXml,
  type SerializationOptions,
  convertToUnist,
  convertToXml,
  toDate,
} from 'jats-utils';

type Options = { log?: Logger; source?: string; vfile?: VFile };

function select<T extends GenericNode>(selector: string, node?: GenericNode): T | undefined {
  try {
    return (unistSelect(selector, node) ?? undefined) as T | undefined;
  } catch (error) {
    const nodeType = node?.type ?? '(undefined)';
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[jats-xml/select] selector="${selector}" nodeType="${nodeType}" failed: ${msg}`,
    );
  }
}

const DEFAULT_DOCTYPE =
  'article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD with MathML3 v1.3 20210610//EN" "http://jats.nlm.nih.gov/publishing/1.3/JATS-archivearticle1-3-mathml3.dtd"';

type WriteOptions = SerializationOptions & {
  bodyOnly?: boolean;
};

/**
 * Drop comments and whitespace-only text nodes introduced by xml-js when
 * `captureSpacesBetweenElements` is true (ignorable XML whitespace).
 */
function significantChildElements(elements: Element[] | undefined): Element[] | undefined {
  return elements?.filter((elem) => {
    if (elem.type === 'comment') return false;
    if (elem.type === 'text') {
      const t = String((elem as { text?: string }).text ?? '');
      if (!t.trim()) return false;
    }
    return true;
  });
}

/**
 * Drop top-level processing instructions (e.g. xml-stylesheet) from the prolog.
 * Malformed prologs such as <?version xml="1.0"?> are parsed this way by xml-js.
 */
function dropTopLevelInstructions(
  elements: Element[] | undefined,
  onInstruction?: (instruction: Element) => void,
): Element[] | undefined {
  return elements?.filter((elem) => {
    if (elem.type === 'instruction') {
      onInstruction?.(elem);
      return false;
    }
    return true;
  });
}

export class Jats {
  declaration?: DeclarationAttributes;
  doctype?: string;
  raw: Element;
  log?: Logger;
  tree: GenericParent;
  source?: string;
  /** Prolog fixes recorded when no VFile was available at parse time. */
  prologWarnings?: JatsPrologWarning[];

  constructor(data: string, opts?: Options) {
    const toc = tic();
    this.log = opts?.log;
    if (opts?.source) this.source = opts.source;
    const vfile = opts?.vfile;
    if (!vfile) this.prologWarnings = [];
    const warnProlog = (reason: string, note?: string) => {
      recordJatsPrologWarning(this.prologWarnings, vfile, reason, note);
    };
    const { xml: afterDefectRepairs, applied: defectRepairs } = repairKnownXmlDefects(data);
    defectRepairs.forEach(({ repair, count }) => {
      const reason = knownXmlDefectRepairMessage(repair.from, repair.to);
      const note = count === 1 ? undefined : `${count} occurrences`;
      warnProlog(reason, note);
    });
    const { xml: parseInput, escapedBareAmpersandCount } = sanitizeXmlEntities(afterDefectRepairs);
    if (escapedBareAmpersandCount > 0) {
      const note =
        escapedBareAmpersandCount === 1
          ? '1 bare & rewritten to &#38;'
          : `${escapedBareAmpersandCount} bare & rewritten to &#38;`;
      warnProlog('Escaped bare ampersand(s) before XML parse', note);
    }
    try {
      this.raw = xml2js(parseInput, {
        compact: false,
        // Preserve whitespace-only text nodes between elements. This is usually unnecessary except inside <preformat>.
        // convertToUnist drops these outside preformat so other content is processed independent of arbitrary xml whitespace.
        captureSpacesBetweenElements: true,
      }) as Element;
    } catch (error) {
      throw new Error('Problem parsing the JATS document, please ensure it is XML');
    }
    const { declaration, elements } = this.raw;
    this.declaration = declaration?.attributes;
    const filteredElements = dropTopLevelInstructions(
      significantChildElements(elements),
      (instruction) => {
        const name = instruction.name ?? '(unnamed)';
        const body = String(instruction.instruction ?? '').trim();
        const note = body ? `name=${name} ${body}` : `name=${name}`;
        warnProlog('Removed top-level XML processing instruction from prolog', note);
      },
    );
    if (filteredElements?.length && filteredElements[0].type !== 'doctype') {
      warnProlog('JATS is missing DOCTYPE declaration; inserted empty doctype');
      filteredElements.unshift({ type: 'doctype' });
    }
    if (
      !(
        filteredElements?.length === 2 &&
        filteredElements[0].type === 'doctype' &&
        hasSingleArticle(filteredElements[1])
      )
    ) {
      throw new Error('JATS must be structured as <!DOCTYPE><article>...</article>');
    }
    this.doctype = filteredElements[0].doctype;
    if (filteredElements[1].name === 'pmc-articleset') {
      warnProlog('JATS root is pmc-articleset wrapper', 'Using nested article element');
    }
    const converted = convertToUnist(filteredElements[1]);
    this.tree = select('article', converted) as GenericParent;
    this.log?.debug(toc('Parsed and converted JATS to unist tree in %s'));
  }

  get frontmatter(): PageFrontmatter {
    const title = this.articleTitle;
    const subtitle = this.articleSubtitle;
    const short_title = this.articleAltTitle;
    let date: string | undefined;
    // Prefer a fully-specified publication date (day/month/year).
    // If publication date is incomplete (e.g. year-only), fall back to history accepted date.
    const preferredDateNode =
      this.publicationDate ??
      this.pubHistoryPubDate ??
      this.pubHistoryAcceptedDate ??
      this.historyAcceptedDate;
    if (preferredDateNode) {
      const d = toDate(preferredDateNode);
      if (d) {
        const year = d.getUTCFullYear();
        const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = d.getUTCDate().toString().padStart(2, '0');
        date = `${year}-${month}-${day}`;
      }
    }
    const authors = this.articleAuthors?.map((auth) => {
      return processContributor(auth);
    });
    const affiliations = this.articleAffiliations?.map((aff) => {
      return processAffiliation(aff);
    });
    const keywords = this.keywords?.map((k) => toText(k)) ?? [];
    const subjectScope = this.articleCategories ?? this.front;
    const journalCollSubject = select(
      `${Tags.subjGroup}[subj-group-type="hwp-journal-coll"] ${Tags.subject}`,
      subjectScope,
    );
    const articleSubject = journalCollSubject ?? select(Tags.subject, subjectScope);
    const journalTitle = select(Tags.journalTitle, this.front);
    const license = this.license;
    let licenseString: string | null = null;
    if (license?.['xlink:href']) {
      licenseString = license['xlink:href'];
    } else if (license && select('[type=ali\\:license_ref]', license)) {
      licenseString = toText(select('[type=ali\\:license_ref]', license));
    } else if (selectAll('ext-link', license).length === 1) {
      // this should only happen if there is only one ext-link
      licenseString = (select('ext-link', license) as LinkMixin)['xlink:href'] ?? null;
    } else if (license) {
      licenseString = toText(license);
    }
    let openAccess: boolean | undefined;
    const licenseType = license?.['license-type']?.toLowerCase();
    if (licenseType && ['openaccess', 'open-access'].includes(licenseType)) {
      openAccess = true;
    } else if (licenseString?.match(/^\s*Open Access\s*This/)) {
      licenseString = licenseString.replace(/^\s*Open Access\s*/, '');
      openAccess = true;
    } else if (licenseString?.toLowerCase().startsWith('this is an open access article')) {
      openAccess = true;
    }
    const pmc = this.pmc;
    const identifiers = pmc ? { pmcid: `PMC${pmc}` } : undefined;
    const frontmatter: PageFrontmatter = validatePageFrontmatter(
      {
        title: title ? toText(title) : undefined,
        subtitle: subtitle ? toText(subtitle) : undefined,
        short_title: short_title ? toText(short_title) : undefined,
        doi: this.doi ?? undefined,
        identifiers,
        date,
        authors: authors.length ? authors : undefined,
        // editors,
        affiliations: affiliations.length ? affiliations : undefined,
        keywords: keywords.length ? keywords : undefined,
        venue: journalTitle ? { title: toText(journalTitle) } : undefined,
        subject: articleSubject ? toText(articleSubject) : undefined,
        license: licenseString ?? undefined,
        open_access: openAccess,
      },
      { property: 'frontmatter', messages: {} },
    );
    return frontmatter;
  }

  get front(): Front | undefined {
    return select<Front>(Tags.front, this.tree);
  }

  get articleMeta(): ArticleMeta | undefined {
    return select<ArticleMeta>(Tags.articleMeta, this.tree);
  }

  get permissions(): Permissions | undefined {
    return select<Permissions>(Tags.permissions, this.front);
  }

  get doi(): string | undefined {
    return doi.normalize(findArticleId(this.front, 'doi') ?? '');
  }

  get pmc(): string | undefined {
    return findArticleId(this.front, 'pmc')?.replace(/^PMC:?/, '');
  }

  get pmid(): string | undefined {
    return findArticleId(this.front, 'pmid');
  }

  get publicationDates(): PubDate[] {
    return selectAll(Tags.pubDate, this.front) as PubDate[];
  }

  get publicationDate(): PubDate | undefined {
    return this.publicationDates.find((d) => !!select(Tags.day, d));
  }

  /**
   * JATS `<history>` can include multiple `<date date-type="...">` nodes,
   * often including an "accepted" date that is a better default for project/page `date`.
   */
  get historyDates(): GenericParent[] {
    return selectAll('history date', this.articleMeta ?? this.front) as GenericParent[];
  }

  get historyAcceptedDate(): GenericParent | undefined {
    const accepted = this.historyDates.find((d) => {
      const dt = String((d as any)['date-type'] ?? '').toLowerCase();
      return dt === 'accepted' || dt === 'accept';
    });
    if (accepted && select(Tags.day, accepted)) return accepted;
    return undefined;
  }

  /**
   * Some sources store important dates under:
   * `<article-meta><pub-history><event><date date-type="...">...</date></event></pub-history>`.
   */
  get pubHistoryDates(): GenericParent[] {
    return selectAll('pub-history event date', this.articleMeta ?? this.front) as GenericParent[];
  }

  private findPubHistoryDateByType(types: string[]): GenericParent | undefined {
    const wanted = new Set(types.map((t) => t.toLowerCase()));
    const found = this.pubHistoryDates.find((d) => {
      const dt = String((d as any)['date-type'] ?? '').toLowerCase();
      return wanted.has(dt);
    });
    if (found && select(Tags.day, found)) return found;
    return undefined;
  }

  get pubHistoryPubDate(): GenericParent | undefined {
    return this.findPubHistoryDateByType(['pub', 'published', 'publication']);
  }

  get pubHistoryAcceptedDate(): GenericParent | undefined {
    return this.findPubHistoryDateByType(['accepted', 'accept']);
  }

  get license(): License | undefined {
    return select<License>(Tags.license, this.permissions);
  }

  get keywordGroup(): KeywordGroup | undefined {
    return select<KeywordGroup>(Tags.kwdGroup, this.front);
  }

  /** The first keywords */
  get keywords(): Keyword[] {
    return selectAll(Tags.kwd, this.keywordGroup) as Keyword[];
  }

  get keywordGroups(): KeywordGroup[] {
    return selectAll(Tags.kwdGroup, this.front) as KeywordGroup[];
  }

  get articleCategories(): ArticleCategories | undefined {
    return select<ArticleCategories>(Tags.articleCategories, this.front);
  }

  get titleGroup(): TitleGroup | undefined {
    return select<TitleGroup>(Tags.titleGroup, this.front);
  }

  get articleTitle(): ArticleTitle | undefined {
    return select<ArticleTitle>(Tags.articleTitle, this.titleGroup);
  }

  get articleSubtitle(): Subtitle | undefined {
    return select<Subtitle>(Tags.subtitle, this.titleGroup);
  }

  get articleAltTitle(): Subtitle | undefined {
    return select<Subtitle>(Tags.altTitle, this.titleGroup);
  }

  get abstract(): Abstract | undefined {
    return select<Abstract>(Tags.abstract, this.front);
  }

  get abstracts(): Abstract[] {
    return selectAll(Tags.abstract, this.front) as Abstract[];
  }

  get contribGroup(): ContribGroup | undefined {
    return select<ContribGroup>(Tags.contribGroup, this.front);
  }

  get contribGroups(): ContribGroup[] {
    return selectAll(Tags.contribGroup, this.front) as ContribGroup[];
  }

  get articleAuthors(): Contrib[] {
    const contribs = selectAll(Tags.contrib, {
      type: 'contribGroups',
      children: this.contribGroups,
    }) as Contrib[];
    const authors = contribs.filter((contrib) => {
      const contribType = contrib['contrib-type'];
      return !contribType || contribType === 'author';
    });
    return authors;
  }

  get articleAffiliations(): Affiliation[] {
    return selectAll(`${Tags.aff}[id]`, this.front) as Affiliation[];
  }

  get body(): Body | undefined {
    return select<Body>(Tags.body, this.tree);
  }

  get back(): Back | undefined {
    return select<Back>(Tags.back, this.tree);
  }

  get subArticles(): SubArticle[] {
    return selectAll(Tags.subArticle, this.tree) as SubArticle[];
  }

  /** First `ref-list` in back matter. */
  get refList(): RefList | undefined {
    return this.refLists[0];
  }

  /** All `ref-list` elements under `back`, in document order. */
  get refLists(): RefList[] {
    if (!this.back) return [];
    return selectAll(Tags.refList, this.back) as RefList[];
  }

  /** Every `ref` from every `ref-list` under `back`, in document order. */
  get references(): Reference[] {
    return this.refLists.flatMap((list) => selectAll(Tags.ref, list) as Reference[]);
  }

  sort() {
    if (this.articleMeta) {
      this.articleMeta.children = this.articleMeta?.children.sort(
        (a, b) =>
          articleMetaOrder.findIndex((x) => x === a.type) -
          articleMetaOrder.findIndex((x) => x === b.type),
      );
    }
    (selectAll('table-wrap', this.tree) as GenericParent[]).forEach((tw) => {
      tw.children = tw.children.sort(
        (a, b) => (tableWrapOrder[a.type] ?? -1) - (tableWrapOrder[b.type] ?? -1),
      );
    });
  }

  serialize(opts?: WriteOptions): string {
    this.sort();
    const body = convertToXml(this.tree);
    const element = opts?.bodyOnly
      ? body
      : {
          type: 'element',
          elements: [
            {
              type: 'doctype',
              doctype: this.doctype || DEFAULT_DOCTYPE,
            },
            body,
          ],
          declaration: { attributes: this.declaration ?? { version: '1.0', encoding: 'UTF-8' } },
        };

    const xml = serializeJatsXml(element, opts);
    return xml;
  }
}

function hasSingleArticle(element: Element): boolean {
  if (element.name === 'article') {
    return true;
  }
  if (element.name === 'pmc-articleset') {
    const children = significantChildElements(element.elements);
    return children?.length === 1 && children[0].name === 'article';
  }
  return false;
}
