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
import { VFile } from 'vfile';
import type { Options } from '../src/types';
import { jatsConvertTransform } from '../src';
import { prepareJatsXmlForConvert } from './helpers/wrapJatsSnippet';
import { treeContainsPartial } from './helpers/mdastPartial';

// Import each fixture as text so it joins the module graph and `bun test --watch`
// re-runs when a `.yml` changes (runtime `fs.readFileSync` is invisible to the watcher).
// Keep this map in sync with the directory — the guard below fails loudly otherwise.
import abstractDescriptionYml from './abstract-description.yml' with { type: 'text' };
import abstractYml from './abstract.yml' with { type: 'text' };
import basicYml from './basic.yml' with { type: 'text' };
import boxedtextYml from './boxedtext.yml' with { type: 'text' };
import figuresYml from './figures.yml' with { type: 'text' };
import imagesYml from './images.yml' with { type: 'text' };
import mathYml from './math.yml' with { type: 'text' };
import preformatYml from './preformat.yml' with { type: 'text' };
import referencesYml from './references.yml' with { type: 'text' };
import tablesYml from './tables.yml' with { type: 'text' };
import enumeratorsYml from './enumerators.yml' with { type: 'text' };
import supplementaryYml from './supplementary.yml' with { type: 'text' };
import statementYml from './statement.yml' with { type: 'text' };
import xrefYml from './xref.yml' with { type: 'text' };

const YAML_FIXTURES: Record<string, string> = {
  'abstract-description.yml': abstractDescriptionYml,
  'abstract.yml': abstractYml,
  'basic.yml': basicYml,
  'boxedtext.yml': boxedtextYml,
  'figures.yml': figuresYml,
  'enumerators.yml': enumeratorsYml,
  'images.yml': imagesYml,
  'math.yml': mathYml,
  'preformat.yml': preformatYml,
  'references.yml': referencesYml,
  'tables.yml': tablesYml,
  'supplementary.yml': supplementaryYml,
  'statement.yml': statementYml,
  'xref.yml': xrefYml,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type ConvertYamlCase = {
  source?: string;
  title: string;
  jats: string;
  jats_back?: string;
  mdast: unknown;
  frontmatter?: Record<string, unknown>;
  expect_no_description?: boolean;
  expect_warn_contains?: string[];
  expect_no_warn_contains?: string[];
  opts?: Options;
};

type ConvertYamlFile = {
  cases: ConvertYamlCase[];
};

/** Ensure every `.yml` on disk is statically imported above (so the watcher tracks it). */
function assertFixturesInSync(testsDir: string): void {
  const onDisk = fs
    .readdirSync(testsDir)
    .filter((name) => name.endsWith('.yml'))
    .filter((name) => fs.statSync(path.join(testsDir, name)).isFile());
  const missing = onDisk.filter((name) => !(name in YAML_FIXTURES));
  if (missing.length > 0) {
    throw new Error(
      `Add these .yml fixtures to YAML_FIXTURES in convert.spec.ts (needed for --watch): ${missing.join(', ')}`,
    );
  }
}

describe('JATS → mdast (YAML fixtures)', () => {
  const testsDir = __dirname;
  assertFixturesInSync(testsDir);
  const yamlFiles = Object.keys(YAML_FIXTURES).sort();

  for (const file of yamlFiles) {
    const doc = yaml.load(YAML_FIXTURES[file]) as ConvertYamlFile;
    const cases = doc.cases ?? [];

    describe(file, () => {
      test.each(cases.map((c): [string, ConvertYamlCase] => [c.title, c]))('%s', (_, c) => {
        const xml = prepareJatsXmlForConvert(testsDir, c.jats, c.jats_back, c.title);
        const vfile = c.opts?.vfile ?? new VFile();
        const opts = { ...c.opts, vfile };
        const { tree, frontmatter } = jatsConvertTransform(new Jats(xml), opts);
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
        if (c.expect_warn_contains?.length) {
          const messages = vfile.messages
            .filter((m) => m.fatal === false)
            .map((m) => `${m.reason ?? ''}${m.note ? `: ${m.note}` : ''}`);
          for (const fragment of c.expect_warn_contains) {
            expect(
              messages.some((r) => r.includes(fragment)),
              `Expected warning containing "${fragment}"; got: ${messages.join(' | ') || '(none)'}`,
            ).toBe(true);
          }
        }
        if (c.expect_no_warn_contains?.length) {
          const messages = vfile.messages
            .filter((m) => m.fatal === false)
            .map((m) => `${m.reason ?? ''}${m.note ? `: ${m.note}` : ''}`);
          for (const fragment of c.expect_no_warn_contains) {
            expect(
              messages.some((r) => r.includes(fragment)),
              `Expected no warning containing "${fragment}"; got: ${messages.join(' | ') || '(none)'}`,
            ).toBe(false);
          }
        }
      });
    });
  }
});
