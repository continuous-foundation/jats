import { describe, expect, test } from 'vitest';
import { VFile } from 'vfile';
import { Jats } from '../src';

const MINIMAL_ARTICLE = `<article><front></front><body><p>x</p></body></article>`;

const DOCTYPE =
  '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2d1 20170631//EN" "JATS-archivearticle1.dtd">';

function articleWithProlog(extraProlog: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
${extraProlog}
${MINIMAL_ARTICLE}`;
}

describe('JATS XML prolog warnings', () => {
  test('warns when dropping xml-stylesheet processing instruction', () => {
    const vfile = new VFile();
    const data = articleWithProlog('<?xml-stylesheet type="text/xsl" href="bits.xsl"?>');
    new Jats(data, { vfile });
    const msg = vfile.messages.find((m) => m.reason?.includes('processing instruction'));
    expect(msg).toBeDefined();
    expect(msg?.fatal).toBe(false);
    expect(msg?.note).toMatch(/name=xml-stylesheet/);
    expect((msg as { ruleId?: string }).ruleId).toBeTruthy();
  });

  test('warns and inserts doctype when doctype is missing', () => {
    const vfile = new VFile();
    const data = `<?xml version="1.0" encoding="UTF-8"?>
${MINIMAL_ARTICLE}`;
    const jats = new Jats(data, { vfile });
    expect(jats.tree.type).toBe('article');
    expect(vfile.messages.some((m) => m.reason?.includes('missing DOCTYPE'))).toBe(true);
  });

  test('warns for pmc-articleset wrapper', () => {
    const vfile = new VFile();
    const data = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<pmc-articleset>${MINIMAL_ARTICLE}</pmc-articleset>`;
    new Jats(data, { vfile });
    expect(vfile.messages.some((m) => m.reason?.includes('pmc-articleset'))).toBe(true);
  });

  test('omits prolog warnings when constructed without vfile', () => {
    const data = articleWithProlog('<?xml-stylesheet type="text/xsl" href="bits.xsl"?>');
    new Jats(data);
    const vfile = new VFile();
    expect(vfile.messages).toHaveLength(0);
  });
});

describe('JATS XML prolog errors', () => {
  test('throws when root is not doctype plus article', () => {
    const data = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html><body></body></html>`;
    expect(() => new Jats(data)).toThrow(
      'JATS must be structured as <!DOCTYPE><article>...</article>',
    );
  });
});
