import type {
  ArrayCompositionRelation,
  JsonSchema,
  JsonSchemaPrimitiveType,
  SchemaGraph,
  SchemaNode,
  SingleCompositionRelation,
} from './model';
import { dialectForSchema, isDraft07Dialect } from './dialect';
import { appendPointer, localRefToPointer, nodeIdForPointer } from './pointer';
import { findUnresolvedReferences, resolveReference, type SchemaResourceRegistry } from './references';
import { schemaToGraph } from './parser';

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationSource = 'schema' | 'instance';

export interface ValidationDiagnostic {
  source: ValidationSource;
  severity: ValidationSeverity;
  keyword?: string;
  message: string;
  /** RFC 6901 path in the schema document. Root = "". */
  schemaPath: string;
  /** Stable graph node id when the diagnostic can be associated with a node. */
  nodeId?: string;
  /** RFC 6901 path in the validated JSON instance. Root = "". */
  instancePath?: string;
}

export interface ValidationResult {
  valid: boolean;
  diagnostics: ValidationDiagnostic[];
}

const JSON_SCHEMA_TYPES = new Set<JsonSchemaPrimitiveType>([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'string',
  'integer',
]);

const NON_NEGATIVE_INTEGER_KEYWORDS = [
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'minProperties',
  'maxProperties',
  'minContains',
  'maxContains',
] as const;

const NUMBER_KEYWORDS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
] as const;

const ARRAY_APPLICATORS: ArrayCompositionRelation[] = ['allOf', 'anyOf', 'oneOf'];
const SINGLE_APPLICATORS: SingleCompositionRelation[] = ['not', 'if', 'then', 'else'];
const KEYED_SCHEMA_MAP_KEYWORDS = new Set(['properties', '$defs', 'definitions', 'dependentSchemas', 'dependencies', 'dependentRequired']);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'boolean' || isObject(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function diagnosticNodePointer(schemaPath: string, keyword?: string): string {
  if (!keyword || !schemaPath) return schemaPath;
  const tokens = schemaPath.split('/').slice(1);
  const encodedKeyword = keyword.replace(/~/g, '~0').replace(/\//g, '~1');

  if (tokens.at(-1) === encodedKeyword) {
    return tokens.length === 1 ? '' : `/${tokens.slice(0, -1).join('/')}`;
  }

  if (
    (KEYED_SCHEMA_MAP_KEYWORDS.has(keyword) || ARRAY_APPLICATORS.includes(keyword as ArrayCompositionRelation)) &&
    tokens.length >= 2 &&
    tokens.at(-2) === encodedKeyword
  ) {
    return tokens.length === 2 ? '' : `/${tokens.slice(0, -2).join('/')}`;
  }

  return schemaPath;
}

function schemaDiagnostic(
  schemaPath: string,
  message: string,
  keyword?: string,
  severity: ValidationSeverity = 'error',
): ValidationDiagnostic {
  return {
    source: 'schema',
    severity,
    keyword,
    message,
    schemaPath,
    nodeId: nodeIdForPointer(diagnosticNodePointer(schemaPath, keyword)),
  };
}

function instanceDiagnostic(
  node: SchemaNode,
  instancePath: string,
  message: string,
  keyword?: string,
): ValidationDiagnostic {
  return {
    source: 'instance',
    severity: 'error',
    keyword,
    message,
    schemaPath: node.pointer,
    nodeId: node.id,
    instancePath,
  };
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right) return false;
  if (left === null || right === null) return left === right;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }

  if (isObject(left) && isObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (!deepEqual(leftKeys, rightKeys)) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }

  return false;
}

function uniqueJsonValues(values: unknown[]): boolean {
  return values.every(
    (value, index) =>
      !values.slice(0, index).some((previous) => deepEqual(previous, value)),
  );
}

function validTypeDeclaration(value: unknown): boolean {
  if (typeof value === 'string') {
    return JSON_SCHEMA_TYPES.has(value as JsonSchemaPrimitiveType);
  }
  if (!Array.isArray(value) || value.length === 0) return false;
  if (!value.every((item) => typeof item === 'string')) return false;
  const values = value as string[];
  return (
    values.every((item) => JSON_SCHEMA_TYPES.has(item as JsonSchemaPrimitiveType)) &&
    new Set(values).size === values.length
  );
}

/**
 * Validates the subset editable through MVP 3 for Draft 2020-12 and Draft-07.
 * Unknown extension keywords are accepted so they can round-trip without data loss.
 */
