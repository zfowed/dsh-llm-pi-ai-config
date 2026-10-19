# Frozen module interfaces

Internal contract for the browser half (v10 module layout). Every module below is
a package-local chunk loaded by `lib/client.js` through
`require.async("./client.<name>.js")` and must keep these exact signatures: the
tests import the same functions directly.

The chunks live flat in `lib/` (`docs/architecture.md` §1.1: the platform only
serves `client.<…>.js` names beside the owner), and the logical hierarchy is the
dotted file name. The load order is the owner's `CHUNK_PLAN`:

| Phase | Chunks | Reads the registry at eval/factory time |
| --- | --- | --- |
| 0 | `core`, `schema`, `form`, `fields.groups`, `fields.hints`, `yaml`, `styles.chrome`, `styles.controls`, `panels.{kit,controls,collections,render,instances,catalog}` | no |
| 1 | `fields`, `panels`, `page`, `styles` | yes (`fieldsTables`/`fieldsHints`, `core`, the two style fragments, the six `panels.*` creators) |

`tests/wiring.test.js` pins the requested set, `tests/module-contract.test.js` pins
the plan ↔ disk ↔ request three-way equality, the phase edges and the per-file
size cap (700 code lines).

The schema envelope is a **uid/refs graph**, not plain JSON Schema. The host
projects `volatileForm(Config).toJSON()` and the client rehydrates it with
`settingsSchema.rehydrate(envelope)` (`new Schema(envelope)`). Offline tests use
`tests/fixtures/llm-pi-ai.schema.json`, snapshotted by
`scripts/snapshot-schema.mjs` from the real `llm-pi-ai` Config.

## Envelope shape (observed, 144 nodes)

```
envelope = { uid: number, refs: { [uid: string]: Node } }
```

Every value that refers to another node is either a bare **uid** (number) or an
already-inlined object. Helpers must accept both.

| Node `type` | Payload keys | Meaning |
| --- | --- | --- |
| `const` | `value` | exactly one allowed value → enum of one |
| `string` | — | free text |
| `number` | — | numeric |
| `boolean` | — | checkbox |
| `object` | `dict: {key: ref}` | fixed-shape object |
| `dict` | `inner: ref`, `sKey: ref` | open-ended map |
| `array` | `inner: ref` (optional), `list` | list |
| `union` | `list: ref[]` | alternatives |
| `lazy` | `inner: {toJSON}` | not present in the snapshot |

`meta` is always present and may carry `default`, `required`, `max`, `min`,
`step`, `description`, `role`, `volatile`. `meta.volatile` is already stripped by
the host's `volatileForm` filter, so anything in the fixture is writable.

Anonymous option unions appear as a `union` whose `list` holds `object` branches.
`retryPolicy` is one of these: `{mode:"normal", maxRetries?, retryableCodes?,
backoff?}` | `{mode:"always", backoff?}`, discriminated by a `const` field.

## `lib/client.core.js` (chunk `core`)

The shared base: the pure helpers every other module would otherwise re-implement,
the primitives resolution, and every local stand-in for an export
`@deepseek-ai/dsh-client-ui-primitives` does not ship.

```js
/** Pure helpers. `readPath` treats a missing segment as `undefined`. */
export function hasOwn(object, key)
export function isPlainObject(value)
export function isExpression(value)          // {__jsExpr: string}
export function readPath(root, path)
export function identity(snapshot)
export function attempt(fn, fallback)
export function describeError(error)          // -> string, never throws
export function textOf(props, key, fallback)  // best-effort localized text
export function readView(usePage)             // the SELECTOR-hook read
export function snapshotOf(controller)
export function isComponent(value)            // functions + forwardRef/memo/lazy
export function symbolFor(description)
export function isDirtyAt(form, path)
export function preview(value)
export function controlIdOf(path)             // `piai-field-<path…>`
export function keyOf(path)
export function protocolOfProfile(profile, fields)
/** The two-step confirm state machine shared by the page's bar and the panels. */
export function useArmedConfirm(react) // -> { armed, arm, cancel }
export var UNSET_VALUE                        // '__unset__' radio sentinel

/** Build the primitive layer against one bundle `require`. */
export function createUi(require) // -> {react, h, primitives, primitive, isComponent,
                                  //     Button, Modal, Input, Checkbox, Tooltip,
                                  //     Tag, Pill, StateDot, CodeBlock, Icon*,
                                  //     fallbacks: {…}}
```

- **The registry entry is replaced by the factory's return value**: `core` is
  published without `ui` at eval, and `registry.core = built` inside the factory,
  because `ui` needs a `require`. Consumers that are created later read the built
  one; the owner passes the whole chunk bag to the page, so the page reads
  `chunks.core.ui` and never touches the registry.
- `isComponent` is shape-based on purpose: judging a `forwardRef`/`memo`/`lazy`
  wrapper "missing" silently installed the local natives (verification.md §11).
  An already-rendered element and a plain object are rejected, so `h(type, …)`
  cannot throw during render.
- `createUi` degrades per export (`Input`/`Checkbox` → the native `'input'`), so
  a bundle that ships half the primitives still renders.
- **Deliberately not here**: `client.schema.js` / `client.form.js` /
  `client.yaml.js` keep their own micro-helpers, because they must stay
  dependency-free for `node --test` and the write path must stay auditable in one
  file (`docs/architecture.md` §5).

## `lib/client.schema.js`

```js
/** Resolve a uid or inlined node against the envelope. @returns {object|undefined} */
export function node(envelope, ref)

/** Walk every writable leaf. @returns {Leaf[]} in document order */
export function leaves(envelope, rootRef, basePath)

/** Leaf = {
 *   path: string[],                 // absolute path from the namespace root
 *   node: object, kind: string,     // kind per the table in client.fields.js
 *   enum?: any[], def?: any, min?: number, max?: number, step?: number,
 *   nullable: boolean, required: boolean, description?: string,
 *   branches?: { label: string, value: any, ref: any }[],  // union only
 *   discriminator?: string,                                 // union: the key a selection writes
 *   container?: { kind: "array"|"dict", path: string[] },  // instance group only
 *   presentationPath?: string[],                            // pre-rebase path (presentation key)
 *   keyEnum?: any[], valueEnum?: any[], valueNullable?: boolean,  // dict leaf only
 *   valueVar?: boolean, valueVarNames?: string[],  // v9: dict whose value union carries `$var`
 *   branches?: { label, value, kind, ref }[],               // union branch kind for labels
 * } */

`valueVar` / `valueVarNames` (v9) are **structural**: `valueVarNames` lists the
placeholder names the value union declares (`thinking.enabled` / `thinking.effort` /
`thinking.budget` for the two chat-template dicts), read out of the schema's own
`{$var: …}` object branch; `valueVar` is `true` exactly when that list exists. Like
`keyEnum`, they describe structure only and never add or remove a leaf
(`lib/client.schema.js`).

/** Structure of an `object`/`dict` node for the form tree. */
export function shape(envelope, ref)

/** `true` when a node is a `{__jsExpr: string}` expression (read-only). */
export function isExpression(value)
```

