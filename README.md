# JSON Schema Graph Builder

An interactive, graph-based editor for designing, understanding, and validating JSON Schemas.

JSON Schema Graph Builder keeps source JSON, a semantic graph, validation diagnostics, and a live JSON Forms preview synchronized. Edit a schema directly in Monaco or visually through the graph inspector, and see both representations update together.

> Built with React, TypeScript, React Flow, Zustand, Monaco Editor, AJV, and JSON Forms.

## Why this project?

Large JSON Schemas quickly become difficult to navigate as properties, definitions, references, composition branches, and conditional rules accumulate. This project turns those relationships into an explorable graph without giving up the portability of standard JSON Schema documents.

The graph is not tied to a UI library. A framework-independent `SchemaGraph` domain model sits between parsing and serialization, while React Flow is only its visual projection.

## Highlights

- Edit JSON Schema as source code or through a visual node inspector.
- Navigate schema structure as an interactive graph with pan, zoom, minimap, drag positioning, and automatic layout.
- Select a node to highlight its incoming and outgoing relations, parents, and children.
- Add, rename, and remove object properties after creation.
- Toggle the `required` flag on existing properties.
- Create definitions and local references while preserving stable node identities.
- Validate both the schema and live JSON instance data.
- Build a JSON Forms UI Schema visually and preview the generated form.
- Import and export standard JSON Schema documents.
- Convert between JSON Schema Draft 2020-12 and Draft-07.
- Preserve unknown keywords during graph round trips where possible.

## Supported JSON Schema features

### Structure and values

- Object, array, string, number, integer, boolean, null, and boolean schemas
- `properties`, `required`, `items`, `prefixItems`, `$defs`, and `definitions`
- `enum`, `const`, and common validation constraints
- Local, recursive, anchor-based, dynamic, and registered external references
- `$id`, `$anchor`, `$dynamicAnchor`, `$ref`, and `$dynamicRef`

### Composition and conditional schemas

- `allOf`, `anyOf`, and `oneOf`
- `not`
- `if`, `then`, and `else`
- `dependentSchemas` and Draft-07 schema dependencies

### Advanced behavior

- `contains`
- `unevaluatedItems` and `unevaluatedProperties`
- Draft-07 tuple `items` and `additionalItems`
- Draft-07 property dependencies

### Editable constraints

| Schema type | Supported constraints |
| --- | --- |
| String | `minLength`, `maxLength`, `pattern`, `format` |
| Number / integer | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |
| Array | `minItems`, `maxItems`, `uniqueItems` |
| Object | `minProperties`, `maxProperties`, `required` |
| General | `enum`, `const` |

Supported format assertions include `email`, `uri`, `uri-reference`, `uuid`, `date`, `date-time`, `time`, `ipv4`, `ipv6`, `hostname`, and `regex`.

## JSON Forms workspace

The JSON Forms workspace provides a visual editing experience for UI Schemas:

- Generate an implicit UI Schema or create an explicit one.
- Add and arrange `Control`, `VerticalLayout`, `HorizontalLayout`, `Group`, `Categorization`, `Category`, and `Label` elements.
- Drag schema properties into compatible layouts.
- Reorder and move UI elements while retaining stable internal IDs.
- Configure labels, renderer options, readonly behavior, and validation modes.
- Add `HIDE`, `SHOW`, `ENABLE`, and `DISABLE` rules.
- Preview forms with the official JSON Forms vanilla renderers.
- Register custom renderers and detail UI Schemas.
- Switch locales and use translation catalogs.
- Trace UI controls and rules back to their corresponding graph nodes.

UI Schema metadata and runtime configuration remain separate from the exported JSON Schema.

## Validation and diagnostics

The editor validates schema source and JSON instance data as you work:

- Monaco markers identify source errors and warnings.
- Graph cards display error and warning counts.
- Inspector diagnostics explain issues for the selected node.
- Validation results include schema and instance paths.
- Clicking a diagnostic focuses its related graph node or UI element.

Invalid source text remains in the editor but does not overwrite the last valid graph. Visual mutations are paused until blocking source errors are resolved.

## Supported dialects

- JSON Schema Draft 2020-12
- JSON Schema Draft-07

The dialect is detected from the root `$schema` value and can also be changed from the toolbar.

| Draft 2020-12 | Draft-07 |
| --- | --- |
| `$defs` | `definitions` |
| `dependentSchemas` | schema-form `dependencies` |
| `dependentRequired` | array-form `dependencies` |
| `prefixItems` | tuple-form `items` |
| trailing `items` | `additionalItems` |

Local JSON Pointer references are rewritten when a conversion or rename changes their targets.

## Getting started

### Requirements

- Node.js 20.19 or newer
- npm

### Install and run

```bash
git clone https://github.com/Giusnovetti/json-schema-editor.git
cd json-schema-editor
npm install
npm run dev
```

Vite will print the local development URL in the terminal.

### Production build

```bash
npm run build
```

The deployable static files are written to `dist/`.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run build` | Type-check and create a production build |
| `npm test` | Run the Vitest test suite once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Run the TypeScript project checks |

## Architecture

```text
JSON Schema source
        │
        ▼
Dialect detection and validation
        │
        ▼
   schemaToGraph()
        │
        ▼
   SchemaGraph domain model
      /       |        \
     /        |         \
React Flow  validator  graphToSchema()
projection                 │
                           ▼
                    Standard JSON Schema
```

The core parser, serializer, operations, reference resolver, dialect conversion, and validation logic have no dependency on React or React Flow. Zustand coordinates application state and synchronizes the source editor, graph, inspector, diagnostics, JSON Forms builder, and preview.

### Source layout

```text
src/
├── core/         # Domain model, parser, serializer, operations, validation
├── graph/        # React Flow projection, cards, and position management
├── inspector/    # Node, constraint, composition, and advanced editors
├── jsonforms/    # UI Schema builder, preview, rules, and extensibility
├── store/        # Application state and synchronization
├── validation/   # Instance editor and diagnostic interface
├── examples/     # Sample schema and instance data
├── App.tsx
└── SchemaCodeEditor.tsx
```

## Design decisions

- **Semantic model first:** React Flow nodes and edges are derived views, not persisted domain objects.
- **Stable identity:** Node IDs survive renames and pointer changes whenever the semantic node remains the same.
- **Safe synchronization:** Invalid JSON never silently replaces the last valid graph.
- **Non-destructive round trips:** Unsupported keywords are retained when possible.
- **No implicit network resolution:** External schemas must be registered explicitly.
- **Portable output:** Graph positions and UI-only metadata are not written into exported schemas.

## Quality

The project currently has **147 automated tests** covering parser/serializer round trips, graph operations, required-property editing, reference rewriting, validation, dialect conversion, composition, graph projection, position persistence, and JSON Forms integration.

Run the complete verification locally with:

```bash
npm run typecheck
npm test
npm run build
```

## Current limitations

- The built-in schema validator targets the features modeled by the editor rather than every keyword in every JSON Schema vocabulary.
- Dialect support is currently limited to Draft 2020-12 and Draft-07.
- External references are resolved only from explicitly registered resources; the editor does not fetch schemas from the network.
- Collaboration, version history, and multi-user editing are not included.

## Contributing

Issues and pull requests are welcome. For substantial changes, open an issue first to discuss the proposed behavior and its effect on schema round trips.

When contributing, make sure these commands pass:

```bash
npm run typecheck
npm test
npm run build
```

## Author

Created by [Giusnovetti](https://github.com/Giusnovetti).