export function validateSchemaDocument(schema: JsonSchema, resources: SchemaResourceRegistry = {}): ValidationResult {
  const diagnostics: ValidationDiagnostic[] = [];
  const seenIds = new Set<string>();
  const seenAnchors = new Set<string>();
  const dialect = dialectForSchema(schema);
  const draft07 = dialect.id === 'draft-07';

  function visit(value: unknown, pointer: string): void {
    if (typeof value === 'boolean') return;
    if (!isObject(value)) {
      diagnostics.push(
        schemaDiagnostic(pointer, 'A subschema must be an object or boolean.'),
      );
      return;
    }

    if ('type' in value && !validTypeDeclaration(value.type)) {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, 'type'),
          'type must be a JSON Schema type name or a non-empty array of unique type names.',
          'type',
        ),
      );
    }

    for (const keyword of NON_NEGATIVE_INTEGER_KEYWORDS) {
      if (keyword in value && !isNonNegativeInteger(value[keyword])) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, keyword),
            `${keyword} must be a non-negative integer.`,
            keyword,
          ),
        );
      }
    }

    for (const keyword of NUMBER_KEYWORDS) {
      if (
        keyword in value &&
        (typeof value[keyword] !== 'number' || !Number.isFinite(value[keyword]))
      ) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, keyword),
            `${keyword} must be a finite number.`,
            keyword,
          ),
        );
      }
    }

    if (
      'multipleOf' in value &&
      (typeof value.multipleOf !== 'number' ||
        !Number.isFinite(value.multipleOf) ||
        value.multipleOf <= 0)
    ) {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, 'multipleOf'),
          'multipleOf must be a number greater than 0.',
          'multipleOf',
        ),
      );
    }

    if ('uniqueItems' in value && typeof value.uniqueItems !== 'boolean') {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, 'uniqueItems'),
          'uniqueItems must be a boolean.',
          'uniqueItems',
        ),
      );
    }

    if ('pattern' in value) {
      if (typeof value.pattern !== 'string') {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'pattern'),
            'pattern must be a string.',
            'pattern',
          ),
        );
      } else {
        try {
          new RegExp(value.pattern, 'u');
        } catch {
          diagnostics.push(
            schemaDiagnostic(
              appendPointer(pointer, 'pattern'),
              'pattern must contain a valid regular expression.',
              'pattern',
            ),
          );
        }
      }
    }

    if ('format' in value && typeof value.format !== 'string') {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, 'format'),
          'format must be a string.',
          'format',
        ),
      );
    }

    if ('$ref' in value && typeof value.$ref !== 'string') {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, '$ref'),
          '$ref must be a string.',
          '$ref',
        ),
      );
    }

    for (const keyword of ['$id', '$anchor', '$dynamicAnchor', '$dynamicRef'] as const) {
      if (keyword in value && typeof value[keyword] !== 'string') {
        diagnostics.push(schemaDiagnostic(appendPointer(pointer, keyword), `${keyword} must be a string.`, keyword));
      }
    }
    for (const keyword of ['$anchor', '$dynamicAnchor'] as const) {
      const anchor = value[keyword];
      if (typeof anchor === 'string' && !/^[A-Za-z_][-A-Za-z0-9._]*$/.test(anchor)) {
        diagnostics.push(schemaDiagnostic(appendPointer(pointer, keyword), `${keyword} must be a valid plain-name anchor.`, keyword));
      }
    }
    if (typeof value.$id === 'string') {
      if (seenIds.has(value.$id)) diagnostics.push(schemaDiagnostic(appendPointer(pointer, '$id'), `Duplicate schema resource identifier ${JSON.stringify(value.$id)}.`, '$id'));
      seenIds.add(value.$id);
    }
    for (const keyword of ['$anchor', '$dynamicAnchor'] as const) {
      const anchor = value[keyword];
      if (typeof anchor !== 'string') continue;
      if (seenAnchors.has(anchor)) diagnostics.push(schemaDiagnostic(appendPointer(pointer, keyword), `Duplicate anchor ${JSON.stringify(anchor)}.`, keyword));
      seenAnchors.add(anchor);
    }

    if ('required' in value) {
      const required = value.required;
      if (
        !Array.isArray(required) ||
        !required.every((item) => typeof item === 'string') ||
        new Set(required).size !== required.length
      ) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'required'),
            'required must be an array of unique strings.',
            'required',
          ),
        );
      }
    }

    if ('enum' in value) {
      if (!Array.isArray(value.enum) || value.enum.length === 0) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'enum'),
            'enum must be a non-empty array.',
            'enum',
          ),
        );
      } else if (!uniqueJsonValues(value.enum)) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'enum'),
            'enum values must be unique.',
            'enum',
          ),
        );
      }
    }

    if (
      typeof value.minLength === 'number' &&
      typeof value.maxLength === 'number' &&
      value.minLength > value.maxLength
    ) {
      diagnostics.push(
        schemaDiagnostic(
          pointer,
          'minLength is greater than maxLength, so no string can satisfy both constraints.',
          'minLength',
          'warning',
        ),
      );
    }

    if (
      typeof value.minItems === 'number' &&
      typeof value.maxItems === 'number' &&
      value.minItems > value.maxItems
    ) {
      diagnostics.push(
        schemaDiagnostic(
          pointer,
          'minItems is greater than maxItems, so no array can satisfy both constraints.',
          'minItems',
          'warning',
        ),
      );
    }

    if (
      typeof value.minProperties === 'number' &&
      typeof value.maxProperties === 'number' &&
      value.minProperties > value.maxProperties
    ) {
      diagnostics.push(
        schemaDiagnostic(
          pointer,
          'minProperties is greater than maxProperties, so no object can satisfy both constraints.',
          'minProperties',
          'warning',
        ),
      );
    }

    if (isObject(value.properties)) {
      for (const [name, child] of Object.entries(value.properties)) {
        const childPointer = appendPointer(pointer, 'properties', name);
        if (!isSchema(child)) {
          diagnostics.push(
            schemaDiagnostic(
              childPointer,
              `Property ${JSON.stringify(name)} must contain a schema object or boolean.`,
              'properties',
            ),
          );
        } else {
          visit(child, childPointer);
        }
      }
    } else if ('properties' in value) {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, 'properties'),
          'properties must be an object whose values are schemas.',
          'properties',
        ),
      );
    }

    const definitionsKeyword = draft07 ? 'definitions' : '$defs';
    const definitionsValue = value[definitionsKeyword];
    if (isObject(definitionsValue)) {
      for (const [name, child] of Object.entries(definitionsValue)) {
        const childPointer = appendPointer(pointer, definitionsKeyword, name);
        if (!isSchema(child)) {
          diagnostics.push(
            schemaDiagnostic(
              childPointer,
              `Definition ${JSON.stringify(name)} must contain a schema object or boolean.`,
              definitionsKeyword,
            ),
          );
        } else {
          visit(child, childPointer);
        }
      }
    } else if (definitionsKeyword in value) {
      diagnostics.push(
        schemaDiagnostic(
          appendPointer(pointer, definitionsKeyword),
          `${definitionsKeyword} must be an object whose values are schemas.`,
          definitionsKeyword,
        ),
      );
    }

    if ('items' in value) {
      const childPointer = appendPointer(pointer, 'items');
      if (draft07 && Array.isArray(value.items)) {
        value.items.forEach((child, index) => {
          const itemPointer = appendPointer(pointer, 'items', String(index));
          if (!isSchema(child)) {
            diagnostics.push(
              schemaDiagnostic(
                itemPointer,
                `items[${index}] must contain a schema object or boolean.`,
                'items',
              ),
            );
          } else {
            visit(child, itemPointer);
          }
        });
      } else if (!isSchema(value.items)) {
        diagnostics.push(
          schemaDiagnostic(
            childPointer,
            draft07
              ? 'items must contain a schema or an array of schemas in Draft-07.'
              : 'items must contain a schema object or boolean.',
            'items',
          ),
        );
      } else {
        visit(value.items, childPointer);
      }
    }

    if (!draft07 && 'prefixItems' in value) {
      if (!Array.isArray(value.prefixItems)) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'prefixItems'),
            'prefixItems must be an array of schemas.',
            'prefixItems',
          ),
        );
      } else {
        value.prefixItems.forEach((child, index) => {
          const childPointer = appendPointer(pointer, 'prefixItems', String(index));
          if (!isSchema(child)) {
            diagnostics.push(schemaDiagnostic(childPointer, `prefixItems[${index}] must contain a schema object or boolean.`, 'prefixItems'));
          } else {
            visit(child, childPointer);
          }
        });
      }
    }

    if (!draft07) {
      for (const keyword of ['contains', 'unevaluatedProperties', 'unevaluatedItems'] as const) {
        if (!(keyword in value)) continue;
        const childPointer = appendPointer(pointer, keyword);
        if (!isSchema(value[keyword])) diagnostics.push(schemaDiagnostic(childPointer, `${keyword} must contain a schema object or boolean.`, keyword));
        else visit(value[keyword], childPointer);
      }
      if (typeof value.minContains === 'number' && typeof value.maxContains === 'number' && value.minContains > value.maxContains) {
        diagnostics.push(schemaDiagnostic(pointer, 'minContains is greater than maxContains.', 'minContains', 'warning'));
      }
    }

    if (draft07 && 'additionalItems' in value) {
      const childPointer = appendPointer(pointer, 'additionalItems');
      if (!isSchema(value.additionalItems)) {
        diagnostics.push(schemaDiagnostic(childPointer, 'additionalItems must contain a schema object or boolean.', 'additionalItems'));
      } else {
        visit(value.additionalItems, childPointer);
      }
    }

    for (const keyword of ARRAY_APPLICATORS) {
      if (!(keyword in value)) continue;
      const branches = value[keyword];
      if (!Array.isArray(branches) || branches.length === 0) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, keyword),
            `${keyword} must be a non-empty array of schemas.`,
            keyword,
          ),
        );
        continue;
      }
      branches.forEach((child, index) => {
        const childPointer = appendPointer(pointer, keyword, String(index));
        if (!isSchema(child)) {
          diagnostics.push(
            schemaDiagnostic(
              childPointer,
              `${keyword}[${index}] must contain a schema object or boolean.`,
              keyword,
            ),
          );
        } else {
          visit(child, childPointer);
        }
      });

      if (
        keyword === 'oneOf' &&
        branches.every(isSchema) &&
        !uniqueJsonValues(branches)
      ) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'oneOf'),
            'oneOf contains duplicate branches and may be impossible to satisfy exactly once.',
            'oneOf',
            'warning',
          ),
        );
      }
    }

    for (const keyword of SINGLE_APPLICATORS) {
      if (!(keyword in value)) continue;
      const childPointer = appendPointer(pointer, keyword);
      if (!isSchema(value[keyword])) {
        diagnostics.push(
          schemaDiagnostic(
            childPointer,
            `${keyword} must contain a schema object or boolean.`,
            keyword,
          ),
        );
      } else {
        visit(value[keyword], childPointer);
      }
    }

    if (('then' in value || 'else' in value) && !('if' in value)) {
      diagnostics.push(
        schemaDiagnostic(
          pointer,
          'then/else have no effect without an if subschema.',
          'if',
          'warning',
        ),
      );
    }

    if (draft07) {
      if (isObject(value.dependencies)) {
        for (const [name, dependency] of Object.entries(value.dependencies)) {
          const childPointer = appendPointer(pointer, 'dependencies', name);
          if (isSchema(dependency)) {
            visit(dependency, childPointer);
            continue;
          }
          if (
            !Array.isArray(dependency) ||
            !dependency.every((item) => typeof item === 'string') ||
            new Set(dependency).size !== dependency.length
          ) {
            diagnostics.push(
              schemaDiagnostic(
                childPointer,
                `dependencies entry ${JSON.stringify(name)} must be a schema or an array of unique strings.`,
                'dependencies',
              ),
            );
          }
        }
      } else if ('dependencies' in value) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'dependencies'),
            'dependencies must be an object.',
            'dependencies',
          ),
        );
      }
    } else {
      if (isObject(value.dependentSchemas)) {
        for (const [name, child] of Object.entries(value.dependentSchemas)) {
          const childPointer = appendPointer(pointer, 'dependentSchemas', name);
          if (!isSchema(child)) {
            diagnostics.push(
              schemaDiagnostic(
                childPointer,
                `dependentSchemas entry ${JSON.stringify(name)} must contain a schema object or boolean.`,
                'dependentSchemas',
              ),
            );
          } else {
            visit(child, childPointer);
          }
        }
      } else if ('dependentSchemas' in value) {
        diagnostics.push(
          schemaDiagnostic(
            appendPointer(pointer, 'dependentSchemas'),
            'dependentSchemas must be an object whose values are schemas.',
            'dependentSchemas',
          ),
        );
      }

      if (isObject(value.dependentRequired)) {
        for (const [name, dependency] of Object.entries(value.dependentRequired)) {
          if (
            !Array.isArray(dependency) ||
            !dependency.every((item) => typeof item === 'string') ||
            new Set(dependency).size !== dependency.length
          ) {
            diagnostics.push(
              schemaDiagnostic(
                appendPointer(pointer, 'dependentRequired', name),
                `dependentRequired entry ${JSON.stringify(name)} must be an array of unique strings.`,
                'dependentRequired',
              ),
            );
          }
        }
      } else if ('dependentRequired' in value) {
        diagnostics.push(schemaDiagnostic(appendPointer(pointer, 'dependentRequired'), 'dependentRequired must be an object.', 'dependentRequired'));
      }
    }
  }

  visit(schema, '');
  const referenceGraph = schemaToGraph(schema);
  for (const unresolved of findUnresolvedReferences(referenceGraph, resources)) {
    const node = referenceGraph.nodes.find((candidate) => candidate.id === unresolved.nodeId);
    diagnostics.push(schemaDiagnostic(node?.pointer ?? '', `${unresolved.keyword} ${JSON.stringify(unresolved.reference)} is unresolved: ${unresolved.message}`, unresolved.keyword, 'warning'));
  }
  return {
    valid: !diagnostics.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics,
  };
}

