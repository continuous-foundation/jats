import { describe, expect, test } from 'vitest';
import type { GenericParent } from 'myst-common';
import { selectAll } from 'unist-util-select';
import { inlineCitationsTransform } from './inlineCitations';

function paragraph(children: any[]): GenericParent {
  return { type: 'root', children: [{ type: 'paragraph', children }] } as GenericParent;
}

function cite(label: string) {
  return { type: 'cite', kind: 'narrative', label, identifier: label };
}

function labels(tree: GenericParent) {
  return (selectAll('citeGroup', tree) as GenericParent[]).map((group) =>
    (group.children ?? []).map((child: any) => child.label),
  );
}

describe('inlineCitationsTransform superscripts', () => {
  test('expands a range split across superscripts with a trailing dash', () => {
    const tree = paragraph([
      { type: 'text', value: 'investigated' },
      { type: 'superscript', children: [cite('c13'), { type: 'text', value: '–' }] },
      { type: 'superscript', children: [cite('c15')] },
      { type: 'text', value: ', potentially' },
    ]);
    inlineCitationsTransform(tree, ['c13', 'c14', 'c15']);
    expect(selectAll('superscript', tree)).toHaveLength(0);
    expect(labels(tree)).toEqual([['c13', 'c14', 'c15']]);
  });

  test('merges citations when a comma is wrapped in the first superscript', () => {
    const tree = paragraph([
      { type: 'text', value: 'MEGAN ' },
      { type: 'superscript', children: [cite('c22'), { type: 'text', value: ',' }] },
      { type: 'superscript', children: [cite('c23')] },
      { type: 'text', value: ', MG-RAST' },
    ]);
    inlineCitationsTransform(tree, ['c22', 'c23']);
    expect(selectAll('superscript', tree)).toHaveLength(0);
    expect(labels(tree)).toEqual([['c22', 'c23']]);
  });

  test('still lifts a superscript wrapping a single citation', () => {
    const tree = paragraph([
      { type: 'text', value: 'shown' },
      { type: 'superscript', children: [cite('c1')] },
    ]);
    inlineCitationsTransform(tree, ['c1']);
    expect(selectAll('superscript', tree)).toHaveLength(0);
    expect(labels(tree)).toEqual([['c1']]);
  });

  test('does not lift a superscript with non-citation text', () => {
    const tree = paragraph([
      { type: 'text', value: 'value' },
      { type: 'superscript', children: [cite('c1'), { type: 'text', value: 'note' }] },
    ]);
    inlineCitationsTransform(tree, ['c1']);
    expect(selectAll('superscript', tree)).toHaveLength(1);
  });
});
