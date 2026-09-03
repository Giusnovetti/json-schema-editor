import type { ErrorObject } from 'ajv';
import { appendPointer, localRefToPointer, nodeIdForPointer, validateSchemaDocument, type SchemaGraph } from '../core';
import {
  SUPPORTED_UI_SCHEMA_TYPES,
  type SupportedUiSchemaType,
  type UiSchemaDiagnostic,
  type UiSchemaDocument,
  type UiSchemaNode,
  type UiRule,
  type UiRuleCondition,
  type UiRuleEffect,
} from './model';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const RULE_EFFECTS = new Set<UiRuleEffect>(['HIDE', 'SHOW', 'ENABLE', 'DISABLE']);

export function getUiRule(node: UiSchemaNode): UiRule | undefined {
  const rule = node.element.rule;
  if (!isObject(rule) || !isObject(rule.condition)) return undefined;
  if (!RULE_EFFECTS.has(rule.effect as UiRuleEffect) || typeof rule.condition.scope !== 'string') return undefined;
  const schema = rule.condition.schema;
  if (typeof schema !== 'boolean' && !isObject(schema)) return undefined;
  return structuredClone(rule) as unknown as UiRule;
}

function idForPath(path: number[]): string {
  return `ui_${path.length === 0 ? 'root' : path.join('_')}`;
}

export function canContainUiElement(parentType: unknown, childType: unknown): boolean {
  if (parentType === 'Categorization') return childType === 'Category';
  if (parentType === 'Control' || parentType === 'Label') return false;
  if (childType === 'Category') return parentType === 'Categorization';
  return ['VerticalLayout', 'HorizontalLayout', 'Group', 'Category'].includes(String(parentType));
}

export function parseUiSchema(value: unknown, explicit = true, previous?: UiSchemaDocument): UiSchemaDocument {
  if (!isObject(value)) throw new Error('A UI Schema root must be an object.');
  const nodes: UiSchemaNode[] = [];
  const reused = new Set<string>();
  function visit(element: Record<string, unknown>, path: number[], parentId?: string, index = 0): string {
    const raw = structuredClone(element);
    const children = Array.isArray(raw.elements) ? raw.elements : [];
    delete raw.elements;
    const matching = previous?.nodes.find((node) => !reused.has(node.id) && JSON.stringify(node.element) === JSON.stringify(raw));
    let id = matching?.id ?? idForPath(path);
    let suffix = 1;
    while (reused.has(id)) id = `${idForPath(path)}_${suffix++}`;
    reused.add(id);
    const type = raw.type;
    nodes.push({ id, parentId, index, element: raw, supported: typeof type === 'string' && SUPPORTED_UI_SCHEMA_TYPES.has(type as SupportedUiSchemaType) });
    children.forEach((child, childIndex) => {
      if (isObject(child)) visit(child, [...path, childIndex], id, childIndex);
    });
    return id;
  }
  const rootId = visit(value, []);
  return { rootId, nodes, explicit };
}

export function uiSchemaToObject(document: UiSchemaDocument): Record<string, unknown> {
  const byId = new Map(document.nodes.map((node) => [node.id, node]));
  function serialize(node: UiSchemaNode): Record<string, unknown> {
    const result = structuredClone(node.element);
    const children = document.nodes.filter((child) => child.parentId === node.id).sort((a, b) => a.index - b.index);
    if (children.length > 0 || !['Control', 'Label'].includes(String(node.element.type))) result.elements = children.map(serialize);
    return result;
  }
  const root = byId.get(document.rootId);
  if (!root) throw new Error(`UI Schema root ${document.rootId} not found.`);
  return serialize(root);
}

export function uiSchemaToJson(document: UiSchemaDocument, spaces = 2): string {
  return JSON.stringify(uiSchemaToObject(document), null, spaces);
}

export function resolveUiScope(graph: SchemaGraph, scope: unknown) {
  if (typeof scope !== 'string') return undefined;
  const pointer = localRefToPointer(scope);
  if (pointer === undefined) return undefined;
  return graph.nodes.find((node) => node.pointer === pointer);
}

