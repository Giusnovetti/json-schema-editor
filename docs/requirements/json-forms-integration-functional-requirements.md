# JSON Schema Graph Builder — Requisiti funzionali per integrazione JSON Forms

**Stato:** proposta requisiti  
**Contesto:** integrazione successiva a MVP4 e precedente a MVP5  
**Base documentale:** documentazione ufficiale JSON Forms consultata ad agosto 2026  
**Target applicativo:** JSON Schema Graph Builder React/TypeScript

---

## 1. Obiettivo dell'integrazione

L'integrazione JSON Forms deve estendere il JSON Schema Graph Builder da editor visuale di JSON Schema a ambiente per:

1. progettare il **modello dati** tramite JSON Schema;
2. progettare la **presentazione del form** tramite JSON Forms UI Schema;
3. visualizzare in tempo reale il form risultante;
4. modificare dati di esempio attraverso il form;
5. verificare validazione, visibilità, abilitazione e comportamento dinamico;
6. esportare/importare JSON Schema, UI Schema e dati senza introdurre formati proprietari obbligatori.

JSON Forms utilizza due artefatti distinti:

- **JSON Schema**, che descrive i dati;
- **UI Schema**, che descrive come i dati vengono presentati nel form.

Il prodotto deve mantenere questa separazione concettuale anche nel proprio modello interno.

---

## 2. Principi funzionali

### RF-001 — Separazione tra JSON Schema e UI Schema

Il sistema deve gestire il JSON Schema e la JSON Forms UI Schema come due documenti distinti.

Il JSON Schema non deve essere modificato implicitamente quando l'utente cambia esclusivamente aspetti di layout o rendering della UI Schema.

### RF-002 — Collegamento semantico tramite `scope`

Ogni elemento UI di tipo `Control` deve poter essere collegato a un nodo o subschema del JSON Schema tramite il relativo `scope`.

Esempio:

```json
{
  "type": "Control",
  "scope": "#/properties/name"
}
```

Il builder deve risolvere visualmente tale `scope` verso il nodo corrispondente dello Schema Graph.

### RF-003 — Identità stabile degli elementi UI

Ogni elemento della UI Schema deve possedere un identificatore interno stabile, indipendente dalla sua posizione nell'array `elements`.

L'identificatore interno non deve essere serializzato nella UI Schema standard, salvo scelta esplicita di un formato di progetto separato.

---

## 3. Modello funzionale della UI Schema

### RF-010 — UI Schema Document

Il sistema deve introdurre un modello interno equivalente a:

```text
UISchemaDocument
│
├── UISchemaElement[]
├── UISchemaRelation[]
└── UISchemaMetadata
       position
       collapsed
       selected
```

I metadata grafici devono restare separati dalla UI Schema esportata.

### RF-011 — Tipi di elementi UI supportati

Il builder deve supportare almeno:

- `Control`;
- `VerticalLayout`;
- `HorizontalLayout`;
- `Group`;
- `Categorization`;
- `Category`;
- `Label`.

### RF-012 — Gerarchia `elements`

Gli elementi layout devono poter contenere altri elementi UI tramite `elements`.

Il builder deve preservare l'ordine degli elementi figli e aggiornare tale ordine dopo il riordinamento visuale.

### RF-013 — Layout annidati

Il sistema deve consentire layout annidati.

Esempio:

```text
VerticalLayout
├── Control: name
├── HorizontalLayout
│   ├── Control: birthDate
│   └── Control: age
└── Group: Address
    ├── Control: street
    └── Control: city
```

---

## 4. Visual UI Schema Builder

### RF-020 — Modalità UI Schema

L'applicazione deve introdurre una modalità dedicata alla progettazione del form con almeno:

- struttura UI Schema;
- riferimenti verso lo Schema Graph;
- inspector dell'elemento selezionato;
- preview JSON Forms.

### RF-021 — Creazione di Control da Schema Graph

L'utente deve poter creare un `Control` a partire da una property dello Schema Graph.

L'operazione deve generare automaticamente lo `scope` corretto.

### RF-022 — Drag & drop Schema → UI Schema

