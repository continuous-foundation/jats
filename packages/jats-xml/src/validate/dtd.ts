import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import which from 'which';
import { makeExecutable, writeFileToFolder } from 'myst-cli-utils';
import chalk from 'chalk';
import type { ISession } from '../types.js';

const JATS_VERSIONS = [
  '1.1',
  '1.1d1',
  '1.1d2',
  '1.1d3',
  '1.2',
  '1.2d1',
  '1.2d2',
  '1.3',
  '1.3d1',
  '1.3d2',
];
const DEFAULT_JATS_VERSION = '1.3';

const MATHML_VERSIONS: ('2' | '3')[] = ['2', '3'];
const DEFAULT_MATHML_VERSION = '3';

const JATS_LIBRARIES = ['authoring', 'publishing', 'archiving'];
const DEFAULT_JATS_LIBRARY = 'archiving';

export type JatsOptions = {
  jats: string;
  mathml: '2' | '3';
  oasis: boolean;
  library: string;
  directory: string;
};

/**
 * Return static/ directory adjacent to the code
 *
 * This provides a standard location to cache DTD files, minimizing re-downloading.
 */
function defaultDirectory() {
  return path.join(__dirname, 'static');
}

function warnOnOptionsMismatch(session: ISession, opts: any, inferredOpts: Partial<JatsOptions>) {
  if (opts.jats && inferredOpts.jats && opts.jats !== inferredOpts.jats) {
    session.log.warn(
      `Using JATS version ${opts.jats}; does not match version inferred from file ${inferredOpts.jats}`,
    );
  }
  if (opts.library && inferredOpts.library && opts.library !== inferredOpts.library) {
    session.log.warn(
      `Using JATS library ${opts.library}; does not match library inferred from file ${inferredOpts.library}`,
    );
  }
  if (opts.mathml && inferredOpts.mathml && opts.mathml !== inferredOpts.mathml) {
    session.log.warn(
      `Using MathML version ${opts.mathml}; does not match version inferred from file ${inferredOpts.mathml}`,
    );
  }
  if (opts.oasis && !inferredOpts.oasis) {
    session.log.warn('Using OASIS table model; does not match non-OASIS inferred from file');
  }
}
/**
 * Validate input value as JATS options and fill in defaults
 */
function validateOptions(session: ISession, opts: any, inferredOpts: Partial<JatsOptions>) {
  warnOnOptionsMismatch(session, opts, inferredOpts);
  let jats: string;
  if (!opts.jats) {
    jats = inferredOpts.jats ?? DEFAULT_JATS_VERSION;
  } else if (!JATS_VERSIONS.includes(opts.jats)) {
    throw new Error(
      `Invalid JATS version "${opts.jats}" - must be one of [${JATS_VERSIONS.join(', ')}]`,
    );
  } else {
    jats = opts.jats;
  }
  let mathml: '2' | '3';
  if (!opts.mathml) {
    mathml = inferredOpts.mathml ?? DEFAULT_MATHML_VERSION;
  } else if (!MATHML_VERSIONS.includes(opts.mathml)) {
    throw new Error(
      `Invalid MathML version "${opts.mathml}" - must be one of [${MATHML_VERSIONS.join(', ')}]`,
    );
  } else {
    mathml = opts.mathml;
  }
  let library: string;
  if (!opts.library) {
    library = inferredOpts.library ?? DEFAULT_JATS_LIBRARY;
  } else if (
    typeof opts.library !== 'string' ||
    !JATS_LIBRARIES.includes(opts.library.toLowerCase())
  ) {
    throw new Error(
      `Invalid JATS library "${opts.library}" - must be one of [${JATS_LIBRARIES.join(', ')}]`,
    );
  } else {
    library = opts.library.toLowerCase();
  }
  const oasis = inferredOpts.oasis ?? !!opts.oasis;
  if (library === 'authoring' && oasis) {
    throw new Error('JATS article authoring library cannot use OASIS table model');
  }
  const out: JatsOptions = {
    library,
    jats,
    mathml,
    oasis,
    directory: opts.directory ?? defaultDirectory(),
  };
  return out;
}

/**
 * DTD folder name
 */
function dtdFolder(opts: JatsOptions) {
  const version = opts.jats.replace('.', '-');
  const oasis = opts.oasis ? '-OASIS' : '';
  const mathml = `MathML${opts.mathml}`;
  const library = opts.library.charAt(0).toUpperCase() + opts.library.slice(1);
  return `JATS-${library}-${version}${oasis}-${mathml}-DTD`;
}

/**
 * DTD zip file name on FTP server
 */
function dtdZipFile(opts: JatsOptions) {
  return `${dtdFolder(opts)}.zip`;
}

/**
 * Local location of DTD zip file
 */
function localDtdZipFile(opts: JatsOptions) {
  return path.join(opts.directory, dtdZipFile(opts));
}

/**
 * Extracted DTD file name
 */
function dtdFile(opts: Omit<JatsOptions, 'directory'>) {
  const version = opts.jats.startsWith('1.3') ? opts.jats.replace('.', '-') : '1';
  let article: string;
  if (opts.library === 'archiving') {
    article = opts.oasis ? 'archive-oasis-article' : 'archivearticle';
  } else if (opts.library === 'publishing') {
    article = opts.oasis ? 'journalpublishing-oasis-article' : 'journalpublishing';
  } else {
    article = 'articleauthoring';
  }
  const mathml = opts.mathml === '3' ? '-mathml3' : '';
  return `JATS-${article}${version}${mathml}.dtd`;
}

/**
 * Local location of extracted DTD file
 */