export function validateUiSchema(document: UiSchemaDocument, graph: SchemaGraph): UiSchemaDiagnostic[] {
  const diagnostics: UiSchemaDiagnostic[] = [];
  for (const node of document.nodes) {
    const type = node.element.type;
    if (!node.supported) diagnostics.push({ severity: 'warning', elementId: node.id, message: `UI Schema element type ${JSON.stringify(type)} is not modelled and was preserved.` });
    if (type === 'Control') {
      const scope = node.element.scope;
      if (typeof scope !== 'string') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Control requires a string scope.' });
      else {
        const target = resolveUiScope(graph, scope);
        if (!target) diagnostics.push({ severity: 'error', elementId: node.id, scope, message: `Control scope ${scope} cannot be resolved.` });
      }
    }
    if (type === 'Group' && typeof node.element.label !== 'string') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Group requires a label.' });
    if (type === 'Category' && typeof node.element.label !== 'string') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Category requires a label.' });
    if (type === 'Category') {
      const parent = node.parentId ? document.nodes.find((candidate) => candidate.id === node.parentId) : undefined;
      if (parent?.element.type !== 'Categorization') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Category must be a child of Categorization.' });
    }
    if (type === 'Label' && typeof node.element.text !== 'string') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Label requires text.' });
    const children = document.nodes.filter((child) => child.parentId === node.id);
    if (!['Control', 'Label'].includes(String(type)) && children.length === 0) diagnostics.push({ severity: 'warning', elementId: node.id, message: `${String(type)} has no elements.` });
    for (const child of children) if (!canContainUiElement(type, child.element.type)) diagnostics.push({ severity: 'error', elementId: child.id, message: `${String(type)} cannot contain ${String(child.element.type)}.` });
    if ('rule' in node.element) {
      const rawRule = node.element.rule;
      if (!isObject(rawRule) || !RULE_EFFECTS.has(rawRule.effect as UiRuleEffect)) diagnostics.push({ severity: 'error', elementId: node.id, message: 'Rule effect must be HIDE, SHOW, ENABLE, or DISABLE.' });
      else if (!isObject(rawRule.condition)) diagnostics.push({ severity: 'error', elementId: node.id, message: 'Rule requires a condition.' });
      else {
        const condition = rawRule.condition;
        if (typeof condition.scope !== 'string') diagnostics.push({ severity: 'error', elementId: node.id, message: 'Rule condition requires a string scope.' });
        else if (!resolveUiScope(graph, condition.scope)) diagnostics.push({ severity: 'error', elementId: node.id, scope: condition.scope, message: `Rule condition scope ${condition.scope} cannot be resolved.` });
        if (typeof condition.schema !== 'boolean' && !isObject(condition.schema)) diagnostics.push({ severity: 'error', elementId: node.id, message: 'Rule condition schema must be a JSON Schema object or boolean.' });
        else for (const diagnostic of validateSchemaDocument(condition.schema as boolean | Record<string, unknown>).diagnostics.filter((item) => item.severity === 'error')) diagnostics.push({ severity: 'error', elementId: node.id, message: `Rule condition schema: ${diagnostic.message}` });
        if ('failWhenUndefined' in condition && typeof condition.failWhenUndefined !== 'boolean') diagnostics.push({ severity: 'error', elementId: node.id, message: 'failWhenUndefined must be a boolean.' });
      }
    }
  }
  return diagnostics;
}

export function generateDefaultUiSchema(graph: SchemaGraph): UiSchemaDocument {
  const controls = graph.edges
    .filter((edge) => edge.source === graph.rootNodeId && edge.relation === 'property')
    .map((edge) => ({ type: 'Control', scope: `#${graph.nodes.find((node) => node.id === edge.target)?.pointer ?? ''}` }));
  return parseUiSchema({ type: 'VerticalLayout', elements: controls }, false);
}

function nextId(document: UiSchemaDocument): string {
  let index = document.nodes.length;
  while (document.nodes.some((node) => node.id === `ui_new_${index}`)) index += 1;
  return `ui_new_${index}`;
}

export function addUiElement(
  document: UiSchemaDocument,
  parentId: string,
  element: Record<string, unknown>,
): UiSchemaDocument {
  const parent = document.nodes.find((node) => node.id === parentId);
  if (!parent || !canContainUiElement(parent.element.type, element.type)) return document;
  const siblings = document.nodes.filter((node) => node.parentId === parentId);
  const type = element.type;
  return {
    ...document,
    explicit: true,
    nodes: [...document.nodes, {
      id: nextId(document), parentId, index: siblings.length,
      element: structuredClone(element),
      supported: typeof type === 'string' && SUPPORTED_UI_SCHEMA_TYPES.has(type as SupportedUiSchemaType),
    }],
  };
}

