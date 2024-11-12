import fs from 'node:fs';
import { pipeline } from 'node:stream';
import { promisify } from 'node:util';
import fetch from 'node-fetch';
import type { S3Client } from '@aws-sdk/client-s3';
import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { DownloadResult, Fetcher, S3Config } from './types.js';

export function defaultFetcher(url: string, kind?: 'json' | 'xml') {
  switch (kind) {
    case 'json':
      return fetch(url, { headers: [['Accept', 'application/json']] });
    case 'xml':
      return fetch(url, { headers: [['Accept', 'application/xml']] });
    default:
      return fetch(url);
  }
}

export async function checkFileExists(
  client: S3Client,
  id: string,
  path: string,
  config: S3Config,
) {
  const key = `${path}${id}.xml`;
  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });
    await client.send(command);
    // If the command succeeds, the file exists
    return key;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
      // The file does not exist in this path
      return null;
    } else {
      // Some other error occurred
      throw err;
    }
  }
}

/**
 * Find if file exists on one of the S3 paths
 */
export async function findFile(client: S3Client, id: string, config: S3Config) {
  for (const path of config.paths) {
    const result = await checkFileExists(client, id, path, config);
    if (result) {
      return {
        path: result,
        type: config.typeMap[path],
      };
    }
  }
}

export async function downloadFileFromS3(
  client: S3Client,
  filePath: string,
  config: S3Config,
): Promise<DownloadResult> {
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: filePath,
  });
  try {
    const response = await client.send(command);
    const data = await response.Body?.transformToString();
    return { success: !!data, source: filePath, data };
  } catch (err) {
    return { success: false, source: filePath };
  }
}

export async function streamToFile(url: string, dest: string, fetcher?: Fetcher) {
  const resp = await (fetcher ?? defaultFetcher)(url);
  if (!resp.ok || !resp.body) {
    return { success: false, status: resp.status, statusText: resp.statusText };
  }
  await promisify(pipeline)(resp.body, fs.createWriteStream(dest));
  return { success: true, dest, status: resp.status, statusText: resp.statusText };
}
