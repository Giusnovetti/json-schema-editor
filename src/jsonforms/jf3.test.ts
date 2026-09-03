import { describe, expect, it } from 'vitest';
import { renameProperty, schemaToGraph } from '../core';
import {
  createUiRule,
  getUiRule,
  parseUiSchema,
  rewriteUiScopes,
  ruleConditionMatches,
  ruleOutcome,
  setUiRule,
  uiSchemaToObject,
  validateUiSchema,
  type UiRuleEffect,
} from './index';

describe('JF-3 dynamic behavior', () => {
  it('round-trips all four standard rule effects', () => {
    for (const effect of ['HIDE', 'SHOW', 'ENABLE', 'DISABLE'] as UiRuleEffect[]) {
      const document = parseUiSchema({ type: 'Control', scope: '#/properties/target' });
      const ruled = setUiRule(document, document.rootId, createUiRule(effect, '#/properties/source', { const: 'yes' }));
      expect(getUiRule(ruled.nodes[0]!)?.effect).toBe(effect);
      expect(uiSchemaToObject(ruled)).toMatchObject({ rule: { effect, condition: { scope: '#/properties/source', schema: { const: 'yes' } } } });
    }
  });

  it('supports property, nested, and root rule scopes', () => {
    const graph = schemaToGraph({ properties: { value: { type: 'string' }, nested: { properties: { flag: { type: 'boolean' } } } } });
    for (const scope of ['#', '#/properties/value', '#/properties/nested/properties/flag']) {
      const document = parseUiSchema({ type: 'Control', scope: '#/properties/value', rule: { effect: 'SHOW', condition: { scope, schema: {} } } });
      expect(validateUiSchema(document, graph).filter((item) => item.severity === 'error')).toHaveLength(0);
    }
  });

  it('diagnoses invalid effects, condition shapes, schemas, failWhenUndefined, and scopes', () => {
    const graph = schemaToGraph({ properties: { target: { type: 'string' } } });
    const cases = [
      { effect: 'INVALID', condition: { scope: '#', schema: {} } },
      { effect: 'SHOW' },
      { effect: 'SHOW', condition: { scope: 1, schema: {} } },
      { effect: 'SHOW', condition: { scope: '#/properties/missing', schema: {} } },
      { effect: 'SHOW', condition: { scope: '#', schema: [], failWhenUndefined: 'yes' } },
    ];
    const messages = cases.flatMap((rule) => validateUiSchema(parseUiSchema({ type: 'Control', scope: '#/properties/target', rule }), graph).map((item) => item.message));
    expect(messages).toEqual(expect.arrayContaining([
      'Rule effect must be HIDE, SHOW, ENABLE, or DISABLE.', 'Rule requires a condition.',
      'Rule condition requires a string scope.', 'Rule condition scope #/properties/missing cannot be resolved.',
      'Rule condition schema must be a JSON Schema object or boolean.', 'failWhenUndefined must be a boolean.',
    ]));
  });

  it('validates the JSON Schema inside a rule condition', () => {
    const graph = schemaToGraph({ properties: { target: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/target', rule: {
      effect: 'SHOW', condition: { scope: '#', schema: { minLength: -1 } },
    } });
    expect(validateUiSchema(document, graph).some((item) => item.message.includes('minLength must be a non-negative integer'))).toBe(true);
  });

  it('supports const, enum, type, numeric constraint, and pattern condition schemas', () => {
    expect(ruleConditionMatches(createUiRule('SHOW', '#/kind', { const: 'business' }), { kind: 'business' })).toBe(true);
    expect(ruleConditionMatches(createUiRule('SHOW', '#/kind', { enum: ['a', 'b'] }), { kind: 'c' })).toBe(false);
    expect(ruleConditionMatches(createUiRule('SHOW', '#/age', { type: 'number', minimum: 18 }), { age: 20 })).toBe(true);
    expect(ruleConditionMatches(createUiRule('SHOW', '#/age', { maximum: 10 }), { age: 11 })).toBe(false);
    expect(ruleConditionMatches(createUiRule('SHOW', '#/code', { pattern: '^A' }), { code: 'ABC' })).toBe(true);
  });

  it('implements failWhenUndefined behavior', () => {
    const defaultRule = createUiRule('SHOW', '#/missing', { const: true });
    expect(ruleConditionMatches(defaultRule, {})).toBe(true);
    const strict = { ...defaultRule, condition: { ...defaultRule.condition, failWhenUndefined: true } };
    expect(ruleConditionMatches(strict, {})).toBe(false);
  });

  it('computes immediate visibility/enabled outcomes for every effect', () => {
    const data = { flag: true };
    expect(ruleOutcome(createUiRule('HIDE', '#/flag', { const: true }), data)).toEqual({ visible: false });
    expect(ruleOutcome(createUiRule('SHOW', '#/flag', { const: true }), data)).toEqual({ visible: true });
    expect(ruleOutcome(createUiRule('DISABLE', '#/flag', { const: true }), data)).toEqual({ enabled: false });
    expect(ruleOutcome(createUiRule('ENABLE', '#/flag', { const: true }), data)).toEqual({ enabled: true });
  });

  it('rewrites Control and rule condition scopes after schema property renames', () => {
    const graph = schemaToGraph({ properties: { old: { type: 'string' }, target: { type: 'string' } } });
    const document = parseUiSchema({ type: 'Control', scope: '#/properties/old', rule: { effect: 'SHOW', condition: { scope: '#/properties/old', schema: {} } } });
    const renamed = renameProperty(graph, graph.rootNodeId, 'old', 'new');
    expect(uiSchemaToObject(rewriteUiScopes(document, graph, renamed))).toMatchObject({
      scope: '#/properties/new', rule: { condition: { scope: '#/properties/new' } },
    });
  });

  it('removes a rule without disturbing the element identity or other fields', () => {
    const document = parseUiSchema({ type: 'Group', label: 'Stable', rule: { effect: 'HIDE', condition: { scope: '#', schema: true } }, elements: [] });
    const cleared = setUiRule(document, document.rootId, undefined);
    expect(cleared.rootId).toBe(document.rootId);
    expect(uiSchemaToObject(cleared)).toEqual({ type: 'Group', label: 'Stable', elements: [] });
  });
});
