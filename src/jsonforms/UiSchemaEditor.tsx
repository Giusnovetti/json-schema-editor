import Editor from '@monaco-editor/react';
import { useRef } from 'react';
import { useSchemaStore } from '../store/useSchemaStore';

export function UiSchemaEditor() {
  const inputRef = useRef<HTMLInputElement>(null);
  const text = useSchemaStore((state) => state.uiSchemaText);
  const error = useSchemaStore((state) => state.uiSchemaParseError);
  const setText = useSchemaStore((state) => state.setUiSchemaText);
  const generate = useSchemaStore((state) => state.generateUiSchema);
  const materialize = useSchemaStore((state) => state.materializeUiSchema);
  const explicit = useSchemaStore((state) => state.uiSchema.explicit);

  async function importFile(file?: File) { if (file) setText(await file.text()); }
  function exportFile() {
    const href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = href; anchor.download = 'uischema.json'; anchor.click(); URL.revokeObjectURL(href);
  }

  return <section className="ui-schema-editor panel">
    <div className="panel__header">
      <span>UI Schema · {explicit ? 'explicit' : 'generated'}</span>
      <div className="compact-actions">
        <input ref={inputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => void importFile(event.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()}>Import</button>
        <button type="button" onClick={exportFile}>Export</button>
        <button type="button" onClick={generate}>Generate</button>
        {!explicit && <button type="button" onClick={materialize}>Materialize</button>}
      </div>
    </div>
    {error && <div className="inline-error ui-schema-error">{error} — last valid UI Schema remains active.</div>}
    <div className="panel__content"><Editor height="100%" defaultLanguage="json" value={text} onChange={(value) => setText(value ?? '')} options={{ minimap: { enabled: false }, fontSize: 12, automaticLayout: true, scrollBeyondLastLine: false }} /></div>
  </section>;
}

