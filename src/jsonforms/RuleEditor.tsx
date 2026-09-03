import { useEffect, useState } from 'react';
import { useSchemaStore } from '../store/useSchemaStore';
import { getUiRule, type UiRuleEffect, type UiSchemaNode } from './index';

const EFFECTS: UiRuleEffect[] = ['HIDE', 'SHOW', 'ENABLE', 'DISABLE'];

export function RuleEditor({ node }: { node: UiSchemaNode }) {
  const graph = useSchemaStore((state) => state.graph);
  const setRule = useSchemaStore((state) => state.setSelectedUiRule);
  const rule = getUiRule(node);
  const [schemaText, setSchemaText] = useState(JSON.stringify(rule?.condition.schema ?? {}, null, 2));
  const [error, setError] = useState<string>();
  useEffect(() => { setSchemaText(JSON.stringify(rule?.condition.schema ?? {}, null, 2)); setError(undefined); }, [node.id, node.element.rule]);
  const defaultScope = graph.nodes.find((item) => item.id === graph.rootNodeId)?.pointer ?? '';

  function update(patch: Partial<NonNullable<typeof rule>>, conditionPatch?: Record<string, unknown>) {
    const current = rule ?? { effect: 'HIDE' as UiRuleEffect, condition: { scope: `#${defaultScope}`, schema: {} } };
    setRule({ ...current, ...patch, condition: { ...current.condition, ...conditionPatch } });
  }
  function applySchema() {
    try {
      const schema = JSON.parse(schemaText) as unknown;
      if (typeof schema !== 'boolean' && (!schema || typeof schema !== 'object' || Array.isArray(schema))) throw new Error('Condition must be a JSON Schema object or boolean.');
      update({}, { schema }); setError(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Invalid condition JSON Schema.'); }
  }

  return <div className="rule-editor">
    <div className="rule-editor__header"><strong>Rule</strong>{rule ? <button type="button" onClick={() => setRule(undefined)}>Remove</button> : <button type="button" onClick={() => update({})}>Add rule</button>}</div>
    {rule && <>
      <label>Effect<select value={rule.effect} onChange={(event) => update({ effect: event.target.value as UiRuleEffect })}>{EFFECTS.map((effect) => <option key={effect}>{effect}</option>)}</select></label>
      <label>Condition target<select value={graph.nodes.find((item) => `#${item.pointer}` === rule.condition.scope)?.id ?? ''} onChange={(event) => { const target = graph.nodes.find((item) => item.id === event.target.value); if (target) update({}, { scope: `#${target.pointer}` }); }}><option value="">Manual/unresolved</option><option value={graph.rootNodeId}>Root (#)</option>{graph.edges.filter((edge) => edge.relation === 'property').map((edge) => <option key={edge.id} value={edge.target}>{edge.key}</option>)}</select></label>
      <label>Condition scope<input value={rule.condition.scope} onChange={(event) => update({}, { scope: event.target.value })} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={rule.condition.failWhenUndefined === true} onChange={(event) => update({}, { failWhenUndefined: event.target.checked || undefined })} />failWhenUndefined</label>
      <div className="rule-presets"><button type="button" onClick={() => { setSchemaText('{\n  "const": true\n}'); update({}, { schema: { const: true } }); }}>const</button><button type="button" onClick={() => { setSchemaText('{\n  "enum": []\n}'); update({}, { schema: { enum: [] } }); }}>enum</button><button type="button" onClick={() => { setSchemaText('{\n  "type": "string"\n}'); update({}, { schema: { type: 'string' } }); }}>type</button></div>
      <label>Condition JSON Schema<textarea value={schemaText} onChange={(event) => setSchemaText(event.target.value)} /></label>
      <button type="button" onClick={applySchema}>Apply condition</button>{error && <small className="error-text">{error}</small>}
    </>}
  </div>;
}

