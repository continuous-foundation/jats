import fs from 'node:fs';
import path from 'node:path';
import type { DownloadResult, ISession } from '../types.js';
import { getDataFromBioRxiv } from './data.js';
import { convertPMCID2DOI } from '../pubmed/converters.js';

/**
 * Download, unzip, and save bioRxiv data, then rename JATS file to specified output file
 */
export async function getBioRxivJatsAndData(
  session: ISession,
  pmcidOrDoi: string,
  outputDir: string,
): Promise<DownloadResult> {
  let pmcid = pmcidOrDoi;
  if (pmcidOrDoi.startsWith('PMC')) {
    const doiFromPmcid = await convertPMCID2DOI(session, pmcidOrDoi);
    if (doiFromPmcid) {
      session.log.debug(`Resolved input ${pmcidOrDoi} to DOI: ${doiFromPmcid}`);
      pmcid = doiFromPmcid;
    }
  }
  try {
    await getDataFromBioRxiv(session, pmcid, outputDir);
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
  } catch (error) {
    session.log.debug(`Unable to download data from PMC for ${pmcidOrDoi}: ${error}`);
    return { success: false, source: pmcidOrDoi };
  }
}