Il sistema dovrebbe consentire di trascinare una property dello Schema Graph dentro un layout UI, creando un `Control` con `scope` verso la property trascinata.

### RF-023 — Creazione dei layout

L'utente deve poter creare visualmente:

```text
Vertical Layout
Horizontal Layout
Group
Categorization
Category
```

### RF-024 — Riordinamento

L'utente deve poter:

- spostare un elemento nello stesso layout;
- spostarlo tra layout differenti;
- cambiare l'ordine dei Control;
- spostare layout annidati.

### RF-025 — Group

Per un elemento `Group` il builder deve consentire almeno:

- modifica di `label`;
- modifica dell'eventuale chiave i18n;
- gestione degli `elements`;
- configurazione di una rule.

### RF-026 — Categorization

Il builder deve supportare `Categorization` come contenitore di `Category`.

Ogni `Category` deve supportare:

- `label`;
- elementi figli;
- eventuale i18n;
- eventuale rule.

### RF-027 — Label

Il builder deve permettere di inserire elementi UI di tipo `Label` come testo non associato a un input.

---

## 5. Control Inspector

### RF-030 — Scope

Per ogni `Control` deve essere possibile:

- vedere lo `scope`;
- selezionare il target tramite Schema Graph;
- modificare manualmente lo scope;
- navigare dal Control al nodo JSON Schema;
- rilevare uno scope non risolvibile.

### RF-031 — Label

Ogni Control deve supportare:

```text
label = string
label = false
label non specificata
```

### RF-032 — Options

Ogni Control deve supportare una proprietà `options`.

Il builder deve offrire:

1. un editor strutturato per le opzioni note;
2. un editor JSON avanzato per opzioni renderer-specific non modellate.

Le opzioni sconosciute devono essere preservate durante il round-trip.

### RF-033 — Options per array

Per i Control associati ad array, l'inspector deve supportare almeno:

- `detail`;
- `showSortButtons`;
- `elementLabelProp`.

Per `detail` devono essere supportati:

- `DEFAULT`;
- `GENERATED`;
- `REGISTERED`;
- UI Schema inline.

### RF-034 — Format UI

Per i Control stringa deve essere possibile configurare tramite UI Schema il `format` del renderer quando supportato, almeno:

```text
date
time
date-time
```

La modifica dell'opzione UI non deve necessariamente modificare il `format` del JSON Schema.

### RF-035 — Readonly per elemento

Ogni Control deve poter essere configurato come readonly attraverso le opzioni UI Schema.

Il builder deve distinguere tra:

- `readOnly` nel JSON Schema;
- readonly nella UI Schema;
- readonly globale del form.

---

## 6. Generazione automatica della UI Schema

### RF-040 — Generate default UI Schema

Il sistema deve poter generare automaticamente una UI Schema a partire dal JSON Schema corrente.

### RF-041 — UI Schema assente

Quando nessuna UI Schema è disponibile, il preview deve poter utilizzare il comportamento JSON Forms di generazione automatica.

L'interfaccia deve distinguere tra:

- UI Schema generata implicitamente;
- UI Schema esplicitamente salvata.

### RF-042 — Materializzazione

L'utente deve poter trasformare una UI Schema generata implicitamente in una UI Schema esplicita modificabile e salvabile.

---

## 7. Rules

### RF-050 — Rule editor

Qualunque elemento UI compatibile deve poter avere una `rule`.

Il builder deve supportare i quattro effetti JSON Forms:

```text
HIDE
SHOW
ENABLE
DISABLE
```

### RF-051 — Rule condition

La condizione deve supportare:

```json
{
  "scope": "#/properties/...",
  "schema": {}
}
```

Lo `schema` della condizione deve essere un normale JSON Schema.

### RF-052 — Editor visuale della condizione

Il builder deve consentire di definire la condizione usando le funzionalità già disponibili nel JSON Schema builder.

Esempio:

```text
Show "companyName"
WHEN
#/properties/accountType
matches
{ "const": "business" }
```

### RF-053 — Rule scope

Lo scope della condizione deve poter puntare:

