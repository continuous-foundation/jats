import type { ISession } from 'myst-cli-utils';
import { tic } from 'myst-cli-utils';
import type { EsummaryResult, IdconvResult } from './types.js';
import type { ResolutionOptions } from '../types.js';
import { defaultFetcher } from '../utils.js';
import { normalizePMID } from './utils.js';

const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';
const IDCONV_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/';

type ConvertIdTypes = keyof Required<IdconvResult>['records'][0];

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
