import type { GenericNode } from 'myst-common';
import { normalizeLabel } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { js2xml } from 'xml-js';
import type { Handler } from './types.js';

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

/**
 * JATS formula handlers. These always produce math nodes (`inlineMath` / `math`):
 * when there is no TeX or MathML, the math node is left without a `value` and the
 * children (typically an `inline-graphic` / `graphic` image) are rendered inside it.
 * The math renderer falls back to those children when the node has no `value`.
 */
export const mathHandlers: Record<string, Handler> = {
  ['inline-formula'](node, state) {
    const texMath = texMathFromNode(node);
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    if (texMath) {
      state.addLeaf('inlineMath', {
        value: texMath,
        label,
        identifier,
      });
    } else {
      // No TeX or MathML (e.g. the equation is only provided as an inline-graphic image).
      // Keep it as an inline math node and render the children (image) inside it; the
      // renderer falls back to the children when the math node has no `value`.
      state.openNode('inlineMath', { value: '', label, identifier });
      state.renderChildren(node);
      state.closeNode();
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
      // No TeX or MathML (e.g. the equation is only provided as a graphic image).
      // Keep it as a math node and render the children (image) inside it; the renderer
      // falls back to the children when the math node has no `value`.
      state.openNode('math', { value: '', label, identifier });
      state.renderChildren(node);
      state.closeNode();
    }
  },
};