- a una property;
- a un nodo annidato;
- alla root `#`.

### RF-054 — `failWhenUndefined`

L'editor deve supportare:

```json
"failWhenUndefined": true
```

### RF-055 — Preview delle rule

Le rule devono essere eseguite nel preview usando i dati correnti.

Una modifica ai dati di preview deve aggiornare immediatamente visibilità e enabled/disabled state.

---

## 8. Form Preview

### RF-060 — Preview embedded

Il sistema deve incorporare un'istanza JSON Forms per visualizzare il form prodotto dal JSON Schema e dalla UI Schema correnti.

### RF-061 — Aggiornamento live

Il preview deve aggiornarsi quando cambia:

- JSON Schema;
- UI Schema;
- form data;
- renderer configuration;
- readonly;
- validation mode.

### RF-062 — Form data

Il progetto deve gestire un documento JSON separato di dati di preview.

L'utente deve poter:

- modificarlo tramite il form;
- modificarlo tramite editor JSON;
- resettarlo;
- importarlo;
- esportarlo.

### RF-063 — Sincronizzazione bidirezionale dei dati

Una modifica tramite un Control JSON Forms deve aggiornare l'editor dei dati.

Una modifica valida nell'editor JSON deve aggiornare il form.

### RF-064 — onChange

Il builder deve intercettare gli aggiornamenti emessi da JSON Forms e rendere disponibili almeno:

- nuovo `data`;
- validation errors correnti.

### RF-065 — Stato iniziale

Il preview deve mostrare anche gli errori prodotti dalla validazione iniziale, senza richiedere una modifica preventiva.

---

## 9. Validation

### RF-070 — Validazione JSON Forms

Il preview deve utilizzare la validazione compatibile con JSON Forms/AJV.

### RF-071 — Validation Mode

L'utente deve poter scegliere:

```text
ValidateAndShow
ValidateAndHide
NoValidation
```

### RF-072 — Error list

Gli errori emessi da JSON Forms devono essere visibili in una lista diagnostics.

Per ogni errore, quando possibile, devono essere mostrati:

- `instancePath`;
- `schemaPath`;
- keyword;
- messaggio;
- Control interessato;
- nodo dello Schema Graph interessato.

### RF-073 — Navigazione dagli errori

Cliccando un errore l'applicazione dovrebbe poter:

- selezionare il Control corrispondente;
- selezionare il nodo JSON Schema corrispondente;
- evidenziare il campo nel preview.

### RF-074 — Additional errors

Il preview deve poter ricevere errori esterni compatibili con `additionalErrors` per simulare errori provenienti da backend o business validation.

### RF-075 — Custom AJV

L'integrazione deve permettere di utilizzare un'istanza AJV configurata dal progetto al posto dell'istanza di default JSON Forms.

Il sistema deve evitare, per quanto possibile, risultati differenti tra validation panel del builder e validation del form JSON Forms.

---

## 10. Renderer Set

### RF-080 — Renderer registry

L'integrazione deve trattare il renderer set come configurazione esplicita del preview.

### RF-081 — Renderer set di default

Deve essere configurato almeno un renderer set React ufficialmente supportato da JSON Forms.

La scelta del renderer set deve essere separata dal documento UI Schema.

### RF-082 — Renderer switching

L'architettura funzionale dovrebbe consentire, senza cambiare JSON Schema o UI Schema, di visualizzare il form con renderer set differenti quando disponibili.

### RF-083 — Feature compatibility

Il builder deve poter segnalare quando una configurazione UI Schema non è supportata dal renderer set selezionato.

### RF-084 — Preview di enum e choice

Il preview deve supportare le modalità previste dal renderer per:

- `enum`;
- `oneOf` con coppie `title` / `const`;
- selezione multipla su array quando supportata.

---

## 11. Custom Renderers

### RF-090 — Custom renderer registry

Il progetto deve prevedere un registro di custom renderer JSON Forms.

Ogni entry deve poter associare:

- renderer;
- tester;
- rank/priorità;
- identificatore leggibile;
- eventuali metadata di configurazione.

### RF-091 — Tester visibility

