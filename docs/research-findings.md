# Research findings: `llm-pi-ai` and the DSH client module system

Evidence gathered before any code was written. Every claim below traces to a
specific file in the installed application, quoted by path. Nothing here is
inferred from a field name alone.

## 1. The configuration target

`@deepseek-ai/dsh-llm-pi-ai` v0.2.0-rc.2 declares one settings namespace:

```js
// node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js
const Config = z.object({ providers: z.dict(profile).default({}).volatile() })
```

- The namespace id is the Loader entry id `llm-pi-ai` (patch id), surfaced by
  `remote.settings.describe()` as `ns: "llm-pi-ai"`.
- `providers` is a **dict** whose values are per-provider profiles, so provider
  names are user-chosen keys, not fixed fields.
- The whole `providers` node is `volatile`, which is why the shipped Models page
  can edit it live. `volatileForm` in `@deepseek-ai/dsh-settings` keeps every
  field under a volatile ancestor.

### Field inventory (from the live schema, not from prose)

`Config.toJSON()` → `volatileForm` yields a 144-node uid graph. Resolving it with
the real Schemastery gives:

- **22 provider-level fields**: `apiKeyEnv`, `displayName`, `api`, `baseURL`,
  `models`, `modelOverrides`, `compat`, `defaultContextWindow`,
  `defaultMaxTokens`, `defaultInput`, `headers`, `reasoning`, `thinkingBudgets`,
  `cacheRetention`, `transport`, `timeoutMs`, `websocketConnectTimeoutMs`,
  `streamIdleTimeoutMs`, `maxRequestImageBytes`, `requestImagePixelBudget`,
  `requestImageMaxBytes`, `retryPolicy`.
- **7 model-level fields** (`models[]` and `modelOverrides.<id>`):
  `id`, `name`, `contextWindow`, `maxTokens`, `input`, `reasoningEfforts`,
  `compat`.
- **26 `compat` keys**, identical at provider and model level.

The README documents only a subset; the schema is authoritative. The shipped
Models page exposes **7** of the 22 provider fields by strict string-literal
audit (`apiKeyEnv`, `displayName`, `api`, `baseURL`, `models`,
`defaultContextWindow`, `defaultInput`); `defaultMaxTokens` appears only as
`schema.getPath(fallback, ["maxTokens"])`, so a looser count reaches 8 — the
stricter number is used here. At model level it exposes 5 of 7. The remaining
fields are what this project adds.

## 2. The write path

The sanctioned pipeline, verified by reading each stage:

```
ctx.configForms.get("llm-pi-ai")            dsh-client-ui-settings/lib/client.js
  -> ConfigFormController.mutate(ops, rev)  minimal path ops + revision guard
  -> remote.settings.mutate(ns, ops, rev)   dsh-api-settings-controller
  -> ctx.settings.write / mutate            dsh-settings/lib/index.js
  -> ctx.configEditor.edit(document)        dsh-config-editor/lib/index.js
  -> writeFileAtomic(patchPath, 0o600)      atomic, per-profile file lock
```

`mutate` applies `{op:"set"|"unset", path}` operations. An `unset` on an array
element splices; an `unset` on an object key removes it. A cleared form field
must therefore be `unset` (inherit), never `null`.

`describe()` reports the schema, the committed `value`/`user`/`base` projections
and a `revision`. A stale revision raises `SETTINGS_CONFLICT`; the editor leaves
the draft intact rather than retrying blindly.

## 3. The client module system

A package's browser half is discovered from its own `package.json`, not from a
registry:

```js
// dsh-client-modules/lib/index.js, locatePkgJson
const internal = this.ctx.loader.internal
moduleUrl = internal.resolveSync(loaderName, baseUrl, {}).url   // v1 loader
return this.nearestPackage(moduleUrl, expectedPackageName)
```

Requirements, each verified by experiment:

1. The package must appear as a Loader entry (so it needs a host half).
2. `dsh.client.platform` must be `"web"`, and `exports["./client"]` must exist.
3. `nearestPackage` walks up from the resolved module and accepts a manifest only
   when `name === loaderName` (for a bare specifier).

### Package-local chunks are supported

Two shipped packages use them, so the module split in this project is not
speculative:

