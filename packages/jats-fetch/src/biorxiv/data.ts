import fs from 'node:fs';
import path from 'node:path';
import type { Fetcher, S3Config } from '../types.js';
import { defaultFetcher, streamToFileFromS3 } from '../utils.js';
import { makeExecutable, type ISession } from 'myst-cli-utils';
import { doi } from 'doi-utils';
import { S3Client } from '@aws-sdk/client-s3';

const BIORXIV_S3_REGION = 'us-east-1';
const BIORXIV_LOOKUP_URL = 'https://biorxiv.curvenote.dev/v1/works/';

export async function getBioRxivS3Metadata(
  input: string,
  fetcher?: Fetcher,
): Promise<{ bucketName: string; filePath: string }> {
  const resp = await (fetcher ?? defaultFetcher)(`${BIORXIV_LOOKUP_URL}${input}`, 'json');
  if (!resp.ok) {
    throw new Error(`Bad response from ${BIORXIV_LOOKUP_URL}`);
  }
  const bioRxivMeta = (await resp.json()) as {
    versions?: { s3Bucket: string; s3Key: string }[];
    s3Bucket?: string;
    s3Key?: string;
  };
  if (bioRxivMeta.s3Bucket && bioRxivMeta.s3Key) {
    return { bucketName: bioRxivMeta.s3Bucket, filePath: bioRxivMeta.s3Key };
  }
  if (bioRxivMeta.versions?.length) {
    const { s3Bucket, s3Key } = bioRxivMeta.versions[bioRxivMeta.versions.length - 1];
    return { bucketName: s3Bucket, filePath: s3Key };
  }
  throw new Error(`Bad response from ${BIORXIV_LOOKUP_URL} - no s3 bucket info found for ${input}`);
}

export async function downloadAndUnzipBioRxiv(
  session: ISession,
  input: { bucketName: string; filePath: string },
  outputDir: string,
) {
  const filePathParts = input.filePath.split('/');
  const filename = filePathParts[filePathParts.length - 1];
  const dest = path.join(outputDir, filename);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  if (!fs.existsSync(dest)) {
    const client = new S3Client({ region: BIORXIV_S3_REGION });
    const config: S3Config = {
      bucketName: input.bucketName,
      region: BIORXIV_S3_REGION,
      requestPayer: 'requester',
    };
    session.log.info(`Downloading bioRxiv data from ${input.filePath}`);
    await streamToFileFromS3(client, input.filePath, dest, config);
  }
  if (!fs.existsSync(dest)) {
    throw new Error(`Unable to download ${input.filePath}`);
  }
  session.log.info(`Extracting bioRxiv data from ${dest} to ${outputDir}`);
  // Extract zip file using unzip command - again, probably better to use node instead.
  const unzip = makeExecutable(`unzip -o ${dest} -d ${outputDir}`, session.log);
  await unzip();
  // Delete unwanted metadata files
  ['directives.xml', 'manifest.xml', 'mimetype', 'transfer.xml'].forEach((file) => {
    const fullPath = path.join(outputDir, file);
    if (fs.existsSync(fullPath)) fs.rmSync(fullPath);
  });
  // Un-nest zip content into outputDir
  const contentDir = path.join(outputDir, 'content');
  const zipContent = fs.readdirSync(contentDir);
  zipContent.map((file) => {
    const oldPath = path.join(contentDir, file);
    const newPath = path.join(outputDir, file);
    fs.renameSync(oldPath, newPath);
    return newPath;
  });
  fs.rmdirSync(contentDir);
}

/**
 * Download and unzip data for bioRxiv DOI
 */
export async function getDataFromBioRxiv(session: ISession, input: string, outputDir: string) {
  if (!doi.validate(input)) {
    throw new Error('Cannot download data for bioRxiv articles without DOI');
  }
  const metadata = await getBioRxivS3Metadata(input);
  await downloadAndUnzipBioRxiv(session, metadata, outputDir);
}
