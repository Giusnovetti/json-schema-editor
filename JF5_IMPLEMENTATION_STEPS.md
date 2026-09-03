# Fase JF-5 — implementation steps

## Starting point

JF-5 completes the first JSON Forms integration by coordinating localization, renderer
sets, preview-only reference resolution, compatibility diagnostics, and navigation. Source
JSON Schema, resolved preview schema, UI Schema, registered details, translations, and
runtime configuration remain distinct artifacts.

## Ordered implementation checklist

1. Add locale and translation-catalog runtime models plus JSON Forms translator and error
   translator adapters with default-message fallback and interpolation.
2. Support translated property labels/descriptions, explicit UI i18n keys, Group/Category/
   Label text, validation errors, enum values, and `oneOf` title/const choices.
3. Add preview locale/catalog controls which do not mutate JSON Schema or UI Schema.
4. Add explicit renderer-set definitions and switching between official vanilla-only and
   vanilla-plus-custom sets without changing either schema document.
5. Extend renderer diagnostics to report unavailable renderers and known options that are
   incompatible with the selected renderer set.
6. Add a preview-schema resolver which dereferences local/anchor/external references from
   caller-supplied resources, preserves the original source schema, detects cycles, and
   returns explicit unresolved-reference diagnostics.
7. Add non-destructive external-resource registry editing and a source/resolved preview
   switch/status display; never overwrite source JSON Schema with the preview projection.
8. Add cross-navigation indexes for Schema node → main/registered Controls and rules,
   UI element → Schema node, validation error → both, plus readonly-origin diagnostics.
9. Add UI affordances for reverse usages, registered-detail usages, relinking unresolved
   elements, and preview-field focus hints.
10. Add unit tests for every JF-5 feature: translation/fallback/interpolation/error/enum
    keys, locale independence, renderer switching and compatibility diagnostics, local and
    external dereferencing/cycles/unresolved diagnostics/source preservation, usage indexes,
    registered details, and readonly origins.
11. Update README/styles and run all tests, typecheck, production build, and diff checks;
    fix every failure.