`container` is present only for a leaf inside an **instance container** — an
`array`/`dict` whose `inner` is object-like (`models[]`, `modelOverrides`). Those
containers stay path-transparent, so the leaf set (and every audit list) is
unchanged; the container path is the one piece the panel needs in order to
re-base the member onto a real instance. The OUTERMOST container wins.

Rules:

- A `union` whose branches are all `const` becomes one `enum` leaf.
- A `union` containing an `object` branch is a discriminated variant: emit
  `branches` and let the panel render a selector plus the active branch.
- `dict` yields an `object`-like node with `open: true`; its own keys are
  user-chosen, so it contributes one repeatable row group, not fixed leaves.
- `leaf.container` never replaces a leaf: it only tags one. A panel that ignores
  it still renders every leaf (the `tests/coverage.test.js` zero-loss guarantee).
- `array` with no `inner` is a list of free values (used by `retryableCodes`).
- `leaf.discriminator` is set only when an `object` branch carries a `const`
  discriminator (`retryPolicy` → `"mode"`). It is what lets the panel write a
  selection back as `{ <key>: <branch value> }` instead of an empty object; a
  union without one (`reasoningEfforts`: `false` or a dict table) leaves it
  `undefined`, and the panel then writes the const literal itself.
- Absent `meta.required` means optional; never invent one.

## `lib/client.form.js`

```js
/** Minimal set/unset delta between two plain values at `basePath`. */
export function diffOps(basePath, before, after) // -> Op[]

/** Staged editor over a `ConfigFormController`-shaped object. */
export function createStagedForm({ getSnapshot, mutate, schema })
// -> { edit(path, value), remove(path), reset(path),
//      dirty, invalid, ops, save(), discard(), subscribe(fn), getSnapshot() }
```

- `Op = { op: "set", path: (string|number)[], value: any } | { op: "unset", path: (string|number)[] }`.
- `diffOps` is recursive: an unchanged subtree yields nothing; a removed object
  key yields `unset` for that key; a shortened array yields `unset` per trailing
  index (the host splices these).
- **A cleared field is `unset`, never `null`.** Clearing means "inherit", and
  `null` is only ever written when the field's own schema declares a nullable
  alternative and the user explicitly picks it.
- `save()` calls `mutate(ops, expectedRevision)` exactly once and rolls the
  staged baseline forward only on success. A conflict leaves the draft intact
  and surfaces the error; no automatic retry that could clobber a concurrent edit.
- `subscribe` notifies on `dirty`/`invalid` transitions; `getSnapshot()` returns
  `{ values, dirty, invalid, error, saving }` for `useSyncExternalStore`.

## `lib/client.fields.groups.js` / `lib/client.fields.hints.js` (data chunks)

The curated copy, split out of the logic chunk. **Data only**: they decide *where*
a field is presented and *what it is called*, never whether it exists.

```js
// client.fields.groups.js  (registry key `fieldsGroups`)
export var FIELDS        // relative path -> { label, hint, kind?, unit?, rows?, pair?,
                         //                   titleRank?, catalog? }
export var GROUPS        // ordered sections; `other` is the unconditional fallback
export var COMPAT_GATES  // protocol -> { offer: string[], withhold: string[] }

// client.fields.hints.js  (registry key `fieldsHints`)
export var VALUE_LABELS  // `<field>.<value>` -> Chinese label
export var VALUE_HINTS   // `<field>.<value>` -> one explanation line
export var MODE_HINTS    // chat-template dict -> {literalLabel, literalHint, varLabel, varHint}
```

- Both are read by `client.fields.js` **at eval time**, so the owner requests them
  in phase 0. A missing one makes the fields chunk throw a named error instead of
  silently rendering every field under its raw path.
- `lib/client.fields.js` re-exports them (`fields`, `groups`, `valueHints`,
  `modeHints`) so the existing tests and any host shim keep working.

## `lib/client.fields.js`

Presentation only — grouping, labels, hints, and the few special widgets. It
must never be the source of truth for *which* fields exist.

```js
/** Group a leaf list into ordered sections. Unknown leaves land in the fallback group. */
export function groupLeaves(leaves) // -> { id, title, leaves }[]

/** Per-path presentation. @returns { label?, hint?, kind?, unit?, rows?, pair?, titleRank? } */
export function describeField(path) // path is a string[] joined with "."

/** The provider tab label: displayName when set, else undefined. Presentation only. */
export function profileLabel(profile) // profile = values.providers[name]

/** The dotted path presentation is keyed by (`presentationPath` when present). */
export function presentationPathOf(leaf)

/** The raw YAML key shown beside a row: `apiKeyEnv`, `compat.x`, `models[].id`. */
export function keyLabelFor(leaf)

/** A union branch's Chinese selector label (`<field>.branch.<value|kind>`).
 *  v8: also titles the branch body (`branchLabelFor(...) + '的参数'`). */
export function branchLabelFor(leaf, branch)

/** A value's Chinese name for one leaf (`<field>.<value>`, raw token kept). */
export function valueLabelFor(leaf, value)

/** v9: the explanation of one option (`<field>.<value>`), or undefined. Additive. */
export function valueHintFor(leaf, value)

/** v9: the literal-vs-`$var` copy for one chat-template dict leaf
 *  (`{literalLabel, literalHint, varLabel, varHint}`, a fresh copy), or undefined. */
export function modeHintFor(leaf)

/** COMPAT_GATES: protocol -> { offer: string[], withhold: string[] } */
export function compatGate(api) // -> { offered: Set, withheld: Set } | undefined
```

- Every leaf the schema reports must appear in exactly one group. A field with
  no entry in `describeField` still renders, using a generic control derived
  from `kind` and a label derived from the path.
- `description` from `meta` is shown verbatim as the hint when present; the
  table only overrides it where it adds protocol-specific guidance. The curated
  `hint` is the authority for the compat switches (v5): it must state effect
  and consequence from the installed adapter/pi-ai implementation, never restate
  the key name (docs/requirements.md R2).
- `valueLabelFor` returns `undefined` for any value without an entry, and the
  caller then renders the raw token — so adding an entry is purely additive.
  **v9** adds the same rule for value-level *explanations*: `valueHintFor(leaf, value)`
  feeds `Row.hintLines` (one `「label」：hint` line per option) and `modeHintFor(leaf)`
  carries the four strings of the chat-template mode radio. Both return `undefined`
  for a value/leaf without an entry; neither can hide a leaf. The tables behind them
  (`valueHints` / `modeHints`) are exposed read-only for tests.
