import { describe, expect, it } from 'vitest';
import type { ErrorObject } from 'ajv';
import { renameProperty, schemaToGraph } from '../core';
import {
  addControlForSchemaNode,
  addUiElement,
  generateDefaultUiSchema,
  mapFormErrors,
  materializeUiSchema,
  parseUiSchema,
  resolveUiScope,
  setUiElementProperty,
  rewriteUiScopes,
  uiSchemaToObject,
  validateUiSchema,
} from './core';

describe('JF-1 UI Schema core', () => {
  it('round-trips supported nested elements, order, and unknown options without internal ids', () => {
    const input = {
      type: 'VerticalLayout',
      customRoot: true,
      elements: [
        { type: 'Control', scope: '#/properties/name', options: { rendererSpecific: 7 } },
        { type: 'HorizontalLayout', elements: [{ type: 'Control', scope: '#/properties/age' }] },
        { type: 'Group', label: 'Address', elements: [] },
      ],
    };
    const document = parseUiSchema(input);
    expect(uiSchemaToObject(document)).toEqual(input);
    expect(JSON.stringify(uiSchemaToObject(document))).not.toContain('ui_root');
    expect(document.nodes.map((node) => node.element.type)).toEqual(['VerticalLayout', 'Control', 'HorizontalLayout', 'Control', 'Group']);
  });

  it('preserves unsupported UI elements and diagnoses them', () => {
    const graph = schemaToGraph({ type: 'object' });
    const document = parseUiSchema({ type: 'CustomLayout', custom: 1, elements: [] });
    expect(uiSchemaToObject(document)).toEqual({ type: 'CustomLayout', custom: 1, elements: [] });
    expect(validateUiSchema(document, graph).some((item) => item.message.includes('not modelled'))).toBe(true);
  });

  it('reconciles stable internal ids when imported elements change position', () => {
    const first = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Control', scope: '#/properties/a' }, { type: 'Control', scope: '#/properties/b' },
    ] });
    const aId = first.nodes.find((node) => node.element.scope === '#/properties/a')!.id;
    const reparsed = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Control', scope: '#/properties/b' }, { type: 'Control', scope: '#/properties/a' },
    ] }, true, first);
    expect(reparsed.nodes.find((node) => node.element.scope === '#/properties/a')!.id).toBe(aId);
  });

  it('resolves Control scopes and reports missing or unresolved scopes', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    expect(resolveUiScope(graph, '#/properties/name')?.pointer).toBe('/properties/name');
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Control', scope: '#/properties/missing' }, { type: 'Control' },
    ] });
    expect(validateUiSchema(document, graph).filter((item) => item.severity === 'error')).toHaveLength(2);
  });

  it('edits a Control scope without changing its internal identity', () => {
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/old' });
    const edited = setUiElementProperty(document, document.rootId, 'scope', '#/properties/new');
    expect(edited.rootId).toBe(document.rootId);
    expect(uiSchemaToObject(edited)).toEqual({ type: 'Control', scope: '#/properties/new' });
  });

  it('generates an implicit default VerticalLayout with one Control per root property', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' }, age: { type: 'integer' } } });
    const generated = generateDefaultUiSchema(graph);
    expect(generated.explicit).toBe(false);
    expect(uiSchemaToObject(generated)).toEqual({ type: 'VerticalLayout', elements: [
      { type: 'Control', scope: '#/properties/name' }, { type: 'Control', scope: '#/properties/age' },
    ] });
    expect(materializeUiSchema(generated).explicit).toBe(true);
  });

  it('adds Controls, VerticalLayout, HorizontalLayout, and Group with stable ids', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    let document = parseUiSchema({ type: 'VerticalLayout', elements: [] });
    const rootId = document.rootId;
    document = addUiElement(document, rootId, { type: 'HorizontalLayout' });
    const horizontalId = document.nodes.at(-1)!.id;
    document = addUiElement(document, rootId, { type: 'Group', label: 'Details' });
    document = addUiElement(document, rootId, { type: 'VerticalLayout' });
    const property = graph.nodes.find((node) => node.pointer === '/properties/name')!;
    document = addControlForSchemaNode(document, horizontalId, graph, property.id);
    expect(document.nodes.find((node) => node.id === horizontalId)?.id).toBe(horizontalId);
    expect(uiSchemaToObject(document)).toMatchObject({ elements: [
      { type: 'HorizontalLayout', elements: [{ type: 'Control', scope: '#/properties/name' }] },
      { type: 'Group', label: 'Details' }, { type: 'VerticalLayout' },
    ] });
  });

  it('keeps JSON Schema independent from UI Schema edits', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const before = structuredClone(graph);
    addUiElement(generateDefaultUiSchema(graph), 'ui_root', { type: 'Group', label: 'UI only' });
    expect(graph).toEqual(before);
  });

  it('propagates deterministic schema property renames to Control scopes', () => {
    const graph = schemaToGraph({ properties: { old: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/old' });
    const renamed = renameProperty(graph, graph.rootNodeId, 'old', 'new');
    expect(uiSchemaToObject(rewriteUiScopes(document, graph, renamed))).toEqual({ type: 'Control', scope: '#/properties/new' });
  });

  it('maps AJV errors to Controls and schema nodes for cross-selection', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/name' });
    const errors = [{ instancePath: '/name', schemaPath: '#/properties/name/type', keyword: 'type', params: { type: 'string' }, message: 'must be string' }] as ErrorObject[];
    const diagnostic = mapFormErrors(errors, document, graph)[0]!;
    expect(diagnostic.elementId).toBe(document.rootId);
    expect(diagnostic.schemaNodeId).toBe(graph.nodes.find((node) => node.pointer === '/properties/name')!.id);
    expect(diagnostic.instancePath).toBe('/name');
  });
});
