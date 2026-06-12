import type { GenericNode } from 'myst-common';
import { select, selectAll } from 'unist-util-select';

export const MEDIA_FIGURE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.gif',
  '.tiff',
  '.tif',
  '.eps',
  '.webp',
  '.mp4',
  '.mov',
  '.avi',
];

export function isFigureMediaUrl(url: string | undefined): boolean {
  if (!url) return false;
  return MEDIA_FIGURE_EXTENSIONS.some((ext) => url.toLowerCase().endsWith(ext));
}

export function mimeTypeFromMedia(media: GenericNode): string | undefined {
  const type = media.mimetype;
  const subtype = media['mime-subtype'];
  if (typeof type === 'string' && typeof subtype === 'string' && type && subtype) {
    return `${type}/${subtype}`;
  }
  return undefined;
}

const MIME_SUBTYPE_LABELS: Record<string, string> = {
  pdf: 'pdf',
  'vnd.ms-excel': 'xls',
  'vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'vnd.ms-powerpoint': 'ppt',
  'vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  msword: 'doc',
  zip: 'zip',
  'x-zip-compressed': 'zip',
  json: 'json',
  xml: 'xml',
  csv: 'csv',
  plain: 'txt',
};

export function fileTypeLabel(media: GenericNode, url: string): string {
  const subtype = media['mime-subtype'];
  if (typeof subtype === 'string' && MIME_SUBTYPE_LABELS[subtype]) {
    return MIME_SUBTYPE_LABELS[subtype];
  }
  const ext = url.split(/[?#]/)[0]?.split('.').pop()?.toLowerCase();
  if (ext) return ext;
  return 'file';
}

export function supplementaryFileLinkLabel(index: number, media: GenericNode, url: string): string {
  return `Supplementary File ${index + 1} (${fileTypeLabel(media, url)})`;
}

export function captionFromSupplementary(
  node: GenericNode,
  media?: GenericNode,
): GenericNode | undefined {
  const labelElement = select('label', node) as GenericNode | undefined;
  let caption = (select('caption', media) ?? labelElement) as GenericNode | undefined;
  if (caption?.children?.length === 1 && caption.children[0].type === 'p') {
    caption = caption.children[0];
  }
  return caption;
}

/** Direct children handled implicitly when rendering media (not rendered separately). */
const SUPPLEMENTARY_HANDLED_CHILD_TYPES = new Set(['media', 'label']);

/** Child element types on supplementary-material that are not converted alongside media. */
export function unhandledSupplementaryChildTypes(node: GenericNode): string[] {
  const types = (node.children ?? [])
    .filter((child) => !SUPPLEMENTARY_HANDLED_CHILD_TYPES.has(child.type))
    .map((child) => child.type);
  return [...new Set(types)];
}
