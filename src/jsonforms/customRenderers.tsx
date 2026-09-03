import { createContext, useContext } from 'react';
import {
  rankWith,
  uiTypeIs,
  type ControlProps,
  type LayoutProps,
} from '@jsonforms/core';
import {
  JsonFormsDispatch,
  withJsonFormsControlProps,
  withJsonFormsLayoutProps,
} from '@jsonforms/react';
import type { CustomRendererDefinition } from './extensibility';

export interface DynamicRendererRuntime {
  prefix: string;
  choices: string[];
}

export const DynamicRendererContext = createContext<DynamicRendererRuntime>({ prefix: 'Dynamic', choices: [] });

function DynamicTextControl({ data, handleChange, path, label, enabled, visible }: ControlProps) {
  const runtime = useContext(DynamicRendererContext);
  if (!visible) return null;
  return <label className="dynamic-control"><span>{runtime.prefix}: {label}</span><input disabled={!enabled} value={typeof data === 'string' ? data : ''} list="dynamic-runtime-choices" onChange={(event) => handleChange(path, event.target.value)} /><datalist id="dynamic-runtime-choices">{runtime.choices.map((choice) => <option key={choice} value={choice} />)}</datalist></label>;
}

function FramedVerticalLayout({ uischema, schema, path, visible, enabled, renderers, cells }: LayoutProps) {
  if (!visible) return null;
  const elements = 'elements' in uischema && Array.isArray(uischema.elements) ? uischema.elements : [];
  return <fieldset className="custom-layout-frame"><legend>Custom layout renderer</legend>{elements.map((element, index) => <JsonFormsDispatch key={`${path}-${index}`} uischema={element} schema={schema} path={path} enabled={enabled} renderers={renderers} cells={cells} />)}</fieldset>;
}

export const DynamicTextRenderer = withJsonFormsControlProps(DynamicTextControl);
export const FramedLayoutRenderer = withJsonFormsLayoutProps(FramedVerticalLayout);

export const BUILTIN_CUSTOM_RENDERERS: CustomRendererDefinition[] = [
  {
    id: 'dynamic-text', label: 'Dynamic text Control', kind: 'control', rank: 20, enabled: false,
    tester: rankWith(20, (uischema, schema) => uischema.type === 'Control' && schema.type === 'string' && (uischema as { options?: Record<string, unknown> }).options?.customRenderer === 'dynamic-text'),
    renderer: DynamicTextRenderer,
    metadata: { option: 'options.customRenderer', runtimeContext: true },
  },
  {
    id: 'framed-vertical', label: 'Framed VerticalLayout', kind: 'layout', rank: 10, enabled: false,
    tester: rankWith(10, uiTypeIs('VerticalLayout')),
    renderer: FramedLayoutRenderer,
    metadata: { layout: 'VerticalLayout' },
  },
];

