import { describe, expect, it } from 'vitest';
import { DRAFT_07_DIALECT, DRAFT_2020_12_DIALECT } from '../core';
import { createPreviewAjv } from './previewAjv';

describe('JSON Forms preview AJV', () => {
  it('compiles and validates Draft 2020-12 schemas declaring their meta-schema', () => {
    const validate = createPreviewAjv(DRAFT_2020_12_DIALECT).compile({
      $schema: DRAFT_2020_12_DIALECT,
      type: 'array',
      prefixItems: [{ type: 'string' }],
    });
    expect(validate(['ok'])).toBe(true);
    expect(validate([1])).toBe(false);
  });

  it('continues to compile Draft-07 schemas with their declared meta-schema', () => {
    const validate = createPreviewAjv(DRAFT_07_DIALECT).compile({
      $schema: DRAFT_07_DIALECT,
      type: 'array',
      items: [{ type: 'string' }],
    });
    expect(validate(['ok'])).toBe(true);
    expect(validate([1])).toBe(false);
  });
});
