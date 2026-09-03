import { useMemo, useRef, useState } from 'react';
import { DIALECTS, dialectLabel, supportedDialectId, type SupportedDialect } from './core';
import { GraphCanvas } from './graph/GraphCanvas';
import { NodeInspector } from './inspector/NodeInspector';
import { SchemaCodeEditor } from './SchemaCodeEditor';
import { useSchemaStore } from './store/useSchemaStore';
import { ValidationPanel } from './validation/ValidationPanel';
import { FormPreview } from './jsonforms/FormPreview';
import { UiSchemaEditor } from './jsonforms/UiSchemaEditor';
import { UiSchemaTree } from './jsonforms/UiSchemaTree';

export default function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'schema' | 'forms'>('schema');
  const sourceText = useSchemaStore((state) => state.sourceText);
  const parseError = useSchemaStore((state) => state.parseError);
  const schemaDiagnostics = useSchemaStore((state) => state.schemaDiagnostics);
  const instanceParseError = useSchemaStore((state) => state.instanceParseError);
  const instanceDiagnostics = useSchemaStore((state) => state.instanceDiagnostics);
  const graph = useSchemaStore((state) => state.graph);
  const setSourceText = useSchemaStore((state) => state.setSourceText);
  const loadSample = useSchemaStore((state) => state.loadSample);
  const resetNodePositions = useSchemaStore((state) => state.resetNodePositions);
  const setDialect = useSchemaStore((state) => state.setDialect);

  const schemaErrors = useMemo(
    () => schemaDiagnostics.filter((item) => item.severity === 'error'),
    [schemaDiagnostics],
  );
  const schemaWarnings = useMemo(
    () => schemaDiagnostics.filter((item) => item.severity === 'warning'),
    [schemaDiagnostics],
  );

  async function importFile(file?: File) {
    if (!file) return;
    setSourceText(await file.text());
  }

  function exportFile() {
    const blob = new Blob([sourceText], { type: 'application/schema+json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = 'schema.json';
    anchor.click();
    URL.revokeObjectURL(href);
  }

  const status = parseError
    ? { label: 'Invalid JSON', error: true }
    : schemaErrors.length > 0
      ? { label: `${schemaErrors.length} schema errors`, error: true }
      : instanceParseError
        ? { label: 'Invalid instance JSON', error: true }
        : instanceDiagnostics.length > 0
          ? { label: `${instanceDiagnostics.length} instance errors`, error: true }
          : schemaWarnings.length > 0
            ? { label: `${schemaWarnings.length} warnings`, error: false }
            : { label: 'Schema + instance valid', error: false };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <strong>JSON Schema Graph Builder</strong>
          <span className="badge">MVP 4 · JF-1</span>
          <button type="button" onClick={() => setMode(mode === 'schema' ? 'forms' : 'schema')}>{mode === 'schema' ? 'JSON Forms' : 'Schema Graph'}</button>
        </div>
        <div className="topbar__stats">
          <span>{graph.nodes.length} nodes</span>
          <span>{graph.edges.length} edges</span>
          <span className={status.error ? 'status status--error' : 'status status--valid'}>
            {status.label}
          </span>
        </div>
        <div className="topbar__actions">
          <label className="dialect-select">
            <span>Dialect</span>
            <select
              value={supportedDialectId(graph.dialect)}
              onChange={(event) => setDialect(event.target.value as SupportedDialect)}
            >
              {Object.values(DIALECTS).map((dialect) => (
                <option key={dialect.id} value={dialect.id}>{dialect.label}</option>
              ))}
            </select>
          </label>
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".json,application/json,application/schema+json"
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
          <button type="button" onClick={() => inputRef.current?.click()}>Import</button>
          <button type="button" onClick={exportFile}>Export</button>
          <button type="button" onClick={resetNodePositions}>Auto layout</button>
          <button type="button" onClick={loadSample}>Sample</button>
        </div>
      </header>

      {mode === 'schema' ? <section className="workspace">
        <aside className="editor-pane">
          <section className="schema-editor-panel panel">
            <div className="panel__header">
              <span>JSON Schema</span>
              {parseError ? (
                <span className="error-text">{parseError}</span>
              ) : schemaErrors.length > 0 ? (
                <span className="error-text">{schemaErrors.length} schema errors</span>
              ) : (
                <small>{schemaWarnings.length > 0 ? `${schemaWarnings.length} warnings` : 'Valid schema'}</small>
              )}
            </div>
            <div className="panel__content">
              <SchemaCodeEditor />
            </div>
          </section>

          <ValidationPanel />
        </aside>

        <section className="graph-pane panel">
          <div className="panel__header">
            <span>Graph</span>
            <small>{dialectLabel(graph.dialect)} · MVP 3 feature set</small>
          </div>
          <div className="panel__content">
            <GraphCanvas />
          </div>
        </section>

        <aside className="inspector-pane panel">
          <NodeInspector />
        </aside>
      </section> : <section className="workspace forms-workspace">
        <aside className="forms-editor-pane">
          <UiSchemaEditor />
          <ValidationPanel />
        </aside>
        <FormPreview />
        <UiSchemaTree />
      </section>}
    </main>
  );
}
