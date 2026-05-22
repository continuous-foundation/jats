/**
 * Every `*.yml` in this directory is loaded. Each file should have a top-level `cases` array.
 *
 * Per case:
 * - `title` (required), `source` (optional, ignored)
 * - `jats` (required): if `path.join(testsDir, jats)` is a file, that file is read; otherwise this
 *   string is XML. Full documents are detected from `<?xml`, `<!DOCTYPE`, root `<article>`, or
 *   `<pmc-articleset>` (see helpers/wrapJatsSnippet.ts). Anything else is wrapped in a minimal
 *   article (reusing existing `<body>` / `<back>` tags when present).
 * - `jats_back`: optional extra `<back>` contents only (no `<back>` tags). Not allowed when `jats`
 *   was read from a file or already contains `<back>`.
 * - `opts`: passed to jatsConvertTransform
 * - `mdast`: partial tree matched somewhere under the result. See helpers/mdastPartial.ts
 * - `frontmatter`: optional partial frontmatter matched with expect(...).toMatchObject(...)
 * - `expect_no_description`: when true, asserts `frontmatter.description` is undefined
 */
import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { Jats } from 'jats-xml';
import type { Options } from '../src/types';
import { jatsConvertTransform } from '../src';
import { prepareJatsXmlForConvert } from './helpers/wrapJatsSnippet';
import { treeContainsPartial } from './helpers/mdastPartial';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ConvertYamlCase = {
  source?: string;
  title: string;
  jats: string;
  jats_back?: string;
  mdast: unknown;
  frontmatter?: Record<string, unknown>;
  expect_no_description?: boolean;
  opts?: Options;
};

type ConvertYamlFile = {
  cases: ConvertYamlCase[];
};

function listYamlFiles(testsDir: string): string[] {
  return fs
    .readdirSync(testsDir)
    .filter((name) => name.endsWith('.yml'))
    .filter((name) => fs.statSync(path.join(testsDir, name)).isFile())
    .sort();
}

describe('JATS → mdast (YAML fixtures)', () => {
  const testsDir = __dirname;
  const yamlFiles = listYamlFiles(testsDir);

  if (yamlFiles.length === 0) {
    throw new Error(`No .yml files found in ${testsDir}`);
  }

  for (const file of yamlFiles) {
    const filePath = path.join(testsDir, file);
    const doc = yaml.load(fs.readFileSync(filePath, 'utf8')) as ConvertYamlFile;
    const cases = doc.cases ?? [];

    describe(file, () => {
      test.each(cases.map((c): [string, ConvertYamlCase] => [c.title, c]))('%s', (_, c) => {
        const xml = prepareJatsXmlForConvert(testsDir, c.jats, c.jats_back, c.title);
        const { tree, frontmatter } = jatsConvertTransform(new Jats(xml), c.opts);
        expect(
          treeContainsPartial(tree, c.mdast),
          [
            `File: ${file}`,
            `Case: ${c.title}`,
            'Expected mdast subtree not found.',
            `Expected (partial): ${JSON.stringify(c.mdast, null, 2)}`,
            `Actual tree: ${JSON.stringify(tree, null, 2)}`,
          ].join('\n'),
        ).toBe(true);
        if (c.frontmatter !== undefined) {
          expect(frontmatter).toMatchObject(c.frontmatter);
        }
        if (c.expect_no_description) {
          expect(frontmatter.description).toBeUndefined();
        }
      });
    });
  }
});
