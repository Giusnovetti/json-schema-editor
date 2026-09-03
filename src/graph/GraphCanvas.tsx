import { useEffect, useMemo } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSchemaStore } from '../store/useSchemaStore';
import { projectGraph, type SchemaFlowNode } from './projectGraph';
import { SchemaNodeCard } from './SchemaNodeCard';

const nodeTypes = { schema: SchemaNodeCard };

export function GraphCanvas() {
  const graph = useSchemaStore((state) => state.graph);
  const nodePositions = useSchemaStore((state) => state.nodePositions);
  const selectNode = useSchemaStore((state) => state.selectNode);
  const selectedNodeId = useSchemaStore((state) => state.selectedNodeId);
  const setNodePosition = useSchemaStore((state) => state.setNodePosition);
  const schemaDiagnostics = useSchemaStore((state) => state.schemaDiagnostics);
  const instanceDiagnostics = useSchemaStore((state) => state.instanceDiagnostics);
  const diagnostics = useMemo(
    () => [...schemaDiagnostics, ...instanceDiagnostics],
    [schemaDiagnostics, instanceDiagnostics],
  );
  const projection = useMemo(
    () => projectGraph(graph, nodePositions, diagnostics, selectedNodeId),
    [graph, nodePositions, diagnostics, selectedNodeId],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaFlowNode>(projection.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(projection.edges);

  useEffect(() => {
    setNodes(projection.nodes);
    setEdges(projection.edges);
  }, [projection, setEdges, setNodes]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={(_, node) => setNodePosition(node.id, node.position)}
      onNodeClick={(_, node) => selectNode(node.id)}
      onPaneClick={() => selectNode(undefined)}
      fitView
      minZoom={0.15}
      maxZoom={2}
    >
      <Background />
      <MiniMap pannable zoomable />
      <Controls />
    </ReactFlow>
  );
}
