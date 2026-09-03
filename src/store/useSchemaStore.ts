import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { create } from 'zustand';
import type { ErrorObject } from 'ajv';
import type { ValidationMode } from '@jsonforms/core';
import {
  addAdvancedSchema,
  addPrefixItem,
  addCompositionBranch,
  addDefinition,
  addDependentSchema,
  addProperty,
  addSingleComposition,
  clearNodeReference,
  convertGraphDialect,
  graphToJson,
  graphToSchema,
  removeCompositionBranch,
  removeAdvancedSchema,
  removeDependentSchema,
  removeProperty,
  removeSingleComposition,
  renameDefinition,
  renameDependentSchema,
  renameProperty,
  schemaToGraph,
  setNodeKeyword,
  setNodeReference,
  setPropertyRequired,
  setNodeType,
  validateInstance,
  validateSchemaDocument,
  type ArrayCompositionRelation,
  type AdvancedSchemaRelation,
  type JsonSchema,
  type JsonSchemaPrimitiveType,
  type SchemaGraph,
  type SupportedDialect,
  type SingleCompositionRelation,
  type ValidationDiagnostic,
} from '../core';
import { sampleInstanceText, sampleSchema, sampleSchemaText } from '../examples/sampleSchema';
import {
  pruneNodePositions,
  setStoredNodePosition,
  type NodePosition,
  type NodePositions,
} from '../graph/positionState';
import {
  addControlForSchemaNode,
  addUiElement,
  generateDefaultUiSchema,
  materializeUiSchema,
  moveUiElement,
  parseUiSchema,
  resolveUiScope,
  setUiElementProperty,
  setControlOption,
  removeUiElement,
  rewriteUiScopes,
  uiSchemaToJson,
  validateUiSchema,
  type UiSchemaDiagnostic,
  type UiSchemaDocument,
  type SupportedUiSchemaType,
  type UiRule,
  DEFAULT_JSON_FORMS_CONFIG,
  type CustomRendererDefinition,
  type JsonFormsGlobalConfig,
  type MiddlewareEventName,
  type RegisteredUiSchemaDocument,
  type RendererSetId,
  type TranslationCatalog,
} from '../jsonforms';
import { BUILTIN_CUSTOM_RENDERERS, type DynamicRendererRuntime } from '../jsonforms/customRenderers';

interface SchemaState {
  sourceText: string;
  graph: SchemaGraph;
  nodePositions: NodePositions;
  selectedNodeId?: string;
  parseError?: string;
  schemaDiagnostics: ValidationDiagnostic[];

  instanceText: string;
  instanceParseError?: string;
  instanceDiagnostics: ValidationDiagnostic[];

  uiSchemaText: string;
  uiSchema: UiSchemaDocument;
  uiSchemaParseError?: string;
  uiSchemaDiagnostics: UiSchemaDiagnostic[];
  selectedUiElementId?: string;
  formErrors: ErrorObject[];
  formReadonly: boolean;
  formValidationMode: ValidationMode;
  additionalErrorsText: string;
  additionalErrors: ErrorObject[];
  additionalErrorsParseError?: string;
  customRenderers: CustomRendererDefinition[];
  registeredUiSchemas: RegisteredUiSchemaDocument[];
  jsonFormsConfig: JsonFormsGlobalConfig;
  middlewareMode: 'none' | 'debug';
  middlewareEvents: MiddlewareEventName[];
  dynamicRendererRuntime: DynamicRendererRuntime;
  previewLocale: string;
  translationCatalogs: TranslationCatalog;
  rendererSet: RendererSetId;
  externalResourcesText: string;
  externalResources: Record<string, JsonSchema>;
  externalResourcesParseError?: string;
  useResolvedPreviewSchema: boolean;

