export function escapePointerToken(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1');
}

export function unescapePointerToken(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~');
}

export function appendPointer(pointer: string, ...tokens: string[]): string {
  const suffix = tokens.map((token) => `/${escapePointerToken(token)}`).join('');
  return `${pointer}${suffix}`;
}

export function localRefToPointer(ref: string): string | undefined {
  if (ref === '#') return '';
  if (!ref.startsWith('#/')) return undefined;
  return ref.slice(1);
}

export function pointerToLocalRef(pointer: string): string {
  return pointer === '' ? '#' : `#${pointer}`;
}

/**
 * Rewrites a JSON Pointer when it is equal to, or nested under, a moved subtree.
 * Returns undefined when the pointer is outside the subtree.
 */
export function replacePointerPrefix(
  pointer: string,
  previousPrefix: string,
  nextPrefix: string,
): string | undefined {
  if (pointer === previousPrefix) return nextPrefix;
  if (!pointer.startsWith(`${previousPrefix}/`)) return undefined;
  return `${nextPrefix}${pointer.slice(previousPrefix.length)}`;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function nodeIdForPointer(pointer: string): string {
  return `n_${fnv1a(pointer || '$').toString(36)}`;
}

export function edgeId(
  source: string,
  relation: string,
  target: string,
  key = '',
): string {
  return `e_${fnv1a(`${source}|${relation}|${key}|${target}`).toString(36)}`;
}
