import { doi } from 'doi-utils';
import fetch from 'node-fetch';
import type { Fetcher, ISession, ResolutionOptions, Resolver } from './types.js';

export const elife: Resolver = {
  test(url: string) {
    return new URL(url).hostname === 'elifesciences.org';
  },
  jatsUrl(url: string) {
    return `${url}.xml`;
  },
};

export const plos: Resolver = {
  test(url: string) {
    return new URL(url).hostname === 'journals.plos.org';
  },
  jatsUrl(url: string) {
    return url.replace('/article?', '/article/file?') + '&type=manuscript';
  },
};

export const joss: Resolver = {
  test(url: string) {
    return new URL(url).hostname === 'joss.theoj.org' && doi.validate(url);
  },
  jatsUrl(url: string) {
    // Probably a better way to do this, the joss papers are on github!
    const doiString = doi.normalize(url) as string;
    const [org, jossId] = doiString.split('/');
    const id = jossId.split('.')[1];
    return `https://raw.githubusercontent.com/openjournals/joss-papers/master/joss.${id}/${org}.${jossId}.jats`;
  },
};

export const biorxiv: Resolver = {
  test(url: string) {
    return new URL(url).hostname === 'www.biorxiv.org';
  },
  async jatsUrl(url: string, fetcher?: Fetcher) {
    const resp = await (fetcher ?? fetch)(url);
    const xmlUrl = (await resp.text()).match(
      /https:\/\/www\.biorxiv\.org\/content\/biorxiv\/[^\s]+\.full\.pdf/,
    );
    if (!xmlUrl) {
      throw new Error(`Could not resolve JATS for biorxiv URL: ${url}`);
    }
    return xmlUrl[0].replace('.full.pdf', '.source.xml');
  },
};

export const DEFAULT_RESOLVERS: Resolver[] = [biorxiv, elife, plos, joss];

/**
 * Use the known custom resolvers to pick where the JATS should be downloaded from.
 */
export async function customResolveJatsUrlFromDoi(
  session: ISession,
  doiString: string,
  opts?: ResolutionOptions,
): Promise<string> {
  if (!doi.validate(doiString)) throw new Error(`The doi ${doiString} is not valid`);
  const doiUrl = doi.buildUrl(doiString) as string;
  session.log.debug(`Resolving DOI ${doiUrl}`);
  const resp = await (opts?.fetcher ?? fetch)(doiUrl);
  const articleUrl = resp.url;
  session.log.debug(`Found resolved URL for DOI at ${articleUrl}`);
  const resolvers = opts?.resolvers ?? DEFAULT_RESOLVERS;
  const resolver = resolvers?.find((r) => r.test(articleUrl));
  if (!resolver) throw new Error(`Could not resolve JATS for ${articleUrl}, no resolver matched`);
  const jatsUrl = await resolver.jatsUrl(articleUrl, opts?.fetcher);
  return jatsUrl;
}
