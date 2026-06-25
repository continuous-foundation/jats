import { describe, expect, it } from 'vitest';
import { VFile } from 'vfile';
import { u } from 'unist-builder';
import { defListAbbreviationTransform } from './abbreviations.js';

function bodyWith(...children: unknown[]) {
  return u('body', children);
}

describe('defListAbbreviationTransform', () => {
  it('extracts abbreviations from def-list title', () => {
    const tree = bodyWith(
      u('def-list', [
        u('title', [u('text', 'Abbreviations')]),
        u('def-item', [
          u('term', [u('text', 'TP')]),
          u('def', [u('p', [u('text', 'Temporal Priority')])]),
        ]),
        u('def-item', [
          u('term', [u('text', 'DAG')]),
          u('def', [u('p', [u('text', 'Directed Acyclic Graph')])]),
        ]),
      ]),
    );
    const frontmatter: { abbreviations?: Record<string, string> } = {};
    const file = new VFile();
    defListAbbreviationTransform(tree, frontmatter, file);

    expect(frontmatter.abbreviations).toEqual({
      TP: 'Temporal Priority',
      DAG: 'Directed Acyclic Graph',
    });
    expect(tree.children).toHaveLength(0);
    expect(file.messages).toHaveLength(0);
  });

  it('uses parent sec title and removes abbreviations-only sec', () => {
    const tree = bodyWith(
      u('sec', [
        u('label', [u('text', '7')]),
        u('title', [u('text', 'Acronyms')]),
        u('def-list', [
          u('def-item', [
            u('term', [u('text', 'ABC')]),
            u('def', [u('p', [u('text', 'Area between the curves')])]),
          ]),
        ]),
      ]),
    );
    const frontmatter: { abbreviations?: Record<string, string> } = {};
    defListAbbreviationTransform(tree, frontmatter);

    expect(frontmatter.abbreviations).toEqual({ ABC: 'Area between the curves' });
    expect(tree.children).toHaveLength(0);
  });

  it('warns for unknown titles but still converts', () => {
    const tree = bodyWith(
      u('def-list', [
        u('title', [u('text', 'Glossary')]),
        u('def-item', [
          u('term', [u('text', 'ER')]),
          u('def', [u('p', [u('text', 'Endoplasmic Reticulum')])]),
        ]),
      ]),
    );
    const frontmatter: { abbreviations?: Record<string, string> } = {};
    const file = new VFile();
    defListAbbreviationTransform(tree, frontmatter, file);

    expect(frontmatter.abbreviations).toEqual({ ER: 'Endoplasmic Reticulum' });
    expect(file.messages.some((m) => m.reason?.includes('unknown title'))).toBe(true);
    expect(file.messages[0]?.note).toBe('Glossary');
  });

  it('preserves term markup in abbreviation keys', () => {
    const tree = bodyWith(
      u('def-list', [
        u('title', [u('text', 'Abbreviations')]),
        u('def-item', [
          u('term', [u('text', 'IC'), u('sub', [u('text', '50')])]),
          u('def', [u('p', [u('text', 'Half-maximal concentration')])]),
        ]),
      ]),
    );
    const frontmatter: { abbreviations?: Record<string, string> } = {};
    defListAbbreviationTransform(tree, frontmatter);

    expect(frontmatter.abbreviations).toEqual({ IC50: 'Half-maximal concentration' });
  });
});
