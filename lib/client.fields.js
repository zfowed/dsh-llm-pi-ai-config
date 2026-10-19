/**
 * Field presentation logic: which group a leaf belongs to, what it is called,
 * and what its hint says.
 *
 * v10 split the data out of this file: `client.fields.groups.js` carries the
 * groups/field labels/compat gates, `client.fields.hints.js` carries the
 * per-value copy. Both are read out of the registry at eval time, so the owner
 * requests them in the phase before this chunk. A missing data chunk is a loud
 * chunk-load failure: silently rendering every field under its raw path would
 * look like a working page that lost all its Chinese copy.
 *
 * This module is **presentation only** — it is not the source of truth for which
 * fields exist (`docs/interface-contract.md`): the field set comes from the
 * runtime schema envelope, and anything this file does not recognise still
 * renders (fallback group `other`, path-derived label, generic control).
 *
 * Chunk envelope: plain script, no `import`/`export`.
 *
 * @module dsh-llm-pi-ai-config/client.fields
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.fields.js'

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})

  // -------------------------------------------------------------------------
  // data chunks (phase 0)
  // -------------------------------------------------------------------------

  var tables = registry.fieldsGroups
  var hints = registry.fieldsHints
  if (tables === undefined || hints === undefined) {
    throw new Error(
      'dsh-llm-pi-ai-config: client.fields.groups.js and client.fields.hints.js must be ' +
        'loaded before client.fields.js',
    )
  }

  /** Grouping, per-field labels/hints and the protocol compat gates. */
  var FIELDS = tables.FIELDS
  var GROUPS = tables.GROUPS
  var COMPAT_GATES = tables.COMPAT_GATES

  /** Per-value labels and the option/mode explanations. */
  var VALUE_LABELS = hints.VALUE_LABELS
  var VALUE_HINTS = hints.VALUE_HINTS
  var MODE_HINTS = hints.MODE_HINTS

  function relativePath(path) {
    if (Array.isArray(path)) {
      if (path.length > 2 && path[0] === 'providers') return path.slice(2)
      return path
    }
    var text = String(path)
    if (text.indexOf('providers.') !== 0) return text
    var rest = text.slice('providers.'.length)
    var dot = rest.indexOf('.')
    if (dot === -1) return text
    return rest.slice(dot + 1)
  }

  /** The instance-relative dotted path the matchers and FIELDS are keyed by. */
  function matchPath(path) {
    var relative = relativePath(path)
    return Array.isArray(relative) ? relative.join('.') : relative
  }

  /**
   * Reduce a dotted path to the key {@link FIELDS} uses.
   *
   * `models.compat.supportsStore` and `modelOverrides.name` carry an instance
   * prefix that the presentation table does not repeat, so the prefix is
   * stripped and `compat.*` stays addressable as a whole. The `providers.<name>`
   * prefix of the page's own leaf paths is stripped first.
   *
   * @param path - dotted path such as `models.reasoningEfforts`.
   * @returns the lookup key, e.g. `reasoningEfforts`.
   */
  function lookupKey(path) {
    var key = matchPath(path)
    if (key.indexOf('models.') === 0) return key.slice('models.'.length)
    if (key.indexOf('modelOverrides.') === 0) return key.slice('modelOverrides.'.length)
    return key
  }

  /**
   * Turn a wire field name into a readable fallback label.
   *
   * A field with no presentation entry must still be labelled sensibly rather
   * than disappearing or showing as a raw key.
   *
   * @param path - dotted path.
   * @returns a humanized label.
   */
  function humanize(path) {
    var leaf = path.split('.').pop() || path
    return leaf
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, function (character) {
        return character.toUpperCase()
      })
  }

  /**
   * Presentation for one field.
   *
   * Only ever overrides presentation: a missing entry is not an error and never
   * removes the field from the page.
   *
   * @param path - dotted path, e.g. `compat.thinkingFormat`.
   * @returns `{label?, hint?, kind?, unit?, rows?, pair?, titleRank?}`; `{}`
   *   when nothing is known.
   */
  function describeField(path) {
    var key = lookupKey(String(path))
    var entry = FIELDS[key]
    if (entry === undefined) return {}
    var result = {}
    if (entry.label !== undefined) result.label = entry.label
    if (entry.hint !== undefined) result.hint = entry.hint
    if (entry.kind !== undefined) result.kind = entry.kind
    if (entry.unit !== undefined) result.unit = entry.unit
    if (entry.rows !== undefined) result.rows = entry.rows
    if (entry.pair !== undefined) result.pair = entry.pair
    if (entry.titleRank !== undefined) result.titleRank = entry.titleRank
    return result
  }

  /**
   * The dotted path presentation is keyed by.
   *
   * A leaf the panels re-based onto an instance (`providers.p.models.0.input`)
   * carries the pre-rebase path as `presentationPath`; the presentation table is
   * keyed relative to one provider profile and does not know instance segments,
   * so the presentation path is the one to look up. Reading and writing always
   * use `leaf.path`.
   *
   * @param leaf - a leaf from `leaves()`.
   * @returns the dotted path for presentation lookups.
   */
  function presentationPathOf(leaf) {
    if (leaf === null || leaf === undefined) return ''
    var path = Array.isArray(leaf.presentationPath) && leaf.presentationPath.length > 0
      ? leaf.presentationPath
      : leaf.path
    return (path || []).join('.')
  }

  /**
   * The display label of one union branch, looked up as
   * `<field key>.branch.<branch value | branch kind>`.
   *
   * Falls back to whatever the schema walker reported (a discriminator value or
   * the branch node type), so an unlisted branch still renders a readable
   * selector instead of disappearing.
   *
   * @param leaf - the union leaf.
   * @param branch - one entry of `leaf.branches`.
   * @returns the label to show.
   */
  function branchLabelFor(leaf, branch) {
    if (branch === null || branch === undefined) return ''
    var key = lookupKey(presentationPathOf(leaf))
    var token = branch.value === undefined || branch.value === null
      ? String(branch.kind !== undefined ? branch.kind : branch.label)
      : String(branch.value)
    var entry = FIELDS[key + '.branch.' + token]
    if (entry !== undefined && entry.label !== undefined && entry.label !== '') return entry.label
    return branch.label !== undefined ? branch.label : token
  }

  /**
   * The YAML key path shown beside a row, so the UI always maps to the config
   * file. Instance containers are marked structurally: `models[].maxTokens`,
   * `modelOverrides.<id>.name`.
   *
   * @param leaf - a leaf from `leaves()` (instance-rebased or not).
   * @returns a short key label such as `apiKeyEnv` or `compat.thinkingFormat`.
   */
  function keyLabelFor(leaf) {
    var segments = presentationPathOf(leaf).split('.').filter(function (part) {
      return part !== ''
    })
    if (segments.length > 2 && segments[0] === 'providers') segments = segments.slice(2)
    if (segments[0] === 'models' && segments.length > 1) {
      return 'models[].' + segments.slice(1).join('.')
    }
    if (segments[0] === 'modelOverrides' && segments.length > 1) {
      return 'modelOverrides.<id>.' + segments.slice(1).join('.')
    }
    return segments.join('.')
  }

  /**
   * Resolve the label for one leaf, preferring the presentation table and
   * falling back to a humanized path so a new schema field still renders.
   *
   * @param leaf - a leaf from `leaves()`.
   * @returns the label to show.
   */
  function labelFor(leaf) {
    var path = presentationPathOf(leaf)
    var described = describeField(path)
    if (described.label !== undefined && described.label !== '') return described.label
    return humanize(path)
  }

  /**
   * Resolve the hint for one leaf: the presentation table first, then the
   * schema's own `meta.description` (which the host already localized).
   *
   * @param leaf - a leaf from `leaves()`.
   * @returns the hint, or `undefined`.
   */
  function hintFor(leaf) {
    var path = presentationPathOf(leaf)
    var described = describeField(path)
    if (described.hint !== undefined && described.hint !== '') return described.hint
    if (leaf.description !== undefined && leaf.description !== '') return leaf.description
    return undefined
  }

  /**
   * The display label of one provider profile, for the provider tab strip.
   *
   * Presentation only, and the one place the page is allowed to read a field
   * VALUE: the tab labels must show the human name a user configured, and
   * `displayName` is exactly one of the labels this module already owns (see
   * `FIELDS.displayName`). The page never uses this to decide *which* fields
   * exist, and a missing/blank/non-string value simply falls back to the
   * provider key, so an upstream rename degrades to a readable key rather than
   * dropping the provider.
   *
   * @param profile - the provider profile value (`values.providers[name]`).
   * @returns the display name, or `undefined` when there is none to use.
   */
  function profileLabel(profile) {
    if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) return undefined
    var name = profile.displayName
    if (typeof name !== 'string') return undefined
    var trimmed = name.trim()
    return trimmed === '' ? undefined : trimmed
  }

  /**
   * Bucket leaves into ordered render groups.
   *
   * Guarantee: every leaf in `leaves` appears in exactly one returned group.
   * The `other` group is an unconditional catch-all, so an unrecognised path —
   * including one added by a future version of the adapter — still renders
   * through the generic control rather than being silently dropped.
   *
   * Empty groups are omitted, so a page never shows an empty heading.
   *
   * @param leaves - leaves from the schema walker.
   * @returns ordered `{id, title, hint?, leaves}[]`; `[]` for an empty input.
   */
  function groupLeaves(leaves) {
    var list = Array.isArray(leaves) ? leaves : []
    var buckets = []
    for (var index = 0; index < GROUPS.length; index += 1) {
      buckets.push({ definition: GROUPS[index], leaves: [] })
    }
    for (var position = 0; position < list.length; position += 1) {
      var leaf = list[position]
      // The page's leaves are absolute (`providers.alpha.api`); the matchers are
      // relative to one provider profile. See {@link relativePath}.
      var path = matchPath(leaf && leaf.path ? leaf.path : [])
      for (var scan = 0; scan < buckets.length; scan += 1) {
        if (buckets[scan].definition.match(path, leaf)) {
          buckets[scan].leaves.push(leaf)
          break
        }
      }
    }
    var groups = []
    for (var kept = 0; kept < buckets.length; kept += 1) {
      if (buckets[kept].leaves.length === 0) continue
      var definition = buckets[kept].definition
      var group = {
        id: definition.id,
        title: definition.title,
        leaves: buckets[kept].leaves,
      }
      if (definition.hint !== undefined) group.hint = definition.hint
      // The one pure-presentation group flag: copied verbatim so nothing else
      // (matching, membership, ordering) learns a new group property.
      if (definition.catalog !== undefined) group.catalog = definition.catalog
      groups.push(group)
    }
    return groups
  }

  /**
   * The compat gate of one wire protocol.
   *
   * Mirrors the adapter's `compatGate()` lookup, including its deliberate
   * `undefined` answer for a protocol that declares no compat type.
   *
   * @param api - resolved wire protocol, e.g. `openai-completions`.
   * @returns `{offered: Set, withheld: Set}`; `undefined` when the protocol
   *   takes no compat fields.
   */
  function compatGate(api) {
    var gate = COMPAT_GATES[api]
    if (gate === undefined) return undefined
    var offered = new Set()
    var withheld = new Set()
    var names = Object.keys(gate)
    for (var index = 0; index < names.length; index += 1) {
      var field = names[index]
      if (gate[field] === 'offer') offered.add(field)
      else withheld.add(field)
    }
    return { offered: offered, withheld: withheld }
  }

  /**
   * Disposition of one compat field for one protocol.
   *
   * @param api - wire protocol.
   * @param field - compat field name.
   * @returns `"offer"`, `"withhold"`, or `undefined` when the protocol declares
   *   no opinion about that name (which the adapter treats as an error, not as
   *   an offer).
   */
  function compatDisposition(api, field) {
    var gate = COMPAT_GATES[api]
    if (gate === undefined) return undefined
    return gate[field]
  }

  /**
   * Every compat field name some protocol offers, in gate order.
   *
   * @returns the deduplicated offer vocabulary.
   */
  function offeredCompatVocabulary() {
    var seen = new Set()
    var order = []
    var protocols = Object.keys(COMPAT_GATES)
    for (var index = 0; index < protocols.length; index += 1) {
      var gate = COMPAT_GATES[protocols[index]]
      var names = Object.keys(gate)
      for (var scan = 0; scan < names.length; scan += 1) {
        if (gate[names[scan]] !== 'offer') continue
        if (seen.has(names[scan])) continue
        seen.add(names[scan])
        order.push(names[scan])
      }
    }
    return order
  }

  /**
   * The label of one enum value for one leaf.
   *
   * @param leaf - a leaf from `leaves()` (instance-rebased or not).
   * @param value - one member of `leaf.enum`.
   * @returns the bilingual label, or `undefined` when the value is not named.
   */
  function valueLabelFor(leaf, value) {
    var key = lookupKey(presentationPathOf(leaf))
    return VALUE_LABELS[key + '.' + String(value)]
  }

  /**
   * The explanation of one option for one leaf.
   *
   * Same key space and same tolerance as {@link valueLabelFor}: an option
   * without an entry returns `undefined` and the caller shows just the label,
   * so adding an entry is purely additive.
   *
   * @param leaf - a leaf from `leaves()` (instance-rebased or not).
   * @param value - one member of `leaf.enum` / `leaf.valueEnum`, or a `$var`
   *   placeholder name for the two chat-template dicts.
   * @returns the Chinese explanation, or `undefined` when the option is unnamed.
   */
  function valueHintFor(leaf, value) {
    var key = lookupKey(presentationPathOf(leaf))
    return VALUE_HINTS[key + '.' + String(value)]
  }

  /**
   * The literal-vs-`$var` copy for one chat-template dict field.
   *
   * @param leaf - the `compat.chatTemplateKwargs` / `compat.chatTemplateArgs`
   *   leaf (instance-rebased or not).
   * @returns a fresh `{literalLabel, literalHint, varLabel, varHint}`, or
   *   `undefined` for every other leaf (the panel then renders the plain
   *   value editor). A copy, so a caller cannot mutate the table.
   */
  function modeHintFor(leaf) {
    var entry = MODE_HINTS[lookupKey(presentationPathOf(leaf))]
    if (entry === undefined) return undefined
    return {
      literalLabel: entry.literalLabel,
      literalHint: entry.literalHint,
      varLabel: entry.varLabel,
      varHint: entry.varHint,
    }
  }

  var api = {
    groupLeaves: groupLeaves,
    describeField: describeField,
    compatGate: compatGate,
    compatDisposition: compatDisposition,
    offeredCompatVocabulary: offeredCompatVocabulary,
    labelFor: labelFor,
    hintFor: hintFor,
    valueLabelFor: valueLabelFor,
    valueHintFor: valueHintFor,
    modeHintFor: modeHintFor,
    presentationPathOf: presentationPathOf,
    keyLabelFor: keyLabelFor,
    branchLabelFor: branchLabelFor,
    profileLabel: profileLabel,
    // The data tables stay exposed read-only: several tests compare the curated
    // copy against the schema (`tests/presentation.test.js`, `tests/hints.test.js`).
    groups: GROUPS,
    fields: FIELDS,
    valueHints: VALUE_HINTS,
    modeHints: MODE_HINTS,
  }

  registry.fields = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function () {
        return api
      },
    })
  }
})(globalThis)
