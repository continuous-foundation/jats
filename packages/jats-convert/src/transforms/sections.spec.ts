import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { copyNode, type GenericParent } from 'myst-common';
import { sectionTransform } from './sections';

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  before: GenericParent;
  after?: GenericParent;
  titleType?: string;
};

function loadCases(file: string) {
  const testYaml = fs.readFileSync(path.join(__dirname, file)).toString();
  return (yaml.load(testYaml) as TestFile).cases;
}

describe('Section title transforms', () => {
  const cases = loadCases('sections.yml');
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))(
    '%s',
    async (_, { before, after, titleType }) => {
      if (!after) after = copyNode(before);
      sectionTransform(before, { titleType: titleType as 'heading' | 'strong' | undefined });
      expect(before).toEqual(after);
    },
  );
});
