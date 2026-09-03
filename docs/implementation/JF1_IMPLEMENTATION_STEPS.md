# Fase JF-1 — implementation steps

## Scope and architecture

JF-1 introduces a second, independent document model for JSON Forms UI Schema. The
existing `SchemaGraph` and JSON Schema source remain unchanged by UI-only edits. UI element
ids and selection are internal metadata and are never emitted in standard UI Schema JSON.
The preview uses the official JSON Forms React integration with the official vanilla
renderer set; preview data remains a third, independent JSON document.

## Ordered implementation checklist

1. Install the official JSON Forms React/core/vanilla packages and AJV.
2. Add a UI Schema domain model for `Control`, `VerticalLayout`, `HorizontalLayout`, and
   `Group`, with stable internal ids, ordered/nested children, unknown-property
   preservation, and standard JSON import/export.
3. Add scope resolution from `Control.scope` to `SchemaGraph`, including unresolved-scope
   diagnostics and helpers for Control → schema-node cross-selection.
4. Add default UI Schema generation from the current JSON Schema and distinguish implicit
   generated UI Schema from an explicit/materialized document.
5. Add core editing operations to create Controls and supported layouts/groups while
   keeping UI element ids stable and JSON Schema independent.
6. Extend application state with non-destructive UI Schema source parsing, import/export,
   selected UI element, generation/materialization, and cross-selection.
7. Add the UI Schema JSON editor and a compact visual tree/inspector for supported JF-1
   elements, including navigation to resolved schema nodes.
8. Embed the JSON Forms preview using current JSON Schema, explicit or generated UI
   Schema, and current data; synchronize form changes back to the data editor.
9. Capture JSON Forms/AJV validation errors, show them in preview diagnostics from initial
   render onward, and associate errors with matching Controls/schema nodes where possible.
10. Add unit tests for each JF-1 feature: round-trip/unknown preservation, stable identity,
    hierarchy/order, scope resolution/diagnostics, default generation, editing operations,
    independence, non-destructive parsing, cross-selection, data synchronization helpers,
    and validation-error mapping.
11. Update README and styling, then run the complete unit suite, typecheck, production
    build, and whitespace checks; fix every failure.