  setSourceText: (text: string) => void;
  setInstanceText: (text: string) => void;
  setUiSchemaText: (text: string) => void;
  generateUiSchema: () => void;
  materializeUiSchema: () => void;
  selectUiElement: (elementId?: string) => void;
  addUiLayout: (parentId: string, type: SupportedUiSchemaType) => void;
  addUiControl: (parentId: string, schemaNodeId: string) => void;
  setSelectedUiElementProperty: (key: string, value: unknown) => void;
  setSelectedControlOption: (key: string, value: unknown) => void;
  moveUiElement: (elementId: string, parentId: string, index: number) => void;
  removeUiElement: (elementId: string) => void;
  setFormReadonly: (readonly: boolean) => void;
  setFormValidationMode: (mode: ValidationMode) => void;
  setAdditionalErrorsText: (text: string) => void;
  setSelectedUiRule: (rule?: UiRule) => void;
  setCustomRendererEnabled: (id: string, enabled: boolean) => void;
  addRegisteredUiSchema: () => void;
  updateRegisteredUiSchema: (id: string, update: Partial<Omit<RegisteredUiSchemaDocument, 'id'>>) => void;
  removeRegisteredUiSchema: (id: string) => void;
  setJsonFormsConfig: (key: keyof JsonFormsGlobalConfig, value: boolean) => void;
  setMiddlewareMode: (mode: 'none' | 'debug') => void;
  recordMiddlewareEvent: (event: MiddlewareEventName) => void;
  clearMiddlewareEvents: () => void;
  setDynamicRendererRuntime: (runtime: DynamicRendererRuntime) => void;
  setPreviewLocale: (locale: string) => void;
  setTranslationCatalogs: (catalogs: TranslationCatalog) => void;
  setRendererSet: (set: RendererSetId) => void;
  setExternalResourcesText: (text: string) => void;
  setUseResolvedPreviewSchema: (enabled: boolean) => void;
  setFormErrors: (errors: ErrorObject[]) => void;
  selectNode: (nodeId?: string) => void;
  setNodePosition: (nodeId: string, position: NodePosition) => void;
  resetNodePositions: () => void;
  setDialect: (dialect: SupportedDialect) => void;
  setSelectedNodeType: (type?: JsonSchemaPrimitiveType) => void;
  setSelectedNodeTitle: (title: string) => void;
  setSelectedNodeKeyword: (keyword: string, value: unknown) => void;
  addPropertyToSelected: (
    name: string,
    type: JsonSchemaPrimitiveType,
    required: boolean,
  ) => void;
  renamePropertyOnSelected: (previousName: string, nextName: string) => void;
  setPropertyRequiredOnSelected: (name: string, required: boolean) => void;
  removePropertyFromSelected: (name: string) => void;
  addDefinitionToSelected: (name: string, type: JsonSchemaPrimitiveType) => void;
  renameDefinitionOnSelected: (previousName: string, nextName: string) => void;
  setSelectedReference: (targetNodeId?: string) => void;
  addPrefixItemToSelected: (type?: JsonSchemaPrimitiveType) => void;
  addAdvancedSchemaToSelected: (relation: AdvancedSchemaRelation, type?: JsonSchemaPrimitiveType) => void;
  removeAdvancedSchemaFromSelected: (relation: AdvancedSchemaRelation) => void;
  addCompositionBranchToSelected: (relation: ArrayCompositionRelation, type?: JsonSchemaPrimitiveType) => void;
  removeCompositionBranchFromSelected: (relation: ArrayCompositionRelation, index: number) => void;
  addSingleCompositionToSelected: (relation: SingleCompositionRelation, type?: JsonSchemaPrimitiveType) => void;
  removeSingleCompositionFromSelected: (relation: SingleCompositionRelation) => void;
  addDependentSchemaToSelected: (name: string, type?: JsonSchemaPrimitiveType) => void;
  renameDependentSchemaOnSelected: (previousName: string, nextName: string) => void;
  removeDependentSchemaFromSelected: (name: string) => void;
  loadSample: () => void;
}

function parseSchemaText(text: string): { schema?: JsonSchema; error?: string } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (errors.length > 0) {
    const first = errors[0];
    return {
      error: `${printParseErrorCode(first.error)} at offset ${first.offset}`,
    };
  }

  if (
    typeof value !== 'boolean' &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  ) {
    return { error: 'A JSON Schema root must be an object or boolean.' };
  }

  return { schema: value as JsonSchema };
}