```js
window.__ModuleLoader__.load({
  id: "@deepseek-ai/dsh-client-ui-sidebar-documentpreview",
  chunk: "client.pdf.js",
  factory: (require) => { ... }
})
```

and the owner requests it with `await require.async("./client.pdf.js")`. The
served file name must match `CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/`.

### Hot reload

`client-hmr` watches the profile patch file and each bundle. Touching a bundle
changes the graph revision within ~1s (`rebuilt` path, verified live:
`dc59e17bf15b` → `950d2f404e8b`). Editing code is therefore hot; only *first
discovery* of a new package is not.

## 4. Why first discovery needs one restart

`resolveMeta` caches its verdict — including the negative "this is not a client
package" verdict — per `baseUrl + "\0" + loaderName`:

```js
sourceKey(loaderName, baseUrl) { return `${baseUrl}\0${loaderName}` }
// "Package metadata (including the negative 'not a client package' verdict) is
//  cached per Loader specifier and owning-tree base URL until restart."
```

The profile symlink `node_modules/dsh-llm-pi-ai-config` was created **before**
this package's `package.json` existed, so the negative verdict was cached against
that exact key and no later patch can clear it.

Isolation experiments (each reverted afterwards):

| Experiment | Result |
| --- | --- |
| Insert a brand-new package of the same shape | enters the graph (76 entries) |
| Insert this package | never enters (75 entries) |
| Fresh alias specifier → same manifest | rejected: name must equal the specifier |
| Path-like specifier (`./node_modules/...`) | rejected: upstream manifest name mismatch |
| Replace symlink with a real directory copy | still absent → not a symlink problem |
| Touch an existing bundle | revision changes → HMR itself works |

Conclusion: the blocker is the cached negative verdict for this exact package
name, and only a process restart clears it. The user chose to finish the
implementation and tests first, so GUI verification of the new cell is recorded
as pending in `docs/verification.md` rather than claimed.

## 5. Constraints this imposes on the design

- **No hardcoded field list.** Fields must be enumerated from the live schema
  envelope, or a forgotten field is invisible.
- **No host-side state.** The plugin registers no namespace; it edits the
  `llm-pi-ai` row through the shared pipeline.
- **No comments survive inside an edited row.** `configEditor.edit` rewrites the
  matched row's `config` node, so YAML comments inside `llm-pi-ai`'s block are
  lost — the same behavior as the shipped Models page. Rows and comments outside
  that block are preserved. Documented, not worked around.
- **Gates are advisory.** `COMPAT_GATES` in the adapter rejects a withheld key
  with a hard error naming the field; the UI should guide but must surface the
  adapter error unchanged.

## 6. v9 evidence: "cleared" (`unset`) versus literal `null`

Everything below was measured read-only against the installed application; the
full report (method, schemastery probes, every raw excerpt) is at
`/tmp/piai-research/UNSET_VS_NULL.md`. Path aliases used there and here:

| alias | file inside `app.asar` |
| --- | --- |
| `ADAPTER:n` | `dsh/node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js:n` |
| `PICOMP:n` | `dsh/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js:n` |
| `PISIMPLE:n` | `dsh/node_modules/@earendil-works/pi-ai/dist/api/simple-options.js:n` |
| `SCHEMA:n` | `dsh/node_modules/@deepseek-ai/schemastery/src/index.ts:n` |
| `CORDIS:n` | `dsh/node_modules/@deepseek-ai/cordis/lib/index.js:n` |
| `EDITOR:n` | `dsh/node_modules/@deepseek-ai/dsh-config-editor/lib/index.js:n` |
| `VALUES:n` | `dsh/node_modules/@deepseek-ai/dsh-util-values/lib/index.js:n` |

### 6.1 Two resolution layers (why a field can be absent and still not `{}`)

1. `EDITOR:77-83` builds `next` from the raw entry config, runs
   `fiber.ctx.waterfall(fiber, "internal/config", next, () => next)` →
   `resolveConfig(fiber.runtime, resolved)`, and only then writes YAML
   (`EDITOR:123`). A throw anywhere in that chain **aborts the write**.
2. The adapter's handler is `ADAPTER:2556-2562`: `const candidate = Config(raw)`
   then `assertServiceable({ providers: structuredClone(candidate.providers.get()) }, …)`.
