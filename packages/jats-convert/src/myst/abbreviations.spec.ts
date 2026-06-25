import { describe, expect, test } from 'vitest';
import yaml from 'js-yaml';
import { abbreviationsFromText, mergeAbbreviations } from './abbreviations';
// Import as text so the module graph includes the fixture and `bun test --watch` re-runs on save.
import abbreviationsYml from './abbreviations.yml' with { type: 'text' };

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  text: string;
  abbreviations: Record<string, string>;
};

describe('Inline citation formatting', () => {
  const cases = (yaml.load(abbreviationsYml) as TestFile).cases;
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))(
    '%s',
    async (_, { text, abbreviations }) => {
      expect(abbreviationsFromText(text)).toEqual(abbreviations);
    },
  );
});

describe('mergeAbbreviations', () => {
  test('collapses case variants with the same expansion', () => {
    expect(mergeAbbreviations({ VRN1: 'VERNALIZATION1' }, { vrn1: 'VERNALIZATION1' })).toEqual({
      VRN1: 'VERNALIZATION1',
    });
  });

  test('keeps both keys when case variants have different expansions', () => {
    expect(
      mergeAbbreviations({ VRN1: 'VERNALIZATION1' }, { vrn1: 'variant repressor network 1' }),
    ).toEqual({
      VRN1: 'VERNALIZATION1',
      vrn1: 'variant repressor network 1',
    });
  });

  test('keeps the target value when the exact key already exists', () => {
    expect(
      mergeAbbreviations({ TR: 'total reflection' }, { TR: 'transcription' }),
    ).toEqual({ TR: 'total reflection' });
  });

  test('calls onConflict for an exact key with a different expansion', () => {
    const conflicts: { key: string; existing: string; incoming: string }[] = [];
    mergeAbbreviations({ TR: 'total reflection' }, { TR: 'transcription' }, (conflict) => {
      conflicts.push(conflict);
    });
    expect(conflicts).toEqual([
      { key: 'TR', existing: 'total reflection', incoming: 'transcription' },
    ]);
  });

  test('does not call onConflict for case-only variants with the same expansion', () => {
    const conflicts: { key: string }[] = [];
    mergeAbbreviations({ ABC: 'alphabet' }, { abc: 'alphabet' }, (conflict) => {
      conflicts.push(conflict);
    });
    expect(conflicts).toHaveLength(0);
  });

  test('adds new keys that do not case-collide with existing entries', () => {
    expect(
      mergeAbbreviations({ TR: 'total reflection' }, { PCR: 'polymerase chain reaction' }),
    ).toEqual({
      TR: 'total reflection',
      PCR: 'polymerase chain reaction',
    });
  });
});
