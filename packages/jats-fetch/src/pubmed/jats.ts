import fs from 'node:fs';
import path from 'node:path';
import { S3Client } from '@aws-sdk/client-s3';
import type { DownloadResult, Fetcher, ISession, S3Config } from '../types.js';
import { checkFileExists, downloadFileFromS3 } from '../utils.js';
import { getDataFromPMC } from './data.js';
import { doi } from 'doi-utils';
import { convertDOI2PMCID } from './converters.js';

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

/**
 * Find if JATS file exists on one of the PubMed S3 paths
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
 * Download JATS file from Open-Access NIH S3 bucket, if available
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
 * Download, unzip, and save PMC data, then rename JATS file to specified output file
 */
export async function getPubMedJatsAndData(
  session: ISession,
  pmcidOrDoi: string,
  outputDir: string,
  listing?: string,
  fetcher?: Fetcher,
): Promise<DownloadResult> {
  let pmcid = pmcidOrDoi;
  if (doi.validate(pmcidOrDoi)) {
    const pmcidFromDoi = await convertDOI2PMCID(session, pmcidOrDoi);
    if (pmcidFromDoi) {
      session.log.debug(`Resolved input ${pmcidOrDoi} to PMC ID: ${pmcidFromDoi}`);
      pmcid = pmcidFromDoi;
    }
  }
  try {
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
  } catch (error) {
    session.log.debug(`Unable to download data from PMC for ${pmcidOrDoi}: ${error}`);
    return { success: false, source: pmcidOrDoi };
  }
}
