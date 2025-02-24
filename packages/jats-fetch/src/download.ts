import fs from 'node:fs';
import path from 'node:path';
import { doi } from 'doi-utils';
import type { ISession } from 'myst-cli-utils';
import { isUrl, tic } from 'myst-cli-utils';
import {
  constructJatsUrlFromPubMedCentral,
  convertDOI2PMCID,
  convertPMID2PMCID,
  getListingsFile,
  getPubMedJatsFromData,
  getPubMedJatsFromS3,
} from './pubmed.js';
import { customResolveJatsUrlFromDoi } from './resolvers.js';
import type { DownloadResult, ResolutionOptions } from './types.js';
import { defaultFetcher } from './utils.js';

/**
 * Return data from URL using xml content type
 *
 * Throws on bad response and warns if response content type is not xml
 */
async function downloadFromUrl(
  session: ISession,
  jatsUrl: string,
  opts: ResolutionOptions,
): Promise<string> {
  const toc = tic();
  session.log.debug(`Fetching JATS from ${jatsUrl}`);
  const resp = await (opts?.fetcher ?? defaultFetcher)(jatsUrl, 'xml');
  if (!resp.ok) {
    session.log.debug(`JATS failed to download from "${jatsUrl}"`);
    throw new Error(`STATUS ${resp.status}: ${resp.statusText}`);
  }
  const contentType = resp.headers?.get('content-type');
  if (
    !(
      contentType?.includes('application/xml') ||
      contentType?.includes('text/xml') ||
      contentType?.includes('text/plain')
    )
  ) {
    session.log.warn(
      `Expected content-type "application/xml" instead we got "${contentType}" for ${jatsUrl}`,
    );
  }
  const data = await resp.text();
  if (!data.match(/<article/)) {
    throw new Error(`XML downloaded from ${jatsUrl} does not look like a JATS article`);
  }
  session.log.debug(toc(`Fetched document with content-type "${contentType}" in %s`));
  return data;
}

type DoiLink = {
  URL: string;
  'content-type'?: 'application/xml' | 'application/pdf' | 'unspecified' | string;
  'content-version'?: 'vor' | string;
  'intended-application': 'text-mining' | 'similarity-checking' | string;
};

/**
 * There are 5.8M or so DOIs that have a full XML record:
 *
 * https://api.crossref.org/works?filter=full-text.type:application/xml,full-text.application:text-mining&facet=publisher-name:*&rows=0
 *
 * This function tries to find the correct URL for the record.
 */
async function getJatsUrlFromDoi(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions,
): Promise<string | undefined> {
  if (!doi.validate(urlOrDoi)) return;
  const toc = tic();
  const doiUrl = doi.buildUrl(urlOrDoi) as string;
  session.log.debug(`Attempting to resolving full XML from DOI ${doiUrl}`);
  const resp = await (opts?.fetcher ?? defaultFetcher)(doiUrl, 'json');
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`DOI failed to resolve: ${doiUrl}`);
    return;
  }
  const data = (await resp.json()) as { link?: DoiLink[] };
  session.log.debug(toc(`DOI resolved in %s with ${data.link?.length ?? 0} links to content`));
  if (data.link) {
    session.log.debug(
      ['', ...data.link.map((link) => `content-type: ${link['content-type']}, ${link.URL}\n`)].join(
        '  - ',
      ),
    );
  }
  const fullXml = data.link?.find((link) =>
    ['text/xml', 'application/xml'].includes(link['content-type'] ?? ''),
  )?.URL;
  if (fullXml) return fullXml;
  session.log.debug(`Could not find XML in DOI record ${doiUrl}`);
  return undefined;
}

/**
 * Attempt to download JATS from provided input
 *
 * `urlOrDoi` may be (1) a local file, in which case, the file content is
 * directly returned, (2) PubMed ID, PubMed Central ID, or DOI, in which case,
 * possible download links are constructed and followed, or (3) a direct
 * download URL, in which case, the content is fetched.
 */
