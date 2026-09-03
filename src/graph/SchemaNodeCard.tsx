import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { SchemaNodeData } from './projectGraph';

export function SchemaNodeCard({ data, selected }: NodeProps) {
  const node = data as SchemaNodeData;
  const stateClass = node.errorCount > 0
    ? 'schema-node--error'
    : node.warningCount > 0
      ? 'schema-node--warning'
      : '';

  return (
    <div className={`schema-node ${stateClass} ${selected ? 'schema-node--selected' : ''} ${node.isRelatedNode ? 'schema-node--related' : ''}`}>
      <Handle type="target" position={Position.Left} />
      <div className="schema-node__header">
        <strong>{node.title}</strong>
        <span>{node.typeLabel}</span>
      </div>
      <div className="schema-node__body">
        {node.errorCount > 0 && <span className="node-badge node-badge--error">{node.errorCount} errors</span>}
        {node.warningCount > 0 && <span className="node-badge node-badge--warning">{node.warningCount} warnings</span>}
        {node.propertyCount > 0 && <span>{node.propertyCount} properties</span>}
        {node.requiredCount > 0 && <span>{node.requiredCount} required</span>}
        {node.definitionCount > 0 && <span>{node.definitionCount} {node.definitionKeyword}</span>}
        {node.hasRef && <span>$ref</span>}
        {node.compositionCount > 0 && <span>{node.compositionCount} composition</span>}
        {node.conditionalCount > 0 && <span>{node.conditionalCount} conditional</span>}
        {node.dependentSchemaCount > 0 && <span>{node.dependentSchemaCount} dependent</span>}
        {node.advancedCount > 0 && <span>{node.advancedCount} advanced</span>}
        {node.resourceId && <span>$id: {node.resourceId}</span>}
        <code>{node.pointer}</code>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