function jsonTypeMatches(instance: unknown, type: JsonSchemaPrimitiveType): boolean {
  switch (type) {
    case 'null': return instance === null;
    case 'boolean': return typeof instance === 'boolean';
    case 'object': return isObject(instance);
    case 'array': return Array.isArray(instance);
    case 'number': return typeof instance === 'number' && Number.isFinite(instance);
    case 'integer': return typeof instance === 'number' && Number.isInteger(instance);
    case 'string': return typeof instance === 'string';
    default: return false;
  }
}

function declaredTypes(value: unknown): JsonSchemaPrimitiveType[] {
  if (typeof value === 'string' && JSON_SCHEMA_TYPES.has(value as JsonSchemaPrimitiveType)) {
    return [value as JsonSchemaPrimitiveType];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item): item is JsonSchemaPrimitiveType =>
        typeof item === 'string' && JSON_SCHEMA_TYPES.has(item as JsonSchemaPrimitiveType),
    );
  }
  return [];
}

function isMultipleOf(value: number, divisor: number): boolean {
  const quotient = value / divisor;
  const nearest = Math.round(quotient);
  return Math.abs(quotient - nearest) <= Number.EPSILON * Math.max(1, Math.abs(quotient)) * 8;
}

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validTime(value: string): boolean {
  const match = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59 && Number(match[3]) <= 60;
}

