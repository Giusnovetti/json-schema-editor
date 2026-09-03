# JSON Schema Graph Builder — Requisiti di Progetto

## 1. Obiettivo del prodotto

Il sistema deve permettere di:

- creare un JSON Schema senza dover scrivere direttamente JSON;
- visualizzare uno schema esistente come **grafo navigabile**;
- modificare lo schema intervenendo sul grafo;
- mantenere sincronizzate rappresentazione visuale e rappresentazione JSON;
- comprendere rapidamente dipendenze, composizioni e riferimenti tra sottoschemi;
- validare lo schema durante la modifica;
- validare documenti JSON di esempio contro lo schema;
- importare ed esportare JSON Schema standard, senza introdurre un formato proprietario obbligatorio.

Principio fondamentale:

> **Graph → JSON Schema e JSON Schema → Graph devono essere trasformazioni reversibili**, nei limiti delle informazioni esclusivamente visuali come posizione, colore e stato di espansione dei nodi.

Come riferimento iniziale, il progetto dovrebbe supportare **JSON Schema Draft 2020-12**, mantenendo però un'architettura estensibile verso altri dialect e versioni.

---

## 2. Modello concettuale del grafo

Il grafo non deve rappresentare semplicemente l'AST del documento JSON.

Non deve quindi esistere necessariamente una corrispondenza 1:1 tra keyword JSON Schema e nodi del grafo.

Il sistema deve distinguere almeno tre concetti principali.

### 2.1 Schema Node

Uno **Schema Node** rappresenta uno schema o un subschema.

Esempio:

```json
{
  "type": "string",
  "minLength": 3,
  "maxLength": 50
}
```

deve essere rappresentato come un singolo nodo contenente:

```text
String
minLength: 3
maxLength: 50
```

e non come un nodo separato per ogni keyword.

### 2.2 Relation / Edge

Una relazione rappresenta un collegamento semantico tra due schema o subschema.

Esempio:

```json
{
  "type": "object",
  "properties": {
    "address": {
      "type": "object"
    }
  }
}
```

può essere rappresentato come:

```text
User ── property: address ──▶ Address
```

Il nome `address` appartiene alla relazione tra i due nodi.

### 2.3 Applicator / Composition Node

Operatori come:

- `allOf`
- `anyOf`
- `oneOf`
- `not`
- `if`
- `then`
- `else`

devono avere una rappresentazione visuale specifica, perché descrivono la composizione di più schemi.

Esempio:

```text
                 ┌──▶ Employee
Person ── allOf ─┤
                 └──▶ ManagerFields
```

---

## 3. Tipologie di relazione

Il modello interno deve distinguere almeno i seguenti tipi di edge:

```text
PROPERTY
PATTERN_PROPERTY
ADDITIONAL_PROPERTY

ITEM
PREFIX_ITEM
CONTAINS

REF
DYNAMIC_REF

ALLOF
ANYOF
ONEOF
NOT

IF
THEN
ELSE

DEPENDENT_SCHEMA

PROPERTY_NAME
UNEVALUATED_PROPERTIES
UNEVALUATED_ITEMS

DEFINITION
```

Le relazioni devono conservare la loro semantica e non essere trattate come semplici collegamenti grafici.

Il modello deve supportare cicli, poiché JSON Schema può contenere riferimenti ricorsivi.

---

## 4. Identità dei nodi

Ogni nodo deve avere un identificatore interno stabile e indipendente dalla posizione dello schema nel documento JSON.

Esempio:

```ts
type SchemaNodeId = string;
```

Un nodo può mantenere informazioni come:

```json
{
  "nodeId": "n_123",
  "schemaPointer": "#/$defs/Address"
}
```

Il `nodeId` deve rimanere stabile anche quando cambia il JSON Pointer.

Per ogni nodo devono poter essere memorizzati almeno:

- `nodeId`;
- `schemaPointer`;
- `$id`;
- `$anchor`;
- `$dynamicAnchor`;
- `title`;
- `description`;
- `type`;
- constraints;
- annotations;
- metadata visuali.

---

## 5. Gestione di `$ref` e dipendenze

Il builder deve supportare:

- `$ref` locale;
- `$ref` verso `$defs`;
- `$ref` verso schema esterno;
- URI assoluti;
- URI relativi;
- JSON Pointer;
- `$anchor`;
- `$dynamicRef`;
- `$dynamicAnchor`;
- riferimenti ricorsivi;
- riferimenti circolari;
- rilevamento dei riferimenti non risolti.

