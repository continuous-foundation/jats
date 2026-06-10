import { describe, expect, test } from 'vitest';
import { VFile } from 'vfile';
import { Jats } from 'jats-xml';
import { jatsConvertTransform } from '../index.js';
import { select } from 'unist-util-select';

const DOCTYPE =
  '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2d1 20170631//EN" "JATS-archivearticle1.dtd">';

describe('fig handler', () => {
  test('renders caption > title without hoisting', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
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
  <body>
    <fig id="fig1">
      <caption>
        <title>Figure title</title>
        <p>Caption text</p>
      </caption>
      <graphic xlink:href="figure.png"/>
    </fig>
  </body>
</article>`;

    const vfile = new VFile();
    const { tree } = jatsConvertTransform(new Jats(xml), { vfile });

    const container = select('container[kind=figure]', tree);
    expect(container).toBeDefined();
    const caption = select('caption', container);
    expect(caption).toBeDefined();
    const titleParagraph = (caption as { children?: { type: string }[] }).children?.[0];
    expect(titleParagraph?.type).toBe('paragraph');
    expect(select('paragraph > strong', caption)).toBeDefined();
    expect(select('caption > paragraph:nth-child(2)', container)).toBeDefined();
    expect(
      vfile.messages.some((m) => m.reason?.includes('Moved figure title from caption to figure')),
    ).toBe(false);
  });
});
