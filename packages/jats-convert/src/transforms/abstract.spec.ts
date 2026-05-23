import { describe, expect, test } from 'vitest';

import { abstractTransform, descriptionFromAbstract } from './abstract';
import { copyNode } from 'myst-common';

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

describe('abstract transform', () => {
  test('simple abstract is unchanged', async () => {
    const abstract = {
      type: 'abstract',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'My Abstract',
            },
          ],
        },
      ],
    };
    const expected = copyNode(abstract);
    abstractTransform(abstract);
    expect(abstract).toEqual(expected);
  });
  test('abstract title "abstract" is removed', async () => {
    const abstract = {
      type: 'abstract',
      children: [
        {
          type: 'title',
          children: [
            {
              type: 'text',
              value: 'Abstract',
            },
          ],
        },
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'My Abstract',
            },
          ],
        },
      ],
    };
    const expected = {
      type: 'abstract',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'My Abstract',
            },
          ],
        },
      ],
    };
    abstractTransform(abstract);
    expect(abstract).toEqual(expected);
  });
  test('abstract title is moved to paragraph', async () => {
    const abstract = {
      type: 'abstract',
      children: [
        {
          type: 'title',
          children: [
            {
              type: 'text',
              value: 'My abstract start',
            },
          ],
        },
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'and my abstract finish',
            },
          ],
        },
      ],
    };
    const expected = {
      type: 'abstract',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'My abstract start',
            },
            {
              type: 'text',
              value: ' ',
            },
            {
              type: 'text',
              value: 'and my abstract finish',
            },
          ],
        },
      ],
    };
    abstractTransform(abstract);
    expect(abstract).toEqual(expected);
  });
  test('abstract as title is converted to paragraph', async () => {
    const abstract = {
      type: 'abstract',
      children: [
        {
          type: 'title',
          children: [
            {
              type: 'text',
              value: 'My abstract start',
            },
          ],
        },
      ],
    };
    const expected = {
      type: 'abstract',
      children: [
        {
          type: 'p',
          children: [
            {
              type: 'text',
              value: 'My abstract start',
            },
          ],
        },
      ],
    };
    abstractTransform(abstract);
    expect(abstract).toEqual(expected);
  });
  test('abstract with lone section unwraps and bolds title', async () => {
    const abstract = {
      type: 'abstract',
      children: [
        {
          type: 'sec',
          children: [
            {
              type: 'title',
              children: [{ type: 'text', value: 'Key messages' }],
            },
            {
              type: 'list',
              'list-type': 'bullet',
              children: [
                {
                  type: 'list-item',
                  children: [
                    {
                      type: 'p',
                      children: [{ type: 'text', value: 'First item.' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const expected = {
      type: 'abstract',
      children: [
        {
          type: 'block',
          children: [
            {
              type: 'p',
              children: [
                {
                  type: 'bold',
                  children: [{ type: 'text', value: 'Key messages' }],
                },
              ],
            },
            {
              type: 'list',
              'list-type': 'bullet',
              children: [
                {
                  type: 'list-item',
                  children: [
                    {
                      type: 'p',
                      children: [{ type: 'text', value: 'First item.' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    abstractTransform(abstract);
    expect(abstract).toEqual(expected);
  });
});
