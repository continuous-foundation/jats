import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { S3Client } from '@aws-sdk/client-s3';
import { doi } from 'doi-utils';
import { makeExecutable, tic, type ISession } from 'myst-cli-utils';
import { xml2js } from 'xml-js';
import type {
  DownloadResult,
  EsummaryResult,
  Fetcher,
  IdconvResult,
  OpenAlexWork,
  PMCListingEntry,
  ResolutionOptions,
  S3Config,
} from './types.js';
import { checkFileExists, defaultFetcher, downloadFileFromS3, streamToFile } from './utils.js';

const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const OA_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';
const IDCONV_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/';
const LISTING_BASE_URL = 'https://ftp.ncbi.nlm.nih.gov/pub/pmc/';
const LISTING_URL = `${LISTING_BASE_URL}oa_file_list.csv`;

const LISTING_FILENAME = 'oa_file_list.csv';

type PubMedS3Config = S3Config & {
  paths: string[];
  typeMap: Record<string, string>;
};

const OA_CONFIG: PubMedS3Config = {
  region: 'us-east-1',
  bucketName: 'pmc-oa-opendata',
  paths: ['oa_comm/xml/all/', 'oa_noncomm/xml/all/', 'author_manuscript/xml/all/'],
  typeMap: {
    'oa_comm/xml/all/': 'Open Access (oa_comm)',
    'oa_noncomm/xml/all/': 'Open Access NonCommercial (oa_noncomm)',
    'author_manuscript/xml/all/': 'AAM (author_manuscript)',
  },
};

type ConvertIdTypes = keyof Required<IdconvResult>['records'][0];

export function normalizePMID(session: ISession, pmid: string) {
  if (pmid.startsWith('https://')) {
    const idPart = new URL(pmid).pathname.slice(1);
    session.log.debug(`Extract ${pmid} to ${idPart}`);
    return idPart;
  }
  return pmid;
}

async function convertId(
  session: ISession,
  id: string,
  from: ConvertIdTypes,
  to: ConvertIdTypes,
  opts?: ResolutionOptions,
): Promise<string | undefined> {
  const toc = tic();
  const resp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${id}`,
    'json',
  );
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to convert ${from} ID: ${id}`);
    return;
  }
  const data = (await resp.json()) as IdconvResult;
  const newId = data?.records?.[0]?.[to];
  if (newId) {
    session.log.debug(toc(`Used nih.gov to transform ${id} to ${newId} in %s.`));
  }
  return newId;
}

async function convertIds(
  session: ISession,
  ids: string[],
  from: ConvertIdTypes,
  to: ConvertIdTypes,
  opts?: ResolutionOptions,
): Promise<Record<string, string> | undefined> {
  const toc = tic();
  const resp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${ids.join(',')}`,
    'json',
  );
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to convert ${from} ${ids.length} IDs`);
    return;
  }
  const data = (await resp.json()) as IdconvResult;
  const entries = data?.records
    ?.filter((record) => !!record[from] && !!record[to])
    .map((record) => [record[from] as string, record[to] as string]);
  const newIds = entries ? Object.fromEntries(entries) : {};
  session.log.debug(
    toc(`Used nih.gov to transform ${entries?.length ?? 0}/${ids.length} ${from} to ${to} in %s.`),
  );
  return newIds;
}

/**
 * Convert a single PMID to PMCID
 *
 * Returns PMCID
 *
 * https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
 */
export async function convertPMID2PMCID(
  session: ISession,
  pmid: string,
  opts?: ResolutionOptions,
): Promise<string | undefined> {
  pmid = normalizePMID(session, pmid);
  const pmcid = await convertId(session, pmid, 'pmid', 'pmcid', opts);
  return pmcid;
}

/**
 * Convert multiple PMIDs to PMCIDs
 *
 * Returns a PMID:PMCID lookup dictionary for successful conversions
 *
 * https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
 */
export async function convertPMIDs2PMCIDs(
  session: ISession,
  pmids: string[],
  opts?: ResolutionOptions,
): Promise<Record<string, string> | undefined> {
  pmids = pmids.map((pmid) => normalizePMID(session, pmid));
  const pmcids = await convertIds(session, pmids, 'pmid', 'pmcid', opts);
  return pmcids;
}

export async function convertPMCID2DOI(session: ISession, pmcid: string, opts?: ResolutionOptions) {
  const pmDoi = await convertId(session, pmcid, 'pmcid', 'doi', opts);
  return pmDoi;
}

