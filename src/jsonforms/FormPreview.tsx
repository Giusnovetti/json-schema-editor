import { JsonForms } from '@jsonforms/react';
import { vanillaCells, vanillaRenderers } from '@jsonforms/vanilla-renderers';
import type { ErrorObject } from 'ajv';
import type { UISchemaElement } from '@jsonforms/core';
import { useMemo } from 'react';
import { graphToSchema } from '../core';
import { useSchemaStore } from '../store/useSchemaStore';
import { mapFormErrors, uiSchemaToObject } from './core';
import { createDebugMiddleware, customRendererEntries, diagnoseRendererSelection, registeredUiSchemaEntries } from './extensibility';
import { DynamicRendererContext } from './customRenderers';
import { createI18nState, rendererCompatibilityDiagnostics, resolvePreviewSchema } from './advanced';
import { createPreviewAjv } from './previewAjv';

export function FormPreview() {
  const graph = useSchemaStore((state) => state.graph);
  const document = useSchemaStore((state) => state.uiSchema);
  const instanceText = useSchemaStore((state) => state.instanceText);
  const instanceParseError = useSchemaStore((state) => state.instanceParseError);
  const setInstanceText = useSchemaStore((state) => state.setInstanceText);
  const selectUiElement = useSchemaStore((state) => state.selectUiElement);
  const selectNode = useSchemaStore((state) => state.selectNode);
  const errors = useSchemaStore((state) => state.formErrors);
  const setFormErrors = useSchemaStore((state) => state.setFormErrors);
  const readonly = useSchemaStore((state) => state.formReadonly);
  const setReadonly = useSchemaStore((state) => state.setFormReadonly);
  const validationMode = useSchemaStore((state) => state.formValidationMode);
  const setValidationMode = useSchemaStore((state) => state.setFormValidationMode);
  const additionalErrors = useSchemaStore((state) => state.additionalErrors);
  const additionalErrorsText = useSchemaStore((state) => state.additionalErrorsText);
  const additionalErrorsParseError = useSchemaStore((state) => state.additionalErrorsParseError);
  const setAdditionalErrorsText = useSchemaStore((state) => state.setAdditionalErrorsText);
  const customRenderers = useSchemaStore((state) => state.customRenderers);
  const registeredUiSchemas = useSchemaStore((state) => state.registeredUiSchemas);
  const config = useSchemaStore((state) => state.jsonFormsConfig);
  const middlewareMode = useSchemaStore((state) => state.middlewareMode);
  const recordMiddlewareEvent = useSchemaStore((state) => state.recordMiddlewareEvent);
  const runtime = useSchemaStore((state) => state.dynamicRendererRuntime);
  const locale = useSchemaStore((state) => state.previewLocale);
  const catalogs = useSchemaStore((state) => state.translationCatalogs);
  const rendererSet = useSchemaStore((state) => state.rendererSet);
  const resources = useSchemaStore((state) => state.externalResources);
  const useResolved = useSchemaStore((state) => state.useResolvedPreviewSchema);
  const sourceSchema = useMemo(() => graphToSchema(graph), [graph]);
  const resolution = useMemo(() => resolvePreviewSchema(sourceSchema, resources), [sourceSchema, resources]);
  const schema = (useResolved ? resolution.schema : sourceSchema) as Record<string, unknown>;
  const uischema = useMemo(() => uiSchemaToObject(document), [document]);
  const data = useMemo(() => { try { return JSON.parse(instanceText) as unknown; } catch { return undefined; } }, [instanceText]);
  const diagnostics = useMemo(() => [
    ...mapFormErrors(errors, document, graph).map((item) => ({ ...item, origin: 'AJV' as const })),
    ...mapFormErrors(additionalErrors, document, graph).map((item) => ({ ...item, origin: 'Additional' as const })),
  ], [errors, additionalErrors, document, graph]);
  const renderers = useMemo(() => rendererSet === 'vanilla-custom' ? [...customRendererEntries(customRenderers), ...vanillaRenderers] : vanillaRenderers, [customRenderers, rendererSet]);
  const uischemas = useMemo(() => registeredUiSchemaEntries(registeredUiSchemas), [registeredUiSchemas]);
  const middleware = useMemo(() => middlewareMode === 'debug' ? createDebugMiddleware(recordMiddlewareEvent) : undefined, [middlewareMode, recordMiddlewareEvent]);
  const rendererDiagnostics = useMemo(() => diagnoseRendererSelection(document, graph, customRenderers, config).filter((item) => item.rendererId), [document, graph, customRenderers, config]);
  const compatibility = useMemo(() => rendererCompatibilityDiagnostics(document, rendererSet, customRenderers), [document, rendererSet, customRenderers]);
  const i18n = useMemo(() => createI18nState(locale, catalogs), [locale, catalogs]);
  const ajv = useMemo(() => createPreviewAjv(graph.dialect), [graph.dialect]);

  return <section className="form-preview panel">
    <div className="panel__header"><span>JSON Forms preview</span><select className="validation-mode" value={validationMode} onChange={(event) => setValidationMode(event.target.value as typeof validationMode)}><option>ValidateAndShow</option><option>ValidateAndHide</option><option>NoValidation</option></select><label className="preview-readonly"><input type="checkbox" checked={readonly} onChange={(event) => setReadonly(event.target.checked)} />Readonly all</label><small>{errors.length + additionalErrors.length} errors</small></div>
    <div className="form-preview__content">
      {instanceParseError ? <div className="inline-error">Fix preview data JSON to resume the form.</div> : <DynamicRendererContext.Provider value={runtime}><JsonForms
        schema={schema}
        uischema={document.explicit ? uischema as unknown as UISchemaElement : undefined}
        data={data}
        renderers={renderers}
        cells={vanillaCells}
        readonly={readonly}
        validationMode={validationMode}
        additionalErrors={additionalErrors}
        config={config}
        uischemas={uischemas}
        middleware={middleware}
        i18n={i18n}
        ajv={ajv}
        onChange={({ data: nextData, errors: nextErrors }) => {
          const text = JSON.stringify(nextData, null, 2);
          if (text !== instanceText) setInstanceText(text);
          setFormErrors((nextErrors ?? []) as ErrorObject[]);
        }}
      /></DynamicRendererContext.Provider>}
      {useResolved && <div className={resolution.diagnostics.length ? 'inline-error' : 'resolved-status'}>Resolved preview schema: {resolution.resolvedCount} references expanded, {resolution.diagnostics.length} unresolved.</div>}
      {(compatibility.length > 0 || resolution.diagnostics.length > 0) && <div className="form-error-list">{compatibility.map((item) => <button type="button" key={item.elementId} onClick={() => selectUiElement(item.elementId)}>{item.message}</button>)}{resolution.diagnostics.map((item, index) => <button type="button" key={`ref-${index}`} onClick={() => item.nodeId && selectNode(item.nodeId)}>$ref {item.reference}: {item.message}</button>)}</div>}
      {rendererDiagnostics.length > 0 && <details className="renderer-diagnostics"><summary>Custom renderer selections</summary>{rendererDiagnostics.map((item) => <div key={item.elementId}><code>{item.elementId}</code> → {item.rendererLabel} (rank {item.rank})</div>)}</details>}
      <details className="additional-errors"><summary>Additional backend/business errors</summary><textarea value={additionalErrorsText} onChange={(event) => setAdditionalErrorsText(event.target.value)} />{additionalErrorsParseError && <small className="error-text">{additionalErrorsParseError} — last valid errors remain active.</small>}</details>
      {diagnostics.length > 0 && <div className="form-error-list">{diagnostics.map((item, index) => <button type="button" key={index} onClick={() => { if (item.elementId) selectUiElement(item.elementId); if (item.schemaNodeId) selectNode(item.schemaNodeId); }}><small>{item.origin}</small> <strong>{item.instancePath || '/'}</strong> {item.message}</button>)}</div>}
    </div>
  </section>;
}
