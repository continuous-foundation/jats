import type { Node } from 'unist-util-select';
import { copyNode as mystCopyNode, toText as mystToText } from 'myst-common';
import type { ISession } from 'jats-xml';
import type { VFile } from 'vfile';

/**
 * toText function that handles newer version of unist
 */
export function toText(node: Node | undefined) {
  return mystToText(node as any);
}

function bibtexPlainText(value: string | Node | undefined | null): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return toText(value);
}

/**
 * Escape LaTeX special characters for BibTeX braced field values.
 *
 * citation-js and other BibTeX parsers treat `$`, `%`, etc. as LaTeX syntax;
 * unescaped values (e.g. "$1,000" in a collab author) fail to parse.
 */
export function escapeBibtex(value: string | Node | undefined | null): string {
  return bibtexPlainText(value)
    .replace(/\\/g, '\\\\')
    .replace(/([{}$%#&_^~])/g, '\\$1');
}

/** Format plain text as a braced BibTeX field value. */
export function bibtexField(value: string | Node | undefined | null): string {
  return `{${escapeBibtex(value)}}`;
}

/**
 * Extract raw text while preserving whitespace/newlines, ignoring markup nodes.
 *
 * This is useful for JATS nodes like `<preformat>` that may contain inline tags
 * (`<bold>`, `<italic>`, etc.) but should serialize as preformatted text.
 */
export function toTextPreserveWhitespace(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.value === 'string') return node.value;
  if (typeof node.cdata === 'string') return node.cdata;
  const children: any[] | undefined = node.children;
  if (!children || children.length === 0) return '';
  return children.map((child) => toTextPreserveWhitespace(child)).join('');
}

/**
 * copyNode function that handles newer version of unist
 */
export function copyNode(node: Node) {
  return mystCopyNode(node as any);
}

export function vfileMessagesForLogInfo(file: VFile) {
  return file.messages.map((message) => ({
    reason: message.reason,
    note: message.note,
    fatal: message.fatal,
    source: message.source,
    ruleId: (message as { ruleId?: string }).ruleId,
  }));
}

export function logMessagesFromVFile(session: ISession, file?: VFile): void {
  if (!file) return;
  file.messages.forEach((message) => {
    const kind = message.fatal === null ? 'info' : message.fatal === false ? 'warn' : 'error';
    const note = message?.note ? `\n   Note: ${message.note}` : '';
    const url = message?.url ? `\n   See also: ${message.url}\n` : '';
    const prefix = message?.file ? `${message?.file} ` : '';
    const formatted = `${message.reason}${note}${url}`;
    switch (kind) {
      case 'info':
        session.log.info(`ℹ️  ${prefix}${formatted}`);
        break;
      case 'error':
        session.log.error(`⛔️ ${prefix}${formatted}`);
        break;
      case 'warn':
        session.log.warn(`⚠️  ${prefix}${formatted}`);
        break;
      default:
        session.log.debug(`${prefix}${formatted}`);
        break;
    }
  });
  file.messages = [];
}
