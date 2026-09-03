import { useEffect, useMemo, useState } from 'react';
import {
  dialectDescriptor,
  getDefinitions,
  getNode,
  getNodeType,
  getOutgoingEdges,
  inferNodeType,
  nodeDisplayName,
  type JsonSchemaPrimitiveType,
  type SchemaEdge,
} from '../core';
import { useSchemaStore } from '../store/useSchemaStore';
import { CompositionFields } from './CompositionFields';
import { ConstraintFields } from './ConstraintFields';
import { AdvancedFields } from './AdvancedFields';

const TYPES: JsonSchemaPrimitiveType[] = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
];

interface RenameRowProps {
  name: string;
  label: string;
  siblingNames: string[];
  onRename: (nextName: string) => void;
  onSelect: () => void;
  onDelete?: () => void;
  required?: boolean;
  onRequiredChange?: (required: boolean) => void;
}

function RenameRow({
  name,
  label,
  siblingNames,
  onRename,
  onSelect,
  onDelete,
  required,
  onRequiredChange,
}: RenameRowProps) {
  const [draft, setDraft] = useState(name);

  useEffect(() => setDraft(name), [name]);

  const trimmed = draft.trim();
  const duplicate = siblingNames.some(
    (candidate) => candidate !== name && candidate === trimmed,
  );
  const canRename = Boolean(trimmed) && trimmed !== name && !duplicate;

  return (
    <div className="resource-row">
      <button type="button" className="resource-row__select" onClick={onSelect}>
        {label}
      </button>
      <input
        aria-label={`Rename ${name}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="button"
        onClick={() => onRename(trimmed)}
        disabled={!canRename}
      >
        Rename
      </button>
      {onRequiredChange && (
        <label className="checkbox-row resource-row__required">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => onRequiredChange(event.target.checked)}
          />
          Required
        </label>
      )}
      {onDelete && (
        <button type="button" className="danger-button" onClick={onDelete}>
          Delete
        </button>
      )}
      {duplicate && <small className="error-text">Name already used.</small>}
    </div>
  );
}

export function NodeInspector() {
  const graph = useSchemaStore((state) => state.graph);
  const selectedNodeId = useSchemaStore((state) => state.selectedNodeId);
  const selectNode = useSchemaStore((state) => state.selectNode);
  const setSelectedNodeType = useSchemaStore((state) => state.setSelectedNodeType);
  const setSelectedNodeTitle = useSchemaStore((state) => state.setSelectedNodeTitle);
  const addPropertyToSelected = useSchemaStore((state) => state.addPropertyToSelected);
  const renamePropertyOnSelected = useSchemaStore(
    (state) => state.renamePropertyOnSelected,
  );
  const removePropertyFromSelected = useSchemaStore(
    (state) => state.removePropertyFromSelected,
  );
  const setPropertyRequiredOnSelected = useSchemaStore(
    (state) => state.setPropertyRequiredOnSelected,
  );
  const addDefinitionToSelected = useSchemaStore(
    (state) => state.addDefinitionToSelected,
  );
  const renameDefinitionOnSelected = useSchemaStore(
    (state) => state.renameDefinitionOnSelected,
  );
  const setSelectedReference = useSchemaStore((state) => state.setSelectedReference);
  const parseError = useSchemaStore((state) => state.parseError);
  const schemaDiagnostics = useSchemaStore((state) => state.schemaDiagnostics);
  const instanceDiagnostics = useSchemaStore((state) => state.instanceDiagnostics);

  const [propertyName, setPropertyName] = useState('');
  const [propertyType, setPropertyType] = useState<JsonSchemaPrimitiveType>('string');
  const [required, setRequired] = useState(false);
  const [definitionName, setDefinitionName] = useState('');
  const [definitionType, setDefinitionType] = useState<JsonSchemaPrimitiveType>('object');

  const node = useMemo(
    () => (selectedNodeId ? getNode(graph, selectedNodeId) : undefined),
    [graph, selectedNodeId],
  );

  const properties = useMemo(
    () => (node ? getOutgoingEdges(graph, node.id, 'property') : []),
    [graph, node],
  );
  const definitions = useMemo(() => getDefinitions(graph), [graph]);
  const ownedDefinitions = useMemo(
    () => (node ? getOutgoingEdges(graph, node.id, 'definition') : []),
    [graph, node],
  );
  const refEdge = useMemo(
    () => (node ? getOutgoingEdges(graph, node.id, 'ref')[0] : undefined),
    [graph, node],
  );

  if (!node) {
    return <div className="empty-state">Select a node to inspect it.</div>;
  }

  const graphEditingBlocked = Boolean(parseError) || schemaDiagnostics.some(
    (diagnostic) => diagnostic.severity === 'error',
  );

  if (node.kind === 'boolean-schema') {
    const booleanDiagnostics = [...schemaDiagnostics, ...instanceDiagnostics].filter(
      (diagnostic) => diagnostic.nodeId === node.id,
    );
    return (
      <div className="inspector-form">
        <h2>Boolean schema</h2>
        <p>Value: <strong>{String(node.booleanValue)}</strong></p>
        <code>{node.pointer || '/'}</code>
        {booleanDiagnostics.map((diagnostic, index) => (
          <div key={`${diagnostic.source}-${index}`} className={`inspector-diagnostic inspector-diagnostic--${diagnostic.severity}`}>
            <strong>{diagnostic.keyword ?? diagnostic.source}</strong>
            <span>{diagnostic.message}</span>
          </div>
        ))}
      </div>
    );
  }

  const explicitType = getNodeType(node);
  const inferredType = inferNodeType(graph, node);
  const title = typeof node.keywords.title === 'string' ? node.keywords.title : '';
  const canAddProperty = inferredType === 'object';
  const propertyNames = properties
    .map((edge) => edge.key)
    .filter((value): value is string => Boolean(value));
  const requiredPropertyNames = new Set(
    Array.isArray(node.keywords.required)
      ? node.keywords.required.filter((value): value is string => typeof value === 'string')
      : [],
  );
  const definitionsKeyword = dialectDescriptor(graph.dialect).definitionsKeyword;
  const definitionNames = ownedDefinitions
    .map((edge) => edge.key)
    .filter((value): value is string => Boolean(value));
  const nodeDiagnostics = [...schemaDiagnostics, ...instanceDiagnostics].filter(
    (diagnostic) => diagnostic.nodeId === node.id,
  );

  const referenceTargets = [
    { nodeId: graph.rootNodeId, label: 'Root (#)' },
    ...definitions.map((definition) => ({
      nodeId: definition.nodeId,
      label: `${definition.name} — #${definition.pointer}`,
    })),
  ];

  if (
    refEdge &&
    !referenceTargets.some((target) => target.nodeId === refEdge.target)
  ) {
    const target = getNode(graph, refEdge.target);
    if (target) {
      referenceTargets.push({
        nodeId: target.id,
        label: `${nodeDisplayName(graph, target)} — #${target.pointer}`,
      });
    }
  }

  return (
    <div className="inspector-form">
      <div>
        <span className="eyebrow">Node inspector</span>
        <h2>{title || nodeDisplayName(graph, node)}</h2>
        <code>{node.pointer || '/'}</code>
      </div>

      {graphEditingBlocked && (
        <div className="inline-error">
          Graph editing is paused until the JSON Schema source errors are fixed.
        </div>
      )}

      <label>
        Title
        <input
          value={title}
          onChange={(event) => setSelectedNodeTitle(event.target.value)}
          placeholder="Schema title"
        />
      </label>

      <label>
        Type
        <select
          value={explicitType ?? ''}
          onChange={(event) =>
            setSelectedNodeType(
              event.target.value
                ? (event.target.value as JsonSchemaPrimitiveType)
                : undefined,
            )
          }
        >
          <option value="">Unspecified ({inferredType})</option>
          {TYPES.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </label>

      {nodeDiagnostics.length > 0 && (
        <section className="inspector-section">
          <h3>Diagnostics</h3>
          <div className="inspector-diagnostics">
            {nodeDiagnostics.map((diagnostic, index) => (
              <div
                key={`${diagnostic.source}-${diagnostic.keyword}-${index}`}
                className={`inspector-diagnostic inspector-diagnostic--${diagnostic.severity}`}
              >
                <strong>{diagnostic.keyword ?? diagnostic.source}</strong>
                <span>{diagnostic.message}</span>
                {diagnostic.instancePath !== undefined && (
                  <code>instance: {diagnostic.instancePath || '/'}</code>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <ConstraintFields node={node} type={inferredType} />

      <AdvancedFields node={node} />

      <CompositionFields node={node} />

      <section className="inspector-section">
        <h3>$ref</h3>
        <label>
          Local target
          <select
            value={refEdge?.target ?? ''}
            onChange={(event) => setSelectedReference(event.target.value || undefined)}
          >
            <option value="">No local reference</option>
            {referenceTargets.map((target) => (
              <option key={target.nodeId} value={target.nodeId}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
        {typeof node.keywords.$ref === 'string' && (
          <code>{node.keywords.$ref}</code>
        )}
      </section>

      {canAddProperty && (
        <section className="inspector-section">
          <h3>Properties</h3>
          {properties.length > 0 && (
            <div className="resource-list">
              {properties.map((edge: SchemaEdge) => {
                const child = getNode(graph, edge.target);
                const name = edge.key ?? '';
                return (
                  <RenameRow
                    key={edge.id}
                    name={name}
                    label={child ? nodeDisplayName(graph, child) : name}
                    siblingNames={propertyNames}
                    onSelect={() => selectNode(edge.target)}
                    onRename={(nextName) => renamePropertyOnSelected(name, nextName)}
                    required={requiredPropertyNames.has(name)}
                    onRequiredChange={(nextRequired) => setPropertyRequiredOnSelected(name, nextRequired)}
                    onDelete={() => removePropertyFromSelected(name)}
                  />
                );
              })}
            </div>
          )}

          <h3>Add property</h3>
          <label>
            Name
            <input
              value={propertyName}
              onChange={(event) => setPropertyName(event.target.value)}
              placeholder="e.g. email"
            />
          </label>
          <label>
            Type
            <select
              value={propertyType}
              onChange={(event) =>
                setPropertyType(event.target.value as JsonSchemaPrimitiveType)
              }
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            Required
          </label>
          <button
            type="button"
            onClick={() => {
              addPropertyToSelected(propertyName, propertyType, required);
              setPropertyName('');
              setRequired(false);
            }}
            disabled={
              !propertyName.trim() || propertyNames.includes(propertyName.trim())
            }
          >
            Add property
          </button>
        </section>
      )}

      <section className="inspector-section">
        <h3>{definitionsKeyword}</h3>
        {ownedDefinitions.length > 0 && (
          <div className="resource-list">
            {ownedDefinitions.map((edge) => {
              const child = getNode(graph, edge.target);
              const name = edge.key ?? '';
              return (
                <RenameRow
                  key={edge.id}
                  name={name}
                  label={child ? nodeDisplayName(graph, child) : name}
                  siblingNames={definitionNames}
                  onSelect={() => selectNode(edge.target)}
                  onRename={(nextName) => renameDefinitionOnSelected(name, nextName)}
                />
              );
            })}
          </div>
        )}
        <label>
          Definition name
          <input
            value={definitionName}
            onChange={(event) => setDefinitionName(event.target.value)}
            placeholder="e.g. Address"
          />
        </label>
        <label>
          Type
          <select
            value={definitionType}
            onChange={(event) =>
              setDefinitionType(event.target.value as JsonSchemaPrimitiveType)
            }
          >
            {TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            addDefinitionToSelected(definitionName, definitionType);
            setDefinitionName('');
          }}
          disabled={
            !definitionName.trim() || definitionNames.includes(definitionName.trim())
          }
        >
          Add definition
        </button>
      </section>

      <section className="inspector-section">
        <h3>Keywords</h3>
        <pre>{JSON.stringify(node.keywords, null, 2)}</pre>
      </section>
    </div>
  );
}
