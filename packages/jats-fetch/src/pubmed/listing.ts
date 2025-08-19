import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import type { Fetcher } from '../types.js';
import type { ISession } from 'myst-cli-utils';
import { streamToFile } from '../utils.js';
import type { PMCListingEntry } from './types.js';

export const LISTING_BASE_URL = 'https://ftp.ncbi.nlm.nih.gov/pub/pmc/';
const LISTING_URL = `${LISTING_BASE_URL}oa_file_list.csv`;
const LISTING_FILENAME = 'oa_file_list.csv';

// NOTE: We prioritize the NIH API over listings file when downloading PMC JATS.

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

/**
 * Search for a pmcid in a large CSV file and return it as a JSON object
 */
export async function searchListingForPMC(
  listingFile: string,
  pmcid: string,
): Promise<PMCListingEntry> {
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