function reindex(nodes: UiSchemaNode[], parentId: string | undefined): UiSchemaNode[] {
  const siblings = nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.index - b.index);
  const indexById = new Map(siblings.map((node, index) => [node.id, index]));
  return nodes.map((node) => indexById.has(node.id) ? { ...node, index: indexById.get(node.id)! } : node);
}

export function moveUiElement(document: UiSchemaDocument, elementId: string, nextParentId: string, nextIndex: number): UiSchemaDocument {
  const element = document.nodes.find((node) => node.id === elementId);
  const parent = document.nodes.find((node) => node.id === nextParentId);
  if (!element || !parent || element.id === document.rootId || !canContainUiElement(parent.element.type, element.element.type)) return document;
  const descendants = new Set<string>();
  const queue = [element.id];
  while (queue.length) {
    const current = queue.shift()!;
    document.nodes.filter((node) => node.parentId === current).forEach((node) => { descendants.add(node.id); queue.push(node.id); });
  }
  if (descendants.has(nextParentId)) return document;
  const oldParentId = element.parentId;
  const siblings = document.nodes.filter((node) => node.parentId === nextParentId && node.id !== elementId).sort((a, b) => a.index - b.index);
  const boundedIndex = Math.max(0, Math.min(nextIndex, siblings.length));
  siblings.splice(boundedIndex, 0, { ...element, parentId: nextParentId });
  const siblingIndexes = new Map(siblings.map((node, index) => [node.id, index]));
  let nodes = document.nodes.map((node) => node.id === elementId
    ? { ...node, parentId: nextParentId, index: boundedIndex }
    : siblingIndexes.has(node.id) ? { ...node, index: siblingIndexes.get(node.id)! } : node);
  nodes = reindex(nodes, oldParentId);
  return { ...document, explicit: true, nodes };
}

export function removeUiElement(document: UiSchemaDocument, elementId: string): UiSchemaDocument {
  const element = document.nodes.find((node) => node.id === elementId);
  if (!element || element.id === document.rootId) return document;
  const removed = new Set([elementId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of document.nodes) if (node.parentId && removed.has(node.parentId) && !removed.has(node.id)) { removed.add(node.id); changed = true; }
  }
  return { ...document, explicit: true, nodes: reindex(document.nodes.filter((node) => !removed.has(node.id)), element.parentId) };
}

export function setUiElementProperty(document: UiSchemaDocument, elementId: string, key: string, value: unknown): UiSchemaDocument {
  if (!document.nodes.some((node) => node.id === elementId)) return document;
  return {
    ...document,
    explicit: true,
    nodes: document.nodes.map((node) => {
      if (node.id !== elementId) return node;
      const element = { ...node.element };
      if (value === undefined) delete element[key]; else element[key] = value;
      return { ...node, element };
    }),
  };
}

export function setControlOption(document: UiSchemaDocument, elementId: string, key: string, value: unknown): UiSchemaDocument {
  const node = document.nodes.find((item) => item.id === elementId);
  if (!node || node.element.type !== 'Control') return document;
  const current = isObject(node.element.options) ? structuredClone(node.element.options) : {};
  if (value === undefined) delete current[key]; else current[key] = value;
  return setUiElementProperty(document, elementId, 'options', Object.keys(current).length > 0 ? current : undefined);
}

export function setUiRule(document: UiSchemaDocument, elementId: string, rule: UiRule | undefined): UiSchemaDocument {
  return setUiElementProperty(document, elementId, 'rule', rule ? structuredClone(rule) : undefined);
}

export function createUiRule(effect: UiRuleEffect, scope: string, schema: UiRuleCondition['schema'] = {}): UiRule {
  return { effect, condition: { scope, schema } };
}

function valueAtScope(data: unknown, scope: string): { defined: boolean; value?: unknown } {
  const pointer = localRefToPointer(scope);
  if (pointer === undefined) return { defined: false };
  if (!pointer) return { defined: true, value: data };
  let value = data;
  for (const encoded of pointer.split('/').slice(1)) {
    const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(value) && !Array.isArray(value)) return { defined: false };
    if (!(token in value)) return { defined: false };
    value = (value as Record<string, unknown>)[token];
  }
  return { defined: true, value };
}

