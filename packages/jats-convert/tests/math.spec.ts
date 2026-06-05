/**
 * Warnings for the image-fallback math path (`inline-formula` / `disp-formula` without
 * TeX or MathML). The math node keeps the formula content as children, and the renderer
 * assumes those children are images — so anything else (or nothing) should warn.
 */
import { describe, expect, test } from 'vitest';
import { VFile } from 'vfile';
import { Jats } from 'jats-xml';
import { jatsConvertTransform } from '../src';
import { wrapJatsFragment } from './helpers/wrapJatsSnippet';

function convert(bodyInner: string) {
  const xml = wrapJatsFragment(`<body>${bodyInner}</body>`);
  const vfile = new VFile();
  const { tree } = jatsConvertTransform(new Jats(xml), { vfile });
  return { tree, vfile };
}

function warnReasons(vfile: VFile): string[] {
  return vfile.messages.filter((m) => m.fatal === false).map((m) => m.reason ?? '');
}

function hasReason(vfile: VFile, fragment: string): boolean {
  return warnReasons(vfile).some((r) => r.includes(fragment));
}

describe('math image-fallback warnings', () => {
  test('image-only inline-formula does not warn about unexpected children', () => {
    const { vfile } = convert(
      '<p><inline-formula><alternatives><inline-graphic xlink:href="eq.gif"/></alternatives></inline-formula></p>',
    );
    expect(hasReason(vfile, 'unexpected non-image children')).toBe(false);
    expect(hasReason(vfile, 'empty math node')).toBe(false);
  });

  test('graphic-only disp-formula does not warn about unexpected children', () => {
    const { vfile } = convert('<disp-formula><graphic xlink:href="eq.gif"/></disp-formula>');
    expect(hasReason(vfile, 'unexpected non-image children')).toBe(false);
    expect(hasReason(vfile, 'empty math node')).toBe(false);
  });

  test('inline-formula with non-image content warns about unexpected children', () => {
    const { vfile } = convert('<p><inline-formula><bold>x</bold></inline-formula></p>');
    expect(hasReason(vfile, 'unexpected non-image children')).toBe(true);
    const note = vfile.messages.find((m) =>
      m.reason?.includes('unexpected non-image children'),
    )?.note;
    expect(note).toContain('strong');
  });

  test('disp-formula with non-image content warns about unexpected children', () => {
    const { vfile } = convert('<disp-formula id="e1"><bold>x</bold></disp-formula>');
    expect(hasReason(vfile, 'unexpected non-image children')).toBe(true);
    const message = vfile.messages.find((m) =>
      m.reason?.includes('unexpected non-image children'),
    );
    expect(message?.note).toContain('id=e1');
  });

  test('empty inline-formula warns about an empty math node', () => {
    const { vfile } = convert('<p>text <inline-formula></inline-formula> more</p>');
    expect(hasReason(vfile, 'empty math node')).toBe(true);
  });

  test('image-only fallback still produces a math node with the image child', () => {
    const { tree } = convert(
      '<p><inline-formula><alternatives><inline-graphic xlink:href="eq.gif"/></alternatives></inline-formula></p>',
    );
    const json = JSON.stringify(tree);
    expect(json).toContain('"type":"inlineMath"');
    expect(json).toContain('"url":"eq.gif"');
  });
});
