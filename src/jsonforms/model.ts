export type SupportedUiSchemaType =
  | 'Control' | 'VerticalLayout' | 'HorizontalLayout' | 'Group'
  | 'Categorization' | 'Category' | 'Label';

export interface UiSchemaNode {
  id: string;
  parentId?: string;
  index: number;
  /** Standard UI Schema element with structural `elements` removed. */
  element: Record<string, unknown>;
  supported: boolean;
}

export interface UiSchemaDocument {
  rootId: string;
  nodes: UiSchemaNode[];
  explicit: boolean;
}

export interface UiSchemaDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  elementId?: string;
  scope?: string;
  schemaNodeId?: string;
}

export type UiRuleEffect = 'HIDE' | 'SHOW' | 'ENABLE' | 'DISABLE';
export interface UiRuleCondition {
  scope: string;
  schema: boolean | Record<string, unknown>;
  failWhenUndefined?: boolean;
}
export interface UiRule {
  effect: UiRuleEffect;
  condition: UiRuleCondition;
}

export const SUPPORTED_UI_SCHEMA_TYPES = new Set<SupportedUiSchemaType>([
  'Control', 'VerticalLayout', 'HorizontalLayout', 'Group',
  'Categorization', 'Category', 'Label',
]);
