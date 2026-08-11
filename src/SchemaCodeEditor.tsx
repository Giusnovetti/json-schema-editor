import Editor, { type OnMount } from '@monaco-editor/react';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import { useEffect, useRef } from 'react';
import { unescapePointerToken } from './core';
import { useSchemaStore } from './store/useSchemaStore';

type MountedEditor = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];

function schemaPathTokens(pointer: string): Array<string | number> {
  if (!pointer) return [];
  return pointer
    .split('/')
    .slice(1)
    .map(unescapePointerToken);
}

export function SchemaCodeEditor() {
  const sourceText = useSchemaStore((state) => state.sourceText);
  const schemaDiagnostics = useSchemaStore((state) => state.schemaDiagnostics);
  const setSourceText = useSchemaStore((state) => state.setSourceText);
  const editorRef = useRef<MountedEditor | null>(null);
  const monacoRef = useRef<MonacoApi | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;

    const tree = parseTree(sourceText);
    const markers = schemaDiagnostics.map((diagnostic) => {
      const target = tree
        ? findNodeAtLocation(tree, schemaPathTokens(diagnostic.schemaPath)) ?? tree
        : undefined;
      const startOffset = target?.offset ?? 0;
      const endOffset = target ? target.offset + Math.max(1, target.length) : startOffset + 1;
      const start = model.getPositionAt(startOffset);
      const end = model.getPositionAt(endOffset);

      return {
        severity:
          diagnostic.severity === 'error'
            ? monaco.MarkerSeverity.Error
            : diagnostic.severity === 'warning'
              ? monaco.MarkerSeverity.Warning
              : monaco.MarkerSeverity.Info,
        message: diagnostic.message,
        source: 'JSON Schema Graph Builder',
        code: diagnostic.keyword,
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: end.lineNumber,
        endColumn: end.column,
      };
    });

    monaco.editor.setModelMarkers(model, 'json-schema-graph-builder', markers);
  }, [schemaDiagnostics, sourceText]);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  return (
    <Editor
      height="100%"
      defaultLanguage="json"
      value={sourceText}
      onMount={onMount}
      onChange={(value) => setSourceText(value ?? '')}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        formatOnPaste: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
    />
  );
}
