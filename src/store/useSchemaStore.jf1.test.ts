import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSchemaStore } from './useSchemaStore';

describe('JF-1 store integration', () => {
  let snapshot: ReturnType<typeof useSchemaStore.getState>;
  beforeEach(() => { snapshot = useSchemaStore.getState(); });
  afterEach(() => { useSchemaStore.setState(snapshot, true); });

  it('keeps the last valid UI Schema active after a syntax error', () => {
    const previous = useSchemaStore.getState().uiSchema;
    useSchemaStore.getState().setUiSchemaText('{ invalid');
    const state = useSchemaStore.getState();
    expect(state.uiSchema).toBe(previous);
    expect(state.uiSchemaText).toBe('{ invalid');
    expect(state.uiSchemaParseError).toBeTruthy();
  });

  it('imports explicit UI Schema and cross-selects its resolved schema node', () => {
    useSchemaStore.getState().setUiSchemaText(JSON.stringify({ type: 'Control', scope: '#/properties/name' }));
    const elementId = useSchemaStore.getState().uiSchema.rootId;
    useSchemaStore.getState().selectUiElement(elementId);
    const state = useSchemaStore.getState();
    expect(state.uiSchema.explicit).toBe(true);
    expect(state.graph.nodes.find((node) => node.id === state.selectedNodeId)?.pointer).toBe('/properties/name');
  });

  it('synchronizes valid preview data text and validation state', () => {
    useSchemaStore.getState().setInstanceText('{"name":"Ada","age":36,"tags":[]}');
    const state = useSchemaStore.getState();
    expect(state.instanceParseError).toBeUndefined();
    expect(JSON.parse(state.instanceText)).toMatchObject({ name: 'Ada' });
  });

  it('stores global readonly independently from UI Schema options', () => {
    const before = useSchemaStore.getState().uiSchemaText;
    useSchemaStore.getState().setFormReadonly(true);
    expect(useSchemaStore.getState().formReadonly).toBe(true);
    expect(useSchemaStore.getState().uiSchemaText).toBe(before);
  });

  it('supports every validation mode independently from schema documents', () => {
    const source = useSchemaStore.getState().sourceText;
    const uiSource = useSchemaStore.getState().uiSchemaText;
    for (const mode of ['ValidateAndShow', 'ValidateAndHide', 'NoValidation'] as const) {
      useSchemaStore.getState().setFormValidationMode(mode);
      expect(useSchemaStore.getState().formValidationMode).toBe(mode);
    }
    expect(useSchemaStore.getState().sourceText).toBe(source);
    expect(useSchemaStore.getState().uiSchemaText).toBe(uiSource);
  });

  it('preserves the last valid additional errors after invalid JSON or shape', () => {
    const valid = JSON.stringify([{ instancePath: '/name', schemaPath: '#/properties/name/type', keyword: 'business', params: {}, message: 'Unavailable' }]);
    useSchemaStore.getState().setAdditionalErrorsText(valid);
    const previous = useSchemaStore.getState().additionalErrors;
    useSchemaStore.getState().setAdditionalErrorsText('{ broken');
    expect(useSchemaStore.getState().additionalErrors).toBe(previous);
    expect(useSchemaStore.getState().additionalErrorsParseError).toBeTruthy();
    useSchemaStore.getState().setAdditionalErrorsText('[{"message":"missing paths"}]');
    expect(useSchemaStore.getState().additionalErrors).toBe(previous);
  });

  it('keeps renderer config, middleware, and dynamic Context runtime outside schemas', () => {
    const source = useSchemaStore.getState().sourceText;
    const uiSource = useSchemaStore.getState().uiSchemaText;
    useSchemaStore.getState().setCustomRendererEnabled('dynamic-text', true);
    useSchemaStore.getState().setJsonFormsConfig('trim', true);
    useSchemaStore.getState().setMiddlewareMode('debug');
    useSchemaStore.getState().setDynamicRendererRuntime({ prefix: 'API', choices: ['One'] });
    expect(useSchemaStore.getState()).toMatchObject({ middlewareMode: 'debug', jsonFormsConfig: { trim: true }, dynamicRendererRuntime: { prefix: 'API' } });
    expect(useSchemaStore.getState().sourceText).toBe(source);
    expect(useSchemaStore.getState().uiSchemaText).toBe(uiSource);
  });

  it('manages multiple registered UI Schema documents', () => {
    useSchemaStore.getState().addRegisteredUiSchema();
    useSchemaStore.getState().addRegisteredUiSchema();
    const [first, second] = useSchemaStore.getState().registeredUiSchemas;
    expect(first?.id).not.toBe(second?.id);
    useSchemaStore.getState().updateRegisteredUiSchema(first!.id, { name: 'Updated' });
    expect(useSchemaStore.getState().registeredUiSchemas[0]?.name).toBe('Updated');
    useSchemaStore.getState().removeRegisteredUiSchema(second!.id);
    expect(useSchemaStore.getState().registeredUiSchemas).toHaveLength(1);
  });

  it('keeps locale, renderer set, and resolved-preview configuration outside schemas', () => {
    const source = useSchemaStore.getState().sourceText;
    const uiSource = useSchemaStore.getState().uiSchemaText;
    useSchemaStore.getState().setPreviewLocale('it');
    useSchemaStore.getState().setRendererSet('vanilla');
    useSchemaStore.getState().setUseResolvedPreviewSchema(true);
    expect(useSchemaStore.getState()).toMatchObject({ previewLocale: 'it', rendererSet: 'vanilla', useResolvedPreviewSchema: true });
    expect(useSchemaStore.getState().sourceText).toBe(source);
    expect(useSchemaStore.getState().uiSchemaText).toBe(uiSource);
  });

  it('preserves the last valid external resource registry after invalid JSON', () => {
    const valid = JSON.stringify({ 'https://remote.test/schema': { type: 'string' } });
    useSchemaStore.getState().setExternalResourcesText(valid);
    const previous = useSchemaStore.getState().externalResources;
    useSchemaStore.getState().setExternalResourcesText('{ bad');
    expect(useSchemaStore.getState().externalResources).toBe(previous);
    expect(useSchemaStore.getState().externalResourcesParseError).toBeTruthy();
  });
});