function validDateTime(value: string): boolean {
  const separator = value.includes('T') ? 'T' : value.includes('t') ? 't' : undefined;
  if (!separator) return false;
  const [date, time] = value.split(separator);
  return Boolean(date && time && validDate(date) && validTime(time));
}

function validIpv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every(
    (part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
  );
}

function validIpv6(value: string): boolean {
  if (!/^[0-9A-Fa-f:]+$/.test(value) || !value.includes(':')) return false;
  if ((value.match(/::/g) ?? []).length > 1) return false;
  const parts = value.split(':');
  if (!parts.every((part) => part === '' || /^[0-9A-Fa-f]{1,4}$/.test(part))) return false;
  return value.includes('::') ? parts.length <= 8 : parts.length === 8;
}

function validHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  return value.split('.').every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
  );
}

function validFormat(format: string, value: string): boolean | undefined {
  switch (format) {
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'uri':
    case 'uri-reference':
      try {
        if (format === 'uri') new URL(value);
        else new URL(value, 'https://example.invalid/');
        return true;
      } catch {
        return false;
      }
    case 'uuid': return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    case 'date': return validDate(value);
    case 'date-time': return validDateTime(value);
    case 'time': return validTime(value);
    case 'ipv4': return validIpv4(value);
    case 'ipv6': return validIpv6(value);
    case 'hostname': return validHostname(value);
    case 'regex':
      try {
        new RegExp(value, 'u');
        return true;
      } catch {
        return false;
      }
    default: return undefined;
  }
}