Il builder dovrebbe poter mostrare, in modalità diagnostica, quale renderer viene selezionato per un Control e con quale priorità.

### RF-092 — Renderer override

Un custom renderer deve poter avere priorità maggiore rispetto a un renderer standard quando il relativo tester restituisce un rank più alto.

### RF-093 — Custom layout renderer

La stessa infrastruttura deve poter supportare custom renderer per elementi layout.

### RF-094 — Preservazione delle options custom

La UI Schema deve preservare opzioni utilizzate da custom renderer anche quando il builder non ne conosce la semantica.

---

## 12. Configurazione e renderer dinamici

### RF-100 — Configuration

Il preview deve poter ricevere una configurazione globale equivalente alla `config` di JSON Forms.

Devono essere supportate almeno le opzioni documentate:

- `restrict`;
- `trim`;
- `showUnfocusedDescription`;
- `hideRequiredAsterisk`.

### RF-101 — Precedenza options

L'interfaccia deve rendere evidente che le `options` definite direttamente sull'elemento UI possono avere precedenza rispetto alla configurazione globale.

### RF-102 — Dynamic renderer readiness

Il modello di integrazione non deve impedire l'uso di renderer che ottengono dati dinamici da API o React Context.

Il builder non deve tentare di serializzare nella UI Schema lo stato runtime del renderer.

---

## 13. UI Schema registry per dettagli annidati

### RF-110 — Registered UI Schemas

Il progetto deve prevedere la possibilità di registrare UI Schema secondarie associate a tester.

### RF-111 — Array/Object detail

Una UI Schema registrata deve poter essere utilizzata nella resa dettagliata di array/object quando JSON Forms richiede una UI Schema specifica.

### RF-112 — Gestione documenti multipli

Il progetto deve poter conservare:

```text
Main UI Schema
Registered UI Schema 1
Registered UI Schema 2
...
```

---

## 14. Ref resolving

### RF-120 — Riferimenti locali

Il preview deve funzionare con i `$ref` locali risolvibili direttamente da JSON Forms.

### RF-121 — Riferimenti complessi o esterni

Quando il JSON Schema contiene riferimenti complessi o esterni, il builder deve poter passare al preview uno schema precedentemente risolto/dereferenziato dal resolver del progetto.

### RF-122 — Nessuna alterazione dell'originale

La risoluzione necessaria per il preview non deve sostituire o perdere il JSON Schema sorgente originale.

Il progetto dovrebbe distinguere:

```text
Source Schema
Resolved Preview Schema
```

### RF-123 — Diagnostics di reference

Se il preview non può essere costruito a causa di riferimenti non risolti, il sistema deve mostrare una diagnostica esplicita.

---

## 15. Sincronizzazione Schema Graph ↔ UI Schema

### RF-130 — Rename propagation

Quando viene rinominata una property nel JSON Schema, il builder deve aggiornare gli `scope` della UI Schema che puntano alla property rinominata.

Tutti i Control e le rule interessate devono essere aggiornati.

### RF-131 — Move propagation

Quando un nodo JSON Schema viene spostato e cambia JSON Pointer, il sistema deve aggiornare gli scope UI collegati quando il mapping è deterministico.

### RF-132 — Delete diagnostics

Se viene eliminato un nodo referenziato dalla UI Schema, il sistema non deve eliminare silenziosamente gli elementi UI correlati.

Deve invece:

1. marcare gli scope come unresolved;
2. mostrare una diagnostica;
3. permettere all'utente di ricollegare o eliminare il Control.

### RF-133 — Find usages

Dal nodo Schema Graph deve essere possibile individuare gli utilizzi nella UI Schema:

```text
Used by:
→ Control "First name"
→ Rule condition of "Company name"
→ Registered detail UI Schema
```

---

## 16. UI Schema Code Editor

### RF-140 — Editor JSON

Il sistema deve offrire un editor JSON dedicato alla UI Schema.

### RF-141 — Sincronizzazione visuale ↔ codice

Le modifiche visuali devono aggiornare il JSON della UI Schema.

