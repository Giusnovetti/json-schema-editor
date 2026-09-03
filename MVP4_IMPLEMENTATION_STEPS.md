# MVP4 implementation steps

## Existing data model context

The application has no database or backend persistence layer. Its source of truth is the
in-memory `SchemaGraph` stored by Zustand. A graph contains stable schema nodes, semantic
edges, a root node id, and a dialect URI; graph positions are intentionally stored
separately. JSON import is parsed into this model and export serializes the model back to
standard JSON Schema.

MVP4 therefore extends the domain model and validation APIs. Multiple resources are
represented by a registry of standard JSON Schema documents keyed by canonical URI, not by
a proprietary bundle format or an implicit network/database fetcher.

## Implementation checklist

1. Extend semantic relations and structural presence with `contains`,
   `unevaluatedProperties`, and `unevaluatedItems`; add a distinct `dynamicRef` edge.
2. Parse and serialize those schema-valued keywords losslessly, while preserving ordered
   `prefixItems` (already present) and all identifier/anchor keywords.
3. Add graph operations and inspector controls to create/remove `prefixItems`, `contains`,
   `unevaluatedProperties`, and `unevaluatedItems`, plus editors for `$id`, `$anchor`,
   `$dynamicAnchor`, `$ref`, and `$dynamicRef`.
4. Add a reference/resource subsystem that indexes root and embedded `$id` resources,
   JSON Pointers, `$anchor`, and `$dynamicAnchor`; resolves relative/absolute local and
   external references; reports unresolved references; and supports caller-supplied schema
   resource registries without network side effects.
5. Extend schema validation for URI-reference strings, anchor syntax, duplicate resource
   identifiers/anchors, schema-valued advanced applicators, `minContains`/`maxContains`,
   and Draft-07 incompatibility diagnostics.
6. Extend instance validation for `prefixItems`, `contains` with contain counts,
   `unevaluatedItems`, `unevaluatedProperties`, registered external `$ref`, and
   `$dynamicRef` dynamic-scope lookup with static fallback.
7. Project all new relations and resource/reference state into graph labels/cards and keep
   the existing supported dialect conversion behavior explicit (Draft 2020-12 and
   Draft-07).
8. Add unit tests for every checklist feature: round-trip, editing, resolution,
   multi-resource validation, dynamic references, schema diagnostics, instance semantics,
   projection, and dialect behavior.
9. Update public exports and README, then run unit tests, type checking, and production
   build; fix all failures.

