import type {
  JsonFormsRendererRegistryEntry,
  JsonFormsUISchemaRegistryEntry,
  JsonSchema,
  Middleware,
  RankedTester,
  UISchemaElement,
} from '@jsonforms/core';
import type { ComponentType } from 'react';
import { resolveUiScope, uiSchemaToObject } from './core';
import type { UiSchemaDocument } from './model';
import { graphToSchema, type SchemaGraph } from '../core';

export interface CustomRendererDefinition {
  id: string;
  label: string;
  kind: 'control' | 'layout';
  rank: number;
  tester: RankedTester;
  renderer: ComponentType<any>;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface RendererSelectionDiagnostic {
  elementId: string;
  rendererId?: string;
  rendererLabel?: string;
  rank: number;
  kind?: CustomRendererDefinition['kind'];
}

export function customRendererEntries(definitions: CustomRendererDefinition[]): JsonFormsRendererRegistryEntry[] {
  return definitions.filter((item) => item.enabled).map((item) => ({ tester: item.tester, renderer: item.renderer }));
}

export function diagnoseRendererSelection(document: UiSchemaDocument, graph: SchemaGraph, definitions: CustomRendererDefinition[], config: unknown = {}): RendererSelectionDiagnostic[] {
  const rootSchema = graphToSchema(graph) as JsonSchema;
  return document.nodes.map((node) => {
    const schemaNode = resolveUiScope(graph, node.element.scope);
    const schema = (schemaNode?.keywords ?? rootSchema) as JsonSchema;
    const candidates = definitions.filter((item) => item.enabled).map((item) => ({ item, rank: item.tester(node.element as unknown as UISchemaElement, schema, { rootSchema, config }) })).filter((item) => item.rank >= 0).sort((a, b) => b.rank - a.rank);
    const winner = candidates[0];
    return { elementId: node.id, rendererId: winner?.item.id, rendererLabel: winner?.item.label, rank: winner?.rank ?? -1, kind: winner?.item.kind };
  });
}

export interface RegisteredUiSchemaDocument {
  id: string;
  name: string;
  document: UiSchemaDocument;
  enabled: boolean;
  tester: { schemaType?: string; schemaPathSuffix?: string; rank: number };
}

export function registeredUiSchemaEntries(items: RegisteredUiSchemaDocument[]): JsonFormsUISchemaRegistryEntry[] {
  return items.filter((item) => item.enabled).map((item) => ({
    tester: (schema, schemaPath) => {
      if (item.tester.schemaType && schema.type !== item.tester.schemaType) return -1;
      if (item.tester.schemaPathSuffix && !schemaPath.endsWith(item.tester.schemaPathSuffix)) return -1;
      return item.tester.rank;
    },
    uischema: uiSchemaToObject(item.document) as unknown as UISchemaElement,
  }));
}

export interface JsonFormsGlobalConfig {
  restrict: boolean;
  trim: boolean;
  showUnfocusedDescription: boolean;
  hideRequiredAsterisk: boolean;
}

export const DEFAULT_JSON_FORMS_CONFIG: JsonFormsGlobalConfig = {
  restrict: false,
  trim: false,
  showUnfocusedDescription: false,
  hideRequiredAsterisk: false,
};

export type MiddlewareEventName = 'INIT' | 'UPDATE_CORE' | 'UPDATE_DATA';

export function createDebugMiddleware(onEvent: (event: MiddlewareEventName) => void): Middleware {
  return (state, action, defaultReducer) => {
    if (action.type === 'jsonforms/INIT') onEvent('INIT');
    else if (action.type === 'jsonforms/UPDATE_CORE') onEvent('UPDATE_CORE');
    else if (action.type === 'jsonforms/UPDATE') onEvent('UPDATE_DATA');
    return defaultReducer(state, action);
  };
}

export function updateRegisteredUiSchema(items: RegisteredUiSchemaDocument[], id: string, update: Partial<Omit<RegisteredUiSchemaDocument, 'id'>>): RegisteredUiSchemaDocument[] {
  return items.map((item) => item.id === id ? { ...item, ...update } : item);
}

export function removeRegisteredUiSchema(items: RegisteredUiSchemaDocument[], id: string): RegisteredUiSchemaDocument[] {
  return items.filter((item) => item.id !== id);
}
