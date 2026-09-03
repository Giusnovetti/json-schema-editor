# Fase JF-2 — implementation steps

## Starting point

JF-2 extends the independent UI Schema document introduced in JF-1. All visual edits must
serialize to standard JSON Forms UI Schema, retain stable internal ids, preserve unknown
options, and leave JSON Schema and runtime preview state independent.

## Ordered implementation checklist

1. Extend supported UI element types with `Categorization`, `Category`, and `Label`,
   including required-property and parent/child compatibility diagnostics.
2. Add immutable tree operations for moving elements within/between layouts, ordered
   reindexing, cycle prevention, and deletion while retaining ids for surviving elements.
3. Add Schema Graph property drag sources and layout drop targets that create scoped
   Controls; retain the existing accessible select-based creation path.
4. Add drag/drop and explicit move controls for nested UI elements so layouts and Controls
   can be reordered or moved between compatible containers.
5. Add creation and inspectors for nested layouts, `Categorization`, `Category`, and
   `Label`, including labels/text and i18n keys where applicable.
6. Add Control label states (unspecified, string, false) and a structured options model
   which merges edits into existing options without dropping renderer-specific values.
7. Add Control renderer options for per-element readonly and string date/time/date-time
   formats.
8. Add array Control options for `detail`, `showSortButtons`, and `elementLabelProp`, with
   support for standard detail modes and inline UI Schema JSON.
9. Add a global preview readonly toggle kept outside UI Schema and pass it to JSON Forms.
10. Add unit tests for every JF-2 feature: new element round-trip and diagnostics,
    nesting/reordering/cross-layout moves/cycle rejection/deletion, drag-operation backing
    commands, stable ids, option merging and unknown preservation, label states,
    date/time/array options, and global readonly independence.
11. Update README/styles and run all tests, typecheck, production build, and diff checks;
    fix every failure.

