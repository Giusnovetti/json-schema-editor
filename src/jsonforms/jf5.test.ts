import { describe, expect, it } from 'vitest';
import { schemaToGraph } from '../core';
import { BUILTIN_CUSTOM_RENDERERS } from './customRenderers';
import {
  createCatalogErrorTranslator,
  createCatalogTranslator,
  createI18nState,
  enumTranslationKey,
  findUiSchemaUsages,
  parseUiSchema,
  readonlyOrigins,
  rendererCompatibilityDiagnostics,
  resolvePreviewSchema,
  type RegisteredUiSchemaDocument,
} from './index';

describe('JF-5 advanced integration', () => {
  const catalogs = {
    en: { 'person.name.label': 'Name', 'error.required': 'Required: {missingProperty}', 'person.kind.admin': 'Administrator' },
    it: { 'person.name.label': 'Nome', 'error.required': 'Obbligatorio: {missingProperty}', 'group.address': 'Indirizzo' },
  };

  it('translates path/UI keys, falls back, interpolates, and switches locale', () => {
    const en = createCatalogTranslator('en', catalogs);
    const it = createCatalogTranslator('it', catalogs);
    expect(en('person.name.label', 'Fallback')).toBe('Name');
    expect(it('person.name.label', 'Fallback')).toBe('Nome');
    expect(it('unknown', 'Default {count}', { count: 2 })).toBe('Default 2');
    expect(it('missing')).toBeUndefined();
    expect(createI18nState('it', catalogs).locale).toBe('it');
  });

  it('translates validation errors and enum/oneOf choice keys', () => {
    const translate = createCatalogTranslator('it', catalogs);
    const errorTranslator = createCatalogErrorTranslator('it', catalogs);
    const message = errorTranslator({ keyword: 'required', instancePath: '', schemaPath: '#/required', params: { missingProperty: 'name' } }, translate);
    expect(message).toBe('Obbligatorio: name');
    expect(enumTranslationKey('#/person/kind', 'admin')).toBe('person.kind.admin');
    expect(createCatalogTranslator('en', catalogs)(enumTranslationKey('#/person/kind', 'admin'), 'Admin')).toBe('Administrator');
  });

  it('switches renderer sets and diagnoses unavailable/incompatible options', () => {
    const document = parseUiSchema({ type: 'Control', scope: '#', options: { customRenderer: 'dynamic-text', apiSource: 'countries' } });
    const enabled = BUILTIN_CUSTOM_RENDERERS.map((item) => ({ ...item, enabled: true }));
    expect(rendererCompatibilityDiagnostics(document, 'vanilla', enabled).map((item) => item.severity)).toEqual(['error', 'warning']);
    expect(rendererCompatibilityDiagnostics(document, 'vanilla-custom', enabled)).toEqual([]);
    expect(rendererCompatibilityDiagnostics(document, 'vanilla-custom', enabled.map((item) => ({ ...item, enabled: false })))[0]?.message).toContain('unavailable');
  });

  it('dereferences a local reference for preview without mutating source', () => {
    const source = { $defs: { Name: { type: 'string', minLength: 2 } }, $ref: '#/$defs/Name', title: 'Source' };
    const before = structuredClone(source);
    const result = resolvePreviewSchema(source);
    expect(result.schema).toMatchObject({ type: 'string', minLength: 2, title: 'Source' });
    expect(result.resolvedCount).toBe(1);
    expect(source).toEqual(before);
  });

  it('dereferences registered external resources and reports missing ones', () => {
    const source = { $id: 'https://example.test/root', $ref: 'https://remote.test/value' };
    const resolved = resolvePreviewSchema(source, { 'https://remote.test/value': { $id: 'https://remote.test/value', type: 'integer' } });
    expect(resolved.schema).toMatchObject({ type: 'integer' });
    expect(resolved.diagnostics).toEqual([]);
    const missing = resolvePreviewSchema(source);
    expect(missing.diagnostics[0]?.reference).toBe('https://remote.test/value');
    expect(missing.schema).toMatchObject({ $ref: 'https://remote.test/value' });
  });

  it('detects cycles and preserves the recursive reference boundary', () => {
    const source = { $id: 'https://example.test/node', type: 'object', properties: { next: { $ref: 'https://example.test/node' } } };
    const before = JSON.stringify(source);
    const result = resolvePreviewSchema(source);
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.schema).length).toBeLessThan(2000);
    expect(JSON.stringify(source)).toBe(before);
  });

  it('finds main Control/rule and registered-detail usages', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' }, flag: { type: 'boolean' } } });
    const name = graph.nodes.find((node) => node.pointer === '/properties/name')!;
    const main = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Control', label: 'Name', scope: '#/properties/name' },
      { type: 'Control', scope: '#/properties/flag', rule: { effect: 'SHOW', condition: { scope: '#/properties/name', schema: {} } } },
    ] });
    const registered: RegisteredUiSchemaDocument = { id: 'detail', name: 'Detail', enabled: true, tester: { rank: 1 }, document: parseUiSchema({ type: 'Control', scope: '#/properties/name' }) };
    const usages = findUiSchemaUsages(graph, name.id, main, [registered]);
    expect(usages.map((item) => `${item.documentName}:${item.kind}`)).toEqual(['Main UI Schema:control', 'Main UI Schema:rule', 'Detail:control']);
  });

  it('reports every readonly origin', () => {
    const graph = schemaToGraph({ properties: { value: { type: 'string', readOnly: true } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/value', options: { readonly: true }, rule: { effect: 'DISABLE', condition: { scope: '#', schema: true } } });
    expect(readonlyOrigins(graph, document, document.rootId, true)).toEqual(['json-schema', 'ui-schema', 'global', 'rule-disable']);
  });
});

