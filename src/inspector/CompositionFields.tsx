import { useEffect, useMemo, useState } from 'react';
import {
  dialectDescriptor,
  getNode,
  getOutgoingEdges,
  nodeDisplayName,
  type ArrayCompositionRelation,
  type JsonSchemaPrimitiveType,
  type SchemaNode,
  type SingleCompositionRelation,
} from '../core';
import { useSchemaStore } from '../store/useSchemaStore';

const ARRAY_RELATIONS: ArrayCompositionRelation[] = ['allOf', 'anyOf', 'oneOf'];
const SINGLE_RELATIONS: SingleCompositionRelation[] = ['not', 'if', 'then', 'else'];
const TYPES: JsonSchemaPrimitiveType[] = [
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
];

function DependentSchemaRow({
  name,
  nodeId,
  siblingNames,
}: {
  name: string;
  nodeId: string;
  siblingNames: string[];
}) {
  const graph = useSchemaStore((state) => state.graph);
  const selectNode = useSchemaStore((state) => state.selectNode);
  const rename = useSchemaStore((state) => state.renameDependentSchemaOnSelected);
  const remove = useSchemaStore((state) => state.removeDependentSchemaFromSelected);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);

  const trimmed = draft.trim();
  const duplicate = siblingNames.some((candidate) => candidate !== name && candidate === trimmed);
  const child = getNode(graph, nodeId);

  return (
    <div className="resource-row">
      <button type="button" className="resource-row__select" onClick={() => selectNode(nodeId)}>
        {child ? nodeDisplayName(graph, child) : name}
      </button>
      <input
        aria-label={`Rename dependent schema ${name}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button
        type="button"
        disabled={!trimmed || trimmed === name || duplicate}
        onClick={() => rename(name, trimmed)}
      >
        Rename
      </button>
      <button type="button" className="danger-button" onClick={() => remove(name)}>
        Delete
      </button>
    </div>
  );
}

export function CompositionFields({ node }: { node: SchemaNode }) {
  const graph = useSchemaStore((state) => state.graph);
  const selectNode = useSchemaStore((state) => state.selectNode);
  const addBranch = useSchemaStore((state) => state.addCompositionBranchToSelected);
  const removeBranch = useSchemaStore((state) => state.removeCompositionBranchFromSelected);
  const addSingle = useSchemaStore((state) => state.addSingleCompositionToSelected);
  const removeSingle = useSchemaStore((state) => state.removeSingleCompositionFromSelected);
  const addDependent = useSchemaStore((state) => state.addDependentSchemaToSelected);

  const [branchType, setBranchType] = useState<JsonSchemaPrimitiveType>('object');
  const [dependentName, setDependentName] = useState('');
  const [dependentType, setDependentType] = useState<JsonSchemaPrimitiveType>('object');

  const dependentSchemasKeyword = dialectDescriptor(graph.dialect).dependentSchemasKeyword;
  const dependentEdges = useMemo(
    () => getOutgoingEdges(graph, node.id, 'dependentSchema'),
    [graph, node.id],
  );
  const dependentNames = dependentEdges
    .map((edge) => edge.key)
    .filter((value): value is string => typeof value === 'string');

  return (
    <section className="inspector-section composition-editor">
      <h3>Composition</h3>
      <p className="section-help">
        Applicators are represented as semantic edges to subschema nodes.
      </p>

      <label>
        New subschema type
        <select
          value={branchType}
          onChange={(event) => setBranchType(event.target.value as JsonSchemaPrimitiveType)}
        >
          {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>

      {ARRAY_RELATIONS.map((relation) => {
        const edges = getOutgoingEdges(graph, node.id, relation)
          .slice()
          .sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
        return (
          <div key={relation} className="composition-group">
            <div className="composition-group__header">
              <strong>{relation}</strong>
              <button type="button" onClick={() => addBranch(relation, branchType)}>
                + branch
              </button>
            </div>
            {edges.map((edge) => {
              const child = getNode(graph, edge.target);
              const index = edge.index ?? 0;
              return (
                <div key={edge.id} className="composition-row">
                  <button type="button" className="resource-row__select" onClick={() => selectNode(edge.target)}>
                    {relation}[{index}] {child ? `— ${nodeDisplayName(graph, child)}` : ''}
                  </button>
                  <button type="button" className="danger-button" onClick={() => removeBranch(relation, index)}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}

      {SINGLE_RELATIONS.map((relation) => {
        const edge = getOutgoingEdges(graph, node.id, relation)[0];
        const child = edge ? getNode(graph, edge.target) : undefined;
        return (
          <div key={relation} className="composition-group">
            <div className="composition-group__header">
              <strong>{relation}</strong>
              {!edge && (
                <button type="button" onClick={() => addSingle(relation, branchType)}>
                  + subschema
                </button>
              )}
            </div>
            {edge && (
              <div className="composition-row">
                <button type="button" className="resource-row__select" onClick={() => selectNode(edge.target)}>
                  {child ? nodeDisplayName(graph, child) : relation}
                </button>
                <button type="button" className="danger-button" onClick={() => removeSingle(relation)}>
                  Delete
                </button>
              </div>
            )}
          </div>
        );
      })}

      <div className="composition-group">
        <div className="composition-group__header">
          <strong>{dependentSchemasKeyword}</strong>
        </div>
        {dependentEdges.map((edge) => (
          <DependentSchemaRow
            key={edge.id}
            name={edge.key ?? ''}
            nodeId={edge.target}
            siblingNames={dependentNames}
          />
        ))}
        <label>
          Trigger property
          <input
            value={dependentName}
            onChange={(event) => setDependentName(event.target.value)}
            placeholder="e.g. creditCard"
          />
        </label>
        <label>
          Subschema type
          <select
            value={dependentType}
            onChange={(event) => setDependentType(event.target.value as JsonSchemaPrimitiveType)}
          >
            {TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <button
          type="button"
          disabled={!dependentName.trim() || dependentNames.includes(dependentName.trim())}
          onClick={() => {
            addDependent(dependentName, dependentType);
            setDependentName('');
          }}
        >
          Add dependent schema
        </button>
      </div>
    </section>
  );
}
