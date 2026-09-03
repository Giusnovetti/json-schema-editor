import { useState } from 'react';
import { parseUiSchema, uiSchemaToJson } from './core';
import { useSchemaStore } from '../store/useSchemaStore';

export function ExtensibilityPanel() {
  const renderers = useSchemaStore((state) => state.customRenderers);
  const toggle = useSchemaStore((state) => state.setCustomRendererEnabled);
  const registered = useSchemaStore((state) => state.registeredUiSchemas);
  const add = useSchemaStore((state) => state.addRegisteredUiSchema);
  const update = useSchemaStore((state) => state.updateRegisteredUiSchema);
  const remove = useSchemaStore((state) => state.removeRegisteredUiSchema);
  const config = useSchemaStore((state) => state.jsonFormsConfig);
  const setConfig = useSchemaStore((state) => state.setJsonFormsConfig);
  const mode = useSchemaStore((state) => state.middlewareMode);
  const setMode = useSchemaStore((state) => state.setMiddlewareMode);
  const events = useSchemaStore((state) => state.middlewareEvents);
  const clearEvents = useSchemaStore((state) => state.clearMiddlewareEvents);
  const runtime = useSchemaStore((state) => state.dynamicRendererRuntime);
  const setRuntime = useSchemaStore((state) => state.setDynamicRendererRuntime);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const locale = useSchemaStore((state) => state.previewLocale);
  const setLocale = useSchemaStore((state) => state.setPreviewLocale);
  const catalogs = useSchemaStore((state) => state.translationCatalogs);
  const setCatalogs = useSchemaStore((state) => state.setTranslationCatalogs);
  const rendererSet = useSchemaStore((state) => state.rendererSet);
  const setRendererSet = useSchemaStore((state) => state.setRendererSet);
  const resourcesText = useSchemaStore((state) => state.externalResourcesText);
  const resourcesError = useSchemaStore((state) => state.externalResourcesParseError);
  const setResourcesText = useSchemaStore((state) => state.setExternalResourcesText);
  const resolved = useSchemaStore((state) => state.useResolvedPreviewSchema);
  const setResolved = useSchemaStore((state) => state.setUseResolvedPreviewSchema);
  return <details className="extensibility-panel"><summary>JF-4 extensibility</summary>
    <h4>Custom renderer registry</h4>{renderers.map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={item.enabled} onChange={(event) => toggle(item.id, event.target.checked)} />{item.label} · {item.kind} · rank {item.rank}</label>)}
    <h4>Global config</h4><small>Element options take precedence over matching global config.</small>{Object.entries(config).map(([key, value]) => <label className="checkbox-row" key={key}><input type="checkbox" checked={value} onChange={(event) => setConfig(key as keyof typeof config, event.target.checked)} />{key}</label>)}
    <h4>Registered detail UI Schemas</h4><button type="button" onClick={add}>Add registered UI Schema</button>{registered.map((item) => <div className="registered-uischema" key={item.id}>
      <label>Name<input value={item.name} onChange={(event) => update(item.id, { name: event.target.value })} /></label><label className="checkbox-row"><input type="checkbox" checked={item.enabled} onChange={(event) => update(item.id, { enabled: event.target.checked })} />Enabled</label>
      <label>Schema type<select value={item.tester.schemaType ?? ''} onChange={(event) => update(item.id, { tester: { ...item.tester, schemaType: event.target.value || undefined } })}><option value="">Any</option><option>object</option><option>array</option><option>string</option></select></label>
      <label>Path suffix<input value={item.tester.schemaPathSuffix ?? ''} onChange={(event) => update(item.id, { tester: { ...item.tester, schemaPathSuffix: event.target.value || undefined } })} /></label>
      <label>Rank<input type="number" value={item.tester.rank} onChange={(event) => update(item.id, { tester: { ...item.tester, rank: Number(event.target.value) } })} /></label>
      <textarea defaultValue={uiSchemaToJson(item.document)} onBlur={(event) => { try { update(item.id, { document: parseUiSchema(JSON.parse(event.target.value), true, item.document) }); setErrors((state) => ({ ...state, [item.id]: '' })); } catch (reason) { setErrors((state) => ({ ...state, [item.id]: reason instanceof Error ? reason.message : 'Invalid UI Schema.' })); } }} />
      {errors[item.id] && <small className="error-text">{errors[item.id]} — last valid detail remains active.</small>}<button type="button" className="danger-button" onClick={() => remove(item.id)}>Remove</button>
    </div>)}
    <h4>Middleware</h4><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="none">None</option><option value="debug">Debug events</option></select><button type="button" onClick={clearEvents}>Clear events</button><code>{events.join(' · ') || 'No events'}</code>
    <h4>Dynamic renderer Context</h4><label>Prefix<input value={runtime.prefix} onChange={(event) => setRuntime({ ...runtime, prefix: event.target.value })} /></label><label>Choices<input value={runtime.choices.join(', ')} onChange={(event) => setRuntime({ ...runtime, choices: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} /></label><small>Runtime Context values are never serialized into UI Schema.</small>
    <h4>Renderer set</h4><select value={rendererSet} onChange={(event) => setRendererSet(event.target.value as typeof rendererSet)}><option value="vanilla">Official vanilla only</option><option value="vanilla-custom">Vanilla + custom</option></select>
    <h4>i18n</h4><label>Locale<input value={locale} onChange={(event) => setLocale(event.target.value)} /></label><label>Translation catalogs JSON<textarea value={JSON.stringify(catalogs, null, 2)} onChange={(event) => { try { setCatalogs(JSON.parse(event.target.value)); setErrors((state) => ({ ...state, catalogs: '' })); } catch { setErrors((state) => ({ ...state, catalogs: 'Invalid catalogs JSON.' })); } }} /></label>{errors.catalogs && <small className="error-text">{errors.catalogs}</small>}
    <h4>Resolved preview schema</h4><label className="checkbox-row"><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} />Use resolved preview projection</label><label>External resources JSON<textarea value={resourcesText} onChange={(event) => setResourcesText(event.target.value)} /></label>{resourcesError && <small className="error-text">{resourcesError} — last valid registry remains active.</small>}
  </details>;
}
