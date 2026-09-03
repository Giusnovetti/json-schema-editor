import { describe, expect, it } from 'vitest';
import { schemaToGraph } from '../core';
import {
  addControlForSchemaNode,
  addUiElement,
  canContainUiElement,
  moveUiElement,
  parseUiSchema,
  removeUiElement,
  setControlOption,
  setUiElementProperty,
  uiSchemaToObject,
  validateUiSchema,
} from './core';

describe('JF-2 visual UI Schema builder', () => {
  it('round-trips Categorization, Category, and Label with nested order and i18n', () => {
    const input = {
      type: 'Categorization',
      elements: [{
        type: 'Category', label: 'General', i18n: 'category.general',
        elements: [{ type: 'Label', text: 'Introduction', i18n: 'intro' }],
      }],
    };
    const document = parseUiSchema(input);
    expect(uiSchemaToObject(document)).toEqual(input);
    expect(document.nodes.every((node) => node.supported)).toBe(true);
  });

  it('enforces Categorization/Category compatibility and required labels/text', () => {
    const graph = schemaToGraph({ type: 'object' });
    const invalid = parseUiSchema({ type: 'Categorization', elements: [
      { type: 'Control', scope: '#' },
      { type: 'Category', elements: [{ type: 'Label' }] },
    ] });
    const messages = validateUiSchema(invalid, graph).map((item) => item.message);
    expect(messages).toEqual(expect.arrayContaining([
      'Categorization cannot contain Control.', 'Category requires a label.', 'Label requires text.',
    ]));
    expect(canContainUiElement('Categorization', 'Category')).toBe(true);
    expect(canContainUiElement('VerticalLayout', 'Category')).toBe(false);
  });

  it('creates nested Categorization/Category/Label elements with stable ids', () => {
    let document = parseUiSchema({ type: 'VerticalLayout', elements: [] });
    document = addUiElement(document, document.rootId, { type: 'Categorization' });
    const categorizationId = document.nodes.at(-1)!.id;
    document = addUiElement(document, categorizationId, { type: 'Category', label: 'One' });
    const categoryId = document.nodes.at(-1)!.id;
    document = addUiElement(document, categoryId, { type: 'Label', text: 'Hello' });
    expect(document.nodes.find((node) => node.id === categorizationId)?.id).toBe(categorizationId);
    expect(uiSchemaToObject(document)).toMatchObject({ elements: [{ type: 'Categorization', elements: [{ type: 'Category', elements: [{ type: 'Label' }] }] }] });
  });

  it('reorders siblings and moves nested layouts between compatible parents', () => {
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Group', label: 'A', elements: [{ type: 'Control', scope: '#/properties/a' }] },
      { type: 'Group', label: 'B', elements: [] },
      { type: 'Label', text: 'End' },
    ] });
    const groupA = document.nodes.find((node) => node.element.label === 'A')!;
    const groupB = document.nodes.find((node) => node.element.label === 'B')!;
    const control = document.nodes.find((node) => node.element.type === 'Control')!;
    const label = document.nodes.find((node) => node.element.type === 'Label')!;
    const reordered = moveUiElement(document, label.id, document.rootId, 0);
    expect((uiSchemaToObject(reordered).elements as Array<Record<string, unknown>>)[0]?.type).toBe('Label');
    const moved = moveUiElement(reordered, control.id, groupB.id, 0);
    expect(moved.nodes.find((node) => node.id === control.id)?.parentId).toBe(groupB.id);
    expect(moved.nodes.find((node) => node.id === groupA.id)?.id).toBe(groupA.id);
  });

  it('rejects cycles and incompatible moves without changing the document', () => {
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Group', label: 'Outer', elements: [{ type: 'VerticalLayout', elements: [] }] },
      { type: 'Categorization', elements: [{ type: 'Category', label: 'Tab', elements: [] }] },
    ] });
    const group = document.nodes.find((node) => node.element.type === 'Group')!;
    const nested = document.nodes.find((node) => node.parentId === group.id)!;
    const category = document.nodes.find((node) => node.element.type === 'Category')!;
    expect(moveUiElement(document, group.id, nested.id, 0)).toBe(document);
    expect(moveUiElement(document, category.id, group.id, 0)).toBe(document);
  });

  it('deletes a layout subtree and reindexes surviving siblings', () => {
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [
      { type: 'Group', label: 'Delete', elements: [{ type: 'Label', text: 'child' }] },
      { type: 'Label', text: 'survivor' },
    ] });
    const group = document.nodes.find((node) => node.element.type === 'Group')!;
    const survivor = document.nodes.find((node) => node.element.text === 'survivor')!;
    const removed = removeUiElement(document, group.id);
    expect(removed.nodes.some((node) => node.element.text === 'child')).toBe(false);
    expect(removed.nodes.find((node) => node.id === survivor.id)?.index).toBe(0);
  });

  it('uses the drag/drop backing command to create a correctly scoped Control', () => {
    const graph = schemaToGraph({ properties: { name: { type: 'string' } } });
    const target = graph.nodes.find((node) => node.pointer === '/properties/name')!;
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [] });
    expect(uiSchemaToObject(addControlForSchemaNode(document, document.rootId, graph, target.id))).toEqual({
      type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/name' }],
    });
  });

  it('supports all Control label states', () => {
    const base = parseUiSchema({ type: 'Control', scope: '#' });
    expect(uiSchemaToObject(setUiElementProperty(base, base.rootId, 'label', 'Custom'))).toMatchObject({ label: 'Custom' });
    expect(uiSchemaToObject(setUiElementProperty(base, base.rootId, 'label', false))).toMatchObject({ label: false });
    expect(uiSchemaToObject(setUiElementProperty(setUiElementProperty(base, base.rootId, 'label', 'x'), base.rootId, 'label', undefined))).not.toHaveProperty('label');
  });

  it('merges readonly and date/time options while preserving unknown renderer options', () => {
    let document = parseUiSchema({ type: 'Control', scope: '#/properties/date', options: { custom: { rank: 10 } } });
    document = setControlOption(document, document.rootId, 'readonly', true);
    document = setControlOption(document, document.rootId, 'format', 'date-time');
    expect(uiSchemaToObject(document)).toMatchObject({ options: { custom: { rank: 10 }, readonly: true, format: 'date-time' } });
  });

  it('supports array detail modes, inline UI Schema, sorting, and element labels', () => {
    let document = parseUiSchema({ type: 'Control', scope: '#/properties/items' });
    document = setControlOption(document, document.rootId, 'detail', 'REGISTERED');
    document = setControlOption(document, document.rootId, 'showSortButtons', true);
    document = setControlOption(document, document.rootId, 'elementLabelProp', 'name');
    expect(uiSchemaToObject(document)).toMatchObject({ options: { detail: 'REGISTERED', showSortButtons: true, elementLabelProp: 'name' } });
    document = setControlOption(document, document.rootId, 'detail', { type: 'VerticalLayout', elements: [] });
    expect(uiSchemaToObject(document)).toMatchObject({ options: { detail: { type: 'VerticalLayout', elements: [] } } });
  });
});

