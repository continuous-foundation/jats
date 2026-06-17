import { describe, expect, test } from 'vitest';

import { descriptionFromAbstract, isGenericAbstractTitle } from './abstract';

describe('description from abstract', () => {
  test('first two sentences return', async () => {
    const abstract = 'Sentence one. Sentence two. Sentence three.';
    expect(descriptionFromAbstract(abstract)).toEqual('Sentence one. Sentence two.');
  });
  test('exactly two sentences return', async () => {
    const abstract = 'Sentence one. Sentence two.';
    expect(descriptionFromAbstract(abstract)).toEqual('Sentence one. Sentence two.');
  });
  test('exactly one sentence returns', async () => {
    const abstract = 'Sentence one.';
    expect(descriptionFromAbstract(abstract)).toEqual('Sentence one.');
  });
  test('description allows name title', async () => {
    const abstract = 'Sentence about Mr. Someone now. Sentence two. Sentence three.';
    expect(descriptionFromAbstract(abstract)).toEqual(
      'Sentence about Mr. Someone now. Sentence two.',
    );
  });
  test('description allows abbreviation', async () => {
    const abstract = 'Sentence about o.n.e. or something. Sentence two. Sentence three.';
    expect(descriptionFromAbstract(abstract)).toEqual(
      'Sentence about o.n.e. or something. Sentence two.',
    );
  });
  test('sentence that ends in capital word does not split', async () => {
    const abstract = 'Sentence does not Count. Sentence two. Sentence three. Sentence four.';
    expect(descriptionFromAbstract(abstract)).toEqual(
      'Sentence does not Count. Sentence two. Sentence three.',
    );
  });
  test('new lines are ignored', async () => {
    const abstract = 'Sentence\n\n\none.\n\nSentence\ntwo.\nSentence\nthree.';
    expect(descriptionFromAbstract(abstract)).toEqual('Sentence one. Sentence two.');
  });
  test('commas do not interfere', async () => {
    const abstract = 'Sentence one. Sentence two. Sentence, three.';
    expect(descriptionFromAbstract(abstract)).toEqual('Sentence one. Sentence two.');
  });
});

describe('isGenericAbstractTitle', () => {
  test('recognizes common redundant labels', () => {
    expect(isGenericAbstractTitle('Abstract')).toBe(true);
    expect(isGenericAbstractTitle('abstract:')).toBe(true);
    expect(isGenericAbstractTitle('Summary')).toBe(true);
    expect(isGenericAbstractTitle('Brief Summary')).toBe(true);
    expect(isGenericAbstractTitle('Insight, Innovation and Integration')).toBe(false);
  });
});