- `pair` is a layout id, not a field selector: `FieldsBlock` merges **consecutive**
  leaves carrying the same id into one `.piai-row-pair` two-column grid, and a run
  of one stays an ordinary row (v6, docs/interaction-design.md §14). It can never
  hide or drop a leaf.
- `titleRank` (v7, implemented) is the instance-card title priority: a number,
  lower first (`name` is marked `1`). A panel titles a card with the value of the
  highest-ranked candidate leaf whose value is a non-empty string, then falls back
  to the schema-derived `required` string leaf, then to `#n`; `modelOverrides`
  keeps the dict key and never enters that flow. It exists so the panels can
  implement `name → id → #n` without naming a field (AGENTS §3.2, acceptance A9),
  and it is presentation only — it never changes which leaves exist
  (docs/interaction-design.md §15.4, §15.9 D1).
- The raw key chip (`keyLabelFor`) and the curated `hint` are rendered **inside
  the `piai-info` tooltip**, not inline (v7, docs/interaction-design.md §15.3):
  the trigger carries `aria-label`, the bubble is `role="tooltip"` and is
  `portal`ed (so it is *not* in the rendered tree). The control's
  `aria-describedby` therefore points at the **permanent `piai-info` anchor id**,
  never at the bubble; field-level inline `.piai-hint` is gone and group-level
  `hint` stays inline. Validation errors have no per-field node: the control gets
  `aria-invalid="true"` and the owner renders the adapter text in
  `.piai-notices > [role="alert"]` (§15.12 OBS-4).
- Gates are **advisory**. The adapter remains authoritative; when the adapter
  rejects a withheld field the save error is shown unchanged.

### `hintBubble(keyLabel, hint, lines)` — the tooltip label contract (v9-T20)

```js
/** The Tooltip `label` for one row. @returns {ReactNode[]} */
function hintBubble(keyLabel, hint, lines)
```

- **Shape:** `[]` when there is nothing to show, otherwise exactly **one** child:
  a `span.piai-root` wrapper whose children are, in order, the optional
  `code.piai-key` (raw YAML key), the optional `span` hint, and one `span` per
  extra line (`Row.hintLines`). There is **no `<br>`** anywhere in the panels
  chunk any more (`grep "h('br'" lib/client.panels.js` → 0); the line breaks come
  from the wrapper's own flex column (`lib/client.panels.kit.js` 的 `hintBubble()`).
- **Why a nested `.piai-root`:** `Tooltip` renders its bubble through
  `createPortal(…, document.body)` (the same mechanism the shipped `Modal` uses),
  so the bubble has **no `.piai-root` ancestor** — every scoped rule in
  `lib/client.styles.js` would miss it and the chip would lose its background,
  border, radius and padding. The wrapper re-enters the scope inside the portal.
- **Colour: body text inherits, the chip does not (v9-T31 + v9-T35).** The bubble
  is permanently light-on-dark, and the primitive's `Tooltip.module.css` pins a
  static light foreground (the `--dsw-static-neutral-bluish-00` token) on
  `.bubble`. A nested `.piai-root` out-specifies that declaration, so the
  **nested-root pair carries `color: inherit`** (`lib/client.styles.js` 的 `STYLESHEET()`): the
  body text and hint lines inherit the surface the content is actually portalled
  into, instead of re-applying the page's `--dsw-alias-label-primary` (which
  paints dark-on-dark in the light theme — the third GUI report; the broken state
  measured 1.21:1, the fix 12.14:1 for `rgb(230,236,245)` on `rgb(35,42,54)`).
  The **raw-key chip is deliberately excluded** (`lib/client.styles.js` 的 `STYLESHEET()`
  only pins its width; T35 withdrew the `color: inherit` it briefly had): it keeps
  the base `.piai-key` theme-token pair — text `--dsw-alias-label-secondary` on
  `--dsw-alias-bg-layer-2` with a `--dsw-alias-border-l1` border — i.e. dark text
  on a light chip in the light theme (6.51:1). Inheriting the bubble's light
  foreground would render it at 1.09:1, effectively invisible. The static token
  must **not** be referenced: it is outside the 23-token allowlist enforced by
  `tests/styles.test.js`.
- **Bubble padding is a compensation value, not a symmetric one (v9-T39).** The
  primitive's own `.bubble` rule is `padding: 3px 7px`, and our content layer sits
  *inside* it, so "the same, larger padding on all four sides" can only be done
  here, by compensation: `padding: var(--piai-space-3) var(--piai-space-2)` (12/8)
  gives `3 + 12 == 7 + 8 == 15px` of visual padding per side — measured
  15/15/15/15, while removing the rule falls back to 3/7/7/3. The rule is gated to
  the bubble only, through the children its wrapper is a parent of —
  `:has(> .piai-key)` / `:has(> span)` branches, each paired with
  `:not(.piai-page)` — because the Modal portal wrapper's direct children are
  `div.piai-item-actions` plus `div.piai-catalog` / `p.piai-hint`, so neither
  branch matches and the dialog keeps its own spacing
  (`lib/client.styles.js` 的 `STYLESHEET()`; both branches measured `matches() === false`,
  Modal wrapper padding `0`).
- **Line spacing and chip width** come from paired rules in
  `lib/client.styles.js` 的 `STYLESHEET()`:
  `.piai-root .piai-root, .piai-root:not(.piai-page) { display:flex;
  flex-direction:column; gap:var(--piai-space-1); min-width:0; max-width:100% }`,
  plus `> .piai-key { align-self: flex-start }` (chip keeps its content width)
  and `> span { min-width: 0 }` (long hints wrap). The `:not(.piai-page)` half is
  **required** because the real portal root has no `.piai-root` ancestor, whereas
  the page root always carries `piai-page` — the descendant form alone would match
  neither in the real GUI. The same pair carries a companion rule
  `> .piai-item-actions { margin-left: 0; align-self: stretch }` so the modal
  picker's toolbar stacks full-width instead of being pushed right by the
  primitive's `margin-left:auto`.
- **Verdicts stay where they are measured:** the browser evidence for the bubble
  is the `r7` fixture (positive/negative control) recorded in
  `docs/verification.md` §18; this contract only fixes the DOM/CSS shape.

## `lib/client.page.js` (chunk `page`)

The settings page face, extracted from the owner in v10: the owner runs before any
chunk can be requested, so everything that only has to exist once the page renders
lives here.