function parseInstanceText(text: string): { value?: unknown; hasValue: boolean; error?: string } {
  const errors: ParseError[] = [];
  const value = parse(text, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (errors.length > 0) {
    const first = errors[0];
    return {
      hasValue: false,
      error: `${printParseErrorCode(first.error)} at offset ${first.offset}`,
    };
  }

  if (text.trim() === '') {
    return { hasValue: false, error: 'Enter a JSON instance to validate.' };
  }

  return { value, hasValue: true };
}

function instanceValidationState(graph: SchemaGraph, instanceText: string): {
  instanceParseError?: string;
  instanceDiagnostics: ValidationDiagnostic[];
} {
  const parsed = parseInstanceText(instanceText);
  if (!parsed.hasValue) {
    return {
      instanceParseError: parsed.error,
      instanceDiagnostics: [],
    };
  }

  return {
    instanceParseError: undefined,
    instanceDiagnostics: validateInstance(graph, parsed.value).diagnostics,
  };
}

function graphMutation(
  state: SchemaState,
  mutate: (graph: SchemaGraph) => SchemaGraph,
): Partial<SchemaState> {
  if (
    state.parseError ||
    state.schemaDiagnostics.some((diagnostic) => diagnostic.severity === 'error')
  ) {
    // Do not overwrite invalid editor text with a mutation derived from the
    // last valid graph. The user must repair the source schema first.
    return {};
  }

  const graph = mutate(state.graph);
  const schema = graphToSchema(graph);
  const schemaValidation = validateSchemaDocument(schema);
  const uiSchema = state.uiSchema.explicit ? state.uiSchema : generateDefaultUiSchema(graph);
  return {
    graph,
    sourceText: graphToJson(graph),
    nodePositions: pruneNodePositions(graph, state.nodePositions),
    parseError: undefined,
    schemaDiagnostics: schemaValidation.diagnostics,
    uiSchema,
    uiSchemaText: uiSchemaToJson(uiSchema),
    uiSchemaDiagnostics: validateUiSchema(uiSchema, graph),
    ...instanceValidationState(graph, state.instanceText),
  };
}

const initialGraph = schemaToGraph(sampleSchema as unknown as JsonSchema);
const initialSchemaDiagnostics = validateSchemaDocument(
  sampleSchema as unknown as JsonSchema,
).diagnostics;
const initialInstanceState = instanceValidationState(initialGraph, sampleInstanceText);
const initialUiSchema = generateDefaultUiSchema(initialGraph);

export const useSchemaStore = create<SchemaState>((set) => ({
  sourceText: sampleSchemaText,
  graph: initialGraph,
  nodePositions: {},
  selectedNodeId: initialGraph.rootNodeId,
  schemaDiagnostics: initialSchemaDiagnostics,

  instanceText: sampleInstanceText,
  ...initialInstanceState,
  uiSchema: initialUiSchema,
  uiSchemaText: uiSchemaToJson(initialUiSchema),
  uiSchemaDiagnostics: validateUiSchema(initialUiSchema, initialGraph),
  formErrors: [],
  formReadonly: false,
  formValidationMode: 'ValidateAndShow',
  additionalErrorsText: '[]',
  additionalErrors: [],
  customRenderers: BUILTIN_CUSTOM_RENDERERS,
  registeredUiSchemas: [],
  jsonFormsConfig: DEFAULT_JSON_FORMS_CONFIG,
  middlewareMode: 'none',
  middlewareEvents: [],
  dynamicRendererRuntime: { prefix: 'Dynamic', choices: ['Alpha', 'Beta'] },
  previewLocale: 'en',
  translationCatalogs: {
    en: {},
    it: { 'error.required': 'campo obbligatorio', 'error.type': 'tipo non valido' },
  },
  rendererSet: 'vanilla-custom',
  externalResourcesText: '{}',
  externalResources: {},
  useResolvedPreviewSchema: false,
  setFormErrors: (formErrors) => set({ formErrors }),
  setFormReadonly: (formReadonly) => set({ formReadonly }),
  setFormValidationMode: (formValidationMode) => set({ formValidationMode }),
  setCustomRendererEnabled: (id, enabled) => set((state) => ({ customRenderers: state.customRenderers.map((item) => item.id === id ? { ...item, enabled } : item) })),
  addRegisteredUiSchema: () => set((state) => {
    const id = `detail_${Date.now()}_${state.registeredUiSchemas.length}`;
    const document = parseUiSchema({ type: 'VerticalLayout', elements: [] }, true);
    return { registeredUiSchemas: [...state.registeredUiSchemas, { id, name: `Detail ${state.registeredUiSchemas.length + 1}`, document, enabled: true, tester: { rank: 10 } }] };
  }),
  updateRegisteredUiSchema: (id, update) => set((state) => ({ registeredUiSchemas: state.registeredUiSchemas.map((item) => item.id === id ? { ...item, ...update } : item) })),
  removeRegisteredUiSchema: (id) => set((state) => ({ registeredUiSchemas: state.registeredUiSchemas.filter((item) => item.id !== id) })),
  setJsonFormsConfig: (key, value) => set((state) => ({ jsonFormsConfig: { ...state.jsonFormsConfig, [key]: value } })),
  setMiddlewareMode: (middlewareMode) => set({ middlewareMode }),
  recordMiddlewareEvent: (event) => set((state) => ({ middlewareEvents: [...state.middlewareEvents.slice(-49), event] })),
  clearMiddlewareEvents: () => set({ middlewareEvents: [] }),
  setDynamicRendererRuntime: (dynamicRendererRuntime) => set({ dynamicRendererRuntime }),
  setPreviewLocale: (previewLocale) => set({ previewLocale }),
  setTranslationCatalogs: (translationCatalogs) => set({ translationCatalogs }),
  setRendererSet: (rendererSet) => set({ rendererSet }),
  setUseResolvedPreviewSchema: (useResolvedPreviewSchema) => set({ useResolvedPreviewSchema }),
  setExternalResourcesText: (text) => {
    try {
      const value = JSON.parse(text) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.values(value).every((schema) => typeof schema === 'boolean' || (schema && typeof schema === 'object' && !Array.isArray(schema)))) throw new Error('Resources must be an object mapping URI to JSON Schema.');
      set({ externalResourcesText: text, externalResources: value as Record<string, JsonSchema>, externalResourcesParseError: undefined });
    } catch (reason) { set({ externalResourcesText: text, externalResourcesParseError: reason instanceof Error ? reason.message : 'Invalid resources JSON.' }); }
  },
  setAdditionalErrorsText: (text) => {
    try {
      const value = JSON.parse(text) as unknown;
      if (!Array.isArray(value) || !value.every((item) => item && typeof item === 'object' && typeof (item as Record<string, unknown>).instancePath === 'string' && typeof (item as Record<string, unknown>).schemaPath === 'string' && typeof (item as Record<string, unknown>).keyword === 'string')) throw new Error('Additional errors must be an array of AJV-compatible error objects.');
      set({ additionalErrorsText: text, additionalErrors: value as ErrorObject[], additionalErrorsParseError: undefined });
    } catch (reason) {
      set({ additionalErrorsText: text, additionalErrorsParseError: reason instanceof Error ? reason.message : 'Invalid additional errors JSON.' });
    }
  },

  setUiSchemaText: (text) => {
    const errors: ParseError[] = [];
    const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false }) as unknown;
    if (errors.length > 0) {
      const first = errors[0];
      set({ uiSchemaText: text, uiSchemaParseError: `${printParseErrorCode(first.error)} at offset ${first.offset}` });
      return;
    }
    try {
      const uiSchema = parseUiSchema(value, true, useSchemaStore.getState().uiSchema);
      set((state) => ({
        uiSchemaText: text, uiSchema, uiSchemaParseError: undefined,
        uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph),
        selectedUiElementId: uiSchema.nodes.some((node) => node.id === state.selectedUiElementId) ? state.selectedUiElementId : uiSchema.rootId,
      }));
    } catch (reason) {
      set({ uiSchemaText: text, uiSchemaParseError: reason instanceof Error ? reason.message : 'Invalid UI Schema.' });
    }
  },

  generateUiSchema: () => set((state) => {
    const uiSchema = generateDefaultUiSchema(state.graph);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaParseError: undefined, uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph), selectedUiElementId: uiSchema.rootId };
  }),

  materializeUiSchema: () => set((state) => {
    const uiSchema = materializeUiSchema(state.uiSchema);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema) };
  }),

  selectUiElement: (elementId) => set((state) => {
    const element = state.uiSchema.nodes.find((node) => node.id === elementId);
    const target = element ? resolveUiScope(state.graph, element.element.scope) : undefined;
    return { selectedUiElementId: elementId, selectedNodeId: target?.id ?? state.selectedNodeId };
  }),

  addUiLayout: (parentId, type) => set((state) => {
    const element = type === 'Group' ? { type, label: 'Group' }
      : type === 'Category' ? { type, label: 'Category' }
        : type === 'Label' ? { type, text: 'Label' } : { type };
    const uiSchema = addUiElement(state.uiSchema, parentId, element);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  addUiControl: (parentId, schemaNodeId) => set((state) => {
    const uiSchema = addControlForSchemaNode(state.uiSchema, parentId, state.graph, schemaNodeId);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  setSelectedUiElementProperty: (key, value) => set((state) => {
    if (!state.selectedUiElementId) return state;
    const uiSchema = setUiElementProperty(state.uiSchema, state.selectedUiElementId, key, value);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  setSelectedUiRule: (rule) => set((state) => {
    if (!state.selectedUiElementId) return state;
    const uiSchema = setUiElementProperty(state.uiSchema, state.selectedUiElementId, 'rule', rule);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  setSelectedControlOption: (key, value) => set((state) => {
    if (!state.selectedUiElementId) return state;
    const uiSchema = setControlOption(state.uiSchema, state.selectedUiElementId, key, value);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  moveUiElement: (elementId, parentId, index) => set((state) => {
    const uiSchema = moveUiElement(state.uiSchema, elementId, parentId, index);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph) };
  }),

  removeUiElement: (elementId) => set((state) => {
    const uiSchema = removeUiElement(state.uiSchema, elementId);
    return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, state.graph), selectedUiElementId: uiSchema.rootId };
  }),

  setSourceText: (text) => {
    const parsed = parseSchemaText(text);
    if (parsed.schema === undefined) {
      set({
        sourceText: text,
        parseError: parsed.error,
        schemaDiagnostics: [],
        instanceDiagnostics: [],
      });
      return;
    }

    const schemaValidation = validateSchemaDocument(parsed.schema);
    if (!schemaValidation.valid) {
      // Keep the previous graph because converting an invalid structural schema
      // could silently drop invalid subschemas. The editor text remains untouched.
      set({
        sourceText: text,
        parseError: undefined,
        schemaDiagnostics: schemaValidation.diagnostics,
        instanceDiagnostics: [],
      });
      return;
    }

    const graph = schemaToGraph(parsed.schema);
    set((state) => ({
      sourceText: text,
      graph,
      nodePositions: pruneNodePositions(graph, state.nodePositions),
      parseError: undefined,
      schemaDiagnostics: schemaValidation.diagnostics,
      ...(() => {
        const uiSchema = state.uiSchema.explicit ? state.uiSchema : generateDefaultUiSchema(graph);
        return { uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, graph) };
      })(),
      selectedNodeId:
        state.selectedNodeId && graph.nodes.some((node) => node.id === state.selectedNodeId)
          ? state.selectedNodeId
          : graph.rootNodeId,
      ...instanceValidationState(graph, state.instanceText),
    }));
  },

  setInstanceText: (text) =>
    set((state) => ({
      instanceText: text,
      ...instanceValidationState(state.graph, text),
    })),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),

  setNodePosition: (nodeId, position) =>
    set((state) => ({
      nodePositions: setStoredNodePosition(state.nodePositions, nodeId, position),
    })),

  resetNodePositions: () => set({ nodePositions: {} }),

  setDialect: (dialect) =>
    set((state) => graphMutation(state, (graph) => convertGraphDialect(graph, dialect))),

  setSelectedNodeType: (type) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) => setNodeType(graph, state.selectedNodeId!, type));
    }),

  setSelectedNodeTitle: (title) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        setNodeKeyword(graph, state.selectedNodeId!, 'title', title || undefined),
      );
    }),

  setSelectedNodeKeyword: (keyword, value) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        setNodeKeyword(graph, state.selectedNodeId!, keyword, value),
      );
    }),

  addPropertyToSelected: (name, type, required) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        addProperty(graph, state.selectedNodeId!, name, type, required),
      );
    }),

  renamePropertyOnSelected: (previousName, nextName) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      const mutation = graphMutation(state, (graph) =>
        renameProperty(graph, state.selectedNodeId!, previousName, nextName),
      );
      if (!mutation.graph) return mutation;
      const uiSchema = rewriteUiScopes(state.uiSchema, state.graph, mutation.graph);
      return { ...mutation, uiSchema, uiSchemaText: uiSchemaToJson(uiSchema), uiSchemaDiagnostics: validateUiSchema(uiSchema, mutation.graph) };
    }),

  setPropertyRequiredOnSelected: (name, required) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        setPropertyRequired(graph, state.selectedNodeId!, name, required),
      );
    }),

  removePropertyFromSelected: (name) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        removeProperty(graph, state.selectedNodeId!, name),
      );
    }),

  addDefinitionToSelected: (name, type) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        addDefinition(graph, state.selectedNodeId!, name, type),
      );
    }),

  renameDefinitionOnSelected: (previousName, nextName) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        renameDefinition(graph, state.selectedNodeId!, previousName, nextName),
      );
    }),

  setSelectedReference: (targetNodeId) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        targetNodeId
          ? setNodeReference(graph, state.selectedNodeId!, targetNodeId)
          : clearNodeReference(graph, state.selectedNodeId!),
      );
    }),

  addPrefixItemToSelected: (type) =>
    set((state) => !state.selectedNodeId ? state : graphMutation(state, (graph) => addPrefixItem(graph, state.selectedNodeId!, type))),

  addAdvancedSchemaToSelected: (relation, type) =>
    set((state) => !state.selectedNodeId ? state : graphMutation(state, (graph) => addAdvancedSchema(graph, state.selectedNodeId!, relation, type))),

  removeAdvancedSchemaFromSelected: (relation) =>
    set((state) => !state.selectedNodeId ? state : graphMutation(state, (graph) => removeAdvancedSchema(graph, state.selectedNodeId!, relation))),


  addCompositionBranchToSelected: (relation, type) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        addCompositionBranch(graph, state.selectedNodeId!, relation, type),
      );
    }),

  removeCompositionBranchFromSelected: (relation, index) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        removeCompositionBranch(graph, state.selectedNodeId!, relation, index),
      );
    }),

  addSingleCompositionToSelected: (relation, type) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        addSingleComposition(graph, state.selectedNodeId!, relation, type),
      );
    }),

  removeSingleCompositionFromSelected: (relation) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        removeSingleComposition(graph, state.selectedNodeId!, relation),
      );
    }),

  addDependentSchemaToSelected: (name, type) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        addDependentSchema(graph, state.selectedNodeId!, name, type),
      );
    }),

  renameDependentSchemaOnSelected: (previousName, nextName) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        renameDependentSchema(graph, state.selectedNodeId!, previousName, nextName),
      );
    }),

  removeDependentSchemaFromSelected: (name) =>
    set((state) => {
      if (!state.selectedNodeId) return state;
      return graphMutation(state, (graph) =>
        removeDependentSchema(graph, state.selectedNodeId!, name),
      );
    }),

  loadSample: () =>
    set({
      sourceText: sampleSchemaText,
      graph: initialGraph,
      nodePositions: {},
      selectedNodeId: initialGraph.rootNodeId,
      parseError: undefined,
      schemaDiagnostics: initialSchemaDiagnostics,
      instanceText: sampleInstanceText,
      ...initialInstanceState,
    }),
}));
