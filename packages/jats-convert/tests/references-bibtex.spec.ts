import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Jats } from 'jats-xml';
import { VFile } from 'vfile';
import { processJatsReferences } from '../src/transforms/references.js';

function bibtexForRef(xml: string, vfile = new VFile()): { bib: string; vfile: VFile } {
  const jats = new Jats(xml);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jats-bibtex-'));
  try {
    processJatsReferences(jats.body!, jats.references, { dir, bibtex: true, vfile });
    return { bib: fs.readFileSync(path.join(dir, 'main.bib'), 'utf8'), vfile };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function warnMessages(vfile: VFile): string[] {
  return vfile.messages
    .filter((m) => m.fatal === false)
    .flatMap((m) => [m.reason, m.note].filter((s): s is string => !!s));
}

function bibFieldCount(bib: string, field: string): number {
  return (bib.match(new RegExp(`^  ${field} = `, 'gm')) ?? []).length;
}

function hasDuplicateFieldWarning(vfile: VFile, source: string): boolean {
  return vfile.messages.some(
    (m) =>
      m.fatal === false &&
      m.reason === 'Skipped duplicate field in bibtex conversion' &&
      (m.note?.includes(`:${source} ->`) ?? false),
  );
}

const REF_WRAPPER = (citation: string) =>
  `<article><body></body><back><ref-list><ref id="r1"><label>1.</label>${citation}</ref></ref-list></back></article>`;

describe('bibtex field conversion', () => {
  test('month, page-range, series, issn, isbn', () => {
    const { bib } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <source>Journal</source>
        <year>2020</year>
        <month>June</month>
        <page-range>10-20</page-range>
        <series>Methods</series>
        <issn>1234-5678</issn>
        <isbn>978-0-123456-78-9</isbn>
      </element-citation>`),
    );
    expect(bib).toContain('month = {June}');
    expect(bib).toContain('pages = {10-20}');
    expect(bib).toContain('series = {Methods}');
    expect(bib).toContain('issn = {1234-5678}');
    expect(bib).toContain('isbn = {978-0-123456-78-9}');
  });

  test('conf-date with structured month and year', () => {
    const { bib } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <conf-name>Conf</conf-name>
        <conf-date><month>3</month><year>2019</year></conf-date>
      </element-citation>`),
    );
    expect(bib).toContain('year = {2019}');
    expect(bib).toContain('month = {3}');
  });

  test('conf-date iso-8601-date attribute', () => {
    const { bib } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <conf-date iso-8601-date="2018-11-05">November 2018</conf-date>
      </element-citation>`),
    );
    expect(bib).toContain('year = {2018}');
    expect(bib).toContain('month = {11}');
  });

  test('ext-link url (non-doi)', () => {
    const { bib } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="web">
        <article-title>Site</article-title>
        <ext-link ext-link-type="uri" xlink:href="https://example.com">Example</ext-link>
      </element-citation>`),
    );
    expect(bib).toContain('url = {https://example.com}');
  });

  test('supplement appended to title', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Main paper</article-title>
        <supplement>Table S1</supplement>
        <year>2021</year>
      </element-citation>`),
    );
    expect(bib).toContain('title = {Main paper (Table S1)}');
    expect(warnMessages(vfile).some((n) => n.includes('Supplement appended to title'))).toBe(true);
  });

  test('italic markup inside title preserves child text', () => {
    const { bib } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Foo <italic>bar</italic> baz</article-title>
        <year>2022</year>
      </element-citation>`),
    );
    expect(bib).toContain('title = {Foo bar baz}');
  });

  test('page-range skipped when fpage is present', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <year>2020</year>
        <fpage>1</fpage>
        <lpage>5</lpage>
        <page-range>99-100</page-range>
      </element-citation>`),
    );
    expect(bib).toContain('pages = {1--5}');
    expect(bib).not.toContain('99-100');
    expect(bibFieldCount(bib, 'pages')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'page-range')).toBe(true);
  });

  test('comment and conf-sponsor warn as unsupported fields', () => {
    const { vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <comment>(presented at workshop)</comment>
        <conf-sponsor>NSF</conf-sponsor>
        <year>2020</year>
      </element-citation>`),
    );
    const messages = warnMessages(vfile);
    expect(messages.some((n) => n.includes('comment ->'))).toBe(true);
    expect(messages.some((n) => n.includes('conf-sponsor ->'))).toBe(true);
  });

  test('punctuation-only comments are silently ignored', () => {
    const { vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <comment>(</comment>
        <issue>3</issue>
        <comment>)</comment>
        <comment>-</comment>
        <fpage>10</fpage>
        <comment>(</comment>
        <lpage>20</lpage>
        <comment>)</comment>
        <year>2020</year>
      </element-citation>`),
    );
    expect(warnMessages(vfile).some((n) => n.includes('comment ->'))).toBe(false);
  });

  test('bare citation text warns as unsupported field', () => {
    const { vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <year>2020</year>
        Available from publisher archive
      </element-citation>`),
    );
    expect(warnMessages(vfile).some((n) => n.includes('Available from publisher archive'))).toBe(
      true,
    );
  });

  test('bare citation text includes adjacent inline markup in warning', () => {
    const { vfile } = bibtexForRef(
      REF_WRAPPER(`<mixed-citation publication-type="journal">
        <article-title>Example</article-title>
        <year>2020</year>
        bare text <italic>with italic</italic>
      </mixed-citation>`),
    );
    expect(warnMessages(vfile).some((n) => n.includes('text -> bare text with italic'))).toBe(true);
  });

  test('punctuation-only citation text does not warn', () => {
    const { vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <year>2020</year>
        ; pp. 
      </element-citation>`),
    );
    expect(warnMessages(vfile).some((n) => n.includes(':text ->'))).toBe(false);
  });
});

describe('duplicate bibtex field prioritization', () => {
  test('year before conf-date keeps year and skips conf-date month when year not applied', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <year>2020</year>
        <conf-date iso-8601-date="2019-06-01"/>
      </element-citation>`),
    );
    expect(bib).toContain('year = {2020}');
    expect(bib).not.toContain('month = {06}');
    expect(bibFieldCount(bib, 'year')).toBe(1);
    expect(bibFieldCount(bib, 'month')).toBe(0);
    expect(hasDuplicateFieldWarning(vfile, 'conf-date')).toBe(true);
  });

  test('conf-date with rejected year also skips structured month', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <year>2020</year>
        <conf-date><month>6</month><year>2019</year></conf-date>
      </element-citation>`),
    );
    expect(bib).toContain('year = {2020}');
    expect(bib).not.toContain('month = {6}');
    expect(bibFieldCount(bib, 'month')).toBe(0);
    expect(hasDuplicateFieldWarning(vfile, 'conf-date')).toBe(true);
  });

  test('conf-date before year keeps conf-date year and warns on duplicate year', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <conf-date iso-8601-date="2019-06-01"/>
        <year>2020</year>
      </element-citation>`),
    );
    expect(bib).toContain('year = {2019}');
    expect(bib).not.toContain('year = {2020}');
    expect(bibFieldCount(bib, 'year')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'year')).toBe(true);
  });

  test('month before conf-date keeps first month', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <month>Jan</month>
        <conf-date><month>6</month><year>2019</year></conf-date>
      </element-citation>`),
    );
    expect(bib).toContain('month = {Jan}');
    expect(bib).not.toContain('month = {6}');
    expect(bibFieldCount(bib, 'month')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'conf-date')).toBe(true);
    expect(bib).toContain('year = {2019}');
  });

  test('conf-date before month keeps conf-date month and warns on duplicate month', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="confproc">
        <article-title>Talk</article-title>
        <conf-date><month>6</month></conf-date>
        <month>Jan</month>
      </element-citation>`),
    );
    expect(bib).toContain('month = {6}');
    expect(bib).not.toContain('month = {Jan}');
    expect(hasDuplicateFieldWarning(vfile, 'month')).toBe(true);
  });

  test('fpage/lpage before page-range keeps fpage and warns on duplicate page-range', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <fpage>1</fpage>
        <lpage>5</lpage>
        <page-range>99-100</page-range>
      </element-citation>`),
    );
    expect(bib).toContain('pages = {1--5}');
    expect(bibFieldCount(bib, 'pages')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'page-range')).toBe(true);
  });

  test('page-range before fpage/lpage keeps page-range and warns on duplicate fpage', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <page-range>99-100</page-range>
        <fpage>1</fpage>
        <lpage>5</lpage>
      </element-citation>`),
    );
    expect(bib).toContain('pages = {99-100}');
    expect(bib).not.toContain('pages = {1--5}');
    expect(bibFieldCount(bib, 'pages')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'fpage')).toBe(true);
  });

  test('inline page text before fpage keeps text and warns on duplicate fpage', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>, 99.
        <fpage>1</fpage>
        <lpage>5</lpage>
      </element-citation>`),
    );
    expect(bib).toContain('pages = {99}');
    expect(bib).not.toContain('pages = {1--5}');
    expect(hasDuplicateFieldWarning(vfile, 'fpage')).toBe(true);
  });

  test('fpage/lpage before inline page text keeps fpage and warns on duplicate text', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <fpage>1</fpage>
        <lpage>5</lpage>, 99.
      </element-citation>`),
    );
    expect(bib).toContain('pages = {1--5}');
    expect(bib).not.toContain('pages = {99}');
    expect(hasDuplicateFieldWarning(vfile, 'text')).toBe(true);
  });

  test('part-title before article-title keeps first title', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="inbook">
        <part-title>Chapter</part-title>
        <article-title>Article</article-title>
      </element-citation>`),
    );
    expect(bib).toContain('title = {Chapter}');
    expect(bib).not.toContain('title = {Article}');
    expect(bibFieldCount(bib, 'title')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'article-title')).toBe(true);
  });

  test('first date-in-citation note wins and warns on duplicate note', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <article-title>Example</article-title>
        <date-in-citation>note1</date-in-citation>
        <date-in-citation>note2</date-in-citation>
      </element-citation>`),
    );
    expect(bib).toContain('note = {note1}');
    expect(bib).not.toContain('note = {note2}');
    expect(bibFieldCount(bib, 'note')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'date-in-citation')).toBe(true);
  });

  test('uri before ext-link keeps first url and warns on duplicate link', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="web">
        <article-title>Site</article-title>
        <uri xlink:href="http://a.com"/>
        <ext-link ext-link-type="uri" xlink:href="http://b.com"/>
      </element-citation>`),
    );
    expect(bib).toContain('url = {http://a.com}');
    expect(bib).not.toContain('http://b.com');
    expect(bibFieldCount(bib, 'url')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'ext-link')).toBe(true);
  });

  test('ext-link before uri keeps first url and warns on duplicate link', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="web">
        <article-title>Site</article-title>
        <ext-link ext-link-type="uri" xlink:href="http://b.com"/>
        <uri xlink:href="http://a.com"/>
      </element-citation>`),
    );
    expect(bib).toContain('url = {http://b.com}');
    expect(bib).not.toContain('http://a.com');
    expect(bibFieldCount(bib, 'url')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'uri')).toBe(true);
  });

  test('source before conf-name keeps first booktitle in inbook citations', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="book">
        <part-title>Chapter</part-title>
        <source>Book proceedings</source>
        <conf-name>Conference name</conf-name>
        <year>2020</year>
      </element-citation>`),
    );
    expect(bib).toContain('booktitle = {Book proceedings}');
    expect(bib).not.toContain('booktitle = {Conference name}');
    expect(bibFieldCount(bib, 'booktitle')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'conf-name')).toBe(true);
  });

  test('supplement note fallback warns when note already set', () => {
    const { bib, vfile } = bibtexForRef(
      REF_WRAPPER(`<element-citation publication-type="journal">
        <supplement>Table S1</supplement>
        <date-in-citation>Published online</date-in-citation>
        <year>2020</year>
      </element-citation>`),
    );
    expect(bib).toContain('note = {Published online}');
    expect(bib).not.toContain('Supplement: Table S1');
    expect(bibFieldCount(bib, 'note')).toBe(1);
    expect(hasDuplicateFieldWarning(vfile, 'supplement')).toBe(true);
  });
});
