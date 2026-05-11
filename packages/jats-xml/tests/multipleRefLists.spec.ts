import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { Jats } from '../src';

describe('Multiple ref-list under back', () => {
  test('refLists and references include supplemental ref-list', () => {
    const data = fs.readFileSync(new URL('./twoRefLists.xml', import.meta.url), 'utf8');
    const jats = new Jats(data);
    expect(jats.refLists.length).toBe(2);
    expect(jats.refList?.children?.some((c: { type?: string }) => c.type === 'title')).toBe(true);
    expect(jats.references.map((r) => r.id)).toEqual(['c1', 'sc1']);
  });
});
