# Fase JF-3 — implementation steps

## Starting point

JF-3 builds on the JF-1/JF-2 UI Schema document and the official JSON Forms preview.
Rules are standard UI Schema properties. Validation mode and additional errors are runtime
preview configuration and must not be serialized into JSON Schema or UI Schema.

## Ordered implementation checklist

1. Add a typed rule model and immutable UI element rule operations supporting `HIDE`,
   `SHOW`, `ENABLE`, and `DISABLE`.
2. Validate rule shape, effect, condition scope, condition JSON Schema, and
   `failWhenUndefined`; associate unresolved rule scopes with UI and schema diagnostics.
3. Extend schema rename propagation to rewrite both Control scopes and rule-condition
   scopes deterministically.
4. Add a rule inspector to all supported UI elements with effect, graph-backed/manual
   condition scope, `failWhenUndefined`, and JSON Schema condition editing.
5. Provide structured helpers for common visual conditions (`const`, `enum`, and basic
   type/constraint schemas) while retaining an advanced JSON Schema editor.
6. Execute rules in the live preview through JSON Forms so form-data changes immediately
   update visibility and enabled state.
7. Add runtime validation mode state for `ValidateAndShow`, `ValidateAndHide`, and
   `NoValidation`, and pass it to JSON Forms.
8. Add non-destructive additional-errors JSON parsing, an editor for AJV-compatible
   backend/business errors, and pass valid errors to JSON Forms.
9. Keep captured AJV errors and additional errors distinguishable in diagnostics while
   mapping both to Controls and Schema Graph nodes when possible.
10. Add unit tests for every JF-3 feature: all effects, round-trip, scope resolution and
    diagnostics, condition schemas, `failWhenUndefined`, rename propagation, rule outcome
    helpers, all validation modes, non-destructive additional-error parsing, error merging,
    navigation mapping, and runtime/schema independence.
11. Update README and styling, then run all tests, typecheck, production build, and diff
    checks; fix every failure.

