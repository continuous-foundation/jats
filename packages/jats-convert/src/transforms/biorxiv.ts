import type { GenericNode } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import type { VFile } from 'vfile';
import { jatsFileWarn } from '../messages.js';
import { toText } from '../utils.js';

export function isBioRxiv(tree?: GenericNode) {
  const journalId = select('journal-id[journal-id-type=hwp]', tree);
  return toText(journalId) === 'biorxiv';
}

export function graphicToBioRxivUrl(
  fullTree?: GenericNode, // full JATS tree with frontmatter
  body?: GenericNode, // for processing
  file?: VFile,
) {
  if (!isBioRxiv(fullTree)) return;
  const accepted = select('date[date-type=accepted]', fullTree);
  if (!accepted) {
    jatsFileWarn(file, 'Skipped bioRxiv figure URL rewrite; missing accepted date', {
      source: 'jats-convert:biorxiv',
    });
    return;
  }
  const year = toText(select('year', accepted));
  const month = toText(select('month', accepted)).padStart(2, '0');
  const day = toText(select('day', accepted)).padStart(2, '0');
  const slug = toText(select('article-id[pub-id-type=doi]', fullTree))
    .split('/')
    .slice(1)
    .join('/');
  const urlBase = `https://www.biorxiv.org/content/biorxiv/early/${year}/${month}/${day}/${slug}`;
  selectAll('fig,table-wrap', body).forEach((node: GenericNode) => {
    const figId = node['hwp:id'];
    if (!figId) {
      jatsFileWarn(file, 'Skipped bioRxiv figure URL rewrite; missing hwp:id', {
        source: 'jats-convert:biorxiv',
        note: node.id ? `id=${node.id}` : `type=${node.type}`,
      });
      return;
    }
    const graphic = select('graphic', node) as GenericNode;
    if (!graphic) {
      jatsFileWarn(file, 'Skipped bioRxiv figure URL rewrite; missing graphic', {
        source: 'jats-convert:biorxiv',
        note: `fig-id=${figId}`,
      });
      return;
    }
    graphic['xlink:href'] = `${urlBase}/${figId}.large.jpg`;
  });
}
