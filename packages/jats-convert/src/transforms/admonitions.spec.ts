import { VFile } from 'vfile';
import { describe, expect, test } from 'vitest';
import type { GenericParent } from 'myst-common';
import { admonitionTransform } from './admonitions';

describe('admonitionTransform', () => {
  test('caption title is moved to admonition title', () => {
    const vfile = new VFile();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'caption',
              children: [
                {
                  type: 'title',
                  children: [
                    {
                      type: 'text',
                      value: 'My Title',
                    },
                  ],
                },
              ],
            },
            {
              type: 'text',
              value: 'My content',
            },
          ],
        },
      ],
    };
    const result = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'admonitionTitle',
              children: [
                {
                  type: 'text',
                  value: 'My Title',
                },
              ],
            },
            {
              type: 'text',
              value: 'My content',
            },
          ],
        },
      ],
    };
    admonitionTransform(tree, vfile);
    expect(tree).toEqual(result);
  });
  test('direct title is moved to admonition title', () => {
    const vfile = new VFile();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'title',
              children: [{ type: 'text', value: 'Direct title' }],
            },
            {
              type: 'p',
              children: [{ type: 'text', value: 'Box content' }],
            },
          ],
        },
      ],
    };
    admonitionTransform(tree, vfile);
    expect(vfile.messages).toHaveLength(0);
    expect((tree.children[0] as GenericParent).children?.[0]).toMatchObject({
      type: 'admonitionTitle',
      children: [{ type: 'text', value: 'Direct title' }],
    });
  });
  test('caption with no title is lost', () => {
    const vfile = new VFile();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'caption',
              children: [
                {
                  type: 'text',
                  value: 'My Title',
                },
              ],
            },
            {
              type: 'text',
              value: 'My content',
            },
          ],
        },
      ],
    };
    const result = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'text',
              value: 'My content',
            },
          ],
        },
      ],
    };
    admonitionTransform(tree, vfile);
    expect(tree).toEqual(result);
  });
  test('sec title is used when nested figure caption has no title', () => {
    const vfile = new VFile();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'sec',
              children: [
                {
                  type: 'label',
                  children: [{ type: 'text', value: 'Box 1.' }],
                },
                {
                  type: 'title',
                  children: [{ type: 'text', value: 'Box title' }],
                },
                {
                  type: 'p',
                  children: [
                    {
                      type: 'fig',
                      children: [
                        {
                          type: 'caption',
                          children: [
                            {
                              type: 'p',
                              children: [{ type: 'text', value: 'Figure caption' }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    admonitionTransform(tree, vfile);
    expect(vfile.messages).toHaveLength(0);
    expect((tree.children[0] as GenericParent).children?.[0]?.children?.[1]).toMatchObject({
      type: 'admonitionTitle',
      children: [{ type: 'text', value: 'Box title' }],
    });
  });
  test('sec heading is used when section transform already ran', () => {
    const vfile = new VFile();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'boxed-text',
          children: [
            {
              type: 'sec',
              children: [
                {
                  type: 'heading',
                  depth: 1,
                  children: [{ type: 'text', value: 'Section heading' }],
                },
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'Box content' }],
                },
              ],
            },
          ],
        },
      ],
    };
    admonitionTransform(tree, vfile);
    expect(vfile.messages).toHaveLength(0);
    expect((tree.children[0] as GenericParent).children?.[0]?.children?.[0]).toMatchObject({
      type: 'admonitionTitle',
      children: [{ type: 'text', value: 'Section heading' }],
    });
  });
});
