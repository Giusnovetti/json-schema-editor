import { Fragment, useEffect, useMemo, useState, type DragEvent } from 'react';
import { getNodeType } from '../core';
import { useSchemaStore } from '../store/useSchemaStore';
import { canContainUiElement, findUiSchemaUsages, readonlyOrigins, resolveUiScope, type UiSchemaNode } from './index';
import { RuleEditor } from './RuleEditor';
import { ExtensibilityPanel } from './ExtensibilityPanel';

function ControlOptions({ node }: { node: UiSchemaNode }) {
  const graph = useSchemaStore((state) => state.graph);
  const setProperty = useSchemaStore((state) => state.setSelectedUiElementProperty);
  const setOption = useSchemaStore((state) => state.setSelectedControlOption);
  const target = resolveUiScope(graph, node.element.scope);
  const schemaType = target ? getNodeType(target) : undefined;
  const options = typeof node.element.options === 'object' && node.element.options && !Array.isArray(node.element.options)
    ? node.element.options as Record<string, unknown> : {};
  const [labelText, setLabelText] = useState(typeof node.element.label === 'string' ? node.element.label : '');
  const [optionsText, setOptionsText] = useState(JSON.stringify(options, null, 2));
  const [optionsError, setOptionsError] = useState<string>();
  useEffect(() => { setLabelText(typeof node.element.label === 'string' ? node.element.label : ''); }, [node.element.label]);
  useEffect(() => { setOptionsText(JSON.stringify(options, null, 2)); setOptionsError(undefined); }, [node.element.options]);

  const labelMode = node.element.label === false ? 'false' : typeof node.element.label === 'string' ? 'string' : 'default';
  return <div className="ui-element-inspector">
    <label>Scope<input value={typeof node.element.scope === 'string' ? node.element.scope : ''} onChange={(event) => setProperty('scope', event.target.value || undefined)} /></label>
    <label>Schema target<select value={target?.id ?? ''} onChange={(event) => {
      const next = graph.nodes.find((item) => item.id === event.target.value);
      if (next) setProperty('scope', `#${next.pointer}`);
    }}><option value="">Unresolved</option>{graph.edges.filter((edge) => edge.relation === 'property').map((edge) => <option key={edge.id} value={edge.target}>{edge.key}</option>)}</select></label>
    <label>Label mode<select value={labelMode} onChange={(event) => {
      if (event.target.value === 'default') setProperty('label', undefined);
      else if (event.target.value === 'false') setProperty('label', false);
      else setProperty('label', labelText || 'Label');
    }}><option value="default">Unspecified</option><option value="string">Custom text</option><option value="false">Hidden</option></select></label>
    {labelMode === 'string' && <label>Label<input value={labelText} onChange={(event) => { setLabelText(event.target.value); setProperty('label', event.target.value); }} /></label>}
    <label className="checkbox-row"><input type="checkbox" checked={options.readonly === true} onChange={(event) => setOption('readonly', event.target.checked || undefined)} />Readonly for this Control</label>
    {schemaType === 'string' && <label>Renderer format<select value={typeof options.format === 'string' ? options.format : ''} onChange={(event) => setOption('format', event.target.value || undefined)}><option value="">Default</option><option value="date">date</option><option value="time">time</option><option value="date-time">date-time</option></select></label>}
    {schemaType === 'array' && <>
      <label>Detail<select value={typeof options.detail === 'string' ? options.detail : typeof options.detail === 'object' ? 'INLINE' : ''} onChange={(event) => setOption('detail', event.target.value === 'INLINE' ? { type: 'VerticalLayout', elements: [] } : event.target.value || undefined)}><option value="">Default</option><option value="DEFAULT">DEFAULT</option><option value="GENERATED">GENERATED</option><option value="REGISTERED">REGISTERED</option><option value="INLINE">Inline UI Schema</option></select></label>
      <label className="checkbox-row"><input type="checkbox" checked={options.showSortButtons === true} onChange={(event) => setOption('showSortButtons', event.target.checked || undefined)} />Show sort buttons</label>
      <label>Element label property<input value={typeof options.elementLabelProp === 'string' ? options.elementLabelProp : ''} onChange={(event) => setOption('elementLabelProp', event.target.value || undefined)} /></label>
    </>}
    <label>Advanced options JSON<textarea value={optionsText} onChange={(event) => setOptionsText(event.target.value)} /></label>
    <button type="button" onClick={() => { try { const parsed = JSON.parse(optionsText) as unknown; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Options must be a JSON object.'); setProperty('options', parsed); setOptionsError(undefined); } catch (reason) { setOptionsError(reason instanceof Error ? reason.message : 'Invalid options JSON.'); } }}>Apply options</button>
    {optionsError && <small className="error-text">{optionsError}</small>}
  </div>;
}

export function UiSchemaTree() {
  const graph = useSchemaStore((state) => state.graph);
  const document = useSchemaStore((state) => state.uiSchema);
  const selected = useSchemaStore((state) => state.selectedUiElementId);
  const select = useSchemaStore((state) => state.selectUiElement);
  const addElement = useSchemaStore((state) => state.addUiLayout);
  const addControl = useSchemaStore((state) => state.addUiControl);
  const setProperty = useSchemaStore((state) => state.setSelectedUiElementProperty);
  const moveElement = useSchemaStore((state) => state.moveUiElement);
  const removeElement = useSchemaStore((state) => state.removeUiElement);
  const diagnostics = useSchemaStore((state) => state.uiSchemaDiagnostics);
  const selectedNode = document.nodes.find((node) => node.id === selected) ?? document.nodes.find((node) => node.id === document.rootId);
  const selectedSchemaNodeId = useSchemaStore((state) => state.selectedNodeId);
  const registered = useSchemaStore((state) => state.registeredUiSchemas);
  const globalReadonly = useSchemaStore((state) => state.formReadonly);
  const usages = selectedSchemaNodeId ? findUiSchemaUsages(graph, selectedSchemaNodeId, document, registered) : [];
  const readonlyReasons = selectedNode ? readonlyOrigins(graph, document, selectedNode.id, globalReadonly) : [];
  const ordered = useMemo(() => {
    const result: Array<{ node: UiSchemaNode; depth: number }> = [];
    const visit = (parentId: string | undefined, depth: number) => document.nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.index - b.index).forEach((node) => { result.push({ node, depth }); visit(node.id, depth + 1); });
    visit(undefined, 0); return result;
  }, [document]);
  const containers = document.nodes.filter((node) => canContainUiElement(node.element.type, selectedNode?.element.type));

  function dragStart(event: DragEvent, type: 'schema' | 'ui', id: string) { event.dataTransfer.setData(type === 'schema' ? 'application/x-schema-node' : 'application/x-ui-element', id); event.dataTransfer.effectAllowed = type === 'schema' ? 'copy' : 'move'; }
  function dropInto(event: DragEvent, target: UiSchemaNode, index?: number) {
    event.preventDefault();
    const schemaId = event.dataTransfer.getData('application/x-schema-node');
    const uiId = event.dataTransfer.getData('application/x-ui-element');
    if (schemaId && canContainUiElement(target.element.type, 'Control')) addControl(target.id, schemaId);
    if (uiId) moveElement(uiId, target.id, index ?? document.nodes.filter((node) => node.parentId === target.id).length);
  }
  function dropBefore(event: DragEvent, target: UiSchemaNode) {
    const uiId = event.dataTransfer.getData('application/x-ui-element');
    if (!uiId || !target.parentId) return;
    event.preventDefault();
    moveElement(uiId, target.parentId, target.index);
  }

  return <section className="ui-tree panel">
    <div className="panel__header"><span>Visual UI Schema builder</span><small>{diagnostics.length} diagnostics</small></div>
    <div className="ui-tree__content">
      <div className="schema-palette"><strong>Schema properties</strong>{graph.edges.filter((edge) => edge.relation === 'property').map((edge) => <button draggable onDragStart={(event) => dragStart(event, 'schema', edge.target)} type="button" key={edge.id}>{edge.key}</button>)}</div>
      <div className="ui-element-list">{ordered.map(({ node, depth }) => {
        const target = resolveUiScope(graph, node.element.scope);
        const accepts = !['Control', 'Label'].includes(String(node.element.type));
        return <Fragment key={node.id}>{node.parentId && <div className="ui-drop-before" style={{ marginLeft: depth * 16 }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropBefore(event, node)} />}
        <button draggable={node.id !== document.rootId} onDragStart={(event) => dragStart(event, 'ui', node.id)} onDragOver={(event) => { if (accepts) event.preventDefault(); }} onDrop={(event) => dropInto(event, node)} type="button" className={node.id === selected ? 'ui-element ui-element--selected' : 'ui-element'} style={{ paddingLeft: 10 + depth * 16 }} onClick={() => select(node.id)}>
          <strong>{String(node.element.type ?? 'Unknown')}</strong><span>{typeof node.element.label === 'string' ? node.element.label : typeof node.element.text === 'string' ? node.element.text : typeof node.element.scope === 'string' ? node.element.scope : ''}</span>{node.element.type === 'Control' && <i>{target ? 'resolved' : 'unresolved'}</i>}
        </button></Fragment>;
      })}</div>
      {selectedNode && !['Control', 'Label'].includes(String(selectedNode.element.type)) && <div className="ui-tree__actions">
        {selectedNode.element.type === 'Categorization' ? <button type="button" onClick={() => addElement(selectedNode.id, 'Category')}>+ Category</button> : <>
          <button type="button" onClick={() => addElement(selectedNode.id, 'VerticalLayout')}>+ Vertical</button><button type="button" onClick={() => addElement(selectedNode.id, 'HorizontalLayout')}>+ Horizontal</button><button type="button" onClick={() => addElement(selectedNode.id, 'Group')}>+ Group</button><button type="button" onClick={() => addElement(selectedNode.id, 'Categorization')}>+ Categorization</button><button type="button" onClick={() => addElement(selectedNode.id, 'Label')}>+ Label</button>
        </>}
        {canContainUiElement(selectedNode.element.type, 'Control') && <select defaultValue="" onChange={(event) => { if (event.target.value) addControl(selectedNode.id, event.target.value); event.target.value = ''; }}><option value="">+ Control from schema…</option>{graph.edges.filter((edge) => edge.relation === 'property').map((edge) => <option key={edge.id} value={edge.target}>{edge.key}</option>)}</select>}
      </div>}
      {selectedNode?.element.type === 'Control' && <ControlOptions node={selectedNode} />}
      {selectedNode && ['Group', 'Category'].includes(String(selectedNode.element.type)) && <div className="ui-element-inspector"><label>Label<input value={typeof selectedNode.element.label === 'string' ? selectedNode.element.label : ''} onChange={(event) => setProperty('label', event.target.value || undefined)} /></label><label>i18n key<input value={typeof selectedNode.element.i18n === 'string' ? selectedNode.element.i18n : ''} onChange={(event) => setProperty('i18n', event.target.value || undefined)} /></label></div>}
      {selectedNode?.element.type === 'Label' && <div className="ui-element-inspector"><label>Text<input value={typeof selectedNode.element.text === 'string' ? selectedNode.element.text : ''} onChange={(event) => setProperty('text', event.target.value)} /></label><label>i18n key<input value={typeof selectedNode.element.i18n === 'string' ? selectedNode.element.i18n : ''} onChange={(event) => setProperty('i18n', event.target.value || undefined)} /></label></div>}
      {selectedNode && <RuleEditor node={selectedNode} />}
      {readonlyReasons.length > 0 && <div className="readonly-origins"><strong>Readonly/disabled because</strong>{readonlyReasons.map((origin) => <span key={origin}>{origin}</span>)}</div>}
      {selectedNode && selectedNode.id !== document.rootId && <div className="ui-tree__actions"><label>Move to<select value={selectedNode.parentId} onChange={(event) => moveElement(selectedNode.id, event.target.value, document.nodes.filter((node) => node.parentId === event.target.value).length)}>{containers.map((node) => <option key={node.id} value={node.id}>{String(node.element.label ?? node.element.type)}</option>)}</select></label><button type="button" onClick={() => { const siblings = document.nodes.filter((node) => node.parentId === selectedNode.parentId); moveElement(selectedNode.id, selectedNode.parentId!, Math.max(0, selectedNode.index - 1)); if (siblings.length === 0) return; }}>↑</button><button type="button" onClick={() => moveElement(selectedNode.id, selectedNode.parentId!, selectedNode.index + 1)}>↓</button><button type="button" className="danger-button" onClick={() => removeElement(selectedNode.id)}>Delete</button></div>}
      {diagnostics.length > 0 && <div className="ui-diagnostics">{diagnostics.map((item, index) => <button type="button" key={index} onClick={() => item.elementId && select(item.elementId)}>{item.message}</button>)}</div>}
      <ExtensibilityPanel />
      {usages.length > 0 && <div className="usage-list"><strong>Selected schema node used by</strong>{usages.map((usage, index) => <button type="button" key={`${usage.documentId}-${usage.elementId}-${index}`} onClick={() => usage.documentId === 'main' && select(usage.elementId)}>{usage.documentName} · {usage.kind} · {usage.label}</button>)}</div>}
    </div>
  </section>;
}
