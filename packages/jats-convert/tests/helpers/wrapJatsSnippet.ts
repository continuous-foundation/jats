import fs from 'node:fs';
import path from 'node:path';

/** Default when a fragment is wrapped or a bare `<article>` needs a DOCTYPE line. */
const DEFAULT_DOCTYPE = `<!DOCTYPE article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.0 20120330//EN" "JATS-archivearticle1.dtd">\n`;

const DEFAULT_ARTICLE_META = `<front><article-meta>
  <title-group><article-title>Test</article-title></title-group>
  <pub-date pub-type="epub"><day>01</day><month>01</month><year>2020</year></pub-date>
</article-meta></front>`;

export type ResolvedJatsInput = {
  content: string;
  fromFile: boolean;
};

/**
 * If `path.join(testsDir, jats)` is a file, read it; otherwise treat `jats` as XML text.
 */
export function resolveJatsInput(testsDir: string, jats: string): ResolvedJatsInput {
  const trimmed = jats.trim();
  const filePath = path.join(testsDir, jats);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    return { content: fs.readFileSync(filePath, 'utf8'), fromFile: true };
  }
  return { content: trimmed, fromFile: false };
}

/** Whole JATS document: XML declaration, DOCTYPE, or root `<article>` / `<pmc-articleset>`. */
export function isFullJatsDocument(xml: string): boolean {
  const t = xml.trim();
  if (/^\s*<\?xml/i.test(t)) return true;
  if (/^\s*<!DOCTYPE/i.test(t)) return true;
  if (/^\s*<pmc-articleset[\s>]/i.test(t)) return true;
  if (/^\s*<article[\s>]/i.test(t)) return true;
  return false;
}

function finalizeFullDocument(xml: string): string {
  const t = xml.trim();
  if (/^\s*<!DOCTYPE/i.test(t)) return t;
  if (/^\s*<\?xml/i.test(t)) return t;
  if (/^\s*<pmc-articleset[\s>]/i.test(t)) return t;
  if (/^\s*<article[\s>]/i.test(t)) return `${DEFAULT_DOCTYPE}${t}`;
  return t;
}

/**
 * Wrap a body/back fragment into a minimal `<article>` acceptable to `new Jats(...)`.
 * If `inner` already has `<body>`, it is not wrapped again; optional `jatsBack` is appended after it.
 */
export function wrapJatsFragment(inner: string, jatsBack?: string): string {
  const back = jatsBack?.trim() ? `<back>${jatsBack.trim()}</back>` : '';
  const t = inner.trim();

  if (/<back[\s>]/i.test(t)) {
    if (/<body[\s>]/i.test(t)) {
      return `${DEFAULT_DOCTYPE}<article>${t}</article>`;
    }
    return `${DEFAULT_DOCTYPE}<article><body></body>${t}</article>`;
  }
  if (/<body[\s>]/i.test(t)) {
    const prefix = /<front[\s>]/i.test(t) ? '' : DEFAULT_ARTICLE_META;
    return `${DEFAULT_DOCTYPE}<article>${prefix}${t}${back}</article>`;
  }
  return `${DEFAULT_DOCTYPE}<article>${DEFAULT_ARTICLE_META}<body>${t}</body>${back}</article>`;
}

function validateJatsBack(
  resolved: ResolvedJatsInput,
  jatsBack: string | undefined,
  caseTitle: string,
): void {
  if (!jatsBack?.trim()) return;
  if (resolved.fromFile) {
    throw new Error(
      `Case "${caseTitle}": jats_back is not allowed when jats is loaded from a file`,
    );
  }
  if (/<back[\s>]/i.test(resolved.content)) {
    throw new Error(
      `Case "${caseTitle}": jats_back is not allowed when jats already contains <back>`,
    );
  }
}

/**
 * Resolve `jats` (file path under `testsDir` or inline XML), then normalize to parseable JATS.
 */
export function prepareJatsXmlForConvert(
  testsDir: string,
  jats: string,
  jatsBack: string | undefined,
  caseTitle: string,
): string {
  const resolved = resolveJatsInput(testsDir, jats);
  validateJatsBack(resolved, jatsBack, caseTitle);
  if (isFullJatsDocument(resolved.content)) {
    return finalizeFullDocument(resolved.content);
  }
  return wrapJatsFragment(resolved.content, jatsBack);
}
