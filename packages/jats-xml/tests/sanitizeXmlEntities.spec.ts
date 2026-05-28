import { describe, expect, test } from 'vitest';
import { toText } from 'myst-common';
import { VFile } from 'vfile';
import { Jats, sanitizeXmlEntities } from '../src';

const DOCTYPE =
  '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2d1 20170631//EN" "JATS-archivearticle1.dtd">';

const MINIMAL_ARTICLE = `<article><front></front><body><p>x</p></body></article>`;

describe('sanitizeXmlEntities', () => {
  test('escapes bare ampersand in text', () => {
    const { xml, escapedBareAmpersandCount } = sanitizeXmlEntities('Bill & Melinda');
    expect(xml).toBe('Bill &#38; Melinda');
    expect(escapedBareAmpersandCount).toBe(1);
  });

  test('leaves valid named and numeric entities unchanged', () => {
    const input = 'a &amp; b &ndash; c &#8211; d &#x2013; e';
    const { xml, escapedBareAmpersandCount } = sanitizeXmlEntities(input);
    expect(xml).toBe(input);
    expect(escapedBareAmpersandCount).toBe(0);
  });
});

describe('JATS XML bare ampersand handling', () => {
  test('parses article with bare ampersand in text', () => {
    const data = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<article><front></front><body><p>Bill & Melinda</p></body></article>`;
    const jats = new Jats(data);
    const p = jats.tree.children?.find((c) => c.type === 'body')?.children?.[0];
    expect(toText(p as { type: string })).toBe('Bill & Melinda');
  });

  test('warns when bare ampersands were escaped', () => {
    const vfile = new VFile();
    const data = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<article><front></front><body><p>AT&amp;T and A &amp; B</p></body></article>`;
    new Jats(data, { vfile });
    expect(vfile.messages.some((m) => m.reason?.includes('bare ampersand'))).toBe(false);

    const dirty = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<article><front></front><body><p>Bill & Melinda</p></body></article>`;
    new Jats(dirty, { vfile });
    const msg = vfile.messages.find((m) => m.reason?.includes('bare ampersand'));
    expect(msg).toBeDefined();
    expect(msg?.fatal).toBe(false);
    expect(msg?.note).toMatch(/1 bare/);
  });
});