```js
/** Build the page face against one bundle `require`. */
export function createPage(require) // -> { makePage(chunks, deps) }

/** chunks: `{core, schema, form, fields, yaml, panels}` as `ensureChunks()` resolves them.
 *  deps:   `{boundary, locale}` — the owner's `PageBoundary` class, and its locale
 *          namespace id (the bundled defaults are a pass-through boundary and
 *          `'dsh-llm-pi-ai-config'`). */
export function makePage(chunks, deps) // -> the section component
```

- The face owns: the tab DOM ids (`model-extended-tab-<i>-<key>` /
  `model-extended-panel-<i>-<key>`, per position so two keys that sanitise alike
  stay unique), `providerTabItems`, the sticky bar with the two-step
  `ProviderDeleteButton`, the read-only 「原代码」 face, and the two
  `PageBoundary` wrappers (strip and body).
- It reads the shared helpers and the resolved primitives off `chunks.core`
  (`isComponent`, `StateDot`, `CodeBlock`, `attempt`, `describeError`, `textOf`,
  `readView`, `snapshotOf`, `readPath`, `identity`), so it has **no load-order
  coupling** and no global read.
- A missing `chunks.core.ui` raises a named error; it is thrown inside the lazy
  host's load, so `ChunkBoundary` renders a message plus a retry rather than
  letting a render-time throw abdicate the settings cell.
- Purity: no `ctx`, no `remote.*`, no I/O. Every edit goes through the staged
  `form` prop; the only remote calls (`catalog.discover`, the credential
  channel) arrive as props from the owner.

## `lib/client.panels.js` and its modules

v10 split the former single panels chunk. `lib/client.panels.js` is now the facade:
it owns `ProviderTabs`, `ProviderPanel` and the composition; the six modules each
publish one factory.

```js
/** The facade. */
export function createPanels(require, deps) // -> { ProviderTabs, ProviderPanel }

// The modules, called by the facade in this order (each returns its contribution):
export function createKit(shared)         // panels.kit.js        -> {Row, ConfirmButton,
                                          //   hintBubble, leafUi, pairIdOf, pairRunsOf,
                                          //   renderRow, expressionBody}
export function createControls(shared)    // panels.controls.js   -> {EnumControl,
                                          //   BooleanControl, NumberControl, TextControl,
                                          //   CredentialControl, enumLabelOf,
                                          //   enumHintLines, renderControl, describeControl}
export function createCollections(shared) // panels.collections.js-> {CheckboxGroupControl,
                                          //   TagListControl, DictControl, AddKey,
                                          //   TemplateArgsControl, TierTableControl}
export function createRender(shared)      // panels.render.js     -> {UnionControl,
                                          //   ObjectControl, ArrayControl, FieldsBlock}
export function createInstances(shared)   // panels.instances.js  -> {ArraySection,
                                          //   InstanceDictSection, instanceCardHead,
                                          //   relativeTo, titleLeafOf, titleRankOf,
                                          //   compatSections, CompatDisclosures}
export function createCatalog(shared)     // panels.catalog.js    -> {GroupBlock,
                                          //   withheldKeys, ModelCatalogPicker}
```

**The `shared` bag** is the whole cross-module contract:

```js
shared = {
  core,            // the `core` chunk API (helpers + ui)
  ui,              // core.ui: the resolved primitives and the local stand-ins
  react, h,        // the same react instance and `createElement` for every module
  require,         // the bundle require
  components: {},  // filled by the facade from every creator's return value
}
```

- **Cross-module calls are read off `shared.components.<name>` at call time.**
  Never capture one at creation time: `renderRow` (kit) ↔ `FieldsBlock` (render) ↔
  `ArraySection` (instances) ↔ `renderControl` (controls) is a cycle, and only
  late binding can express it. `tests/module-contract.test.js` asserts that every
  creator is requested before the facade and that the built set is complete.
- Module-local functions are called directly. A module may only reach a helper of
  a module the facade has already created.
- The emitter list the class-set tests scan is derived from the directory
  (`tests/helpers/class-sources.mjs`), so a new module is covered automatically.

Registry shape: `globalThis.__dshLlmPiAiConfig.panels = { createPanels, componentNames }`,
and when a `require` is reachable the built components are attached too. The
browser factory returns the two components directly, so
`(await require.async("./client.panels.js")).ProviderPanel` works.

Props are `{form, schema, fields, envelope, values, provider, providerNames,
groups, leaves, options, locale, onSelect, onAdd, onRemove, catalog}` (plus
`items`, `label`, `adding`, `actions` for `ProviderTabs`); panels are pure — no
`ctx`, no global reads, no `remote.*`, no I/O — and every write goes through
`form`. Since v7 the provider delete chrome moved out of `ProviderTabs` into the
owner's sticky bar, so `ProviderTabs` consumes only `onSelect` / `onAdd`;
`onRemove` stays in the shared prop bag for the owner, which renders the two-step
delete itself.

**v9 additions to the dense prop bag:**

- `ProviderTabs.actions` — a single React node rendered in the tab strip's
  **right-hand slot** of `.piai-tabs-bar` (`{key:'actions', className:'piai-item-actions'}`);
  the slot is always rendered, so a caller that passes nothing leaves it empty. The
  owner puts the 「原代码 / 配置表单」 toggle there
  (`lib/client.panels.js` 的 `ProviderTabs()`; `lib/client.page.js` 的 `makePage()`（`rawActions`）). The add panel stays a
  **sibling** of the bar, so `.piai-tabs` keeps its tablist/tab/tabpanel contract.
- `ProviderPanel.catalog` — `{available, error, probe, discover}` (or `undefined`).
  It reaches **only** the group the presentation module marked with the pure
  presentation flag `group.catalog === true` (today the `models` group,
  `lib/client.fields.groups.js` 的 `GROUPS()`); every other group is rendered untouched. Every
  field in it is display state:
  `available` gates the trigger, `error` supplies its disabled reason,
  `probe` is informational, and `discover()` is the only side effect — it returns
  `{kind:'found', models}` or `{kind:'refused', message}` and never writes. Adoption
  is one `form.edit(container.path, rows)` (`lib/client.panels.catalog.js` 的 `ModelCatalogPicker()`,
  `:3682-3704`).
- `Row.hintLines` — optional `string[]` appended to that row's `piai-info` tooltip
  (one line per option, produced by `fields.valueHintFor`); `[]`/undefined renders
  the plain bubble (`lib/client.panels.kit.js` 的 `hintBubble()`, `:1838-1851`).
- `EnumControl.unsetText` / `unsetHint` / `includeUnset` — the visible label and
  `title` of the unset choice, and whether it exists at all. Defaults keep v7
  behaviour; the boolean group passes `默认（未设置）`, the chat-template mode radio
  passes `includeUnset: false` because a mode is a two-way choice
  (`lib/client.panels.kit.js` 的 `ConfirmButton()`).
