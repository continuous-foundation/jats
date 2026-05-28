import fs from 'node:fs';
import path from 'node:path';
import { unified } from 'unified';
import type { Plugin } from 'unified';
import { VFile } from 'vfile';
import { dump, load } from 'js-yaml';
import type { MessageInfo, GenericNode, GenericParent } from 'myst-common';
import { copyNode, normalizeLabel } from 'myst-common';
import { flushJatsPrologWarnings, Jats } from 'jats-xml';
import { select, selectAll } from 'unist-util-select';
import { u } from 'unist-builder';
import type { Body, License, LinkMixin } from 'jats-tags';
import { RefType } from 'jats-tags';
import type { ISession } from 'jats-xml';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { js2xml } from 'xml-js';
import type { Handler, IJatsParser, JatsResult, Options, StateData } from './types.js';
import { basicTransformations, journalTransforms } from './transforms/index.js';
import type { ProjectFrontmatter } from 'myst-frontmatter';
import { abstractTransform, descriptionFromAbstract } from './transforms/abstract.js';
import {
  getPMIDLookup,
  processJatsReferences,
  resolveJatsCitations,
} from './transforms/references.js';
import { backToBodyTransform, tableFootnotesToLegend } from './transforms/footnotes.js';
import version from './version.js';
import { jatsFileError, jatsFileWarn } from './messages.js';
import {
  logMessagesFromVFile,
  toText,
  toTextPreserveWhitespace,
  vfileMessagesForLogInfo,
} from './utils.js';
import { inlineCitationsTransform } from './myst/inlineCitations.js';
import {
  abbreviationFootnoteTransform,
  abbreviationSectionTransform,
} from './transforms/abbreviations.js';
import { floatToEndTransform } from './transforms/supplementary.js';
import { dataAvailabilityTransform } from './transforms/parts.js';
import { abbreviationsFromTree } from './myst/abbreviations.js';

