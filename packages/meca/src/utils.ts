import fs from 'node:fs';
import path from 'node:path';
import os from 'os';
import type { GenericNode } from 'myst-common';
import type { Element } from 'xml-js';

import { select as unistSelect, selectAll as unistSelectAll } from 'unist-util-select';

export function createTempFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'meca'));
}

export function removeTempFolder(tempFolder?: string) {
  if (tempFolder && fs.existsSync(tempFolder)) {
    fs.rmSync(tempFolder, { recursive: true });
  }
}

export function select<T extends GenericNode>(selector: string, node?: GenericNode): T | undefined {
  return (unistSelect(selector, node) ?? undefined) as T | undefined;
}

export function selectAll<T extends GenericNode>(selector: string, node?: GenericNode): T[] {
  return (unistSelectAll(selector, node) ?? undefined) as T[];
}

export function elementWithText(
  name: string,
  text: string,
  attributes?: Record<string, string>,
): Element {
  return { type: 'element', name, elements: [{ type: 'text', text }], attributes };
}
