import type { GenericNode, GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import type { Node as MystNode } from 'myst-spec';
import type { Element } from 'xml-js';
import { select } from 'unist-util-select';

/** `unist-util-select` returns @types/unist `Node`; `toText` expects myst-spec `Node`. */
export function nodeText(node: unknown): string {
  return toText(node as MystNode | undefined);
}

export function selectText(tree: GenericParent, selector: string): string {
  return nodeText(select(selector, tree));
}

export type ConvertToUnistContext = { insidePreformat?: boolean };

export function convertToUnist(
  node: Element,
  ctx?: ConvertToUnistContext,
): GenericNode | GenericParent | undefined {
  const insidePreformat = ctx?.insidePreformat ?? false;
  switch (node.type) {
    case 'element': {
      const { name, attributes, elements } = node;
      const nextInside = insidePreformat || name === 'preformat';
      const children = elements
        ?.map((el) => convertToUnist(el, { insidePreformat: nextInside }))
        .filter((n): n is GenericNode => !!n);
      const { type, ...attrs } = attributes ?? {};
      if (type !== undefined) attrs._type = type;
      const next: GenericNode = { type: name ?? 'unknown', ...attrs };
      if (name === 'code') {
        next.value = elements?.[0].text as string;
      } else if (children) next.children = children;
      return next;
    }
    case 'text': {
      const { attributes, text } = node;
      const raw = String(text);
      if (!insidePreformat && !raw.trim()) {
        return undefined;
      }
      const value = insidePreformat ? raw : raw.replace(/\n(\s+)$/, '');
      return {
        type: 'text',
        ...attributes,
        value,
      };
    }
    case 'cdata': {
      const { attributes, cdata } = node;
      const str = String(cdata);
      return {
        type: 'cdata',
        ...attributes,
        cdata: insidePreformat ? str : str.trim(),
      };
    }
    case 'comment': {
      const { comment } = node;
      return { type: 'comment', value: String(comment) };
    }
    case 'instruction': {
      // For example:
      // <?properties manuscript?> becomes:
      // { type: 'instruction', name: 'properties', instruction: 'manuscript' }
      return undefined;
    }
    default:
      console.log(node);
      throw new Error(`found ${node.type} ${node.name}`);
  }
}

export function convertToXml(node: GenericNode): Element {
  const { type, ...rest } = node;
  switch (type) {
    case 'text': {
      const { value, ...attributes } = rest;
      return { type: 'text', attributes, text: value };
    }
    case 'code': {
      const { value, ...attributes } = rest;
      return { type: 'element', name: type, attributes, elements: [{ type: 'text', text: value }] };
    }
    case 'comment': {
      return { type: 'comment', comment: rest.value };
    }
    case 'cdata': {
      const { cdata, ...attributes } = rest;
      return { type: 'cdata', attributes, cdata };
    }
    default: {
      const { children, _type, ...attributes } = rest;
      if (_type !== undefined) attributes.type = _type;
      return { type: 'element', name: type, attributes, elements: children?.map(convertToXml) };
    }
  }
}

export function escapeForXML(text: string) {
  return text.replace(/&(?!amp;)/g, '&amp;').replace(/</g, '&lt;');
}

const MonthLookup: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

export function toDate(date?: GenericParent): Date | undefined {
  if (!date) return;
  const isoDate = date['iso-8601-date'];
  if (isoDate) return new Date(isoDate);
  const year = Number(selectText(date, 'year'));
  if (!year || Number.isNaN(year)) return;
  const monthText = selectText(date, 'month');
  const monthTextNumber = Number(monthText);
  const month = Number.isNaN(monthTextNumber) ? MonthLookup[monthText] : monthTextNumber - 1;
  if (month == null) return new Date(Date.UTC(year, 0));
  const day = Number(selectText(date, 'day'));
  if (!day || Number.isNaN(day)) return new Date(Date.UTC(year, month));
  return new Date(Date.UTC(year, month, day));
}

export function formatDate(date?: Date) {
  if (!date) return;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}
