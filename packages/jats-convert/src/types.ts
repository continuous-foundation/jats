import type { PageFrontmatter } from 'myst-frontmatter';
import type { GenericNode, GenericParent, MessageInfo } from 'myst-common';
import type { Jats } from 'jats-xml';
import type { VFile } from 'vfile';

export type Handler = (node: GenericNode, state: IJatsParser, parent: any) => void;

export type JatsResult = {
  tree: GenericParent;
  frontmatter: PageFrontmatter;
};

export type MathPlugins = Required<PageFrontmatter>['math'];

export type Options = {
  vfile?: VFile;
  handlers?: Record<string, Handler>;
  dir?: string;
  logInfo?: Record<string, any>;
  pmidCache?: Record<string, string | null>;
  // If true, this will leave citations with DOIs to be resolved later
  dois?: boolean;
  // If true, this will write a bibtex file, as necessary
  bibtex?: boolean;
};

export type StateData = {
  isInContainer?: boolean;
  /** label/identifier from table-wrap when rendering without a container */
  xrefTarget?: { label?: string; identifier?: string };
};

export interface IJatsParser<D extends Record<string, any> = StateData> {
  file: VFile;
  data: D;
  handlers: Record<string, Handler>;
  jats: Jats;
  options: Options;
  stack: GenericNode[];
  top: () => GenericNode;
  text: (value?: string) => void;
  renderChildren: (node: any) => void;
  renderInline: (node: GenericNode, name: string, attributes?: Record<string, any>) => void;
  addLeaf: (name: string, attributes?: Record<string, any>) => void;
  openNode: (name: string, attributes?: Record<string, any>) => void;
  closeNode: () => void;
  warn: (message: string, source?: string, opts?: MessageInfo) => void;
  error: (message: string, source?: string, opts?: MessageInfo) => void;
}
