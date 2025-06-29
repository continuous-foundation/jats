import { describe, expect, test } from 'vitest';
import fs from 'fs';
import { select } from 'unist-util-select';
import { toText } from 'myst-common';
import { Jats } from '../src';
import { Tags } from 'jats-tags';

describe('Baseprint JATS read', () => {

  test('read minimal', async () => {
    const file = 'tests/minimal_baseprint.xml';
    const data = fs.readFileSync(file).toString();
    const jats = new Jats(data);

    expect(toText(jats.articleTitle)).toBe('Some title');
    expect(toText(jats.abstract)).toBe('Some abstract.');
    expect(toText(jats.body)).toBe('Some text.');
    expect(jats.articleAuthors.length).toBe(1);
    const author = jats.articleAuthors[0];
    expect(toText(select(Tags.surname, author))).toBe('Wang');
  });

});