export const MVP2_FORMATS = [
  'email',
  'uri',
  'uri-reference',
  'uuid',
  'date',
  'date-time',
  'time',
  'ipv4',
  'ipv6',
  'hostname',
  'regex',
] as const;

/** Validates a JSON instance against the graph-supported Draft 2020-12 / Draft-07 subset. */
export function validateInstance(graph: SchemaGraph, instance: unknown, resources: SchemaResourceRegistry = {}): ValidationResult {
  const draft07 = isDraft07Dialect(graph.dialect);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const refTargets = new Map(
    graph.edges.filter((edge) => edge.relation === 'ref').map((edge) => [edge.source, edge.target]),
  );

  function childFor(node: SchemaNode, relation: string): SchemaNode | undefined {
    const edge = graph.edges.find((candidate) => candidate.source === node.id && candidate.relation === relation);
    return edge ? nodeById.get(edge.target) : undefined;
  }

  function branchesFor(node: SchemaNode, relation: ArrayCompositionRelation): SchemaNode[] {
    return graph.edges
      .filter((edge) => edge.source === node.id && edge.relation === relation)
      .sort((left, right) => (left.index ?? 0) - (right.index ?? 0))
      .map((edge) => nodeById.get(edge.target))
      .filter((child): child is SchemaNode => Boolean(child));
  }

  function validateNode(
    node: SchemaNode,
    value: unknown,
    instancePath: string,
    stack: Set<string>,
  ): ValidationDiagnostic[] {
    const visitKey = `${node.id}|${instancePath}`;
    if (stack.has(visitKey)) return [];
    const nextStack = new Set(stack);
    nextStack.add(visitKey);
    const diagnostics: ValidationDiagnostic[] = [];

    if (node.kind === 'boolean-schema') {
      if (node.booleanValue === false) {
        diagnostics.push(instanceDiagnostic(node, instancePath, 'The instance is rejected by a false schema.'));
      }
      return diagnostics;
    }

    const keywords = node.keywords;

    if (typeof keywords.$ref === 'string') {
      const targetId = refTargets.get(node.id);
      const target = targetId ? nodeById.get(targetId) : undefined;
      if (target) {
        diagnostics.push(...validateNode(target, value, instancePath, nextStack));
      } else {
        const resolved = resolveReference(graph, node.id, keywords.$ref, resources);
        if (resolved.status === 'resolved') {
          diagnostics.push(...validateInstance({ ...resolved.graph, rootNodeId: resolved.node.id }, value, resources).diagnostics.map((item) => ({ ...item, instancePath })));
        } else {
        diagnostics.push(
          instanceDiagnostic(node, instancePath, `Reference ${keywords.$ref} cannot be resolved.`, '$ref'),
        );
        }
      }
      // Draft-07 defines a $ref object as a reference object: sibling keywords are ignored.
      if (draft07) return diagnostics;
    }

    if (!draft07 && typeof keywords.$dynamicRef === 'string') {
      const targetId = graph.edges.find((edge) => edge.source === node.id && edge.relation === 'dynamicRef')?.target;
      const target = targetId ? nodeById.get(targetId) : undefined;
      const resolved = target ? { status: 'resolved' as const, graph, node: target } : resolveReference(graph, node.id, keywords.$dynamicRef, resources);
      if (resolved.status === 'resolved') {
        if (resolved.graph === graph) diagnostics.push(...validateNode(resolved.node, value, instancePath, nextStack));
        else diagnostics.push(...validateInstance({ ...resolved.graph, rootNodeId: resolved.node.id }, value, resources).diagnostics.map((item) => ({ ...item, instancePath })));
      }
      else diagnostics.push(instanceDiagnostic(node, instancePath, `Dynamic reference ${keywords.$dynamicRef} cannot be resolved.`, '$dynamicRef'));
    }

    const types = declaredTypes(keywords.type);
    if (types.length > 0 && !types.some((type) => jsonTypeMatches(value, type))) {
      diagnostics.push(instanceDiagnostic(node, instancePath, `Expected ${types.join(' | ')}.`, 'type'));
      return diagnostics;
    }

    if (Array.isArray(keywords.enum) && !keywords.enum.some((item) => deepEqual(item, value))) {
      diagnostics.push(instanceDiagnostic(node, instancePath, 'Value is not one of the allowed enum values.', 'enum'));
    }
    if ('const' in keywords && !deepEqual(keywords.const, value)) {
      diagnostics.push(instanceDiagnostic(node, instancePath, 'Value does not match const.', 'const'));
    }

    if (typeof value === 'string') {
      const length = Array.from(value).length;
      if (typeof keywords.minLength === 'number' && length < keywords.minLength) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `String length ${length} is less than minLength ${keywords.minLength}.`, 'minLength'));
      }
      if (typeof keywords.maxLength === 'number' && length > keywords.maxLength) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `String length ${length} is greater than maxLength ${keywords.maxLength}.`, 'maxLength'));
      }
      if (typeof keywords.pattern === 'string') {
        try {
          if (!new RegExp(keywords.pattern, 'u').test(value)) {
            diagnostics.push(instanceDiagnostic(node, instancePath, `String does not match pattern ${JSON.stringify(keywords.pattern)}.`, 'pattern'));
          }
        } catch {
          // Schema validation reports invalid regular expressions.
        }
      }
      if (typeof keywords.format === 'string' && validFormat(keywords.format, value) === false) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `String does not satisfy format ${JSON.stringify(keywords.format)}.`, 'format'));
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (typeof keywords.minimum === 'number' && value < keywords.minimum) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `${value} is less than minimum ${keywords.minimum}.`, 'minimum'));
      }
      if (typeof keywords.maximum === 'number' && value > keywords.maximum) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `${value} is greater than maximum ${keywords.maximum}.`, 'maximum'));
      }
      if (typeof keywords.exclusiveMinimum === 'number' && value <= keywords.exclusiveMinimum) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `${value} must be greater than exclusiveMinimum ${keywords.exclusiveMinimum}.`, 'exclusiveMinimum'));
      }
      if (typeof keywords.exclusiveMaximum === 'number' && value >= keywords.exclusiveMaximum) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `${value} must be less than exclusiveMaximum ${keywords.exclusiveMaximum}.`, 'exclusiveMaximum'));
      }
      if (typeof keywords.multipleOf === 'number' && keywords.multipleOf > 0 && !isMultipleOf(value, keywords.multipleOf)) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `${value} is not a multiple of ${keywords.multipleOf}.`, 'multipleOf'));
      }
    }

    if (Array.isArray(value)) {
      if (typeof keywords.minItems === 'number' && value.length < keywords.minItems) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `Array has ${value.length} items, less than minItems ${keywords.minItems}.`, 'minItems'));
      }
      if (typeof keywords.maxItems === 'number' && value.length > keywords.maxItems) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `Array has ${value.length} items, greater than maxItems ${keywords.maxItems}.`, 'maxItems'));
      }
      if (keywords.uniqueItems === true && !uniqueJsonValues(value)) {
        diagnostics.push(instanceDiagnostic(node, instancePath, 'Array items must be unique.', 'uniqueItems'));
      }
      const prefixItems = graph.edges
        .filter((edge) => edge.source === node.id && edge.relation === 'prefixItem')
        .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
      for (const edge of prefixItems) {
        const index = edge.index ?? 0;
        if (index >= value.length) continue;
        const child = nodeById.get(edge.target);
        if (child) {
          diagnostics.push(...validateNode(child, value[index], appendPointer(instancePath, String(index)), nextStack));
        }
      }

      const itemsNode = childFor(node, 'items');
      if (itemsNode) {
        const startIndex = prefixItems.length > 0 ? prefixItems.length : 0;
        value.forEach((item, index) => {
          if (index < startIndex) return;
          diagnostics.push(...validateNode(itemsNode, item, appendPointer(instancePath, String(index)), nextStack));
        });
      }
      const containsNode = childFor(node, 'contains');
      const contained = new Set<number>();
      if (containsNode) {
        value.forEach((item, index) => {
          if (validateNode(containsNode, item, appendPointer(instancePath, String(index)), nextStack).length === 0) contained.add(index);
        });
        const minimum = typeof keywords.minContains === 'number' ? keywords.minContains : 1;
        const maximum = typeof keywords.maxContains === 'number' ? keywords.maxContains : Infinity;
        if (contained.size < minimum || contained.size > maximum) diagnostics.push(instanceDiagnostic(node, instancePath, `Array contains ${contained.size} matching items; expected ${minimum}..${maximum === Infinity ? '∞' : maximum}.`, 'contains'));
      }
      const unevaluatedItems = childFor(node, 'unevaluatedItems');
      if (unevaluatedItems) value.forEach((item, index) => {
        if (index < prefixItems.length || itemsNode || contained.has(index)) return;
        diagnostics.push(...validateNode(unevaluatedItems, item, appendPointer(instancePath, String(index)), nextStack));
      });
    }

    if (isObject(value)) {
      const keys = Object.keys(value);
      if (typeof keywords.minProperties === 'number' && keys.length < keywords.minProperties) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `Object has ${keys.length} properties, less than minProperties ${keywords.minProperties}.`, 'minProperties'));
      }
      if (typeof keywords.maxProperties === 'number' && keys.length > keywords.maxProperties) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `Object has ${keys.length} properties, greater than maxProperties ${keywords.maxProperties}.`, 'maxProperties'));
      }

      const required = Array.isArray(keywords.required)
        ? keywords.required.filter((item): item is string => typeof item === 'string')
        : [];
      for (const propertyName of required) {
        if (!(propertyName in value)) {
          diagnostics.push(instanceDiagnostic(node, appendPointer(instancePath, propertyName), `Required property ${JSON.stringify(propertyName)} is missing.`, 'required'));
        }
      }

      const propertyEdges = graph.edges.filter(
        (edge) => edge.source === node.id && edge.relation === 'property' && edge.key,
      );
      for (const edge of propertyEdges) {
        if (!edge.key || !(edge.key in value)) continue;
        const child = nodeById.get(edge.target);
        if (child) diagnostics.push(...validateNode(child, value[edge.key], appendPointer(instancePath, edge.key), nextStack));
      }
      const unevaluatedProperties = childFor(node, 'unevaluatedProperties');
      if (unevaluatedProperties) {
        const evaluated = new Set(propertyEdges.map((edge) => edge.key).filter((key): key is string => Boolean(key)));
        for (const [key, item] of Object.entries(value)) if (!evaluated.has(key)) diagnostics.push(...validateNode(unevaluatedProperties, item, appendPointer(instancePath, key), nextStack));
      }

      const propertyDependenciesValue = draft07 ? keywords.dependencies : keywords.dependentRequired;
      if (isObject(propertyDependenciesValue)) {
        for (const [trigger, dependency] of Object.entries(propertyDependenciesValue)) {
          if (!(trigger in value) || !Array.isArray(dependency)) continue;
          for (const propertyName of dependency) {
            if (typeof propertyName !== 'string' || propertyName in value) continue;
            diagnostics.push(
              instanceDiagnostic(
                node,
                appendPointer(instancePath, propertyName),
                `Property ${JSON.stringify(trigger)} requires property ${JSON.stringify(propertyName)}.`,
                draft07 ? 'dependencies' : 'dependentRequired',
              ),
            );
          }
        }
      }

      const dependentEdges = graph.edges.filter(
        (edge) => edge.source === node.id && edge.relation === 'dependentSchema' && edge.key,
      );
      for (const edge of dependentEdges) {
        if (!edge.key || !(edge.key in value)) continue;
        const child = nodeById.get(edge.target);
        if (child) diagnostics.push(...validateNode(child, value, instancePath, nextStack));
      }
    }

    for (const branch of branchesFor(node, 'allOf')) {
      diagnostics.push(...validateNode(branch, value, instancePath, nextStack));
    }

    const anyOfBranches = branchesFor(node, 'anyOf');
    if (anyOfBranches.length > 0) {
      const passing = anyOfBranches.some(
        (branch) => validateNode(branch, value, instancePath, new Set(nextStack)).length === 0,
      );
      if (!passing) {
        diagnostics.push(instanceDiagnostic(node, instancePath, 'Instance must satisfy at least one anyOf branch.', 'anyOf'));
      }
    }

    const oneOfBranches = branchesFor(node, 'oneOf');
    if (oneOfBranches.length > 0) {
      const matches = oneOfBranches.filter(
        (branch) => validateNode(branch, value, instancePath, new Set(nextStack)).length === 0,
      ).length;
      if (matches !== 1) {
        diagnostics.push(instanceDiagnostic(node, instancePath, `Instance must satisfy exactly one oneOf branch; matched ${matches}.`, 'oneOf'));
      }
    }

    const notNode = childFor(node, 'not');
    if (notNode) {
      const rejected = validateNode(notNode, value, instancePath, new Set(nextStack)).length === 0;
      if (rejected) {
        diagnostics.push(instanceDiagnostic(node, instancePath, 'Instance must not satisfy the not subschema.', 'not'));
      }
    }

    const ifNode = childFor(node, 'if');
    if (ifNode) {
      const conditionMatches = validateNode(ifNode, value, instancePath, new Set(nextStack)).length === 0;
      const selected = childFor(node, conditionMatches ? 'then' : 'else');
      if (selected) diagnostics.push(...validateNode(selected, value, instancePath, nextStack));
    }

    return diagnostics;
  }

  const root = nodeById.get(graph.rootNodeId);
  if (!root) {
    return {
      valid: false,
      diagnostics: [{
        source: 'instance',
        severity: 'error',
        message: `Root node ${graph.rootNodeId} was not found.`,
        schemaPath: '',
        instancePath: '',
      }],
    };
  }

  const diagnostics = validateNode(root, instance, '', new Set());
  return {
    valid: diagnostics.length === 0,
    diagnostics,
  };
}