export async function downloadJatsFromUrl(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions = {},
): Promise<DownloadResult> {
  if (fs.existsSync(urlOrDoi)) {
    session.log.debug(`JATS returned from local file ${urlOrDoi}`);
    const data = fs.readFileSync(urlOrDoi).toString();
    return { success: true, source: urlOrDoi, data };
  }
  const expectedUrls = (
    await Promise.all([
      constructJatsUrlFromPubMedCentral(session, urlOrDoi, opts),
      getJatsUrlFromDoi(session, urlOrDoi, opts),
    ])
  ).filter((u): u is string => !!u);
  if (expectedUrls.length > 0) {
    session.log.debug(['Trying URLs:\n', ...expectedUrls.map((url) => ` ${url}\n`)].join('  - '));
    for (let index = 0; index < expectedUrls.length; index++) {
      const url = expectedUrls[index];
      try {
        const data = await downloadFromUrl(session, url, opts);
        if (data) return { success: true, source: url, data };
      } catch (error) {
        session.log.debug((error as Error).message);
      }
    }
    // If there are expected URLs that don't work, report them and do not try other resolvers
    return { success: false, source: expectedUrls[0] };
  }
  try {
    if (doi.validate(urlOrDoi)) {
      const jatsUrl = await customResolveJatsUrlFromDoi(session, urlOrDoi, opts);
      const data = await downloadFromUrl(session, jatsUrl, opts);
      return { success: true, source: jatsUrl, data };
    }
    if (isUrl(urlOrDoi)) {
      session.log.debug(
        "No resolver matched, and the URL doesn't look like a DOI. We will attempt to download it directly.",
      );
      const data = await downloadFromUrl(session, urlOrDoi, opts);
      return { success: true, source: urlOrDoi, data };
    }
  } catch (error) {
    session.log.debug((error as Error).message);
    return { success: false, source: urlOrDoi };
  }
  session.log.debug(`Could not find ${urlOrDoi} locally, and it doesn't look like a URL or DOI`);
  return { success: false, source: urlOrDoi };
}

/**
 * Given an input url/doi/identifier, attempt to download JATS XML and, optionally, dependent data
 *
 * Allowed inputs are DOI, PMCID, PubMed ID (which will be resolved to PMCID), or a direct JATS download URL
 *
 * `output` may be a destination folder or xml filename. If `data` is `true`, this function will also
 * attempt to fetch dependent data; currently, this flag is only supported for open-access PMC articles.
 * Data location will be determined using the pubmed OA API. You may also specify a `listing` file to look up
 * data location.
 */
export async function jatsFetch(
  session: ISession,
  input: string,
  opts: { output?: string; data?: boolean; listing?: string },
) {
  if (input === 'listing' && !opts.data && !(opts.output && opts.listing)) {
    // Handle downloading only the listings file
    const inputDest = opts.output ?? opts.listing;
    if (!inputDest) {
      throw new Error('Destination for listing file must be specified');
    }
    const dest = await getListingsFile(session, inputDest);
    session.log.info(`PMC Open Access listing saved to ${dest}`);
    return;
  }
  let output = opts.output;
  let filename: string | undefined;
  if (input.endsWith('.tar.gz')) {
    // If input looks like a data repository URL, assume we want the data.
    opts.data = true;
    const foldername = input.split('/').slice(-1)[0].slice(0, -'.tar.gz'.length);
    filename = `${foldername}.xml`;
    if (!output) {
      output = foldername;
    }
  }
  if (input.match(/^[0-9]+$/)) {
    // If input is a number, assume it is PMID and try to resolve PMC ID
    const pmcid = await convertPMID2PMCID(session, input);
    if (pmcid) {
      session.log.debug(`Resolved input ${input} to PMC ID: ${pmcid}`);
      input = pmcid;
    }
  }
  if (doi.validate(input)) {
    const pmcid = await convertDOI2PMCID(session, input);
    if (pmcid) {
      session.log.debug(`Resolved input ${input} to PMC ID: ${pmcid}`);
      input = pmcid;
    }
  }
  if (!output) output = opts.data ? `${input}` : '.';
  if (!path.extname(output)) {
    filename = filename ?? (input.startsWith('PMC') ? `${input}.xml` : 'jats.xml');
    output = path.join(output, filename);
  }
  if (path.extname(output) && !['.xml', '.jats'].includes(path.extname(output).toLowerCase())) {
    throw new Error(`Output must be an XML file or a directory`);
  }
  let result: DownloadResult | undefined;
  if (opts.data) {
    // This downloads all data and renames JATS - it will throw if it does not work
    result = await getPubMedJatsFromData(session, input, path.dirname(output), opts.listing);
  }
  // We can do better with doi/pubmed -> PMC conversions to use this path more
  if (!result?.data && input.startsWith('PMC')) {
    result = await getPubMedJatsFromS3(session, input);
  }
  if (!result?.data) {
    result = await downloadJatsFromUrl(session, input);
  }
  if (!result?.data && input.startsWith('PMC')) {
    // Downloading all the data for just the XML should be last resort
    result = await getPubMedJatsFromData(session, input, path.dirname(output), opts.listing);
  }
  if (!result?.data) {
    throw new Error(`Unable to resolve JATS XML content from ${input}`);
  }
  if (!path.extname(output)) {
    fs.mkdirSync(output, { recursive: true });
  } else {
    fs.mkdirSync(path.dirname(output), { recursive: true });
  }
  fs.writeFileSync(output, result.data);
  session.log.info(`JATS written to ${output}`);
}
