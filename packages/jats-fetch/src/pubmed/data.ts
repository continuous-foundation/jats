import fs from 'node:fs';
import path from 'node:path';
import { xml2js } from 'xml-js';
import type { Fetcher } from '../types.js';
import { defaultFetcher, streamToFile } from '../utils.js';
import { makeExecutable, type ISession } from 'myst-cli-utils';
import { getListingsFile, LISTING_BASE_URL, searchListingForPMC } from './listing.js';

const OA_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';

type OAResponse = {
  OA?: {
    records?: {
      _attributes?: { 'returned-count'?: string };
      record?: {
        _attributes?: { citation?: string; license?: string };
        link?: { _attributes?: { href?: string } };
      };
    };
  };
};

export async function getDownloadMetadata(pmcid: string, fetcher?: Fetcher) {
  const resp = await (fetcher ?? defaultFetcher)(`${OA_URL}?format=tgz&id=${pmcid}`, 'xml');
  if (!resp.ok) {
    throw new Error(`Bad response from ${OA_URL}`);
  }
  const oaMeta = xml2js(await resp.text(), { compact: true }) as OAResponse;
  if (oaMeta.OA?.records?._attributes?.['returned-count'] !== '1') {
    throw new Error(`Bad response from ${OA_URL} - returned count is not 1`);
  }
  const url = oaMeta?.OA?.records?.record?.link?._attributes?.href;
  if (!url) {
    throw new Error(`Bad response from ${OA_URL} - href is not available`);
  }
  const { citation, license } = oaMeta.OA?.records?.record?._attributes ?? {};
  return { url, citation, license };
}

export async function downloadAndUnzipPMC(
  session: ISession,
  url: string,
  outputDir: string,
  fetcher?: Fetcher,
) {
  // PMC open-access downloads are avaible over https and ftp
  url = url.replace(/^ftp:/, 'https:');
  const urlParts = url.split('/');
  const filename = urlParts[urlParts.length - 1];
  const dest = path.join(outputDir, filename);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(dest)) {
    session.log.info(`Downloading PMC data from ${url}`);
    await streamToFile(url, dest, fetcher);
  }
  if (!fs.existsSync(dest)) {
    throw new Error(`Unable to download ${url}`);
  }
  session.log.info(`Extracting PMC data from ${dest} to ${outputDir}`);
  // Should use node, something like:
  // fs.createReadStream(dest).pipe(gunzip()).pipe(tar.extract(outputDir));
  const unzip = makeExecutable(`tar -xf ${dest} -C ${outputDir}`, session.log);
  await unzip();
  const zipDir = path.join(outputDir, path.basename(dest).replace(/\.(tar\.gz|tgz)$/, ''));
  const zipContent = fs.readdirSync(zipDir);
  zipContent
    .map((file) => {
      // Un-nest zip content into outputDir
      const oldPath = path.join(zipDir, file);
      const newPath = path.join(outputDir, file);
      fs.renameSync(oldPath, newPath);
      return newPath;
    })
    .filter((file) => file.toLowerCase().endsWith('.gif'))
    .forEach((gifFile) => {
      const jpgFile = gifFile.replace(/.gif$/, '.jpg');
      if (fs.existsSync(jpgFile)) fs.rmSync(gifFile);
    });
  fs.rmdirSync(zipDir);
}

/**
 * Download and unzip data for PMC ID
 *
 * A .tar.gz URL may also be provided instead of an ID.
 */
export async function getDataFromPMC(
  session: ISession,
  pmcid: string,
  outputDir: string,
  listing?: string,
  fetcher?: Fetcher,
) {
  let url: string | undefined;
  if (pmcid.endsWith('.tar.gz')) {
    url = pmcid;
  } else {
    if (!pmcid.startsWith('PMC')) {
      throw new Error('Data may only be downloaded for PMC articles');
    }
    try {
      const metadata = await getDownloadMetadata(pmcid);
      url = metadata.url;
    } catch {
      if (listing) {
        const listingFile = await getListingsFile(session, listing, fetcher);
        const entry = await searchListingForPMC(listingFile, pmcid);
        url = `${LISTING_BASE_URL}${entry.url}`;
      }
    }
  }
  if (!url) {
    throw new Error(`Unable to find PMC data download url for: ${pmcid}`);
  }
  await downloadAndUnzipPMC(session, url, outputDir, fetcher);
}
