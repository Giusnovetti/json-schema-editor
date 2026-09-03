import { describe, expect, it, vi } from 'vitest';
import { schemaToGraph } from '../core';
import { BUILTIN_CUSTOM_RENDERERS } from './customRenderers';
import {
  DEFAULT_JSON_FORMS_CONFIG,
  createDebugMiddleware,
  customRendererEntries,
  diagnoseRendererSelection,
  parseUiSchema,
  registeredUiSchemaEntries,
  removeRegisteredUiSchema,
  setControlOption,
  uiSchemaToObject,
  updateRegisteredUiSchema,
  type RegisteredUiSchemaDocument,
} from './index';

describe('JF-4 extensibility', () => {
  it('projects only enabled custom Control and layout renderers', () => {
    const definitions = BUILTIN_CUSTOM_RENDERERS.map((item) => ({ ...item, enabled: item.id === 'dynamic-text' }));
    expect(customRendererEntries(definitions)).toHaveLength(1);
    expect(customRendererEntries(definitions)[0]?.renderer).toBe(definitions[0]?.renderer);
  });

  it('selects the highest-ranked applicable custom renderer and exposes diagnostics', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/name', options: { customRenderer: 'dynamic-text' } });
    const definitions = BUILTIN_CUSTOM_RENDERERS.map((item) => ({ ...item, enabled: true }));
    const diagnostic = diagnoseRendererSelection(document, graph, definitions)[0]!;
    expect(diagnostic.rendererId).toBe('dynamic-text');
    expect(diagnostic.rank).toBe(20);
    expect(diagnostic.kind).toBe('control');
  });

  it('selects a custom layout renderer independently from Control renderers', () => {
    const graph = schemaToGraph({ type: 'object' });
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [] });
    const definitions = BUILTIN_CUSTOM_RENDERERS.map((item) => ({ ...item, enabled: true }));
    expect(diagnoseRendererSelection(document, graph, definitions)[0]).toMatchObject({ rendererId: 'framed-vertical', kind: 'layout', rank: 10 });
  });

  it('allows a higher-ranked custom override to win', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/name', options: { customRenderer: 'dynamic-text' } });
    const definitions = BUILTIN_CUSTOM_RENDERERS.map((item) => ({ ...item, enabled: true }));
    const override = { ...definitions[0]!, id: 'override', label: 'Override', rank: 100, tester: () => 100 };
    expect(diagnoseRendererSelection(document, graph, [...definitions, override])[0]?.rendererId).toBe('override');
  });

  it('preserves custom renderer options during known option edits', () => {
    const document = parseUiSchema({ type: 'Control', scope: '#', options: { customRenderer: 'dynamic-text', apiSource: 'countries' } });
    const edited = setControlOption(document, document.rootId, 'readonly', true);
    expect(uiSchemaToObject(edited)).toMatchObject({ options: { customRenderer: 'dynamic-text', apiSource: 'countries', readonly: true } });
  });

  it('projects enabled registered detail UI Schemas with type/path/rank testers', () => {
    const item: RegisteredUiSchemaDocument = {
      id: 'address', name: 'Address detail', enabled: true,
      document: parseUiSchema({ type: 'VerticalLayout', elements: [] }),
      tester: { schemaType: 'object', schemaPathSuffix: '/address', rank: 15 },
    };
    const entries = registeredUiSchemaEntries([item]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.tester({ type: 'object' }, '#/properties/address', 'address')).toBe(15);
    expect(entries[0]?.tester({ type: 'string' }, '#/properties/address', 'address')).toBe(-1);
    expect(entries[0]?.uischema).toEqual({ type: 'VerticalLayout', elements: [] });
    expect(registeredUiSchemaEntries([{ ...item, enabled: false }])).toHaveLength(0);
  });

  it('updates and removes registered UI Schema documents without changing stable ids', () => {
    const item: RegisteredUiSchemaDocument = { id: 'stable', name: 'Before', enabled: true, document: parseUiSchema({ type: 'VerticalLayout', elements: [] }), tester: { rank: 1 } };
    const updated = updateRegisteredUiSchema([item], 'stable', { name: 'After', tester: { rank: 9 } });
    expect(updated[0]).toMatchObject({ id: 'stable', name: 'After', tester: { rank: 9 } });
    expect(removeRegisteredUiSchema(updated, 'stable')).toEqual([]);
  });

  it('provides the documented global configuration defaults', () => {
    expect(DEFAULT_JSON_FORMS_CONFIG).toEqual({ restrict: false, trim: false, showUnfocusedDescription: false, hideRequiredAsterisk: false });
  });

  it('debug middleware records only the principal JSON Forms events and delegates', () => {
    const events: string[] = [];
    const middleware = createDebugMiddleware((event) => events.push(event));
    const reducer = vi.fn((state) => state);
    const state = {} as Parameters<typeof middleware>[0];
    middleware(state, { type: 'jsonforms/INIT' } as Parameters<typeof middleware>[1], reducer);
    middleware(state, { type: 'jsonforms/UPDATE_CORE' } as Parameters<typeof middleware>[1], reducer);
    middleware(state, { type: 'jsonforms/UPDATE' } as Parameters<typeof middleware>[1], reducer);
    middleware(state, { type: 'other' } as unknown as Parameters<typeof middleware>[1], reducer);
    expect(events).toEqual(['INIT', 'UPDATE_CORE', 'UPDATE_DATA']);
    expect(reducer).toHaveBeenCalledTimes(4);
  });
});
