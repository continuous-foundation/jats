import { describe, expect, test } from 'vitest';
import yaml from 'js-yaml';
import { abbreviationsFromText } from './abbreviations';
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