export async function convertDOI2PMCID(session: ISession, input: string, opts?: ResolutionOptions) {
  const pmDoi = await convertId(session, input, 'doi', 'pmcid', opts);
  return pmDoi;
}

/**
 * Query NIH APIs for single DOI from PubMed ID
 */
export async function convertPMID2DOI(
  session: ISession,
  pmid: string,
  opts?: ResolutionOptions,
): Promise<string | undefined> {
  pmid = normalizePMID(session, pmid);
  const toc = tic();
  let pmDoi = await convertId(session, pmid, 'pmid', 'doi', opts);
  if (pmDoi) return pmDoi;
  const esummaryResp = await (opts?.fetcher ?? defaultFetcher)(
    `${ESUMMARY_URL}?db=pubmed&format=json&id=${pmid}`,
    'json',
  );
  if (esummaryResp.ok) {
    const data = (await esummaryResp.json()) as EsummaryResult;
    pmDoi = data?.result?.[pmid]?.articleids?.find((articleid) => {
      return articleid.idtype === 'doi';
    })?.value;
    if (pmDoi) {
      session.log.debug(
        toc(`Used nih.gov to query ${pmid} for DOI ${pmDoi} in %s. (Tool: esummary)`),
      );
      return pmDoi;
    }
  }
  // Silently return -- other functions can try!
  session.log.debug(`Failed to return DOI from PubMedID: ${pmid}`);
  return;
}

/**
 * Query NIH APIs for multiple DOIs from PubMed IDs
 */
export async function convertPMIDs2DOIs(
  session: ISession,
  pmids: string[],
  opts?: ResolutionOptions,
): Promise<Record<string, string | null> | undefined> {
  pmids = [...new Set(pmids.map((pmid) => normalizePMID(session, pmid)))];
  const toc = tic();
  const pmDois: Record<string, string | null> =
    (await convertIds(session, pmids, 'pmid', 'doi', opts)) ?? {};
  if (Object.keys(pmDois).length === pmids.length) {
    return pmDois;
  }
  const esummaryResp = await (opts?.fetcher ?? defaultFetcher)(
    `${ESUMMARY_URL}?db=pubmed&format=json&id=${pmids.filter((pmid) => !pmDois[pmid]).join(',')}`,
    'json',
  );
  if (esummaryResp.ok) {
    const data = (await esummaryResp.json()) as {
      result?: Record<string, { articleids?: { idtype?: string; value?: string }[] }>;
    };
    Object.entries(data?.result ?? {})
      .filter(([pmid]) => pmid !== 'uids')
      .forEach(([pmid, record]) => {
        const pmDoi = record.articleids?.find((articleid: { idtype?: string; value?: string }) => {
          return articleid.idtype === 'doi';
        })?.value;
        if (pmDoi) {
          pmDois[pmid] = pmDoi;
        } else {
          pmDois[pmid] = null;
        }
      });
  }
  session.log.debug(
    toc(
      `Used nih.gov to transform ${Object.values(pmDois).filter((pmDoi) => !!pmDoi).length}/${
        pmids.length
      } PMIDs to PMCID in %s.`,
    ),
  );
  return pmDois;
}

function pubMedCentralJats(PMCID: string) {
  const normalized = PMCID.replace(/^PMC:?/, '');
  return `${EFETCH_URL}?db=pmc&id=${normalized}`;
}

/**
 * Construct JATS download url from PubMed Central ID
 *
 * This url uses the efetch utility from NIH.
 *
 * If a DOI is provided, this will attempt to resolve the DOI to a PMCID
 */
