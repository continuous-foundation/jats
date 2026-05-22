import { describe, expect, test } from 'vitest';
import { descriptionFromAbstract } from '../src/transforms/abstract.js';

describe('descriptionFromAbstract', () => {
  test('returns first two sentences when more are present', () => {
    const abstract = 'First sentence here. Second sentence follows. Third sentence is extra.';
    expect(descriptionFromAbstract(abstract)).toBe('First sentence here. Second sentence follows.');
  });

  test('returns full text when only one sentence', () => {
    expect(descriptionFromAbstract('Only one sentence.')).toBe('Only one sentence.');
  });

  test('returns full text when only two sentences', () => {
    expect(descriptionFromAbstract('Alpha one. Beta two.')).toBe('Alpha one. Beta two.');
  });

  test('collapses whitespace', () => {
    expect(descriptionFromAbstract('First one.\n\n  Second two.\nThird three.')).toBe(
      'First one. Second two.',
    );
  });
});
