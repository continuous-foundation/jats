import { describe, expect, test } from 'vitest';
import { VFile } from 'vfile';
import { Jats, repairKnownXmlDefects } from '../src';

const DOCTYPE =
  '<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2d1 20170631//EN" "JATS-archivearticle1.dtd">';

describe('repairKnownXmlDefects', () => {
  test('inserts missing space before fn-type on id=n1 footnote', () => {
    const input = '<fn id="n1"fn-type="equal"><p>x</p></fn>';
    const { xml, applied } = repairKnownXmlDefects(input);
    expect(xml).toBe('<fn id="n1" fn-type="equal"><p>x</p></fn>');
    expect(applied).toHaveLength(1);
    expect(applied[0].count).toBe(1);
  });

  test('does nothing when fragment is absent', () => {
    const input = '<fn id="n1" fn-type="equal"><p>x</p></fn>';
    const { xml, applied } = repairKnownXmlDefects(input);
    expect(xml).toBe(input);
    expect(applied).toHaveLength(0);
  });
});

describe('JATS known XML defect repairs', () => {
  test('parses malformed fn tag and warns once', () => {
    const vfile = new VFile();
    const data = `<?xml version="1.0" encoding="UTF-8"?>
${DOCTYPE}
<article><front></front><body><p><fn id="n1"fn-type="equal"><p>equal contrib</p></fn></p></body></article>`;
    const jats = new Jats(data, { vfile });
    expect(jats.tree.type).toBe('article');
    const msg = vfile.messages.find(
      (m) =>
        m.reason?.includes(
          'replaced <fn id="n1"fn-type="equal"> with <fn id="n1" fn-type="equal">',
        ),
    );
    expect(msg).toBeDefined();
    expect(msg?.fatal).toBe(false);
    expect(msg?.note).toBeUndefined();
  });
});
