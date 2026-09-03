import { useEffect, useState } from 'react';
import { MVP2_FORMATS, type SchemaNode } from '../core';
import { useSchemaStore } from '../store/useSchemaStore';

interface NumberKeywordProps {
  keyword: string;
  label: string;
  node: SchemaNode;
  min?: number;
  step?: number;
}

function NumberKeyword({ keyword, label, node, min, step }: NumberKeywordProps) {
  const setKeyword = useSchemaStore((state) => state.setSelectedNodeKeyword);
  const value = node.kind === 'schema' ? node.keywords[keyword] : undefined;

  return (
    <label>
      {label}
      <input
        type="number"
        value={typeof value === 'number' ? String(value) : ''}
        min={min}
        step={step ?? 'any'}
        placeholder="Not set"
        onChange={(event) => {
          const text = event.target.value;
          setKeyword(keyword, text === '' ? undefined : Number(text));
        }}
      />
    </label>
  );
}

interface TextKeywordProps {
  keyword: string;
  label: string;
  node: SchemaNode;
  placeholder?: string;
  list?: string;
}

function TextKeyword({ keyword, label, node, placeholder, list }: TextKeywordProps) {
  const setKeyword = useSchemaStore((state) => state.setSelectedNodeKeyword);
  const value = node.kind === 'schema' ? node.keywords[keyword] : undefined;

  return (
    <label>
      {label}
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        placeholder={placeholder ?? 'Not set'}
        list={list}
        onChange={(event) => setKeyword(keyword, event.target.value || undefined)}
      />
    </label>
  );
}

function BooleanKeyword({ keyword, label, node }: { keyword: string; label: string; node: SchemaNode }) {
  const setKeyword = useSchemaStore((state) => state.setSelectedNodeKeyword);
  const value = node.kind === 'schema' ? node.keywords[keyword] : undefined;

  return (
    <label>
      {label}
      <select
        value={typeof value === 'boolean' ? String(value) : ''}
        onChange={(event) => {
          const next = event.target.value;
          setKeyword(keyword, next === '' ? undefined : next === 'true');
        }}
      >
        <option value="">Not set</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    </label>
  );
}

interface JsonKeywordEditorProps {
  keyword: 'enum' | 'const';
  node: SchemaNode;
}

function JsonKeywordEditor({ keyword, node }: JsonKeywordEditorProps) {
  const setKeyword = useSchemaStore((state) => state.setSelectedNodeKeyword);
  const present = node.kind === 'schema' && keyword in node.keywords;
  const current = node.kind === 'schema' ? node.keywords[keyword] : undefined;
  const [draft, setDraft] = useState(present ? JSON.stringify(current, null, 2) : '');
  const [error, setError] = useState<string>();

  useEffect(() => {
    setDraft(present ? JSON.stringify(current, null, 2) : '');
    setError(undefined);
  }, [current, present]);

  function apply() {
    if (!draft.trim()) {
      setKeyword(keyword, undefined);
      setError(undefined);
      return;
    }

    try {
      const parsed = JSON.parse(draft) as unknown;
      if (keyword === 'enum' && !Array.isArray(parsed)) {
        setError('enum must be a JSON array.');
        return;
      }
      setKeyword(keyword, parsed);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invalid JSON value.');
    }
  }

  return (
    <div className="json-keyword-editor">
      <label>
        {keyword}
        <textarea
          spellCheck={false}
          value={draft}
          placeholder={keyword === 'enum' ? '["one", "two"]' : 'Any JSON value'}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="inline-actions">
        <button type="button" onClick={apply}>Apply {keyword}</button>
        {present && (
          <button
            type="button"
            onClick={() => {
              setDraft('');
              setKeyword(keyword, undefined);
              setError(undefined);
            }}
          >
            Clear
          </button>
        )}
      </div>
      {error && <small className="error-text json-editor-error">{error}</small>}
    </div>
  );
}

export function ConstraintFields({ node, type }: { node: SchemaNode; type: string }) {
  return (
    <>
      {type === 'string' && (
        <section className="inspector-section constraint-grid">
          <h3>String constraints</h3>
          <NumberKeyword keyword="minLength" label="minLength" node={node} min={0} step={1} />
          <NumberKeyword keyword="maxLength" label="maxLength" node={node} min={0} step={1} />
          <TextKeyword keyword="pattern" label="pattern" node={node} placeholder="Regular expression" />
          <TextKeyword keyword="format" label="format" node={node} placeholder="e.g. email" list="json-schema-formats" />
          <datalist id="json-schema-formats">
            {MVP2_FORMATS.map((format) => <option key={format} value={format} />)}
          </datalist>
        </section>
      )}

      {(type === 'number' || type === 'integer') && (
        <section className="inspector-section constraint-grid">
          <h3>Numeric constraints</h3>
          <NumberKeyword keyword="minimum" label="minimum" node={node} />
          <NumberKeyword keyword="maximum" label="maximum" node={node} />
          <NumberKeyword keyword="exclusiveMinimum" label="exclusiveMinimum" node={node} />
          <NumberKeyword keyword="exclusiveMaximum" label="exclusiveMaximum" node={node} />
          <NumberKeyword keyword="multipleOf" label="multipleOf" node={node} min={0} />
        </section>
      )}

      {type === 'array' && (
        <section className="inspector-section constraint-grid">
          <h3>Array constraints</h3>
          <NumberKeyword keyword="minItems" label="minItems" node={node} min={0} step={1} />
          <NumberKeyword keyword="maxItems" label="maxItems" node={node} min={0} step={1} />
          <BooleanKeyword keyword="uniqueItems" label="uniqueItems" node={node} />
          <NumberKeyword keyword="minContains" label="minContains" node={node} min={0} step={1} />
          <NumberKeyword keyword="maxContains" label="maxContains" node={node} min={0} step={1} />
        </section>
      )}

      {type === 'object' && (
        <section className="inspector-section constraint-grid">
          <h3>Object constraints</h3>
          <NumberKeyword keyword="minProperties" label="minProperties" node={node} min={0} step={1} />
          <NumberKeyword keyword="maxProperties" label="maxProperties" node={node} min={0} step={1} />
        </section>
      )}

      <section className="inspector-section">
        <h3>Value constraints</h3>
        <JsonKeywordEditor keyword="enum" node={node} />
        <JsonKeywordEditor keyword="const" node={node} />
      </section>
    </>
  );
}