3. `CORDIS:956-962` / `CORDIS:1345-1348` assign the **schema-resolved** value, so
   `profiles()` reads the parsed profile. Two measured consequences:
   an absent `dict`/`object` materializes as `{}` (`SCHEMA:912-913`:
   `if (name === 'object' || name === 'dict') { schema.meta.default = {} }`), while
   a *present* key whose value is `null` is **retained** (`SCHEMA:812-823`, line 817:
   `if (!isNullable(value) || key in data) result[key] = value`).

### 6.2 Verdicts (all measured, not inferred)

- **`compat.chatTemplateKwargs` / `compat.chatTemplateArgs`** (`ADAPTER:975-976`;
  offered only by `openai-completions`, `ADAPTER:391-392` inside
  `COMPLETIONS_COMPAT_GATE`). Schema: `z.dict(chatTemplateKwarg)`, where
  `chatTemplateKwarg` is `string | number | boolean | null | {$var, omitWhenOff?}`
  (`ADAPTER:946-962`). The adapter only copies configured entries into pi-ai
  (`ADAPTER:616-627`) and drops an **empty** dict (`configuredCompatEntries`,
  `ADAPTER:477-481`), so an empty dict is indistinguishable from an absent one.
  pi-ai resolves each value at request time (`PICOMP:765-791`): `undefined`
  results are dropped (`PICOMP:769-771`), a resolved object with no keys becomes
  `undefined` for the whole field (`PICOMP:773`, `PICOMP:647-648`), while a
  literal `null` is returned verbatim (`PICOMP:776-777`) and kept, so the body
  carries `"key": null` — **distinguishable from an absent key**. Nothing
  rejects `null` or `""` for a dict *value* (only wrong types fail).
- **`headers`** (`ADAPTER:1028`). Absent key → header not sent (`ADAPTER:1737-1744`).
  A `null` value is kept by the schema, passes `assertValidHeaders`
  (`ADAPTER:1070-1076`, which only asks `Headers` to accept the pair), and WebIDL
  `ToString` turns it into the **literal string `"null"`** on the wire; `""` sends
  an empty header. Nothing rejects either.
- **`reasoningEfforts`** (`ADAPTER:1001`, wrapper `ADAPTER:1008`). Only keys in
  `THINKING_LEVELS` validate; a valueless value is legal **only** for `off`
  (`ADAPTER:568-579`: `low: null` → `needs the wire value dispatch should send`,
  `low: ""` → `must not be an empty string`, and at least one non-`off` level must
  be declared). Absent `off` means "unsupported" (`ADAPTER:580-589` sets
  `map[level] = null`), which is **not** the same as writing `off: null`
  ("supported, send nothing"). Clearing a row therefore means *delete that key*,
  and clearing the whole field means *omitting* it — never a value-level `null`.
- **Ordinary optional scalars** (`ADAPTER:1021-1048`, `ADAPTER:941-946`). Absence is
  always accepted (`SCHEMA:812-823` + `.default()`). `null` is **not** rejected by
  the schema (`SCHEMA:533-543` short-circuits nullable data before any member
  schema runs), but downstream it is always one of: a `TypeError`
  (`baseURL`/`displayName` `ADAPTER:1092-1093`; `retryPolicy` `ADAPTER:1144`), a
  named validation error (`compat` top-level scalar with `value == null`,
  `ADAPTER:528`), a `.required()` rejection (`models[].id`, `SCHEMA:533-535`), a
  default that makes it *behave* like absence (`defaultContextWindow`,
  `streamIdleTimeoutMs`, `maxRequestImageBytes`, …), or a value silently forwarded
  into the request (`timeoutMs` → `timeout: null`; `transport`; `cacheRetention`;
  `thinkingBudgets.*: null` **erases** that level's budget instead of keeping the
  2048 default).
- **Do absent and `null` ever coincide?** Only at **container** level
  (`ADAPTER:478` `Object.entries(compat ?? {})`, `ADAPTER:1071`
  `Object.entries(headers ?? {})`, `PICOMP:1326-1327`
  `model.compat.chatTemplateKwargs ?? detected.chatTemplateKwargs`) and through
  schema defaults. At **leaf** level they never do: `VALUES:176-188` compares by
  key count (`{a:null}` ≠ `{}`), pi-ai tests `resolved !== undefined`
  (`PICOMP:769`), and the adapter tests `value == null` (`ADAPTER:528`).

