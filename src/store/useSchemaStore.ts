import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { create } from 'zustand';
import {
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
  removeDependentSchema,
  removeProperty,
  removeSingleComposition,
  renameDefinition,
  renameDependentSchema,
  renameProperty,
  schemaToGraph,
  setNodeKeyword,
  setNodeReference,
  setNodeType,
  validateInstance,
  validateSchemaDocument,
  type ArrayCompositionRelation,
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

  setSourceText: (text: string) => void;
  setInstanceText: (text: string) => void;
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
  removePropertyFromSelected: (name: string) => void;
  addDefinitionToSelected: (name: string, type: JsonSchemaPrimitiveType) => void;
  renameDefinitionOnSelected: (previousName: string, nextName: string) => void;
  setSelectedReference: (targetNodeId?: string) => void;
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
  return {
    graph,
    sourceText: graphToJson(graph),
    nodePositions: pruneNodePositions(graph, state.nodePositions),
    parseError: undefined,
    schemaDiagnostics: schemaValidation.diagnostics,
    ...instanceValidationState(graph, state.instanceText),
  };
}

const initialGraph = schemaToGraph(sampleSchema as unknown as JsonSchema);
const initialSchemaDiagnostics = validateSchemaDocument(
  sampleSchema as unknown as JsonSchema,
).diagnostics;
const initialInstanceState = instanceValidationState(initialGraph, sampleInstanceText);

export const useSchemaStore = create<SchemaState>((set) => ({
  sourceText: sampleSchemaText,
  graph: initialGraph,
  nodePositions: {},
  selectedNodeId: initialGraph.rootNodeId,
  schemaDiagnostics: initialSchemaDiagnostics,

  instanceText: sampleInstanceText,
  ...initialInstanceState,

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
      return graphMutation(state, (graph) =>
        renameProperty(graph, state.selectedNodeId!, previousName, nextName),
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
