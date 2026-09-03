export type JsonSchemaPrimitiveType =
  | 'null'
  | 'boolean'
  | 'object'
  | 'array'
  | 'number'
  | 'string'
  | 'integer';

export type JsonSchema = boolean | Record<string, unknown>;

export type SchemaNodeId = string;
export type SchemaEdgeId = string;

export type ArrayCompositionRelation = 'allOf' | 'anyOf' | 'oneOf';
export type SingleCompositionRelation = 'not' | 'if' | 'then' | 'else';
export type AdvancedSchemaRelation = 'contains' | 'unevaluatedProperties' | 'unevaluatedItems';
export type SchemaRelation =
  | 'property'
  | 'items'
  | 'prefixItem'
  | 'definition'
  | 'ref'
  | 'dynamicRef'
  | ArrayCompositionRelation
  | SingleCompositionRelation
  | AdvancedSchemaRelation
  | 'dependentSchema';

export interface StructuralPresence {
  properties: boolean;
  items: boolean;
  prefixItems?: boolean;
  defs: boolean;
  allOf?: boolean;
  anyOf?: boolean;
  oneOf?: boolean;
  not?: boolean;
  if?: boolean;
  then?: boolean;
  else?: boolean;
  dependentSchemas?: boolean;
  contains?: boolean;
  unevaluatedProperties?: boolean;
  unevaluatedItems?: boolean;
}

export interface SchemaNode {
  id: SchemaNodeId;
  /** RFC 6901 JSON Pointer, relative to the document root. Root = "". */
  pointer: string;
  kind: 'schema' | 'boolean-schema';
  booleanValue?: boolean;
  /**
   * Non-structural keywords. Schema-valued/applicator keywords represented by
   * graph edges are removed here and rebuilt by the serializer.
   */
  keywords: Record<string, unknown>;
  structuralPresence: StructuralPresence;
}

export interface SchemaEdge {
  id: SchemaEdgeId;
  source: SchemaNodeId;
  target: SchemaNodeId;
  relation: SchemaRelation;
  /** Property/definition/dependentSchemas name when the relation is keyed. */
  key?: string;
  /** Branch index for allOf/anyOf/oneOf. */
  index?: number;
  /** Original ref string for REF edges. */
  ref?: string;
}

export interface SchemaGraph {
  dialect: string;
  rootNodeId: SchemaNodeId;
  nodes: SchemaNode[];
  edges: SchemaEdge[];
}

export const DEFAULT_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