Le modifiche JSON valide devono aggiornare il visual UI Schema builder.

### RF-142 — Parse error non distruttivi

In presenza di JSON sintatticamente invalido:

- il testo deve essere preservato;
- l'ultima UI Schema valida deve restare disponibile;
- il preview non deve usare dati parzialmente parsati.

### RF-143 — Unknown elements/options

Elementi e proprietà UI Schema non riconosciuti devono essere preservati quando possibile e segnalati come non modellati, non eliminati silenziosamente.

---

## 17. Import / Export

### RF-150 — Import UI Schema

Il sistema deve permettere l'import di una UI Schema JSON esistente.

### RF-151 — Export UI Schema

Il sistema deve esportare una UI Schema standard utilizzabile direttamente da JSON Forms.

### RF-152 — Export package

Il progetto dovrebbe permettere di esportare almeno:

```text
schema.json
uischema.json
data.json
```

### RF-153 — Project metadata

Posizioni dei nodi, stato di collapse, selezioni e altre informazioni del builder devono essere salvate separatamente dai file JSON Forms standard.

---

## 18. i18n

### RF-160 — i18n configuration

L'integrazione deve prevedere un meccanismo per fornire a JSON Forms una funzione di traduzione.

### RF-161 — Preview locale

L'utente deve poter cambiare locale nel preview senza modificare JSON Schema o UI Schema.

### RF-162 — Traduzione di label e description

Il preview deve poter utilizzare le chiavi di traduzione derivate dal path della property, da eventuali chiavi `i18n` e dalle label UI.

### RF-163 — Error translation

Il sistema deve consentire la personalizzazione/localizzazione dei messaggi di validazione.

### RF-164 — Enum translation

Devono poter essere testate traduzioni degli elementi:

- `enum`;
- `oneOf` usato come enum tramite `title`/`const`.

### RF-165 — UI Schema translation

Il preview deve supportare la traduzione degli elementi UI Schema previsti da JSON Forms, inclusi almeno Group, Category e Label.

---

## 19. Readonly

### RF-170 — Readonly globale

Il preview deve avere un toggle per attivare `readonly` sull'intero form.

### RF-171 — Origine dello stato readonly

L'inspector dovrebbe indicare perché un campo risulta non modificabile:

```text
JSON Schema readOnly
UI Schema option
Global readonly
Rule DISABLE
```

---

## 20. Middleware

### RF-180 — Middleware registration

L'integrazione deve consentire opzionalmente di fornire middleware JSON Forms al preview.

### RF-181 — Stato runtime separato

Le trasformazioni runtime eseguite dal middleware non devono essere confuse con modifiche strutturali al JSON Schema o alla UI Schema.

### RF-182 — Debug events

In modalità sviluppo dovrebbe essere possibile osservare gli eventi principali:

```text
INIT
UPDATE_CORE
UPDATE_DATA
```

---

## 21. Diagnostics specifiche JSON Forms

### RF-190 — Unresolved Control scope

Segnalare un errore quando un `Control.scope` non punta a uno schema risolvibile.

### RF-191 — Unresolved Rule scope

Segnalare un errore quando `rule.condition.scope` non è risolvibile.

### RF-192 — Invalid layout child

Segnalare elementi non validi rispetto alla struttura del layout, ad esempio una `Categorization` contenente figli incompatibili.

### RF-193 — Missing required UI property

Segnalare proprietà UI obbligatorie mancanti, ad esempio:

```text
Control senza scope
Group senza label
layout senza elements
```

### RF-194 — Renderer unavailable

Segnalare quando nessun renderer registrato è applicabile a un elemento.

### RF-195 — Unsupported renderer option

Il builder dovrebbe poter segnalare una option nota ma incompatibile con il renderer set selezionato.

---

## 22. Modalità di lavoro proposta

L'interfaccia dovrebbe permettere almeno quattro viste coordinate:

```text
┌───────────────────────┐
│ Schema Graph          │
├───────────────────────┤
│ UI Schema Builder     │
├───────────────────────┤
│ Form Preview          │
├───────────────────────┤
│ JSON / Diagnostics    │
└───────────────────────┘
```

