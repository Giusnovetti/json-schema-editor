# JSON Schema Graph Builder

Visual JSON Schema builder based on a semantic graph model.

This repository currently implements **MVP 1 + MVP 2 + MVP 3 + MVP 4** and **JSON Forms phase JF-1**, plus a **Draft-07 compatibility increment** alongside Draft 2020-12.

## Supported dialects

The builder currently supports two selectable dialects:

- **JSON Schema Draft 2020-12**;
- **JSON Schema Draft-07**.

The root `$schema` value is detected on import. The toolbar also exposes a dialect selector that converts the semantic graph to the selected syntax while preserving stable node ids and rewriting affected local JSON Pointer `$ref` values.

### Draft-07 compatibility scope

Draft-07 support covers the full feature set already implemented through MVP 3, including:

- primitive/object/array/boolean schemas;
- `properties`, `required`, validation constraints, `enum`, `const`, and supported `format` assertions;
- local JSON Pointer `$ref`, including recursive references;
- `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, and `else`;
- definitions using `definitions` rather than `$defs`;
- Draft-07 `dependencies`, including both property-dependency arrays and schema dependencies;
- tuple validation using `items: [...]`;
- `additionalItems` for values after a Draft-07 tuple;
- Draft-07 `$ref` sibling semantics in instance validation;
- schema ↔ graph round-trip and dialect conversion.

Dialect conversion maps the semantic equivalents currently represented by the graph:

```text
Draft 2020-12                Draft-07
------------------------------------------------
$defs                  ⇄     definitions
dependentSchemas       ⇄     dependencies (schema form)
dependentRequired      ⇄     dependencies (array form)
prefixItems            ⇄     items: [...]
items after prefix     ⇄     additionalItems
```

Keywords that are outside the current MVP roadmap are still preserved where possible as raw/non-modelled keywords, but are not automatically promoted to semantic graph relations or fully validated by the internal validator.

## Implemented

### MVP 1 — Core graph

- JSON Schema import/export;
- Monaco JSON editor;
- semantic `SchemaGraph` independent from React Flow;
- JSON Schema → Graph → JSON Schema round-trip;
- object, array, string, number, integer, boolean, null and boolean schemas;
- `properties`, `required`, `items`, definitions, local `$ref`;
- recursive local refs without recursive serialization;
- visual graph with zoom, pan, minimap and manual node positions;
- property add/rename/delete;
- definition add/rename;
- local `$ref` create/clear;
- stable node ids across rename operations;
- rewrite of local refs when referenced subtrees are renamed;
- preservation of unknown/non-modelled keywords.

### MVP 2 — Validation

The builder supports editable validation keywords and live validation.

#### Editable constraints

String:

- `minLength`;
- `maxLength`;
- `pattern`;
- `format`.

Number / integer:

- `minimum`;
- `maximum`;
- `exclusiveMinimum`;
- `exclusiveMaximum`;
- `multipleOf`.

Array:

- `minItems`;
- `maxItems`;
- `uniqueItems`.

Object:

- `minProperties`;
- `maxProperties`;
- `required` from the existing property editor.

General:

- `enum`;
- `const`.

#### Schema validation

`validateSchemaDocument()` validates the currently modelled subset for both supported dialects, including:

- valid type declarations;
- keyword value types;
- non-negative integer constraints;
- positive `multipleOf`;
- regular-expression syntax;
- `required` uniqueness;
- non-empty/unique `enum` values;
- dialect-specific definitions and dependency containers;
- schema-valued `properties` and item subschemas;
- Draft-07 tuple `items`, `additionalItems`, and mixed `dependencies`;
- warnings for contradictory min/max cardinality constraints.

Invalid JSON Schema source text is preserved in Monaco and does **not** replace the last valid graph. Graph mutations are paused until blocking schema errors are fixed, preventing invalid source edits from being silently overwritten.

> The internal validator is deliberately isolated behind core functions and validates the currently supported editor subset. A future validator adapter can replace it with a complete official meta-schema implementation without coupling the domain model to a specific validation library.

#### Instance validation

`validateInstance()` supports:

- type assertions;
- `required`;
- string lengths and patterns;
- numeric bounds and `multipleOf`;
- array size and uniqueness;
- object property counts;
- `enum` and `const`;
- local resolved `$ref`;
- recursive local `$ref`;
- boolean schemas;
- item validation, including Draft-07 tuple items;
- Draft-07 `additionalItems`;
- Draft-07 property and schema dependencies;
- supported `format` assertions.

Supported formats:

```text
email
uri
uri-reference
uuid
date
date-time
time
ipv4
ipv6
hostname
regex
```

Unknown formats are preserved and treated as annotations by the internal validator.

#### Error highlighting

Validation diagnostics contain:

```ts
interface ValidationDiagnostic {
  source: 'schema' | 'instance';
  severity: 'error' | 'warning' | 'info';
  keyword?: string;
  message: string;
  schemaPath: string;
  nodeId?: string;
  instancePath?: string;
}
```

They are projected into the UI as:

- Monaco markers for schema errors/warnings;
- graph-node error/warning badges;
- selected-node diagnostics in the inspector;
- clickable validation diagnostics that focus the associated graph node;
- JSON instance validation results with instance and schema paths.

### MVP 3 — Composition

The semantic graph models schema applicators as typed edges to subschema nodes.

Supported relations:

- `allOf`, `anyOf`, `oneOf` with ordered branch indexes;
- `not`;
- `if`, `then`, `else`;
- schema dependencies as keyed `dependentSchema` edges (`dependentSchemas` in 2020-12, schema-form `dependencies` in Draft-07).

The parser and serializer preserve branch order and round-trip these structures. Local `$ref` values that point into a composition branch are resolved, and are rewritten when branch deletion causes surviving array branches to be reindexed. Node ids remain stable while pointers move.

The inspector can:

- add/remove `allOf`, `anyOf`, and `oneOf` branches;
- add/remove `not`, `if`, `then`, and `else` subschemas;
- add, rename, navigate to, and delete schema dependencies.

Graph projection renders composition relations as labelled dashed semantic edges and exposes composition/conditional/dependent counts on schema nodes.

Instance validation implements applicator semantics:

- every `allOf` branch must pass;
- at least one `anyOf` branch must pass;
- exactly one `oneOf` branch must pass;
- `not` succeeds only when its subschema fails;
- `if` is evaluated silently and selects `then` or `else`;
- a schema dependency validates the whole object when its triggering property is present.

Schema validation also checks applicator shapes, non-empty composition arrays, schema-valued branches, and schema dependencies. It emits warnings for duplicate `oneOf` branches and `then`/`else` without `if`.

## Architecture

### JSON Forms JF-1 — Core integration

The toolbar switches between the Schema Graph workspace and a dedicated JSON Forms
workspace. JF-1 includes:

- the official JSON Forms React runtime and official vanilla renderer set;
- an independent UI Schema model and JSON editor with import/export;
- `Control`, `VerticalLayout`, `HorizontalLayout`, and `Group`, including nested ordered
  `elements` and preservation of unknown properties/elements;
- generated implicit UI Schemas and explicit materialization;
- Control scope resolution, diagnostics, Control → Schema Graph cross-selection, and
  deterministic scope rewriting after property renames;
- a live form preview synchronized with the existing JSON data editor;
- initial/live AJV errors mapped back to UI elements and schema nodes.

UI Schema element ids and selection are internal metadata and are never serialized into
the standard `uischema.json`. UI Schema-only changes do not mutate the JSON Schema.

### JSON Forms JF-2 — Visual UI Schema Builder

The JSON Forms workspace now supports visual structural editing:

- drag Schema Graph properties into compatible layouts to create scoped Controls;
- drag/reorder UI elements, move them between nested layouts, or use accessible move
  controls;
- create/delete nested `VerticalLayout`, `HorizontalLayout`, `Group`, `Categorization`,
  `Category`, and `Label` structures;
- edit Group/Category labels and i18n keys plus Label text/i18n;
- configure Control labels as implicit, custom text, or hidden;
- edit known Control options while preserving unknown renderer-specific options;
- configure per-Control readonly, string `date`/`time`/`date-time` renderer formats, and
  array `detail`, `showSortButtons`, and `elementLabelProp` options;
- toggle global form readonly independently from JSON Schema and UI Schema.

Tree operations preserve internal ids, ordered children, and standard UI Schema export.
Invalid parent/child structures, labels, and text are surfaced as UI diagnostics.

### JSON Forms JF-3 — Dynamic behavior

Every supported UI element now has a standard JSON Forms rule editor supporting `HIDE`,
`SHOW`, `ENABLE`, and `DISABLE`. Conditions support root, property, nested, or manual
scopes; graph-backed selection; `failWhenUndefined`; common condition presets; and an
advanced JSON Schema editor validated by the builder. Rule scopes follow deterministic
property renames, and JSON Forms/AJV executes the rules live against preview data.

The preview exposes all JSON Forms validation modes (`ValidateAndShow`,
`ValidateAndHide`, and `NoValidation`) and accepts AJV-compatible additional backend or
business errors through a non-destructive JSON editor. Native and additional errors are
labelled separately and map back to matching Controls and Schema Graph nodes. Validation
mode and additional errors are runtime state and are not serialized into either schema.

### JSON Forms JF-4 — Extensibility

The preview now has explicit runtime registries and diagnostics for custom renderers. The
built-in examples include a Context-aware dynamic text Control and a custom vertical
layout renderer; either can be enabled independently, and ranked tester diagnostics show
which custom renderer wins for each applicable UI element. The registry accepts the same
tester/React-component entries for future project renderers, including layouts.

JF-4 also adds:

- multiple named, enabled/disabled registered detail UI Schemas with type/path/rank
  testers and non-destructive standard UI Schema editing;
- global `restrict`, `trim`, `showUnfocusedDescription`, and `hideRequiredAsterisk`
  configuration, with per-element option precedence documented in the UI;
- optional debug middleware recording `INIT`, `UPDATE_CORE`, and `UPDATE_DATA` events;
- a React Context seam and editable runtime sample values for dynamic/API-driven
  renderers;
- custom renderer selection diagnostics with readable ids, kinds, and ranks.

Renderer components, tester functions, global config, middleware events, registered
runtime entries, and Context values remain separate from JSON Schema and UI Schema export.

### JSON Forms JF-5 — Advanced integration

The preview supports locale switching and translation catalogs through JSON Forms i18n
adapters. Catalog lookup covers path/UI i18n keys, Group/Category/Label content,
validation messages, enums, and `oneOf` title/const choices, with default-message fallback
and value interpolation.

JF-5 also adds:

- switching between the official vanilla renderer set and vanilla plus enabled custom
  renderers without altering either schema;
- diagnostics for unavailable custom renderers and options requiring a dynamic renderer;
- a separate resolved preview-schema projection for local, anchor, and registered external
  references, including cycle boundaries and unresolved-reference diagnostics;
- non-destructive external schema-resource registry editing while preserving the original
  source schema;
- reverse Schema Graph usages across Controls, rule conditions, and registered detail UI
  Schemas;
- readonly-origin reporting for JSON Schema `readOnly`, UI Schema options, global readonly,
  and `DISABLE` rules;
- navigation from compatibility/reference/validation diagnostics to UI and schema nodes.

Locale catalogs, renderer selection, external resources, and the resolved preview schema
are runtime/project state and are never silently written into standard schema documents.

### MVP 4 — Advanced JSON Schema

Draft 2020-12 graphs now model `prefixItems`, `contains`, `unevaluatedProperties`, and
`unevaluatedItems` as semantic relations. The inspector exposes their subschemas and the
`$id`, `$anchor`, `$dynamicAnchor`, `$ref`, and `$dynamicRef` resource keywords.

The core resource resolver indexes root and embedded `$id` resources, JSON Pointer and
named anchors, resolves relative and absolute references, and accepts an explicit registry
of external JSON Schema documents. It never performs implicit network requests. Instance
validation supports registered external references, dynamic-anchor fallback, contains
counts, and unevaluated item/property validation. Draft-07 tuple behavior remains intact;
2020-12-only keywords round-trip as unknown keywords when converting to Draft-07.

The application has no database layer: standard JSON Schema documents and the in-memory
semantic graph are the data model, while visual positions remain separate UI metadata.

`SchemaGraph` remains the application/domain model. React Flow is only a visual projection. Dialect syntax is normalized into this shared semantic graph.

```text
              JSON Schema / Monaco
                       │
                       ▼
              dialect detection
                       │
                       ▼
             validateSchemaDocument()
                       │
                       ▼
                 schemaToGraph()
                       │
                       ▼
                  SchemaGraph
                  /    |    \\
                 /     |     \\
        React Flow  validator  graphToSchema()
                               │
                               ▼
                        dialect-specific JSON