function localDtdFile(opts: JatsOptions) {
  return path.join(opts.directory, dtdFolder(opts), dtdFile(opts));
}

/**
 * NIH FTP server and path for downloading JATS DTD files
 *
 * This is accessed by node-fetch over https.
 */
function ftpUrl(opts: JatsOptions) {
  const library = opts.library === 'authoring' ? 'articleauthoring' : opts.library;
  return `https://ftp.ncbi.nih.gov/pub/jats/${library}/${opts.jats}/${dtdZipFile(opts)}`;
}

/**
 * Create a DTS-filename-options lookup for implicitly setting options based on JATS header content
 */
function buildDtdFileLookup() {
  const lookup: Record<string, Omit<JatsOptions, 'directory'>> = {};
  JATS_VERSIONS.filter((jats) => jats === '1.2' || jats.startsWith('1.3')).forEach((jats) => {
    MATHML_VERSIONS.forEach((mathml) => {
      JATS_LIBRARIES.forEach((library) => {
        (library === 'authoring' ? [false] : [true, false]).forEach((oasis) => {
          const opts: Omit<JatsOptions, 'directory'> = { jats, mathml, library, oasis };
          lookup[dtdFile(opts)] = opts;
        });
      });
    });
  });
  return lookup;
}

/**
 * Infer DTD options from file content
 *
 * This looks at DTD file name in DOCTYPE as well as dtd-version in article element
 */
export function inferOptions(file: string) {
  const data = fs.readFileSync(file).toString();
  const doctype = data.match(/<!DOCTYPE [\s\S]+?">/g)?.[0];
  const lookup = buildDtdFileLookup();
  let opts: Partial<JatsOptions> = {};
  Object.entries(lookup).forEach(([key, value]) => {
    if (doctype?.includes(key)) opts = { ...value };
  });
  const article = data.match(/<article [\s\S]+?>/g)?.[0];
  JATS_VERSIONS.forEach((jats) => {
    if (article?.includes(`dtd-version="${jats}"`)) opts.jats = jats;
  });
  return opts;
}

/**
 * Download DTD zip file from NIH FTP server
 */
async function dtdDownload(session: ISession, opts: JatsOptions) {
  if (!fs.existsSync(opts.directory)) {
    fs.mkdirSync(opts.directory, { recursive: true });
  }
  session.log.info(`🌎 Downloading: ${ftpUrl(opts)}`);
  session.log.debug(`Saving to ${localDtdZipFile(opts)}`);
  const resp = await fetch(ftpUrl(opts));
  const arrayBuffer = await resp.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  writeFileToFolder(localDtdZipFile(opts), buffer as Uint8Array);
}

/**
 * Download DTD zip file from NIH FTP server if it does not yet exist
 */
async function ensureDtdZipExists(session: ISession, opts: JatsOptions) {
  if (!fs.existsSync(path.join(opts.directory, dtdZipFile(opts)))) {
    await dtdDownload(session, opts);
  }
}

/**
 * Download and extract DTD file if it does not yet exist
 */
async function ensureDtdExists(session: ISession, opts: JatsOptions) {
  if (!fs.existsSync(localDtdFile(opts))) {
    await ensureDtdZipExists(session, opts);
    const zipFile = localDtdZipFile(opts);
    session.log.info(`🤐 Unzipping template: ${zipFile}`);
    const zip = new AdmZip(zipFile);
    zip.extractAllTo(opts.directory);
  }
}

/**
 * Test if xmllint is available as a cli command
 */
export function isXmllintAvailable() {
  return which.sync('xmllint', { nothrow: true });
}

/**
 * Run xmllint validation
 */
export async function xmllintValidate(session: Pick<ISession, 'log'>, file: string, dtd: string) {
  if (!isXmllintAvailable()) {
    session.log.error(
      `JATS validation against DTD requires xmllint\n\n${chalk.dim(
        'To install:\n  mac:    brew install xmlstarlet\n  debian: apt install libxml2-utils',
      )}`,
    );
    return;
  }
  try {
    // First drop DOCTYPE with DTD in it - we have already fetched the DTD
    const dropDtdCommand = `xmllint --dropdtd`;
    const validateCommand = `xmllint --noout --dtdvalid ${dtd}`;
    await makeExecutable(`${dropDtdCommand} ${file} | ${validateCommand} -`, session.log)();
  } catch {
    return false;
  }
  return true;
}

/**
 * Check if JATS file is valid based on JATS version/library/etc.
 *
 * Returns true if valid and false if invalid.
 */
export async function validateJatsAgainstDtd(
  session: ISession,
  file: string,
  opts?: Partial<JatsOptions>,
) {
  const inferredOpts = inferOptions(file);
  const validatedOpts = validateOptions(session, opts ?? {}, inferredOpts);
  await ensureDtdExists(session, validatedOpts);
  session.log.debug(`Validating against: ${localDtdFile(validatedOpts)}`);
  session.log.info(`🧐 Validating against: ${dtdFolder(validatedOpts)}`);
  const valid = await xmllintValidate(session, file, localDtdFile(validatedOpts));
  return valid;
}

/**
 * Check if JATS file is valid based on JATS version/library/etc.
 *
 * Logs confirmation message if valid and throws an error if invalid.
 */
export async function validateJatsAgainstDtdWrapper(
  session: ISession,
  file: string,
  opts?: Partial<JatsOptions>,
) {
  const success = await validateJatsAgainstDtd(session, file, opts);
  if (success) {
    session.log.info(chalk.greenBright('JATS validation passed!'));
  } else {
    throw new Error('JATS validation failed.');
  }
}