- Two **internal** components stay unexported: `TemplateArgsControl` (the
  chat-template dict rows, `lib/client.panels.collections.js` 的 `AddKey()`) and `ModelCatalogPicker`
  (the discovery dialog, `:3414`). `componentNames` is still the frozen pair
  `ProviderTabs` / `ProviderPanel`.

**Primitive resolution is shape-based, never `typeof === 'function'`.** The
shipped `@deepseek-ai/dsh-client-ui-primitives` exports `Button` and `Input` as
`React.forwardRef(...)` and (historically) `DisclosureRow` as `React.memo(...)` —
objects. Both this chunk and `lib/client.js` therefore resolve primitives through
an `isComponent(value)` helper that accepts functions plus `forwardRef` / `memo`
/ `lazy` wrapper objects, rejects `react.element` and plain objects, and degrades
to "functions only" when `Symbol.for` is unavailable. A local stand-in renders
only when the export is genuinely absent; judging a wrapper "missing" is the
silent-degrade defect recorded in docs/verification.md §11.
`isComponent` stays internal (the chunk's export shape is frozen to the two
components); the rule is enforced by `tests/wiring.test.js` and exercised
end-to-end with wrapper-shaped stubs in `tests/a11y.test.js`,
`tests/instances.test.js` and `tests/verify.polish.mjs` (P5i).
**v8:** `DisclosureRow` is no longer resolved at all (no call site; the standalone
`FallbackDisclosureRow` is deleted), so the `memo`-shaped coverage must wrap a
primitive that *is* still resolved — otherwise that resolution path loses its test
(docs/interaction-design.md §16.5 W2/W7). Current `WRAPPED_TYPES` is
`{Button:'forwardRef', Input:'forwardRef', Tooltip:'memo'}`
(`tests/a11y.test.js`, `tests/verify.polish.mjs:1364`); the rest of the binding list
(`Modal`/`Checkbox`/`Tag`/`Pill`/`StateDot`/icons) stays resolved at module init even
where v9 retired its only call site. **v10:** `Switch` is no longer resolved at all —
the boolean leaf has been a three-way radiogroup since v9, `tests/a11y.test.js` /
`tests/v8.audit.test.js` assert a boolean leaf must **not** resolve it, and the dead
binding (plus its `FallbackSwitch`) was deleted.