```

The validation engine and dialect conversion layer have no React/React Flow dependency.

## Source layout

```text
src/
├── core/
│   ├── model.ts
│   ├── dialect.ts
│   ├── parser.ts
│   ├── serializer.ts
│   ├── operations.ts
│   ├── selectors.ts
│   ├── pointer.ts
│   ├── validation.ts
│   ├── core.test.ts
│   ├── validation.test.ts
│   ├── composition.test.ts
│   └── draft07.test.ts
├── graph/
│   ├── GraphCanvas.tsx
│   ├── SchemaNodeCard.tsx
│   ├── projectGraph.ts
│   ├── projectGraph.test.ts
│   ├── positionState.ts
│   └── positionState.test.ts
├── inspector/
│   ├── NodeInspector.tsx
│   ├── ConstraintFields.tsx
│   └── CompositionFields.tsx
├── validation/
│   └── ValidationPanel.tsx
├── store/
│   └── useSchemaStore.ts
├── examples/
│   └── sampleSchema.ts
├── SchemaCodeEditor.tsx
└── App.tsx
```

## Unit tests

Current suite: **76 unit tests**.

Coverage includes:

- schema ↔ graph round-trip;
- local and recursive `$ref`;
- property/definition rename and deletion;
- RFC 6901 pointer escaping;
- stable node identity;
- keyword set/remove semantics, including `const: ""`;
- schema constraint validation;
- invalid structural subschemas;
- enum uniqueness;
- string Unicode length;
- numeric bounds and decimal `multipleOf`;
- formats;
- arrays and object constraints;
- boolean schemas;
- recursive instance validation;
- diagnostic → graph-node mapping;
- error/warning projection into graph node data;
- graph position persistence;
- composition parser/serializer round-trip;
- composition branch reindexing and `$ref` rewriting;
- `allOf` / `anyOf` / `oneOf` / `not` semantics;
- `if` / `then` / `else` semantics;
- schema-dependency semantics and editing operations;
- Draft-07 dialect detection;
- `definitions` and mixed `dependencies`;
- Draft-07 tuple `items` and `additionalItems`;
- Draft-07 `$ref` sibling behavior;
- Draft-07 ↔ Draft 2020-12 conversion;
- local `$ref` rewriting during dialect conversion;
- stable node ids during dialect conversion;
- conversion of overlapping `dependentRequired` + `dependentSchemas` triggers into a semantics-preserving Draft-07 `dependencies` schema using `allOf`;
- dialect-aware graph edge labels and containers.

After installing dependencies:

```bash
npm test
npm run typecheck
npm run build
```

## Local development

```bash
npm install
npm run dev
```

## Environment note

The execution environment used to prepare this increment could not reach the npm registry, so `node_modules` could not be installed here. The core was type-checked with the available TypeScript compiler, the committed unit suite was compiled and executed with an offline Vitest-compatible test harness, and the application source was statically checked using temporary external-module declarations. No test/runtime stubs are committed to the project.

## Current intentional limits

Not yet implemented as semantic graph features:

- `contains`;
- `propertyNames`;
- `patternProperties` / `additionalProperties` graph relations;
- `$id`-aware base URI resolution;
- named-fragment/anchor resolution;
- `$dynamicRef` / `$dynamicAnchor`;
- external reference resolution;
- multiple schema resources;
- full vocabulary/dialect plugin engine beyond the two supported built-in dialects;
- complete official meta-schema validation for either dialect;
- ELK layout;
- collaboration/versioning/refactoring tooling.

These remain candidates for the advanced-schema and developer-tooling roadmap milestones.
