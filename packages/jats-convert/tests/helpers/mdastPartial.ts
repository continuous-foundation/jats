/**
 * Partial matching for MyST/mdast JSON from YAML fixtures:
 * - Only keys present on the expected value are asserted.
 * - `children`: expected nodes must appear in order as a subsequence of actual children
 *   (so wrappers like `block` can be skipped).
 * - Arrays of objects with a `type` field use subsequence semantics; other arrays compare
 *   element-by-element from the start (prefix-style).
 */

function isMdastNodeLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'type' in value);
}

function subsequenceMatch(actual: unknown[], expected: unknown[]): boolean {
  let ai = 0;
  for (const exp of expected) {
    while (ai < actual.length && !valuePartialMatch(actual[ai], exp)) {
      ai += 1;
    }
    if (ai >= actual.length) return false;
    ai += 1;
  }
  return true;
}

export function valuePartialMatch(actual: unknown, expected: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null) return actual === null;
  if (typeof expected !== 'object' || expected === null) {
    return actual === expected;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length > 0 && expected.every(isMdastNodeLike)) {
      return subsequenceMatch(actual, expected);
    }
    if (expected.length > actual.length) return false;
    for (let i = 0; i < expected.length; i += 1) {
      if (!valuePartialMatch(actual[i], expected[i])) return false;
    }
    return true;
  }
  if (typeof actual !== 'object' || actual === null) return false;
  const act = actual as Record<string, unknown>;
  const exp = expected as Record<string, unknown>;
  for (const key of Object.keys(exp)) {
    if (key === 'children') continue;
    if (!(key in act)) return false;
    if (!valuePartialMatch(act[key], exp[key])) return false;
  }
  if ('children' in exp) {
    const ec = exp.children;
    const ac = act.children;
    if (!Array.isArray(ec)) return false;
    if (!Array.isArray(ac)) return false;
    return subsequenceMatch(ac, ec);
  }
  return true;
}

/** True if some subtree of `root` partially matches `expected`. */
export function treeContainsPartial(root: unknown, expected: unknown): boolean {
  if (valuePartialMatch(root, expected)) return true;
  if (!root || typeof root !== 'object') return false;
  const children = (root as { children?: unknown }).children;
  if (!Array.isArray(children)) return false;
  return children.some((c) => treeContainsPartial(c, expected));
}
