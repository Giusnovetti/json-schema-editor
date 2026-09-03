import { getNode, getOutgoingEdges, type AdvancedSchemaRelation, type SchemaNode } from '../core';
import { useSchemaStore } from '../store/useSchemaStore';

const RELATIONS: AdvancedSchemaRelation[] = ['contains', 'unevaluatedProperties', 'unevaluatedItems'];

export function AdvancedFields({ node }: { node: SchemaNode }) {
  const graph = useSchemaStore((state) => state.graph);
  const setKeyword = useSchemaStore((state) => state.setSelectedNodeKeyword);
  const addAdvanced = useSchemaStore((state) => state.addAdvancedSchemaToSelected);
  const removeAdvanced = useSchemaStore((state) => state.removeAdvancedSchemaFromSelected);
  const addPrefixItem = useSchemaStore((state) => state.addPrefixItemToSelected);
  const selectNode = useSchemaStore((state) => state.selectNode);
  if (node.kind !== 'schema') return null;
  const prefixItems = getOutgoingEdges(graph, node.id, 'prefixItem');

  return (
    <section className="inspector-section constraint-grid">
      <h3>Advanced JSON Schema</h3>
      {['$id', '$anchor', '$dynamicAnchor', '$ref', '$dynamicRef'].map((keyword) => (
        <label key={keyword}>
          {keyword}
          <input value={typeof node.keywords[keyword] === 'string' ? String(node.keywords[keyword]) : ''}
            placeholder="Not set" onChange={(event) => setKeyword(keyword, event.target.value || undefined)} />
        </label>
      ))}
      <div className="inline-actions">
        <button type="button" onClick={() => addPrefixItem('string')}>Add prefix item</button>
        {prefixItems.map((edge, index) => (
          <button type="button" key={edge.id} onClick={() => selectNode(edge.target)}>Open prefixItems[{index}]</button>
        ))}
      </div>
      {RELATIONS.map((relation) => {
        const edge = getOutgoingEdges(graph, node.id, relation)[0];
        const target = edge ? getNode(graph, edge.target) : undefined;
        return <div className="inline-actions" key={relation}>
          <span>{relation}</span>
          {target ? <>
            <button type="button" onClick={() => selectNode(target.id)}>Open</button>
            <button type="button" onClick={() => removeAdvanced(relation)}>Remove</button>
          </> : <button type="button" onClick={() => addAdvanced(relation)}>Add schema</button>}
        </div>;
      })}
    </section>
  );
}
