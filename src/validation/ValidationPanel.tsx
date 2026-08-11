import { useMemo } from 'react';
import type { ValidationDiagnostic } from '../core';
import { useSchemaStore } from '../store/useSchemaStore';

function DiagnosticRow({ diagnostic }: { diagnostic: ValidationDiagnostic }) {
  const selectNode = useSchemaStore((state) => state.selectNode);
  const path =
    diagnostic.source === 'instance'
      ? diagnostic.instancePath || '/'
      : diagnostic.schemaPath || '/';

  return (
    <button
      type="button"
      className={`diagnostic-row diagnostic-row--${diagnostic.severity}`}
      onClick={() => diagnostic.nodeId && selectNode(diagnostic.nodeId)}
      disabled={!diagnostic.nodeId}
    >
      <span className="diagnostic-row__topline">
        <strong>{diagnostic.keyword ?? diagnostic.source}</strong>
        <code>{path}</code>
      </span>
      <span>{diagnostic.message}</span>
      {diagnostic.source === 'instance' && diagnostic.schemaPath !== undefined && (
        <small>schema: #{diagnostic.schemaPath || ''}</small>
      )}
    </button>
  );
}

export function ValidationPanel() {
  const instanceText = useSchemaStore((state) => state.instanceText);
  const setInstanceText = useSchemaStore((state) => state.setInstanceText);
  const instanceParseError = useSchemaStore((state) => state.instanceParseError);
  const schemaDiagnostics = useSchemaStore((state) => state.schemaDiagnostics);
  const instanceDiagnostics = useSchemaStore((state) => state.instanceDiagnostics);

  const schemaErrors = useMemo(
    () => schemaDiagnostics.filter((item) => item.severity === 'error'),
    [schemaDiagnostics],
  );
  const schemaWarnings = useMemo(
    () => schemaDiagnostics.filter((item) => item.severity === 'warning'),
    [schemaDiagnostics],
  );

  return (
    <section className="validation-panel panel">
      <div className="panel__header">
        <span>Instance validation</span>
        <span
          className={
            instanceParseError || instanceDiagnostics.length > 0
              ? 'status status--error'
              : 'status status--valid'
          }
        >
          {instanceParseError
            ? 'Invalid JSON'
            : instanceDiagnostics.length > 0
              ? `${instanceDiagnostics.length} errors`
              : 'Valid'}
        </span>
      </div>

      <div className="validation-panel__content">
        <textarea
          className="instance-editor"
          aria-label="JSON instance"
          spellCheck={false}
          value={instanceText}
          onChange={(event) => setInstanceText(event.target.value)}
        />

        <div className="diagnostics-pane">
          <div className="diagnostics-summary">
            <strong>Diagnostics</strong>
            <span>{schemaErrors.length} schema errors</span>
            <span>{schemaWarnings.length} warnings</span>
            <span>{instanceDiagnostics.length} instance errors</span>
          </div>

          {instanceParseError && (
            <div className="inline-error">{instanceParseError}</div>
          )}

          {schemaDiagnostics.length === 0 &&
            !instanceParseError &&
            instanceDiagnostics.length === 0 && (
              <div className="empty-diagnostics">Schema and instance are valid.</div>
            )}

          <div className="diagnostic-list">
            {schemaDiagnostics.map((diagnostic, index) => (
              <DiagnosticRow
                key={`schema-${diagnostic.schemaPath}-${diagnostic.keyword}-${index}`}
                diagnostic={diagnostic}
              />
            ))}
            {instanceDiagnostics.map((diagnostic, index) => (
              <DiagnosticRow
                key={`instance-${diagnostic.instancePath}-${diagnostic.keyword}-${index}`}
                diagnostic={diagnostic}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
