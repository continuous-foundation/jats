import type { ISession } from 'myst-cli-utils';

const EFETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';

export function normalizePMID(session: ISession, pmid: string) {
  if (pmid.startsWith('https://')) {
    const idPart = new URL(pmid).pathname.slice(1);
    session.log.debug(`Extract ${pmid} to ${idPart}`);
    return idPart;
  }
  return pmid;
}

export function pubMedCentralEfetchUrl(PMCID: string) {
  const normalized = PMCID.replace(/^PMC:?/, '');
  return `${EFETCH_URL}?db=pmc&id=${normalized}`;
}
