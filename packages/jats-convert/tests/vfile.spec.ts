import { describe, expect, test } from 'vitest';
import { VFile } from 'vfile';
import { Jats } from 'jats-xml';
import { jatsConvertTransform } from '../src';

const DOCTYPE =
  '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2d1 20170631//EN" "JATS-archivearticle1.dtd">';

function minimalArticle(bodyInner: string, backInner = '') {
  const back = backInner ? `<back>${backInner}</back>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<article>
  <front>
    <article-meta>
      <title-group><article-title>Test</article-title></title-group>
      <contrib-group>
        <contrib contrib-type="author">
          <name><surname>Test</surname><given-names>Author</given-names></name>
        </contrib>
      </contrib-group>
      <pub-date pub-type="epub"><day>01</day><month>01</month><year>2020</year></pub-date>
    </article-meta>
  </front>
  <body>${bodyInner}</body>
  ${back}
</article>`;
}

function warnMessages(file: VFile) {
  return file.messages.filter((m) => m.fatal === false);
}

function hasPrologWarning(file: VFile) {
  return warnMessages(file).some((m) => m.reason?.includes('processing instruction'));
}

describe('JATS convert vfile pipeline', () => {
  test('prolog warnings on shared vfile when Jats is constructed with vfile', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<?xml-stylesheet type="text/xsl" href="bits.xsl"?>
<article>
  <front>
    <article-meta>
      <title-group><article-title>Test</article-title></title-group>
    </article-meta>
  </front>
  <body><p>Hello</p></body>
</article>`;

    const vfile = new VFile();
    const jats = new Jats(xml, { vfile });
    expect(hasPrologWarning(vfile)).toBe(true);

    const { tree } = jatsConvertTransform(jats, { vfile });
    expect(tree.type).toBe('root');
    expect(warnMessages(vfile).length).toBeGreaterThan(0);
  });

  test('omits prolog warnings when Jats was constructed without vfile', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<?xml-stylesheet type="text/xsl" href="bits.xsl"?>
<article><front></front><body><p>Hi</p></body></article>`;

    const jats = new Jats(xml);
    const vfile = new VFile();
    jatsConvertTransform(jats, { vfile });
    expect(hasPrologWarning(vfile)).toBe(false);
  });

  test('records missing publication date on convert vfile', () => {
    const xml = minimalArticle('<p>x</p>').replace(
      '<pub-date pub-type="epub"><day>01</day><month>01</month><year>2020</year></pub-date>',
      '',
    );
    const vfile = new VFile();
    jatsConvertTransform(new Jats(xml), { vfile });
    expect(
      warnMessages(vfile).some((m) => m.reason === 'No publication date found in JATS'),
    ).toBe(true);
  });

  test('copies vfile messages to logInfo.messages after convert', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<?xml-stylesheet type="text/xsl" href="bits.xsl"?>
<article><front></front><body><p>Hi</p></body></article>`;

    const vfile = new VFile();
    const logInfo: Record<string, unknown> = {};
    jatsConvertTransform(new Jats(xml, { vfile }), { vfile, logInfo });

    expect(Array.isArray(logInfo.messages)).toBe(true);
    const messages = logInfo.messages as { reason: string; note?: string; fatal: boolean | null }[];
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0].reason).toBeTruthy();
    expect(messages.some((m) => m.reason.includes('processing instruction'))).toBe(true);
    expect(messages.some((m) => m.note !== undefined)).toBe(true);
  });

  test('reference warnings are recorded on vfile without aborting convert', () => {
    const xml = minimalArticle(
      '<p><xref ref-type="bibr" rid="missing">[?]</xref></p>',
      `<ref-list>
        <ref id="B1">
          <element-citation publication-type="journal">
            <article-title>Ok</article-title>
          </element-citation>
        </ref>
        <ref>
          <element-citation publication-type="journal">
            <article-title>No id</article-title>
          </element-citation>
        </ref>
      </ref-list>`,
    );

    const vfile = new VFile();
    const logInfo: Record<string, unknown> = {};
    const { tree } = jatsConvertTransform(new Jats(xml), { vfile, logInfo });

    expect(tree.type).toBe('root');
    expect(warnMessages(vfile).some((m) => m.reason === 'Encountered ref without id')).toBe(
      true,
    );
    expect(
      warnMessages(vfile).some((m) => m.reason === 'Unresolved bibliographic citation'),
    ).toBe(true);

    const logMessages = logInfo.messages as { reason: string }[];
    expect(logMessages.some((m) => m.reason === 'Encountered ref without id')).toBe(true);
  });

  test('opts.vfile is the same messages sink used by the convert plugin', () => {
    const xml = minimalArticle('<p>x</p>');
    const vfile = new VFile();
    jatsConvertTransform(new Jats(xml), { vfile });
    expect(vfile.messages).toBeDefined();
    expect(Array.isArray(vfile.messages)).toBe(true);
  });
});