Deve esistere un sottosistema dedicato alla risoluzione dei riferimenti.

Esempio concettuale:

```text
ReferenceResolver

resolve(ref, context)
    ↓
ResolvedSchema
UnresolvedSchema
ExternalSchema
CircularReference
```

La risoluzione deve tenere conto della base URI corrente e dell'effetto di `$id`.

---

## 6. Gestione di `$defs`

`$defs` deve avere una rappresentazione di primo livello nell'interfaccia.

Esempio:

```text
Definitions

Address
Money
Country
Person
Product
```

Gli schema presenti in `$defs` devono poter essere riutilizzati tramite drag & drop o operazioni equivalenti.

Esempio:

trascinando `Address` dentro `Customer.billingAddress`, il sistema può generare:

```json
{
  "$ref": "#/$defs/Address"
}
```

Il sistema deve consentire di:

- creare definizioni;
- rinominare definizioni;
- eliminare definizioni;
- trovare tutti gli utilizzi di una definizione;
- convertire un subschema inline in una definizione;
- reintegrare una definizione inline.

---

## 7. Editor dei nodi

La selezione di un nodo deve mostrare un inspector contestuale.

Esempio:

```text
┌─────────────────────────────┐
│ Customer                    │
│                             │
│ Type        Object          │
│ Title       Customer        │
│ Description ...             │
│                             │
│ Properties                  │
│ ☑ id       string           │
│ ☑ name     string           │
│ ☐ age      integer          │
│                             │
│ + Property                  │
└─────────────────────────────┘
```

Il simbolo `☑` può rappresentare una property presente in `required`.

### 7.1 String

L'inspector deve supportare almeno:

- `minLength`;
- `maxLength`;
- `pattern`;
- `format`;
- `contentEncoding`;
- `contentMediaType`.

### 7.2 Number / Integer

L'inspector deve supportare almeno:

- `minimum`;
- `maximum`;
- `exclusiveMinimum`;
- `exclusiveMaximum`;
- `multipleOf`.

### 7.3 Array

L'inspector deve supportare almeno:

- `items`;
- `prefixItems`;
- `contains`;
- `minItems`;
- `maxItems`;
- `uniqueItems`;
- `minContains`;
- `maxContains`.

### 7.4 Object

L'inspector deve supportare almeno:

- `properties`;
- `required`;
- `additionalProperties`;
- `patternProperties`;
- `propertyNames`;
- `minProperties`;
- `maxProperties`;
- `dependentRequired`;
- `dependentSchemas`;
- `unevaluatedProperties`.

### 7.5 Keyword generali

Il builder deve supportare almeno:

- `enum`;
- `const`;
- `default`;
- `examples`;
- `title`;
- `description`;
- `deprecated`;
- `readOnly`;
- `writeOnly`.

---

## 8. Creazione visuale

L'utente deve poter creare almeno i seguenti tipi di nodo o schema:

```text
+ Object
+ Array
+ String
+ Number
+ Integer
+ Boolean
+ Null
+ Enum
+ Reference
+ Composition
```

Il sistema deve consentire operazioni visuali come:

```text
trascinare nodo → property
trascinare nodo → array items
trascinare nodo → allOf
trascinare nodo → oneOf
trascinare definition → $ref
```

Esempio:

```text
[ Object: Customer ]

 + Add property
      │
      ├── name → String
      ├── age → Integer
      └── address → Object
```

---

## 9. Composizione

Il builder deve trattare `allOf`, `anyOf`, `oneOf` e `not` come elementi semanticamente riconoscibili.

Esempio:

```text
                     ┌─▶ CreditCard
Payment ── oneOf ────┼─▶ BankTransfer
                     └─▶ PayPal
```

Le condizioni devono essere rappresentabili visivamente.

Esempio:

```text
           ┌── if ───▶ Country = US
Address ───┼── then ─▶ USAddress
           └── else ─▶ InternationalAddress
```

---

## 10. Sincronizzazione JSON ↔ Graph

Il builder deve offrire una modalità di lavoro combinata tra grafo e codice.

Esempio:

```text
┌─────────────────┬─────────────────────────┐
│     GRAPH       │        JSON             │
│                 │                         │
│ Customer        │ {                       │
│   │             │   "type": "object",     │
│   ├── name      │   "properties": {...}   │
│   └── address   │ }                       │
└─────────────────┴─────────────────────────┘
```

Requisiti:

- modifica del grafo → aggiornamento del JSON;
- modifica del JSON → aggiornamento del grafo;
- evidenziazione del JSON relativo al nodo selezionato;
- selezione di una porzione JSON → focus sul nodo corrispondente;
- parsing con errori non distruttivi;
- preservazione, dove possibile, di keyword sconosciute o custom;
- nessuna perdita silenziosa di dati durante import/export.

---

## 11. Validazione dello schema

Il sistema deve distinguere tra validazione dello schema e validazione delle istanze.

### 11.1 Schema validation

Il JSON Schema deve poter essere validato rispetto al relativo meta-schema.

Esempio:

```text
Schema valid ✓
```

oppure:

```text
Customer.age
minimum expects number
```

Gli errori devono essere associati, quando possibile, ai nodi corrispondenti nel grafo.

### 11.2 Instance validation

L'utente deve poter inserire un documento JSON di esempio.

Esempio:

```json
{
  "name": "Mario",
  "age": -5
}
```

Il builder deve mostrare errori di validazione come:

```text
❌ Customer.age
minimum: 0
received: -5
```

Il nodo interessato deve essere evidenziato nel grafo.

---

## 12. Diagnostics strutturali

Oltre agli errori formali previsti dalla specifica, il builder dovrebbe rilevare situazioni potenzialmente problematiche.

Esempi:

- unresolved reference;
- unused `$defs`;
- circular dependency;
- duplicate `$id`;
- duplicate `$anchor`;
- impossible constraint;
- contradictory `allOf`;
- empty `oneOf`;
- reference to missing definition;
- deep dependency chain;
- potentially ambiguous `oneOf`.

Il sistema deve distinguere almeno:

- error;
- warning;
- info.

---

## 13. Navigazione dei grafi grandi

Il builder deve essere utilizzabile anche con schema complessi.

Deve supportare almeno:

- zoom;
- pan;
- fit-to-screen;
- minimap;
- ricerca;
- focus su nodo;
- breadcrumb;
- collapse subtree;
- expand subtree;
- hide primitive nodes;
- hide reference edges;
- show dependencies only;
- show selected neighborhood.

Deve essere possibile isolare le dipendenze di uno specifico nodo.

Esempio:

```text
Show dependencies of Customer
```

---

## 14. Layout

Il builder dovrebbe supportare più strategie di layout:

- hierarchical;
- left-to-right;
- top-to-bottom;
- force-directed;
- manual.

Le coordinate e gli altri metadata visuali devono essere salvati separatamente dal JSON Schema.

Esempio:

```json
{
  "nodeLayouts": {
    "n_123": {
      "x": 520,
      "y": 180
    }
  }
}
```

In questo modo il JSON Schema esportato rimane standard.

---

## 15. Import / Export

### 15.1 Input

Il sistema deve supportare almeno:

- JSON Schema file;
- JSON Schema incollato;
- schema multipli;
- bundle di schema.

In una fase successiva può supportare:

- import da URL;
- registry di schema;
- repository remoti.

### 15.2 Output

Il sistema deve supportare almeno:

- JSON Schema;
- pretty JSON;
- minified JSON;
- schema bundle.

Funzionalità future possibili:

- TypeScript types;
- OpenAPI schema;
- sample JSON;
- documentazione.

Queste funzionalità non sono necessarie per l'MVP.

---

## 16. Dialect e versioni

L'architettura non deve essere rigidamente legata a Draft 2020-12.

Deve esistere un concetto equivalente a:

```ts
interface SchemaDialect {
  id: string;
  keywords: KeywordDefinition[];
  validators: Validator[];
  applicators: ApplicatorDefinition[];
}
```

In futuro devono poter essere supportati:

```text
Draft 2020-12
Draft 2019-09
Draft-07
Custom dialect
```

Le keyword supportate e la loro semantica devono dipendere dal dialect selezionato.

---

## 17. Modello interno suggerito

Una possibile struttura del dominio è:

```text
SchemaDocument
│
├── SchemaResource
│      $id
│      dialect
│
├── SchemaNode[]
│      id
│      type
│      keywords
│      annotations
│
├── SchemaEdge[]
│      source
│      target
│      relation
│      metadata
│
└── GraphMetadata
       position
       collapsed
       color
       groups
```

Una relazione può essere modellata come:

```ts
interface SchemaEdge {
  id: string;
  source: NodeId;
  target: NodeId;

  relation:
    | "property"
    | "items"
    | "ref"
    | "allOf"
    | "anyOf"
    | "oneOf"
    | "if"
    | "then"
    | "else";

  key?: string;
  index?: number;
}
```

La separazione tra **schema semantico** e **layout del grafo** è un requisito architetturale fondamentale.