Row-level action buttons use `variant: 'outline'` + `size: 'sm'` (the shipped
Button's variants are `ghost`/`primary`/`outline`/`toolbar`); destructive actions
keep the inline two-step `ConfirmButton`. The five in-row add/credential buttons
(`piai-provider-add`, `piai-dict-add`, `piai-tag-add`, `piai-cred-editor`,
`piai-cred`) are raised to 32px **by CSS height only** — the `size` prop stays
`'sm'`, so the primitive keeps its 28px font/padding/radius and only the height
matches the neighbouring 32px input (v7, docs/interaction-design.md §15.7).

**Panels name no provider/model field.** Which groups a panel renders is decided
by the caller from **group id / structure**:

| Panel | What it renders |
| --- | --- |
| `ProviderTabs` | the underline tablist modeled on `@deepseek-ai/dsh-client-ui-settings-plugins` (`role=tablist`/`role=tab`, `data-active`, roving tabindex, arrow/Home/End) plus a trailing **add** tab whose panel is the add form; **no** delete chrome (v7). With **0** providers it renders **no** tablist/`role=tab`/`role=tabpanel` and puts the add form in place directly (D2, docs/interaction-design.md §15.2.10) |
| `ProviderPanel` | **every** group the caller passes, in order; `compat` keeps the frozen 6 disclosures |

There is no route/advanced/models split any more, so a group added upstream
cannot be hidden behind a tab. Repeatable groups are rendered per instance from
`leaf.container`:

- `ArraySection` (`container.kind === "array"`, e.g. `models[]`): one card per
  element, collapsed by default, with a **self-written head** (`piai-item-head` /
  `piai-item-actions` / `piai-item-remove`) instead of `DisclosureRow` — the
  primitive has no right-hand action slot and its `collapsedContent` lives inside
  a 24px `overflow:hidden` row (v7, docs/interaction-design.md §15.4). The head's
  first `<button>` carries the chevron **and** the title (`aria-expanded` +
  `aria-controls` → the body id, Enter/Space free from the native button); the
  remove button is that button's **sibling**, never nested, and stays in the DOM
  while collapsed (`opacity: .5`, revealed by `.piai-item-head:hover` or
  `.piai-item-head:has(:focus-visible)`). The title is the highest-ranked
  `fields.describeField(...).titleRank` candidate with a non-empty string value,
  then the `required` string leaf, else `#n`; `remove` splices
  `form.remove([...container.path, index])`, and add appends
  `form.edit([...container.path, length], {})`.
- `InstanceDictSection` (`container.kind === "dict"`, e.g. `modelOverrides`): one
  card per key, same head and add/remove contract keyed by the map key, but the
  card title is the dictionary key (never a `titleRank` candidate).
- An unknown `container.kind` falls back to plain rows; a container whose value
  is a `!!js` expression renders read-only.
- The head is built by the shared `instanceCardHead(options)` helper
  (`{key, title, expanded, bodyId, onToggle, actions}`). v7 hard-coded the remove
  button in its action slot; **v8 makes `actions` an optional array** — omitted or
  a non-empty array keeps the instance-card behaviour, and **`actions: []` renders
  the head with no right-hand control**. `CompatDisclosures` uses `actions: []`
  (docs/interaction-design.md §16.4/§16.5 W4).

Control dispatch is by `leaf.kind` alone (v5 adds two rules, v7 rewrites one; all
name-free):

- **`EnumControl`** (v7) — an enum of **any** size renders as one box-style
  single-select group inside `piai-select`: a `role="radiogroup"` + `aria-label`
  container holding one native `<input type="radio">` per option (same `name` =
  the control id, so the group is mutually exclusive), styled with
  `appearance: none` (16px box, `0.5px` `border-l4`, check drawn by
  `input:checked::after`); the primitive ships no Radio, so the square is ours.
  The last option is the unset choice — labelled `默认（未设置）` since v9
  (`unsetText`, overridable per call site; sentinel `__unset__` → `onClear()` →
  `unset`, never `null`) — and a stored value outside the enum is appended as an
  extra option. `Menu` / `MenuItemButton` / `SegmentedControl` are gone from the
  chunk. A single row label cannot `htmlFor` a group, so `renderRow` passes
  `useHtmlFor: false` for `enum`/`const`. **Five** call sites share it —
  `renderControl` (`enum`/`const`), the boolean triple (`BooleanControl`, v9),
  `DictControl`'s `valueEnum` row, `UnionControl`'s branch selector, and the
  chat-template mode radio (v9, `includeUnset: false`) — all single-value
  write-backs (docs/interaction-design.md §15.5, §18.4; guarded by
  `tests/v7.audit.test.js` and `tests/a11y.test.js`).
- **`UnionControl`** — a branch is selected by the *shape* of the stored value
  (scalar literal, discriminator value, or the single structural branch), and
  choosing one writes what the branch is: `const` → the literal itself,
  discriminated object → `{<discriminator>: <value>}` from
  `leaf.discriminator`, structural (dict/array) → nothing, its own control
  writes the first value. The branch body's title is
  `fields.branchLabelFor(leaf, active) + '的参数'` (e.g.
  `normal（按次数重试）的参数`), falling back to `分支参数`; `active` is the
  current selection (`pendingId ?? realId`). v8 removes the body's
  `padding-left`/`border-left` rail — spacing alone separates it
  (docs/interaction-design.md §16.3).
- **`array` + `enum`** → `CheckboxGroupControl` (`piai-checks`): one `Checkbox`
  per allowed value, labels through `fields.valueLabelFor`; unchecking the last
  one clears the field with `remove`. **v8 geometry:** the box is fixed at
  `16×16` (`.piai-checks > label > input { flex: none; width/min-width: 16px;
  height: 16px }`), the text span keeps only `white-space: nowrap` (no
  `min-width`/`overflow`/`text-overflow`), and the row-stretch rule is narrowed to
  `input:not([type="checkbox"]):not([type="radio"])` so the primitive's inner
  input is never stretched (docs/interaction-design.md §16.2).
- **`dict` + `keyEnum` + scalar values** → `TierTableControl` (`piai-tiers`):
  one row per declared key, always rendered. A filled input writes the string; an
  emptied one removes that key; an all-empty table clears the field.
- Everything else keeps `DictControl` / `TagListControl` / `ArrayControl`
  (`TagListControl` now only serves open free-scalar lists).

Focus rules in the stylesheet are a **whitelist** (v7, docs/interaction-design.md
§15.8 no.3): exactly four selectors may carry `:focus-visible` —
`.piai-root .piai-provider-list [role="tab"]:focus-visible` (+ its `::after`),
`.piai-root .piai-info:focus-visible`, and
`.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove`.
`:focus-within` is forbidden outright, and no selector may reach a primitive
internal (`.wrap`, or an `input`/`label`/`span` owned by a primitive). The R4
radio box declares no focus rule of its own.

`tests/wiring.test.js` asserts the panels are constructible, and
`tests/instances.test.js` asserts the exact op path each card emits.

**v9 dispatch additions (still name-free, still `leaf.kind` + structure):**

- `boolean` → `BooleanControl`, now the shared `EnumControl` with `开启` / `关闭` /
  `默认（未设置）`; the `Switch` primitive is no longer resolved by any control
  (`lib/client.panels.controls.js` 的 `EnumControl()`, `:1907-1912`).
- `dict` with `keyEnum` and no `valueEnum` → `TierTableControl`; each tier is an
  ordinary `Row` (label + `piai-info` bubble + `Input`), and `form.remove` on the
  last emptied key clears the field (`lib/client.panels.collections.js` 的 `TemplateArgsControl()`, `:1984-2000`).
- `dict` with no `keyEnum`, no `valueEnum` and `valueNullable === true` →
  `TemplateArgsControl` (the two chat-template dicts). It reads
  `leaf.valueVarNames` only to seed the first `$var`; the dispatch condition is
  `valueNullable`, **not** `valueVar` — `valueVar` is structural metadata consumed
  by the schema/presentation tests (`lib/client.panels.controls.js` 的 `renderControl()`).
  Removing the last entry calls `form.remove`, so an empty dict never lingers.
- Everything else keeps `DictControl` / `TagListControl` / `ArrayControl` /
  `CheckboxGroupControl` / `UnionControl` exactly as before.

**v9 model discovery** (`group.catalog === true` only): the group head grows a
`获取可用模型` trigger in its `.piai-item-actions` slot, plus a
`.piai-error[role=alert]` / `.piai-hint` status line and the `ModelCatalogPicker`
modal (search `Input` + 全选/取消全选 `Button` + a `.piai-catalog` checkbox list +
`取消` / `添加所选` footer). Busy and disabled states are display-only; the picker
never writes (`lib/client.panels.catalog.js` 的 `messageOf()`, `:3571-3767`).

**Candidate row (v9-T25):** one checkbox plus **one** monospace `code.piai-dict-key`
whose text is the raw model id; the display name is not a second text node but the
`title` attribute (`title = label || identity`, so a missing name falls back to the
id and `name === id` never reads as the same string twice). The search filter still
matches **both** id and name (`lib/client.panels.catalog.js` 的 `ModelCatalogPicker()`, `:3480-3488`). This
mirrors the shipped picker, which renders exactly one `span.candidateId` with
`title: candidate.name ?? candidate.id` and `children: candidate.id`
(`@deepseek-ai/dsh-client-ui-settings-models/lib/client.js`; alias `PICKER:874-878`
in docs/interaction-design.md §18.1).

**`CompatDisclosures`** (v8) renders the compat group's 6 frozen sections inside
`.piai-disclosure`. Each section header is `instanceCardHead({…, actions: []})`
— a native toggle button carrying the chevron **and** the title
(`aria-expanded` + `aria-controls` → the section body id) plus an empty action
slot (`actions: []` renders no `.piai-item-actions` and no remove button; the
instance cards' behaviour is unchanged, v8.audit §5 asserts zero impact). The
chevron is always visible (`IconChevronRightOutlineRegular` collapsed /
`IconChevronDownOutlineRegular` expanded, `size: 14`); there is **no**
`piai-count` badge any more. The body is `.piai-disclosure-body`
(`padding-left: 18px` = 14px chevron + the 4px button gap) and **stays in the DOM
with `hidden`** when collapsed, while the `FieldsBlock` inside is mounted only
while expanded. Section ids **must** be derived from the **index**, not the title:
the current implementation uses `controlIdOf(['compat-section', String(index)])`
+ `'-body'` (e.g. `piai-field-compat-section-0-body`); `controlIdOf` replaces
non-ASCII with `-`, so Chinese titles would collide. Tests should assert "six
distinct ids, every `aria-controls` resolves", not pin the literal id
(docs/interaction-design.md §16.4.7 / `docs/verification.md` §17.6).
The `18px` alignment precondition is a **real primitive icon** (`svg` 14px); the
`FallbackIcon` degraded path renders an unsized `<span>`, so the fixture must
draw the real icon shape (docs/interaction-design.md §16.4.6).

`DisclosureRow` is **no longer resolved or used by the panels** (v8): the
instance cards moved to `instanceCardHead` in v7, and the compat sections joined
them in v8, so the primitive binding and its `FallbackDisclosureRow` stand-in are
deleted (docs/interaction-design.md §16.5 W2/W7).

## `lib/client.js`

Wiring only:

- `inject = ["slots", "locale", "remote", "remote.settings", "remote.credentials",
  "remote.llm", "configForms", "settingsSchema"]` — **8 entries (v9 adds
  `remote.llm`)**.
  Each remote namespace is its own cordis service key, so a namespace must be
  injected before it is read; reading an uninjected key throws during activation
  and fails the whole web-boot entry. Access is additionally wrapped, so a host
  without the credential namespace degrades instead of failing boot, and a host
  without `remote.llm` still renders the page with model discovery refused
  (`lib/client.js` 的 `inject`).
- Registers `settings.section` with a **fresh** id (`model-extended`, order 12)
  so the shipped `models` cell is untouched.
- Mounts inside `configForms.whileServed(["llm-pi-ai"], …)`, so with the adapter
  absent no nav cell is registered and no chunk is ever requested.
- Reads the schema from the live `remote.settings.describe()` descriptor via the
  `configForms.describe()` mirror; no hardcoded field list, no environment probing.
- Loads the chunks in the `CHUNK_PLAN` phase order with `require.async` (see the
  table at the top of this document), then renders through `React.lazy` +
  `React.Suspense` (with a `useState` fallback). The owner hands
  `client.page.js` its own `PageBoundary` class and locale id through
  `__internals.loadPage()`'s deps — the page is a chunk now, so the boundary it
  uses is the one built at bundle-init time.
- Validates drafts with `ctx.settingsSchema.rehydrate` + `.validate`, and a
  malformed envelope disables validation instead of breaking the page.
- Hands the page chunk everything it needs (`ensureChunks()` + `loadPage()`), and
  registers a page whose `makePage` renders `ProviderTabs` above the body and
  `ProviderPanel` inside it. There is no route/advanced/models tab state: the body
  always shows every group of the selected provider.
- The page face builds the tab items (see `lib/client.page.js`): one per provider
  name, in document order, with `label = fields.profileLabel(profile) || key`, and
  position-based DOM ids
  `model-extended-tab-<index>-<sanitized>` / `model-extended-panel-<index>-<sanitized>`
  (the index is what keeps two keys that sanitise alike unique). Since v7 the
  trailing add tab uses the fixed ids `model-extended-tab-add` /
  `model-extended-panel-add` (docs/interaction-design.md §15.2).
- `role="tabpanel"` + `id` + `aria-labelledby` are applied **only** while a tab is
  active — a provider tab or the v7 add tab (`model-extended-panel-add`,
  `aria-labelledby="model-extended-tab-add"`). D2 (decided): with **0** providers
  no tablist, no `role="tab"` and no tabpanel are rendered — the add form renders
  in place; the tabs (including the trailing add tab) appear only with **≥1**
  provider.
- Renders the selected provider's delete control inside `.piai-bar` (v7), with the
  same inline two-step confirmation the panels use; the write stays
  `staged.remove(["providers", name])`.
- Reads the credential remote and exposes it to the panels:
  `ctx.remote.credentials.describe/set/unset`, refreshed on
  `ctx.remote.$on("credentials/{record,reference}-updated")`, and
  `available: false` when the host has no credential remote. The credential
  reference leaves are found by `meta.role === "credential-ref"` — never by a
  field name — and only the reference name ever travels the settings pipeline;
  the secret goes to `credentials.set` exclusively.
- Wraps the strip and the body in their own error boundaries (`PageBoundary`), so
  a crash in either panels-chunk face cannot abdicate the settings cell.

**v9 owner responsibilities (still wiring, still no field mapping):**

- **Model discovery probe.** The owner — never the panels chunk — assembles
  `LlmModelDiscoveryRequest` from the *selected provider's draft*:
  `{provider, baseURL?, api?}`, where `baseURL`/`api` are read from the draft
  entry and only forwarded when they are non-empty strings (a `!!js` expression or
  an unset field is genuinely absent). These two names are the argument of the
  adapter's own discovery call, not a field→group mapping, which is why they may
  live in `lib/client.js` under AGENTS §3.2 (`lib/client.page.js` 的 `makePage()`（probe 组装）).
  The wrapper always resolves `{kind:'found', models}` or
  `{kind:'refused', message}` — an absent `remote.llm`, a missing
  `discoverModels`, or a synchronous throw all become a refusal, never a render
  error (`lib/client.page.js` 的 `makePage()`（`discover()`）). It is passed to `ProviderPanel` as `catalog`.
- **「原代码」 read-only face.** A page-local `rawMode` state toggles the body
  between the form and a read-only YAML rendering of `formSnapshot.values` (the
  staged draft, unsaved edits included). The YAML comes from
  `lib/client.yaml.js`'s `toYaml`; rendering uses the shipped `CodeBlock` with
  `{lang:'yaml', lineNumbers:true}` and degrades to `<pre class="piai-expr-body">`
  without it. When the draft is dirty the face prepends the `rawNotice` line. No
  op is staged, no revision is touched, and the sticky bar is unchanged
  (`lib/client.page.js` 的 `makePage()`（`rawFace()`）). The toggle itself is the `actions` node of
  `ProviderTabs`, drawn in the tab strip's right slot (`lib/client.page.js` 的 `makePage()`（`rawActions`）).
- **Raw-view fallback.** A missing YAML chunk shows one bundled line
  (`RAW_VIEW_FALLBACK`) instead of a stack trace; a missing `CodeBlock` primitive
  falls back to `FallbackPre` (`<pre class="piai-expr-body">`), so the raw face can
  never throw during render (`lib/client.core.js` 的 `FallbackPre()`、`lib/client.page.js` 的 `RAW_VIEW_FALLBACK`).

## Chunk envelope (mandatory — every module except `lib/client.js`)

`lib/client.js` is the bundle owner: it loads once, from `exports["./client"]`,
and carries `window.__ModuleLoader__.load({ id, factory })` with **no** `chunk`.

Every other module is a package-local chunk and must be a script that is valid
as **both** a browser classic script and a Node ES module, so the tests exercise
the exact shipped bytes. Concretely: no `import`, no `export`, no `module.exports`.

Sibling chunks are loaded by the owner with `require.async("./client.<name>.js")`,
and each chunk registers itself with the `chunk` field:

```js
// lib/client.<name>.js
;(function (global) {
  'use strict'

  // ... pure implementation, no browser or Node globals beyond `global` ...

  var api = { someFunction: someFunction }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.<name> = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: 'dsh-llm-pi-ai-config',
      chunk: 'client.<name>.js',
      factory: function () {
        return api
      },
    })
  }
})(globalThis)
```

`chunk` must equal the file name and match
`/^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`. The owning `id` is always
`dsh-llm-pi-ai-config`.

Two access paths, both required to work:

| Context | How the API is reached |
| --- | --- |
| Browser | `(await require.async("./client.<name>.js")).<export>` |
| Node test | `await import('./lib/client.<name>.js')`, then `globalThis.__dshLlmPiAiConfig.<key>` |

**Registry keys (v10).** The key is not always the file stem: the facades keep the
historical keys their consumers already use, and the sub-modules get their own.

| File | Key | Who reads it |
| --- | --- | --- |
| `client.core.js` | `core` | the owner (page/facade deps), `panels.*` via `shared.core` |
| `client.schema.js` / `client.form.js` / `client.yaml.js` | same stem | the owner, tests |
| `client.fields.groups.js` / `client.fields.hints.js` | `fieldsGroups` / `fieldsHints` | `client.fields.js` at eval time |
| `client.fields.js` | `fields` | the owner, `client.page.js` |
| `client.page.js` | `page` | the owner (`__internals.loadPage()`) |
| `client.panels.*.js` | `panelsKit`, `panelsControls`, `panelsCollections`, `panelsRender`, `panelsInstances`, `panelsCatalog` | `client.panels.js` |
| `client.panels.js` | `panels` (deferred `{createPanels, componentNames}`, then the built `{ProviderTabs, ProviderPanel}` merged in) | the owner, tests |
| `client.styles.chrome.js` / `client.styles.controls.js` | `stylesChrome` / `stylesControls` | `client.styles.js` at eval time |
| `client.styles.js` | `styles` | the owner (install/uninstall) |

`client.core.js` and `client.page.js` follow the same "deferred then built" rule as
`client.panels.js`: the script publishes the require-free part, and the chunk
factory writes the built API (the one carrying `ui`, or `{makePage}`) back into the
registry, because the factory is the only place a `require` exists.

The owner seeds the registry by loading chunks in the plan's phase order before it
renders, and hands the chunk bag down as props (the panel layer additionally gets
its `shared` bag from the facade). Panels therefore read no global and perform no
I/O: they are pure functions of their props.

## Module roster and ownership

| File | Registry key | Exports |
| --- | --- | --- |
| `lib/index.js` | — | the (empty) host half; ships no client chunk |
| `lib/client.js` | owner | `apply`, `inject` (+ `__internals.{loadPage, lazyComponent, ensureChunks, chunkPlan, pageBoundary}`) |
| `lib/client.core.js` | `core` | pure helpers, `UNSET_VALUE`, `createUi` |
| `lib/client.schema.js` | `schema` | `node`, `leaves`, `shape`, `isExpression` |
| `lib/client.form.js` | `form` | `diffOps`, `createStagedForm` |
| `lib/client.fields.groups.js` | `fieldsGroups` | `FIELDS`, `GROUPS`, `COMPAT_GATES` |
| `lib/client.fields.hints.js` | `fieldsHints` | `VALUE_LABELS`, `VALUE_HINTS`, `MODE_HINTS` |
| `lib/client.fields.js` | `fields` | `groupLeaves`, `describeField`, `compatGate`, `compatDisposition`, `offeredCompatVocabulary`, `labelFor`, `hintFor`, `keyLabelFor`, `presentationPathOf`, `branchLabelFor`, `valueLabelFor`, `valueHintFor`, `modeHintFor`, `profileLabel` (+ the tables above) |
| `lib/client.yaml.js` | `yaml` | `toYaml` |
| `lib/client.page.js` | `page` | `createPage` → `{makePage}` |
| `lib/client.panels.kit.js` | `panelsKit` | `createKit` |
| `lib/client.panels.controls.js` | `panelsControls` | `createControls` |
| `lib/client.panels.collections.js` | `panelsCollections` | `createCollections` |
| `lib/client.panels.render.js` | `panelsRender` | `createRender` |
| `lib/client.panels.instances.js` | `panelsInstances` | `createInstances` |
| `lib/client.panels.catalog.js` | `panelsCatalog` | `createCatalog` |
| `lib/client.panels.js` | `panels` | `createPanels`, `componentNames`, and (once built) `ProviderTabs`/`ProviderPanel` |
| `lib/client.styles.chrome.js` | `stylesChrome` | `css` |
| `lib/client.styles.controls.js` | `stylesControls` | `css` |
| `lib/client.styles.js` | `styles` | `STYLESHEET`, `CLASSES`, `COMPLETE`, `install`, `uninstall` |

`lib/client.js` renders the page through `React.lazy` + `React.Suspense`, the
proven pattern in
`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`. Slot registration stays
synchronous; only the page body suspends.

Loading order is the `CHUNK_PLAN` table at the top of this document, so a chunk may
rely on an earlier phase being materialised before it reads the registry. The owner
requests exactly the planned names — asserted three ways by
`tests/wiring.test.js`, `tests/module-contract.test.js` and the P8a check in
`tests/verify.polish.mjs`.

## `lib/client.yaml.js` (chunk `yaml`, v9)

```js
/** The chunk's whole API. */
export function toYaml(value) // -> string
```

- **One-way emitter, read-only.** There is no parser, no round-trip promise, and
  nothing here ever feeds the settings pipeline; the write path stays
  `configForms.mutate(ops, revision)`. Its only consumer is the owner's 「原代码」
  face.
- **Never throws.** `undefined`, functions, symbols, `BigInt`, a throwing getter,
  a cycle and a structure deeper than `MAX_DEPTH = 24` all degrade to a safe
  rendering (`null`) instead of raising; an unexpected internal failure returns the
  whole-document fallback `# 无法序列化的值`. The result is always a string
  (exercised by `tests/yaml.test.js`).
- **Frozen shape.** Object → one `key: value` per line, nested containers open a
  block; array → `- item`, an object element starts `- key: value`; empty
  containers → `{}` / `[]`; scalars bare for number/boolean, `null` for null, and
  a double-quoted string whenever a bare scalar would be ambiguous or illegal
  (empty, padded, special initial character, `: ` / ` #`, trailing `:`, a
  number/boolean/null look-alike, a control character); keys quote by the same
  rule.
- **Expression nodes** (`{__jsExpr: string}`, the plugin's representation of an
  unevaluated `!!js`) are emitted as `!!js <text>`; a multi-line text becomes the
  `|-` block scalar, one indent level deeper. The source text is never rewritten.
- **No trailing newline** on the returned string.
- It is a package-local chunk like the others (no `import`/`export`/
  `module.exports`), publishes `globalThis.__dshLlmPiAiConfig.yaml`, and registers
  with `window.__ModuleLoader__.load({ id, chunk:'client.yaml.js', factory })`.
