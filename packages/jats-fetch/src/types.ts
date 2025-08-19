import type { Response } from 'node-fetch';
import type { ISession as BaseISession } from 'myst-cli-utils';

export type ISession = BaseISession;

export interface Resolver {
  test: (url: string) => boolean;
  jatsUrl: (url: string, fetcher?: Fetcher) => string | Promise<string>;
}

export type Fetcher = (
  url: string,
  contentType?: 'json' | 'xml',
) => Promise<
  Pick<Response, 'ok' | 'headers' | 'text' | 'json' | 'status' | 'statusText' | 'url' | 'body'>
>;

export type ResolutionOptions = {
  resolvers?: Resolver[];
  fetcher?: Fetcher;
};

export type DownloadResult = { success: boolean; source: string; data?: string };

export type OpenAlexWork = {
  ids: {
    openalex?: string;
    doi?: string;
    mag?: string;
    pmid?: string;
    pmcid?: string;
  };
};

export type S3Config = {
  region: string;
  bucketName: string;
  requestPayer?: 'requester';
};