export async function constructJatsUrlFromPubMedCentral(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions,
): Promise<string | undefined> {
  if (urlOrDoi.match(/^PMC:?([0-9]+)$/)) return pubMedCentralJats(urlOrDoi);
  if (!doi.validate(urlOrDoi)) return;
  const toc = tic();
  const doiUrl = doi.buildUrl(urlOrDoi) as string;
  session.log.debug(`Attempting to resolve PMCID using OpenAlex from ${doiUrl}`);
  const openAlexUrl = `https://api.openalex.org/works/${doiUrl}`;
  const resp = await (opts?.fetcher ?? defaultFetcher)(openAlexUrl, 'json');
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to lookup on OpenAlex: ${openAlexUrl}`);
    return;
  }
  const data = (await resp.json()) as OpenAlexWork;
  const PMID = data?.ids?.pmid;
  let PMCID = data?.ids?.pmcid;
  if (!PMCID && !!PMID) {
    session.log.debug(
      toc(`OpenAlex resolved ${data?.ids.openalex} in %s. There is no PMCID, but there is a PMID`),
    );
    PMCID = await convertPMID2PMCID(session, PMID, opts);
    if (!PMCID) {
      session.log.debug(toc(`PubMed does not have a record of ${PMID}`));
      return;
    }
  }
  if (!PMCID) {
    session.log.debug(toc(`OpenAlex resolved ${data?.ids.openalex} in %s, but there is no PMCID`));
    return;
  }
  session.log.debug(toc(`OpenAlex resolved in %s, with a PMCID of ${PMCID}`));
  return pubMedCentralJats(PMCID);
}

/**
 * Find if file exists on one of the PubMed S3 paths
 */
export async function findFile(client: S3Client, id: string, config: PubMedS3Config) {
  for (const configPath of config.paths) {
    const result = await checkFileExists(client, id, configPath, config);
    if (result) {
      return {
        path: result,
        type: config.typeMap[configPath],
      };
    }
  }
}

/**
 * Download JATS from Open-Access NIH S3 bucket, if available
 */
export async function getPubMedJatsFromS3(
  session: ISession,
  pmcid: string,
): Promise<DownloadResult> {
  const client = new S3Client({ region: OA_CONFIG.region });
  let found: { path: string } | undefined;
  try {
    found = await findFile(client, pmcid, OA_CONFIG);
  } catch {
    session.log.debug(`Error with AWS credentials`);
    return { success: false, source: pmcid };
  }
  if (!found) {
    session.log.debug(`Not available from open-access S3 bucket: ${pmcid}`);
    return { success: false, source: pmcid };
  } else {
    session.log.debug(`Fetching PMC JATS from S3 bucket: ${pmcid}`);
    const result = await downloadFileFromS3(client, found.path, OA_CONFIG);
    return result;
  }
}

/**
 * Return listings file path
 *
 * If file does not exist, it will be downloaded.
 */
export async function getListingsFile(session: ISession, dest: string, fetcher?: Fetcher) {
  if (!path.extname(dest)) dest = path.join(dest, LISTING_FILENAME);
  if (path.extname(dest) !== '.csv') {
    throw new Error('Listing file must be .csv');
  }
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    session.log.info('Fetching PMC Open Access listing (this may take a while)...');
    session.log.debug(`Fetching PMC Open Access listing from ${LISTING_URL}`);
    const { success, status, statusText } = await streamToFile(LISTING_URL, dest, fetcher);
    if (!success) {
      session.log.debug('PMC Open Access listing failed to download');
      throw new Error(`STATUS ${status}: ${statusText}`);
    }
    session.log.debug(`PMC Open Access listing saved to ${dest}`);
  }
  return dest;
}

// Function to search for a pmcid in a large CSV file and return it as a JSON object
async function searchListingForPMC(listingFile: string, pmcid: string): Promise<PMCListingEntry> {
  const fileStream = fs.createReadStream(listingFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.split(',')[2] === pmcid) {
      const columns: (keyof PMCListingEntry)[] = [
        'url',
        'journal',
        'pmcid',
        'date',
        'id',
        'license',
      ];
      const values = line.split(',');

      // Create the JSON object by mapping columns to values
      const jsonObject = columns.reduce((obj: Partial<PMCListingEntry>, col, index) => {
        obj[col] = values[index];
        return obj;
      }, {});
      return jsonObject as PMCListingEntry;
    }
  }
  throw new Error(`Article ${pmcid} not found in ${listingFile}`);
}

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

/**
 * Download and unzip PMC data and rename JATS xml to specified output file
 */
export async function getPubMedJatsFromData(
  session: ISession,
  pmcid: string,
  outputDir: string,
  listing?: string,
  fetcher?: Fetcher,
): Promise<DownloadResult> {
  await getDataFromPMC(session, pmcid, outputDir, listing, fetcher);
  const content = fs.readdirSync(outputDir);
  const xmlFiles = content
    .filter((file) => file.endsWith('xml')) // handles '.nxml' in addition to '.xml'
    .map((file) => path.join(outputDir, file));
  if (xmlFiles.length === 0) {
    throw new Error(`No xml file in data zip archive for ${pmcid}`);
  }
  if (xmlFiles.length > 1) {
    throw new Error(`Multiple xml files in data zip archive for ${pmcid}`);
  }
  return { success: true, source: pmcid, data: fs.readFileSync(xmlFiles[0]).toString() };
}
