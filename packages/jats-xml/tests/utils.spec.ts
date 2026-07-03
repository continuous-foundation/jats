import { describe, expect, it } from 'vitest';
import { normalizeSubject } from '../src/utils';

describe('normalizeSubject', () => {
  it('title-cases ALL CAPS subjects', () => {
    expect(normalizeSubject('NEUROSCIENCE')).toBe('Neuroscience');
  });

  it('replaces underscores with spaces and title-cases', () => {
    expect(normalizeSubject('Cancer_Biology')).toBe('Cancer Biology');
  });

  it('collapses extra whitespace', () => {
    expect(normalizeSubject('  cancer__biology  ')).toBe('Cancer Biology');
  });

  it('leaves already-normalized subjects unchanged', () => {
    expect(normalizeSubject('Bioengineering')).toBe('Bioengineering');
    expect(normalizeSubject('New Results')).toBe('New Results');
  });
});
