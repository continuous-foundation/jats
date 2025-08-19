export type PMCListingEntry = {
  url: string;
  journal: string;
  pmcid: string;
  date: string;
  id: string;
  license: string;
};

export type IdconvResult = {
  records?: {
    pmcid?: string;
    pmid?: string;
    doi?: string;
  }[];
};

export type EsummaryResult = {
  result?: Record<
    string,
    {
      articleids: {
        idtype?: string;
        value?: string;
      }[];
    }
  >;
};