/** Small deterministic evaluator used for builder diagnostics/tests; JSON Forms executes preview rules with AJV. */
export function ruleConditionMatches(rule: UiRule, data: unknown): boolean {
  const scoped = valueAtScope(data, rule.condition.scope);
  if (!scoped.defined) return rule.condition.failWhenUndefined !== true;
  const schema = rule.condition.schema;
  if (typeof schema === 'boolean') return schema;
  if ('const' in schema && JSON.stringify(scoped.value) !== JSON.stringify(schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => JSON.stringify(item) === JSON.stringify(scoped.value))) return false;
  if (typeof schema.type === 'string') {
    const matches = schema.type === 'null' ? scoped.value === null
      : schema.type === 'array' ? Array.isArray(scoped.value)
        : schema.type === 'object' ? isObject(scoped.value) : typeof scoped.value === schema.type;
    if (!matches) return false;
  }
  if (typeof scoped.value === 'number') {
    if (typeof schema.minimum === 'number' && scoped.value < schema.minimum) return false;
    if (typeof schema.maximum === 'number' && scoped.value > schema.maximum) return false;
  }
  if (typeof scoped.value === 'string' && typeof schema.pattern === 'string') {
    try { if (!new RegExp(schema.pattern, 'u').test(scoped.value)) return false; } catch { return false; }
  }
  return true;
}

export function ruleOutcome(rule: UiRule, data: unknown): { visible?: boolean; enabled?: boolean } {
  const matches = ruleConditionMatches(rule, data);
  if (rule.effect === 'HIDE') return { visible: !matches };
  if (rule.effect === 'SHOW') return { visible: matches };
  if (rule.effect === 'DISABLE') return { enabled: !matches };
  return { enabled: matches };
}

export function addControlForSchemaNode(document: UiSchemaDocument, parentId: string, graph: SchemaGraph, schemaNodeId: string): UiSchemaDocument {
  const target = graph.nodes.find((node) => node.id === schemaNodeId);
  return target ? addUiElement(document, parentId, { type: 'Control', scope: `#${target.pointer}` }) : document;
}

export function materializeUiSchema(document: UiSchemaDocument): UiSchemaDocument {
  return { ...document, explicit: true };
}

export function rewriteUiScopes(document: UiSchemaDocument, previous: SchemaGraph, next: SchemaGraph): UiSchemaDocument {
  const pointerChanges = new Map<string, string>();
  for (const node of previous.nodes) {
    const replacement = next.nodes.find((candidate) => candidate.id === node.id);
    if (replacement && replacement.pointer !== node.pointer) pointerChanges.set(node.pointer, replacement.pointer);
  }
  if (pointerChanges.size === 0) return document;
  return {
    ...document,
    nodes: document.nodes.map((node) => {
      const element = { ...node.element };
      const pointer = localRefToPointer(element.scope as string);
      if (pointer !== undefined && pointerChanges.has(pointer)) element.scope = `#${pointerChanges.get(pointer)!}`;
      if (isObject(element.rule) && isObject(element.rule.condition)) {
        const conditionPointer = localRefToPointer(element.rule.condition.scope as string);
        if (conditionPointer !== undefined && pointerChanges.has(conditionPointer)) element.rule = { ...element.rule, condition: { ...element.rule.condition, scope: `#${pointerChanges.get(conditionPointer)!}` } };
      }
      return { ...node, element };
    }),
  };
}

export interface FormValidationDiagnostic extends UiSchemaDiagnostic {
  instancePath: string;
  schemaPath: string;
  keyword: string;
}

export function mapFormErrors(errors: ErrorObject[], document: UiSchemaDocument, graph: SchemaGraph): FormValidationDiagnostic[] {
  return errors.map((error) => {
    const property = typeof error.params === 'object' && error.params && 'missingProperty' in error.params
      ? appendPointer(error.instancePath, String(error.params.missingProperty)) : error.instancePath;
    const control = document.nodes.find((node) => node.element.type === 'Control' && typeof node.element.scope === 'string' && localRefToPointer(node.element.scope as string) === property.replace(/^/, '/properties').replace('//', '/'));
    const schemaPointer = error.schemaPath.startsWith('#') ? error.schemaPath.slice(1).replace(/\/(?:required|type|format|minimum|maximum|minLength|maxLength)$/, '') : '';
    const schemaNode = graph.nodes.find((node) => node.pointer === schemaPointer) ?? (control ? resolveUiScope(graph, control.element.scope) : undefined);
    return {
      severity: 'error', message: error.message ?? 'Validation failed.', elementId: control?.id,
      schemaNodeId: schemaNode?.id ?? (schemaPointer ? nodeIdForPointer(schemaPointer) : undefined),
      instancePath: property, schemaPath: error.schemaPath, keyword: error.keyword,
    };
  });
}