**Project conclusion** (the rule the page implements): clearing a field is
`{op:"unset"}` — the key disappears and the lower layer / adapter default wins.
A literal `null` is written **only** where the field's own schema declares a
nullable alternative *and* the user explicitly picks it; today that means no UI
entry at all, because the one adapter-legal `null` (`reasoningEfforts.off: null`)
has a dedicated control that writes nothing (see `docs/field-coverage.md`).

### 6.3 Model discovery (`llm/discoverModels`)

The shipped chain, verified in the asar:

```
dsh-client-ui-settings-models/lib/client.js (line 2810)
  ctx.remote.llm.discoverModels(settingsNs, request)
    → remote @deepseek-ai/dsh-llm#llm/discoverModels
      (dsh-llm/lib/typert.host.js:43; schemas :4-22; signatures :150-169)
    → LlmRuntime.remoteDiscoverModels → LlmRuntime.discoverModels
      (dsh-llm/lib/types/index.js:468-512; errors NO_DISCOVERY / INVALID_DISCOVERY,
       RemoteError('llm/model-discovery-rejected'))
    → the registry entry registered by llm-pi-ai
      (dsh-llm-pi-ai/lib/index.js:2608 ctx.llm.registerModelDiscovery(settingsNs, …))
    → the adapter's discoverModels(request, storedProfile)
      (dsh-llm-pi-ai/lib/index.js:2286)
```

- Request shape (`dsh-llm/lib/typert.host.js:372-373`):
  `LlmModelDiscoveryRequest = { provider?, baseURL?, api?, apiKey? }`; result
  `LlmDiscoveredModel = { id, name?, contextWindow?, maxTokens?, inputModalities? }`
  (`:352-353`). `settingsNs` is the Loader entry id, `"llm-pi-ai"`
  (`dsh-llm-pi-ai/lib/index.js:2492`, `:2535`).
- The shipped page builds the request from the **draft** (typed, unsaved API key
  included) and opens a searchable checkbox picker; nothing is written until
  **添加所选** (`dsh-client-ui-settings-models/lib/client.js` line 662-667, `:694-703`,
  `:824-878`). Adopted rows copy `id` / `name` / `contextWindow` / `maxTokens` /
  `input`, and an existing row is never overwritten.
- Adapter behaviour (`dsh-llm-pi-ai/lib/index.js`): an installed catalog provider
  answers **offline** from pi-ai's model catalog (`catalogModels`, `:369`,
  imported from `@earendil-works/pi-ai/providers/all`, `:9`); otherwise it needs a
  `baseURL` and one of `LISTABLE_PROTOCOLS` (`:2140` =
  `anthropic-messages` / `openai-completions` / `openai-responses`), and issues
  `GET {base}/models` (Anthropic: `{root}/v1/models?limit=1000`, `:2176`).
- The dependency is **`@earendil-works/pi-ai` 0.87.1** — there is no
  `@mariozechner/pi-ai` package in the archive (only a `cchistory.mariozechner.at`
  URL comment inside pi-ai source; the npm author field is "Mario Zechner").
- `remote.llm` exposes exactly three methods (`discoverModels`,
  `listConfigurableProviders`, `listProviders`); the host-side
  `llm.listModels(provider)` (`dsh-llm/lib/typert.host.js:191-196`) is **not**
  reachable from the browser.

### 6.4 No shipped raw-config editor exists

Searched the whole archive for `CodeEditor` / `CodeMirror` / `codemirror` /
`monaco` / `Monaco` (zero hits) and for `textarea` in every
`@deepseek-ai/dsh-client-ui-settings*` bundle (zero hits). The only
syntax-highlighted renderer in the shared primitives is `CodeBlock`, which is
**read-only** (`JsonTree` / `JsonBlock` likewise). The shipped `ui-plugin-manager`
writes only a row's `disabled` override and never edits raw YAML
(`dsh-client-ui-plugin-manager/README.md:56`), and the shipped Models page pushes
advanced fields out of the UI with `advancedHint: "其余字段在 cordis.patch.yml
中，请直接编辑对应段。"` (`dsh-client-ui-settings-models/lib/client.js` line 3031).
=> the page's 「原代码」 view is a **new, read-only projection of our own draft**;
there is no upstream implementation to reuse and no parser to copy.