### RF-200 — Cross-selection

Selezionando un Control deve essere possibile evidenziare:

1. elemento UI Schema;
2. nodo JSON Schema referenziato;
3. campo corrispondente nel preview.

### RF-201 — Reverse selection

Selezionando un nodo JSON Schema deve essere possibile mostrare tutti i Control che lo utilizzano.

---

## 23. Requisiti di round-trip

### RF-210 — UI Schema round-trip

Per una UI Schema supportata deve valere:

```text
UI Schema
   ↓
Internal model
   ↓
UI Schema
```

senza perdita semantica.

### RF-211 — Preservazione unknown options

Le `options` non conosciute devono essere preservate.

### RF-212 — Ordine

L'ordine di `elements`, Category e altri elementi ordinati deve essere preservato.

### RF-213 — JSON Schema independence

Il round-trip della UI Schema non deve cambiare il JSON Schema.

---

## 24. Criteri di accettazione principali

### AC-01 — Form base

Dato un JSON Schema object con property primitive, l'utente può generare una UI Schema, vedere il form e modificare i dati.

### AC-02 — Layout

L'utente può organizzare Control tramite VerticalLayout, HorizontalLayout e Group e osservare immediatamente il nuovo layout.

### AC-03 — Categorization

L'utente può creare categorie e ottenere una UI organizzata in categorie/tab secondo il renderer.

### AC-04 — Scope

Un Control creato da una property contiene lo scope corretto e naviga al relativo nodo Schema Graph.

### AC-05 — Rename

Rinominando una property, gli scope collegati vengono aggiornati automaticamente.

### AC-06 — Rule

Un Control può essere nascosto o disabilitato in base al valore di un'altra property tramite rule.

### AC-07 — Validation

Inserendo un dato invalido nel preview, l'errore viene mostrato sia da JSON Forms sia nel pannello diagnostics.

### AC-08 — Validation modes

I tre validation mode producono il comportamento previsto.

### AC-09 — Array

Un Control array può usare almeno le opzioni `detail` e `showSortButtons` quando supportate dal renderer.

### AC-10 — Enum

Un enum JSON Schema viene visualizzato tramite un renderer di selezione compatibile.

### AC-11 — Date/time

Una property stringa configurata con `date`, `time` o `date-time` viene visualizzata con il renderer appropriato quando supportato.

### AC-12 — Readonly

È possibile rendere readonly un singolo Control oppure tutto il form.

### AC-13 — Import/export

Una coppia `schema.json` + `uischema.json` importata può essere modificata e riesportata senza perdita delle proprietà supportate.

### AC-14 — Custom renderer

Un renderer custom registrato con tester di rank superiore può sostituire quello standard nel preview.

### AC-15 — External refs

Uno schema con riferimenti complessi già risolti dal resolver del progetto può essere passato al preview senza modificare il source schema.

---

## 25. Priorità suggerita

### Fase JF-1 — Core integration

```text
JSON Forms React integration
Form Preview
data editor
UI Schema import/export
default UI Schema generation
Control
VerticalLayout
HorizontalLayout
Group
scope resolution
cross-selection
validation errors
```

### Fase JF-2 — Visual UI Schema Builder

```text
drag & drop Schema → Control
layout nesting
reordering
Categorization / Category
Label
Control options
readonly
date/time options
array options
```

### Fase JF-3 — Dynamic behavior

```text
Rules
HIDE / SHOW
ENABLE / DISABLE
condition schema editor
failWhenUndefined
additionalErrors
validation modes
```

### Fase JF-4 — Extensibility

```text
custom renderers
custom layout renderers
renderer registry diagnostics
registered UI Schemas
global config
middleware
dynamic renderer support
```

### Fase JF-5 — Advanced integration

```text
i18n
renderer switching
renderer compatibility diagnostics
resolved preview schema
external-reference diagnostics
advanced form/schema/UI cross-navigation
```

---

## 26. Fuori scope della prima integrazione

Non sono requisiti obbligatori per la prima release JSON Forms:

- editor visuale di codice React per custom renderer;
- editor visuale di middleware JavaScript;
- generazione automatica di applicazioni standalone;
- supporto simultaneo React/Angular/Vue nel builder;
- marketplace di renderer;
- persistenza cloud dei dati compilati nel form;
- business workflow engine;
- sostituzione del JSON Schema Graph con la UI Schema.

Il JSON Schema Graph deve restare il modello del dominio dati; la UI Schema è un artefatto complementare.

---

## 27. Decisioni architetturali funzionali

### DA-01 — Due grafi coordinati

La soluzione raccomandata è mantenere:

```text
SchemaGraph
     │
     │ scope / rule condition scope
     ▼
UISchemaGraph
     │
     ▼
JSON Forms Preview
```

Il legame tra i due grafi è semantico e non di ownership.

### DA-02 — JSON Forms come runtime di preview

JSON Forms deve essere utilizzato come runtime reale del preview.

Il builder non dovrebbe creare un proprio emulatore del comportamento JSON Forms per rendering, rules e validation.

### DA-03 — Modello UI indipendente dal renderer

La UI Schema deve restare indipendente dal renderer set scelto.

Le configurazioni specifiche del renderer devono essere trattate come options/config separabili e preservabili.

### DA-04 — Source vs resolved schema

Per gli schema con reference avanzate il prodotto deve poter mantenere:

```text
Original JSON Schema
        ↓
Project resolver
        ↓
Resolved Preview Schema
        ↓
JSON Forms
```

senza modificare implicitamente il documento sorgente.

---

## 28. Fonti ufficiali consultate

- JSON Forms — What is JSON Forms?  
  https://jsonforms.io/docs/
- JSON Forms — Architecture  
  https://jsonforms.io/docs/architecture
- JSON Forms — React Integration  
  https://jsonforms.io/docs/integrations/react
- JSON Forms — UI Schema  
  https://jsonforms.io/docs/uischema/
- JSON Forms — Controls  
  https://jsonforms.io/docs/uischema/controls
- JSON Forms — Layouts  
  https://jsonforms.io/docs/uischema/layouts
- JSON Forms — Rules  
  https://jsonforms.io/docs/uischema/rules
- JSON Forms — Validation  
  https://jsonforms.io/docs/validation
- JSON Forms — Renderer Sets  
  https://jsonforms.io/docs/renderer-sets
- JSON Forms — Ref Resolving  
  https://jsonforms.io/docs/ref-resolving
- JSON Forms — ReadOnly  
  https://jsonforms.io/docs/readonly
- JSON Forms — i18n  
  https://jsonforms.io/docs/i18n
- JSON Forms — Date and Time Picker  
  https://jsonforms.io/docs/date-time-picker
- JSON Forms — Multiple Choice  
  https://jsonforms.io/docs/multiple-choice
- JSON Forms — Middleware  
  https://jsonforms.io/docs/middleware
- JSON Forms — Custom Renderers  
  https://jsonforms.io/docs/tutorial/custom-renderers
- JSON Forms — Custom Layouts  
  https://jsonforms.io/docs/tutorial/custom-layouts
- JSON Forms — Dynamic Renderers  
  https://jsonforms.io/docs/tutorial/dynamic-enum
- JSON Forms Core API — generateDefaultUISchema  
  https://jsonforms.io/api/core/functions/generatedefaultuischema

---

## 29. Sintesi del risultato atteso

Al termine dell'integrazione il prodotto dovrà consentire il seguente workflow:

```text
JSON Schema Graph
      │
      ├── design del modello dati
      │
      ▼
UI Schema Builder
      │
      ├── layout
      ├── control
      ├── rules
      ├── options
      └── renderer hints
      │
      ▼
JSON Forms Preview
      │
      ├── data binding
      ├── validation
      ├── dynamic visibility
      ├── readonly
      └── custom renderer
      │
      ▼
schema.json + uischema.json + data.json
```

L'integrazione deve quindi aggiungere al JSON Schema Graph Builder un secondo livello visuale orientato alla **presentazione e interazione**, senza confondere tale livello con la semantica del JSON Schema.