const MEDIA_FIGURE_EXTENSIONS = [
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

function refTypeToReferenceKind(kind?: RefType): string | undefined {
  switch (kind) {
    case RefType.sec:
      return 'heading';
    case RefType.fig:
      return 'figure';
    case RefType.dispFormula:
      return 'equation';
    case RefType.table:
      return 'table';
    case RefType.custom:
      return undefined;
  }
}

function texMathFromNode(node: GenericNode) {
  const texMath = select('tex-math', node) as GenericNode;
  if (texMath && texMath.children?.[0].cdata) {
    return texMath.children?.[0].cdata;
  }
  selectAll('*', node).forEach((n: any) => {
    if (n.type.startsWith('mml:')) {
      n.type = n.type.substring(4);
    }
  });
  const math = select('math', node) as GenericNode;
  if (!math) return;
  [math, ...selectAll('math *', node)].forEach((n: any) => {
    const { type, value, children, ...attributes } = n;
    if (type === 'text') {
      n.type = 'text';
      n.text = value;
      delete n.value;
    } else {
      n.type = 'element';
      n.name = type;
      n.elements = children;
      n.attributes = attributes;
      delete n.children;
      Object.keys(attributes).forEach((k) => {
        delete n[k];
      });
    }
  });
  return MathMLToLaTeX.convert(js2xml({ type: 'element', name: 'root', elements: [math] }));
}

type Attributes = Record<string, any>;

const handlers: Record<string, Handler> = {
  body(node, state) {
    state.renderChildren(node);
  },
  text(node, state) {
    state.text(node.value);
  },
  p(node, state) {
    state.renderInline(node, 'paragraph');
  },
  heading(node, state) {
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.renderInline(node, 'heading', {
      enumerated: true,
      label,
      identifier,
      depth: node.depth,
    });
  },
  block(node, state) {
    state.renderInline(node, 'block', { data: { part: node.part ?? node['sec-type'] } });
  },
  ['disp-quote'](node, state) {
    state.renderInline(node, 'blockquote', { kind: node['content-type'] });
  },
  // definitionList(node, state) {
  //   state.renderInline(node, 'def-list');
  // },
  // definitionItem(node, state) {
  //   state.renderInline(node, 'def-item');
  // },
  // definitionTerm(node, state) {
  //   state.renderInline(node, 'term');
  // },
  // definitionDescription(node, state) {
  //   state.renderInline(node, 'def');
  // },
  // code(node, state) {
  //   const { lang } = node as Code;
  //   state.renderInline(node, 'code', { lang });
  // },
  preformat(node, state) {
    state.addLeaf('code', { value: toTextPreserveWhitespace(node), lang: 'text' });
  },
  list(node, state) {
    // https://jats.nlm.nih.gov/archiving/tag-library/1.3/element/list.html
    state.renderInline(node, 'list', {
      ordered: node['list-type'] === 'ordered',
    });
  },
  ['list-item'](node, state) {
    state.renderInline(node, 'listItem');
  },
  ['inline-formula'](node, state) {
    const texMath = texMathFromNode(node);
    if (texMath) {
      const { label, identifier } = normalizeLabel(node.id) ?? {};
      state.addLeaf('inlineMath', {
        value: texMath,
        label,
        identifier,
      });
    } else {
      state.warn('Reduced inline-formula without TeX or MathML to child nodes', 'inline-formula', {
        note: node.id ? `id=${node.id}` : undefined,
      });
      state.renderChildren(node);
    }
  },
  ['disp-formula'](node, state) {
    const texMath = texMathFromNode(node);
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    if (texMath) {
      state.addLeaf('math', {
        value: texMath,
        label,
        identifier,
      });
    } else {
      state.warn('Converted disp-formula without TeX or MathML to paragraph', 'disp-formula', {
        note: node.id ? `id=${node.id}` : undefined,
      });
      if (node.id) {
        state.openNode('div', { label, identifier });
      }
      state.openNode('paragraph');
      state.renderChildren(node);
      state.closeNode();
      if (node.id) {
        state.closeNode();
      }
    }
  },
  bold(node, state) {
    state.renderInline(node, 'strong');
  },
  italic(node, state) {
    state.renderInline(node, 'emphasis');
  },
  underline(node, state) {
    state.renderInline(node, 'underline');
  },
  monospace(node, state) {
    state.renderInline(node, 'inlineCode');
  },
  sub(node, state) {
    state.renderInline(node, 'subscript');
  },
  sup(node, state) {
    state.renderInline(node, 'superscript');
  },
  strike(node, state) {
    state.renderInline(node, 'delete');
  },
  sc(node, state) {
    state.renderInline(node, 'smallcaps');
  },
  // break(node, state) {
  //   // https://jats.nlm.nih.gov/archiving/tag-library/1.3/element/break.html
  //   state.addLeaf('break');
  // },
  // // abbreviation(node, state) {
  // //   // TODO: \newacronym{gcd}{GCD}{Greatest Common Divisor}
  // //   // https://www.overleaf.com/learn/latex/glossaries
  // //   state.renderChildren(node, true);
  // // },
  ['ext-link'](node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  uri(node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  ['boxed-text'](node, state) {
    if (node.id) {
      const { label, identifier } = normalizeLabel(node.id) ?? {};
      state.openNode('div', { label, identifier });
    }
    state.renderInline(node, 'admonition', { kind: 'note' });
    if (node.id) {
      state.closeNode();
    }
  },
  admonitionTitle(node, state) {
    // This is created in a transform!
    state.renderInline(node, 'admonitionTitle');
  },
  // attrib(node, state) {
  //   // This is used inside of disp-quotes
  //   state.renderInline(node, 'attrib');
  // },
  // image(node, state) {
  //   if (node.url?.startsWith('http')) {
  //     state.warn(`Image URL is remote (${node.url})`, node, 'image');
  //   }
  //   if (state.data.isInContainer && node.alt) {
  //     state.openNode('alt-text');
  //     state.text(node.alt);
  //     state.closeNode();
  //   }
  //   // TOOD: identifier?
  //   state.addLeaf('graphic', { 'xlink:href': node.url });
  // },
  ['fig-group'](node, state) {
    state.openNode('tabSet');
    node.children?.forEach((n) => {
      state.openNode('tabItem', {
        title: toText(select('label', n)),
        sync: toText(select('label', n)),
      });
      state.renderChildren({ children: [n] });
      state.closeNode();
    });
    state.closeNode();
  },
  graphic(node, state) {
    const link = node?.['xlink:href'];
    if (!link) {
      state.warn('Graphic has no xlink:href', 'graphic');
    }
    state.addLeaf('image', { url: link });
  },
  ['inline-graphic'](node, state) {
    const link = node?.['xlink:href'];
    if (!link) {
      state.warn('Inline-graphic has no xlink:href', 'inline-graphic');
    }
    state.addLeaf('image', { url: link });
  },
  fig(node, state) {
    const caption = select('caption', node) as GenericNode;
    const graphic = select('graphic,media', node) as GenericNode;
    const title = select('title', node) as GenericNode;
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('container', { label, identifier, kind: 'figure' });
    const wasInContainer = state.data.isInContainer;
    state.data.isInContainer = true;
    const link = graphic?.['xlink:href'];
    if (link) {
      state.addLeaf('image', { url: link });
    } else {
      const detail = graphic ? 'graphic or media without xlink:href' : 'no graphic or media child';
      state.warn('Figure has no image URL', 'fig', {
        note: node.id ? `id=${node.id} ${detail}` : detail,
      });
    }
    state.openNode('caption');
    if (title) {
      state.openNode('strong');
      state.renderChildren(title);
      state.closeNode();
    }
    // caption number?
    if (caption) {
      state.renderChildren(caption);
    }
    state.closeNode();
    state.closeNode();
    state.data.isInContainer = wasInContainer;
  },
  ['table-wrap'](node, state) {
    const captionNode = select('caption', node) as GenericNode | undefined;
    const labelNode = select('label', node) as GenericNode | undefined;
    const titleNode = select('title', node) as GenericNode | undefined;
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('container', { label, identifier, kind: 'table' });
    const wasInContainer = state.data.isInContainer;
    state.data.isInContainer = true;
    state.openNode('caption');
    if (titleNode) {
      state.openNode('strong');
      state.renderChildren(titleNode);
      state.closeNode();
      titleNode.type = '__ignore__';
    }
    if (captionNode || labelNode) {
      state.renderChildren(captionNode || labelNode);
      if (captionNode) captionNode.type = '__ignore__';
      if (labelNode) labelNode.type = '__ignore__';
    }
    state.closeNode();
    state.renderChildren(node);
    state.closeNode();
    state.data.isInContainer = wasInContainer;
  },
  table(node, state) {
    state.openNode('table');
    state.renderChildren(node);
    state.closeNode();
  },
  thead(node, state) {
    state.renderChildren(node);
  },
  tbody(node, state) {
    state.renderChildren(node);
  },
  tfoot(node, state) {
    state.renderChildren(node);
  },
  tr(node, state) {
    state.openNode('tableRow');
    state.renderChildren(node);
    state.closeNode();
  },
  th(node, state) {
    const { align, colspan, rowspan } = node;
    state.openNode('tableCell', { header: true, align, colspan, rowspan });
    state.renderChildren(node);
    state.closeNode();
  },
  td(node, state) {
    const { align, colspan, rowspan } = node;
    state.openNode('tableCell', { align, colspan, rowspan });
    state.renderChildren(node);
    state.closeNode();
  },
  ['table-wrap-foot'](node, state) {
    state.openNode('legend');
    state.renderChildren(node);
    state.closeNode();
  },
  hr(node, state) {
    if (state.data.isInContainer) {
      state.warn('Dropped hr inside figure or table container', 'hr');
      return;
    }
    state.addLeaf('thematicBreak');
  },
  alternatives(node, state) {
    const choice = node.children?.find((child) => !!state.handlers[child.type]);
    if (!choice) {
      const types = node.children?.map((child) => child.type).join(', ') ?? '';
      state.error('No supported types in alternatives node', 'alternatives', {
        note: types ? `children=${types}` : undefined,
      });
    } else {
      const dropped = node.children
        ?.filter((child) => child !== choice)
        .map((child) => child.type)
        .join(', ');
      if (dropped) {
        state.warn('Using first supported alternative only', 'alternatives', {
          note: `chosen=${choice.type} dropped=${dropped}`,
        });
      }
      state.handlers[choice.type](choice, state, node);
    }
  },
  break(node, state) {
    state.addLeaf('break');
  },
  ['named-content'](node, state) {
    const note = [
      node['content-type'] ? `content-type=${node['content-type']}` : undefined,
      node['specific-use'] ? `specific-use=${node['specific-use']}` : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    state.warn('Rendered named-content as child content only', 'named-content', {
      note: note || undefined,
    });
    state.renderChildren(node);
  },
  ['fn-group'](node, state) {
    state.renderChildren(node);
  },
  fn(node, state) {
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('footnoteDefinition', { label, identifier });
    state.renderChildren(node);
    state.closeNode();
  },
  xref(node, state) {
    const refType: RefType = node['ref-type'];
    if (!node.rid) {
      state.warn('xref missing rid', 'xref', { note: `ref-type=${refType}` });
    }
    const { label, identifier } = normalizeLabel(node.rid) ?? {};
    switch (refType) {
      case RefType.bibr:
      case RefType.ref:
        state.renderInline(node, 'cite', {
          label,
          identifier,
          kind: 'narrative',
        });
        return;
      case RefType.video:
      case RefType.app:
      case RefType.boxedText:
      case RefType.media:
      case RefType.supplementaryMaterial:
      case RefType.sec:
      case RefType.fig:
      case RefType.dispFormula:
      case RefType.table: {
        const kind = refTypeToReferenceKind(refType);
        state.renderInline(node, 'crossReference', { label, identifier, kind });
        return;
      }
      case RefType.fn:
      case RefType.tableFn: {
        state.addLeaf('footnoteReference', { label, identifier });
        return;
      }
      default: {
        state.renderInline(node, 'crossReference', { identifier: node.rid });
        state.warn('Unknown xref ref-type', 'xref', { note: `ref-type=${refType}` });
        return;
      }
    }
  },
  ['supplementary-material'](node, state) {
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    let maybeCaption: GenericNode | undefined;
    let media: GenericNode | undefined;
    if (node.children?.length === 1 && node.children[0].type === 'media') {
      media = node.children[0];
    } else if (
      node.children?.length === 2 &&
      node.children[0].type === 'label' &&
      node.children[1].type === 'media'
    ) {
      maybeCaption = node.children[0];
      media = node.children[1];
    }
    const url = media?.['xlink:href'];
    let caption = (select('caption', media) ?? maybeCaption) as GenericNode | undefined;
    if (caption?.children?.length === 1 && caption.children[0].type === 'p') {
      caption = caption.children[0];
    }
    if (url && MEDIA_FIGURE_EXTENSIONS.find((ext) => url.endsWith(ext))) {
      const title = select('title', media) as GenericNode | undefined;
      state.openNode('container', { label, identifier, kind: 'figure' });
      const wasInContainer = state.data.isInContainer;
      state.data.isInContainer = true;
      state.addLeaf('image', { url });
      state.openNode('caption');
      state.openNode('link', { url });
      if (title) {
        state.openNode('strong');
        state.renderChildren(title);
        state.closeNode();
      }
      if (caption) {
        state.renderChildren(caption);
      }
      state.closeNode();
      state.closeNode();
      state.closeNode();
      state.data.isInContainer = wasInContainer;
    } else {
      let detail: string;
      if (!media) {
        detail = 'missing expected media child';
      } else if (!url) {
        detail = 'media without xlink:href';
      } else {
        detail = `url not a figure media extension: ${url}`;
      }
      state.warn('Supplementary-material rendered as generic content', 'supplementary-material', {
        note: node.id ? `id=${node.id} ${detail}` : detail,
      });
      if (node.id) {
        state.openNode('div', { label, identifier });
      }
      state.renderChildren(node);
      if (node.id) {
        state.closeNode();
      }
    }
  },
  ['app-group'](node, state) {
    state.renderChildren(node);
  },
  app(node, state) {
    if (node.id) {
      const { label, identifier } = normalizeLabel(node.id) ?? {};
      state.openNode('div', { label, identifier });
    }
    state.renderChildren(node);
    if (node.id) {
      state.closeNode();
    }
  },
  media(node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  ['inline-supplementary-material'](node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  caption(node, state) {
    state.renderChildren(node);
  },
  email(node, state) {
    state.renderInline(node, 'link', { url: `mailto:${toText(node)}` });
  },
  // These nodes can be safely ignored
  label() {},
  comment() {},
  __ignore__() {},
  ['object-id'](node, state) {
    if (node['pub-id-type'] === 'doi') {
      state.top().doi = toText(node);
    } else if (node['pub-id-type']) {
      state.warn('Ignored object-id pub-id-type', 'object-id', {
        note: `pub-id-type=${node['pub-id-type']}`,
      });
    }
  },
};

const DEFAULT_HANDLERS = { ...handlers };

export class JatsParser implements IJatsParser {
  file: VFile;
  data: StateData;
  options: Options;
  handlers: Record<string, Handler>;
  stack: GenericNode[] = [];
  jats: Jats;

  unhandled: string[] = [];

  constructor(file: VFile, jats: Jats, opts?: Options) {
    this.file = file;
    this.jats = jats;
    this.options = opts ?? {};
    this.data = {};
    this.stack = [{ type: 'root', children: [] }];
    this.handlers = opts?.handlers ?? DEFAULT_HANDLERS;
  }

  top() {
    return this.stack[this.stack.length - 1];
  }

  warn(message: string, source?: string, opts?: MessageInfo) {
    jatsFileWarn(this.file, message, {
      ...opts,
      source: source ? `jats-convert:${source}` : undefined,
    });
  }

  error(message: string, source?: string, opts?: MessageInfo) {
    jatsFileError(this.file, message, {
      ...opts,
      source: source ? `jats-convert:${source}` : undefined,
    });
  }

  pushNode(el?: GenericNode) {
    const top = this.top();
    if (this.stack.length && el && 'children' in top) top.children?.push(el);
    return el;
  }

  text(text?: string) {
    const top = this.top();
    const value = text;
    if (!value || !this.stack.length || !('children' in top)) return;
    const last = top.children?.[top.children.length - 1];
    if (last?.type === 'text') {
      // The last node is also text, merge it
      last.value += `${value}`;
      return last;
    }
    const node = u('text', value);
    top.children?.push(node);
    return node;
  }

  renderChildren(node: GenericNode) {
    node.children?.forEach((child) => {
      const handler = this.handlers[child.type];
      if (handler) {
        handler(child, this, node);
      } else {
        this.unhandled.push(child.type);
        this.error('Unhandled JATS conversion for node', undefined, { note: `type=${child.type}` });
      }
    });
  }

  renderInline(node: GenericNode, name: string, attributes?: Attributes) {
    this.openNode(name, { ...attributes });
    if ('children' in node) {
      this.renderChildren(node);
    } else if ('value' in node && node.value) {
      this.text(node.value);
    }
    this.closeNode();
  }

  addLeaf(name: string, attributes?: Attributes) {
    this.openNode(name, attributes, true);
    this.closeNode();
  }

  openNode(name: string, attributes?: Attributes, isLeaf = false) {
    const node: GenericNode = { type: name, ...attributes };
    if (!isLeaf) node.children = [];
    this.stack.push(node);
  }

  closeNode() {
    const node = this.stack.pop();
    return this.pushNode(node);
  }
}

export const jatsConvertPlugin: Plugin<[Jats, Options?], Body, Body> = function (jats, opts) {
  this.Compiler = (body: Body, file: VFile) => {
    flushJatsPrologWarnings(jats, file);
    if (jats.abstract) {
      abstractTransform(jats.abstract, file);
      body.children = [
        u('block', { part: 'abstract' }, copyNode(jats.abstract).children),
        ...body.children,
      ];
    }
    // Can do better than this in the future, but for now, just put them at the end!
    const floatsGroup = selectAll('floats-group', jats.tree) as GenericParent[];
    if (floatsGroup.length > 0) {
      jatsFileWarn(file, 'Hoisted floats-group children into body', {
        source: 'jats-convert',
        note: `groups=${floatsGroup.length}`,
      });
      floatsGroup.forEach((g) => {
        body.children.push(...g.children);
      });
    }
    floatToEndTransform(body, file);
    backToBodyTransform(body, jats.back);
    dataAvailabilityTransform(body, file);
    const refLookup = processJatsReferences(body, jats.references, { ...opts, vfile: file });
    basicTransformations(body, file);
    journalTransforms(jats.tree, body, file);
    const state = new JatsParser(file, jats, opts);
    state.renderChildren(body);
    while (state.stack.length > 1) state.closeNode();
    const tree = state.stack[0] as GenericParent;
    if (state.unhandled.length && opts?.logInfo) {
      opts.logInfo.unhandled = [...new Set(state.unhandled)];
    }

    resolveJatsCitations(tree, refLookup, file);
    inlineCitationsTransform(
      tree,
      jats.references
        .map(({ id }) => {
          const { identifier } = normalizeLabel(id) ?? {};
          return identifier;
        })
        .filter((id): id is string => !!id),
      file,
    );

    const { frontmatter } = jats;
    abbreviationSectionTransform(tree, frontmatter, file);
    abbreviationFootnoteTransform(tree, frontmatter, file);
    abbreviationsFromTree(tree, frontmatter);
    tableFootnotesToLegend(tree, file);
    const abstract = selectAll('block', tree).find((block) => {
      return block.data && (block.data as any).part === 'abstract';
    });
    if (abstract) {
      frontmatter.description = descriptionFromAbstract(toText(abstract));
    }
    const result: JatsResult = {
      tree,
      frontmatter,
    };
    file.result = result;
    return file;
  };

  return (node: Body) => {
    return node;
  };
};

export function jatsConvertTransform(
  jats: Jats,
  opts?: Options,
): {
  tree: GenericParent;
  frontmatter: ProjectFrontmatter;
} {
  if (opts?.logInfo) {
    opts.logInfo.publisher = toText(select('publisher-name', jats.tree)) || null;
    opts.logInfo.journal = toText(select('journal-title', jats.tree)) || null;
    opts.logInfo.pmid = toText(select('article-id[pub-id-type=pmid]', jats.tree)) || null;
    opts.logInfo.pmc = toText(select('article-id[pub-id-type=pmc]', jats.tree)) || null;
    opts.logInfo.doi = toText(select('article-id[pub-id-type=doi]', jats.tree)) || null;
    opts.logInfo.year = toText(select('year', jats.publicationDate)) || null;
    const license = select('license', jats.tree) as License | undefined;
    let licenseString: string | null = null;
    if (license?.['xlink:href']) {
      licenseString = license['xlink:href'];
    } else if (select('[type=ali\\:license_ref]', license)) {
      licenseString = toText(select('[type=ali\\:license_ref]', license));
    } else if (selectAll('ext-link', license).length === 1) {
      licenseString = (select('ext-link', license) as LinkMixin)['xlink:href'] ?? null;
    } else if (license) {
      licenseString = toText(license);
    }
    opts.logInfo.license = licenseString;
  }
  const file = opts?.vfile ?? new VFile();
  const pipe = unified().use(jatsConvertPlugin, jats, opts);
  pipe.stringify(copyNode(jats.body ?? { type: 'body', children: [] }) as Body, file);
  const { tree, frontmatter } = file.result as JatsResult;
  if (opts?.logInfo && file.messages.length) {
    opts.logInfo.messages = vfileMessagesForLogInfo(file);
  }
  if (opts?.logInfo) {
    opts.logInfo.figures = {
      body: selectAll('fig', jats.body).length,
      back: selectAll('fig', jats.back).length,
      myst: selectAll('container[kind=figure]', tree).length,
    };
    opts.logInfo.tables = {
      body: selectAll('table-wrap', jats.body).length,
      back: selectAll('table-wrap', jats.back).length,
      myst: selectAll('container[kind=table]', tree).length,
    };
    opts.logInfo.math = {
      inline: {
        body: selectAll('inline-formula', jats.body).length,
        back: selectAll('inline-formula', jats.back).length,
        myst: selectAll('inlineMath', tree).length,
      },
      equations: {
        body: selectAll('disp-formula', jats.body).length,
        back: selectAll('disp-formula', jats.back).length,
        myst: selectAll('math', tree).length,
      },
    };
    opts.logInfo.footnotes = {
      body: selectAll('fn', jats.body).length,
      back: selectAll('fn', jats.back).length,
      myst: selectAll('footnoteDefinition', tree).length,
    };
  }
  return { tree, frontmatter };
}

export async function jatsConvert(
  session: ISession,
  input?: string,
  opts?: { frontmatter?: 'page' | 'project' | false; dois?: boolean; bibtex?: boolean },
) {
  const logInfo: Record<string, any> = { jatsVersion: version };
  if (!input) {
    const xmls = fs.readdirSync('.').filter((file) => path.extname(file) === '.xml');
    if (xmls.length === 0) {
      throw new Error('No JATS xml file found in current directory; please specify input');
    }
    if (xmls.length > 1) {
      throw new Error('Multiple XML files found in current directory; please specify input');
    }
    input = xmls[0];
  }
  const dir = path.dirname(input);
  const vfile = new VFile();
  vfile.path = input;
  const jats = new Jats(fs.readFileSync(input).toString(), { vfile, source: input });
  const pmidCache = await getPMIDLookup(jats.references, dir);
  const { tree, frontmatter } = jatsConvertTransform(jats, {
    vfile,
    dir,
    logInfo,
    pmidCache,
    dois: opts?.dois,
    bibtex: opts?.bibtex,
  });
  logMessagesFromVFile(session, vfile);
  const basename = path.basename(input, path.extname(input));
  const mystJson = path.join(dir, `${basename}.myst.json`);
  const mystYml = path.join(dir, 'myst.yml');
  const logJson = path.join(dir, `${basename}.log.json`);
  const logYml = path.join(dir, `${basename}.log.yml`);
  fs.writeFileSync(logJson, JSON.stringify(logInfo, null, 2));
  fs.writeFileSync(logYml, dump(logInfo));
  if (opts?.frontmatter === 'page') {
    fs.writeFileSync(mystJson, JSON.stringify({ mdast: tree, frontmatter }, null, 2));
  } else if (opts?.frontmatter === 'project') {
    if (fs.existsSync(mystYml)) {
      // console.log('myst.yml exists; overriding with frontmatter from JATS');
      const previous = load(fs.readFileSync(mystYml).toString()) as {
        version: number;
        project: ProjectFrontmatter;
        site: Record<string, any>;
      };
      fs.writeFileSync(
        mystYml,
        dump({ ...previous, project: { ...previous.project, ...frontmatter } }),
      );
    } else {
      // console.log(`writing new myst.yml file`);
      fs.writeFileSync(mystYml, dump({ version: 1, project: frontmatter, site: {} }));
    }
    fs.writeFileSync(
      mystJson,
      JSON.stringify({ mdast: tree, frontmatter: { title: frontmatter.title } }, null, 2),
    );
  } else {
    // console.log(`ignoring frontmatter`);
    fs.writeFileSync(
      mystJson,
      JSON.stringify({ mdast: tree, frontmatter: { title: frontmatter.title } }, null, 2),
    );
  }
}
