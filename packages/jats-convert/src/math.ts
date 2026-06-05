import type { GenericNode } from 'myst-common';
import { normalizeLabel } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { js2xml } from 'xml-js';
import type { Handler, IJatsParser } from './types.js';

/**
 * Extract a TeX/LaTeX string from a JATS `inline-formula` / `disp-formula` node.
 *
 * Prefers an explicit `<tex-math>` CDATA payload; otherwise converts embedded MathML
 * (with or without the `mml:` namespace prefix) to LaTeX. Returns `undefined` when the
 * formula contains neither (e.g. the equation is only provided as a graphic image).
 */
export function texMathFromNode(node: GenericNode) {
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

/** A rendered child that carries no visible content (e.g. whitespace between tags). */
function isWhitespaceText(child: GenericNode) {
  return child.type === 'text' && !String(child.value ?? '').trim();
}

/**
 * Render a formula that has no TeX/MathML as a math node whose children are the
 * formula content (typically an `inline-graphic` / `graphic` image, possibly wrapped
 * in `alternatives`). The math renderer falls back to these children when the node
 * has no `value`, and assumes they are images — so warn when anything else shows up.
 */
function renderFormulaImageFallback(node: GenericNode, state: IJatsParser, mathType: string) {
  const { label, identifier } = normalizeLabel(node.id) ?? {};
  state.openNode(mathType, { value: '', label, identifier });
  state.renderChildren(node);
  const mathNode = state.top();
  const children = (mathNode.children ?? []).filter((child) => !isWhitespaceText(child));
  const note = node.id ? `id=${node.id}` : undefined;
  if (children.length === 0) {
    state.warn(
      `Converted ${node.type} without TeX, MathML, or graphic to an empty math node`,
      node.type,
      { note },
    );
  } else {
    const unexpected = [...new Set(children.filter((c) => c.type !== 'image').map((c) => c.type))];
    if (unexpected.length > 0) {
      state.warn(
        `Converted ${node.type} with unexpected non-image children to a math node`,
        node.type,
        { note: [note, `children=${unexpected.join(', ')}`].filter(Boolean).join('; ') },
      );
    }
  }
  state.closeNode();
}

/**
 * JATS formula handlers. These always produce math nodes (`inlineMath` / `math`):
 * when there is no TeX or MathML, the math node is left without a `value` and the
 * children (typically an `inline-graphic` / `graphic` image) are rendered inside it.
 * The math renderer falls back to those children when the node has no `value`.
 */
export const mathHandlers: Record<string, Handler> = {
  ['inline-formula'](node, state) {
    const texMath = texMathFromNode(node);
    if (texMath) {
      const { label, identifier } = normalizeLabel(node.id) ?? {};
      state.addLeaf('inlineMath', { value: texMath, label, identifier });
    } else {
      renderFormulaImageFallback(node, state, 'inlineMath');
    }
  },
  ['disp-formula'](node, state) {
    const texMath = texMathFromNode(node);
    if (texMath) {
      const { label, identifier } = normalizeLabel(node.id) ?? {};
      state.addLeaf('math', { value: texMath, label, identifier });
    } else {
      renderFormulaImageFallback(node, state, 'math');
    }
  },
};