---

## 18. Undo / Redo e operazioni atomiche

Ogni modifica dovrebbe essere rappresentata come un'operazione atomica.

Esempi:

```text
AddNode
DeleteNode
AddProperty
RemoveProperty
ChangeConstraint
CreateReference
MoveNode
ExtractDefinition
InlineDefinition
```

Questo modello deve rendere possibile:

- undo;
- redo;
- history;
- autosave;
- eventuale collaborazione futura;
- eventuale supporto a CRDT o sistemi multiplayer.

---

## 19. Refactoring visuali

Il builder dovrebbe offrire refactoring specifici per JSON Schema.

### 19.1 Extract to `$defs`

Da:

```text
Customer
 └── address → Object
```

a:

```text
Customer ── $ref ──▶ Address

$defs
  └── Address
```

### 19.2 Operazioni supportate

Il sistema dovrebbe poter offrire:

- Extract to `$defs`;
- Inline `$ref`;
- Rename definition;
- Move to `$defs`;
- Duplicate schema;
- Convert property to `$ref`;
- Find usages;
- Replace references.

Esempio di `Find usages`:

```text
Address

Referenced by:
→ Customer.billingAddress
→ Customer.shippingAddress
→ Company.registeredAddress
→ Order.deliveryAddress
```

---

## 20. Requisiti dell'MVP

### MVP 1 — Core Graph

Supportare:

```text
Import JSON Schema
Export JSON Schema

Object
Array
String
Number
Integer
Boolean
Null

properties
required
items

$defs
$ref

Graph navigation
Node inspector

JSON ↔ Graph synchronization
```

### MVP 2 — Validation

Aggiungere:

```text
constraints
enum / const
format

schema validation
instance validation

error highlighting
```

### MVP 3 — Composition

Aggiungere:

```text
allOf
anyOf
oneOf
not

if
then
else

dependentSchemas
```

### MVP 4 — Advanced JSON Schema

Aggiungere:

```text
$id
$anchor
$dynamicRef
$dynamicAnchor

prefixItems
contains

unevaluatedProperties
unevaluatedItems

external references
multiple schema resources
dialects
```

### MVP 5 — Developer Tooling

Aggiungere:

```text
refactoring
find usages
dependency analysis
schema diff
documentation generation
versioning
collaboration
```

---

## 21. Principio di design fondamentale

Il progetto deve esplicitamente adottare il seguente principio:

> **Non esiste una corrispondenza 1:1 tra keyword JSON Schema e nodi del grafo.**

Esempio:

```json
{
  "type": "string",
  "minLength": 3,
  "maxLength": 30
}
```

deve essere rappresentato come **un nodo con attributi**.

Mentre:

```json
{
  "$ref": "#/$defs/User"
}
```

deve creare **una relazione verso un altro nodo**.

E:

```json
{
  "oneOf": [...]
}
```

deve creare **una relazione o struttura di composizione tra più sottoschemi**.

Lo scopo è evitare una rappresentazione puramente sintattica del tipo:

```text
User
 │
 ├─ type
 │   └─ object
 ├─ properties
 │   └─ ...
 ├─ required
 │   └─ ...
```

che sarebbe di fatto un AST visuale e non un grafo semantico.

---

## 22. Modello concettuale finale

La struttura generale del grafo può essere riassunta come:

```text
              ┌────────────┐
              │   Schema   │
              │    Node    │
              └─────┬──────┘
                    │
        ┌───────────┼────────────┐
        │           │            │
   containment   reference   composition
        │           │            │
        ▼           ▼            ▼

   property       $ref          oneOf
   items          $dynamicRef   allOf
   contains                     anyOf
   ...                          if/then/else
```

Il grafo deve quindi rappresentare la **semantica dello schema**, mentre il documento JSON rimane la serializzazione standard dello stesso modello.

---

## 23. Passi successivi consigliati

Prima di scegliere la tecnologia UI o la libreria per il rendering del grafo, è consigliabile definire formalmente:

1. `SchemaGraph`;
2. `SchemaNode`;
3. `SchemaEdge`;
4. tipi di relazione;
5. invariant del modello;
6. operazioni atomiche;
7. algoritmo `JSON Schema → Graph`;
8. algoritmo `Graph → JSON Schema`;
9. strategia di risoluzione dei riferimenti;
10. gestione dei dialect.

Solo dopo questa fase sarà opportuno valutare tecnologie di rendering e layout come React Flow, Cytoscape, ELK o alternative equivalenti.
