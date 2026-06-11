import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Jats } from 'jats-xml';
import { bibtexField, escapeBibtex } from '../utils.js';
import { processJatsReferences } from './references.js';

describe('escapeBibtex', () => {
  test('escapes latex special characters', () => {
    expect(escapeBibtex('$1,000')).toBe('\\$1,000');
    expect(escapeBibtex('100% done')).toBe('100\\% done');
    expect(escapeBibtex('a_b')).toBe('a\\_b');
    expect(escapeBibtex('a & b')).toBe('a \\& b');
    expect(escapeBibtex('already\\escaped')).toBe('already\\\\escaped');
  });

  test('bibtexField wraps escaped text in braces', () => {
    expect(bibtexField('$1,000')).toBe('{\\$1,000}');
  });

  test('escapeBibtex accepts JATS nodes', () => {
    expect(escapeBibtex({ type: 'text', value: '$1,000' })).toBe('\\$1,000');
    expect(bibtexField({ type: 'text', value: '$1,000' })).toBe('{\\$1,000}');
  });
});

describe('processJatsReferences bibtex', () => {
  test('collab author with dollar sign is escaped in main.bib', () => {
    const jats = new Jats(`<article><body></body><back>
      <ref-list>
      <ref id="c7">
      <mixed-citation publication-type="web">
      <collab>Welcome to the $1,000 genome: on Illumina and next-gen sequencing - Biome</collab>
      <uri xlink:href="http://biome.biomedcentral.com/welcome-to-the-1000-genome/">http://biome.biomedcentral.com/welcome-to-the-1000-genome/</uri>
      </mixed-citation>
      </ref>
      </ref-list>
      </back></article>`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jats-bibtex-'));
    try {
      processJatsReferences(jats.body, jats.references, { dir, bibtex: true });
      const bib = fs.readFileSync(path.join(dir, 'main.bib'), 'utf8');
      expect(bib).toContain('author = {{Welcome to the \\$1,000 genome');
      expect(bib).not.toMatch(/author = \{\{Welcome to the \$1,000/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
