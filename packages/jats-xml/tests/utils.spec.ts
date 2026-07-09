import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { Jats } from '../src';
import {
  buildCorrespEmailLookup,
  normalizeSubject,
  processContributor,
  processContributors,
  type CorrespEmailState,
} from '../src/utils';

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

describe('corresponding author email', () => {
  const correspXml = `<article><front>
    <contrib-group>
      <contrib contrib-type="author" corresp="yes">
        <name><surname>Gradinaru</surname><given-names>Viviana</given-names></name>
        <xref ref-type="corresp" rid="cor1">*</xref>
      </contrib>
    </contrib-group>
    <author-notes>
      <corresp id="cor1"><label>*</label>Correspondence: <email>viviana@caltech.edu</email></corresp>
    </author-notes>
  </front></article>`;

  it('buildCorrespEmailLookup maps corresp id to emails in order', () => {
    const jats = new Jats(correspXml);
    expect(buildCorrespEmailLookup(jats.front)).toEqual({
      cor1: ['viviana@caltech.edu'],
    });
  });

  it('processContributor resolves email from corresp xref', () => {
    const jats = new Jats(correspXml);
    const correspEmails: CorrespEmailState = {
      lists: buildCorrespEmailLookup(jats.front),
      index: {},
    };
    const author = processContributor(jats.articleAuthors[0], { correspEmails });
    expect(author).toMatchObject({
      name: 'Viviana Gradinaru',
      corresponding: true,
      email: 'viviana@caltech.edu',
    });
  });

  it('PLOS example corresponding author gets email in frontmatter', () => {
    const data = fs.readFileSync('tests/plosExample.xml', 'utf8');
    const jats = new Jats(data);
    const corresponding = jats.frontmatter.authors?.find((a) => a.corresponding);
    expect(corresponding?.email).toBe('A.Argles2@exeter.ac.uk');
    expect(corresponding?.name).toMatch(/Argles/);
  });

  it('assigns multiple emails from one corresp node in author order', () => {
    const xml = `<article><front>
      <contrib-group>
        <contrib contrib-type="author" corresp="yes">
          <name><surname>Yoneshiro</surname><given-names>Takeshi</given-names></name>
          <xref ref-type="corresp" rid="cor1">5</xref>
        </contrib>
        <contrib contrib-type="author" corresp="yes">
          <name><surname>Kajimura</surname><given-names>Shingo</given-names></name>
          <xref ref-type="corresp" rid="cor1">5</xref>
        </contrib>
      </contrib-group>
      <author-notes>
        <corresp id="cor1"><label>5</label>Corresponding Takeshi Yoneshiro: <email>yoneshiro.takeshi@lsbm.org</email>, Shingo Kajimura: <email>skajimur@bidmc.harvard.edu</email></corresp>
      </author-notes>
    </front></article>`;
    const jats = new Jats(xml);
    const authors = processContributors(jats.articleAuthors, jats.front);
    expect(authors[0]).toMatchObject({
      name: 'Takeshi Yoneshiro',
      corresponding: true,
      email: 'yoneshiro.takeshi@lsbm.org',
    });
    expect(authors[1]).toMatchObject({
      name: 'Shingo Kajimura',
      corresponding: true,
      email: 'skajimur@bidmc.harvard.edu',
    });
    expect(jats.frontmatter.authors?.map((a) => a.email)).toEqual([
      'yoneshiro.takeshi@lsbm.org',
      'skajimur@bidmc.harvard.edu',
    ]);
  });

  it('equal-contrib=yes sets equal_contributor', () => {
    const xml = `<article><front><contrib-group>
      <contrib contrib-type="author" equal-contrib="yes">
        <name><surname>Reyes-Ordoñez</surname><given-names>Adriana</given-names></name>
      </contrib>
      <contrib contrib-type="author">
        <name><surname>Other</surname><given-names>Author</given-names></name>
      </contrib>
    </contrib-group></front></article>`;
    const jats = new Jats(xml);
    const authors = processContributors(jats.articleAuthors, jats.front);
    expect(authors[0].equal_contributor).toBe(true);
    expect(authors[1].equal_contributor).toBeUndefined();
  });
});
