# Fase JF-4 — implementation steps

## Starting point

JF-4 adds runtime extensibility around the official JSON Forms preview. React components,
tester functions, middleware, Context/API data, and renderer runtime state are executable
configuration and must never be serialized into JSON Schema or UI Schema.

## Ordered implementation checklist

1. Add typed custom renderer definitions with readable ids, kind (`control`/`layout`),
   ranked testers, React renderer entries, enabled state, and descriptive metadata.
2. Add renderer selection diagnostics which execute enabled testers against each UI
   element/schema pair, rank applicable custom entries, and report the selected renderer.
3. Provide working built-in custom Control and layout renderer examples whose testers can
   outrank standard renderers, plus APIs ready for externally registered React components.
4. Add preview registry state and controls to enable/disable custom renderers without
   changing either schema document.
5. Add multiple registered detail UI Schema documents with stable ids, names, standard UI
   Schema content, tester configuration, non-destructive JSON editing, and JSON Forms
   registry projection.
6. Add global JSON Forms config state/editors for `restrict`, `trim`,
   `showUnfocusedDescription`, and `hideRequiredAsterisk`; explain per-element option
   precedence in the UI.
7. Add middleware registration/configuration with a no-op default and a development debug
   middleware that records `INIT`, `UPDATE_CORE`, and `UPDATE_DATA` without serializing
   runtime events.
8. Add an explicit React Context seam for dynamic renderer data, demonstrate a renderer
   consuming it, and keep that runtime data separate from UI Schema.
9. Add unit tests for every feature: renderer registration/toggling/ranking/override,
   Control and layout selection diagnostics, registered UI Schema CRUD/tester projection,
   config updates and independence, middleware event filtering, dynamic-context
   separation, and unknown custom-option preservation.
10. Update README/styles and run all tests, typecheck, production build, and diff checks;
    fix every failure.

