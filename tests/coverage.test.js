/**
 * The executable field-coverage record.
 *
 * This is the test that makes the project's central promise checkable: **no
 * field the adapter declares may silently disappear from the page**. It runs
 * against the real schema envelope in `tests/fixtures/llm-pi-ai.schema.json`,
 * which `scripts/snapshot-schema.mjs` produces from the installed adapter, and
 * against the real chunk bytes — not a hand-written stand-in.
 *
 * Two kinds of assertion live here:
 *
 *   1. structural — every leaf the schema walker emits is placed in exactly one
 *      presentation group, and a leaf for a path nobody anticipated still lands
 *      somewhere. This is the forward-compatibility guarantee.
 *   2. inventory — the provider, model and compat field name sets are written
 *      out explicitly. The schema is the source of truth for *rendering*, but
 *      the expected names are pinned here so an upstream change fails loudly
 *      and has to be acknowledged deliberately.
 *
 * @module dsh-llm-pi-ai-config/tests/coverage
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = join(HERE, 'fixtures', 'llm-pi-ai.schema.json')

// v10: the fields logic chunk reads its two data chunks out of the registry
// at eval time (`client.fields.groups.js` + `client.fields.hints.js`).
await import('../lib/client.schema.js')
await import('../lib/client.fields.groups.js')
await import('../lib/client.fields.hints.js')
await import('../lib/client.fields.js')

const schema = globalThis.__dshLlmPiAiConfig.schema
const fields = globalThis.__dshLlmPiAiConfig.fields

/** The snapshot `volatileForm(Config).toJSON()` produced. */
const envelope = JSON.parse(readFileSync(FIXTURE, 'utf8'))

/** The node describing one provider profile. */
const PROVIDER_REF = (() => {
  const root = schema.node(envelope, envelope.uid)
  return schema.node(envelope, root.dict.providers).inner
})()

/** The provider profile's declared field names, in schema order. */
const PROVIDER_FIELDS = schema.shape(envelope, PROVIDER_REF).fields.map((field) => field.key)

/** Resolve one field of the provider profile node. */
function providerField(key) {
  const found = schema.shape(envelope, PROVIDER_REF).fields.find((field) => field.key === key)
  assert.ok(found !== undefined, `provider profile has no field ${key}`)
  return schema.node(envelope, found.ref)
}

/** Every leaf the walker reports for one provider profile. */
const LEAVES = schema.leaves(envelope, PROVIDER_REF, [])

/** The explicit inventory this project commits to. */
const EXPECTED_PROVIDER_FIELDS = [
  'api',
  'apiKeyEnv',
  'baseURL',
  'cacheRetention',
  'compat',
  'defaultContextWindow',
  'defaultInput',
  'defaultMaxTokens',
  'displayName',
  'headers',
  'maxRequestImageBytes',
  'modelOverrides',
  'models',
  'reasoning',
  'requestImageMaxBytes',
  'requestImagePixelBudget',
  'retryPolicy',
  'streamIdleTimeoutMs',
  'thinkingBudgets',
  'timeoutMs',
  'transport',
  'websocketConnectTimeoutMs',
]

const EXPECTED_MODEL_FIELDS = [
  'compat',
  'contextWindow',
  'id',
  'input',
  'maxTokens',
  'name',
  'reasoningEfforts',
]

const EXPECTED_COMPAT_KEYS = [
  'allowEmptySignature',
  'cacheControlFormat',
  'chatTemplateArgs',
  'chatTemplateKwargs',
  'forceAdaptiveThinking',
  'maxTokensField',
  'requiresAssistantAfterToolResult',
  'requiresReasoningContentOnAssistantMessages',
  'requiresThinkingAsText',
  'requiresToolResultName',
  'supportsCacheControlOnTools',
  'supportsDeveloperRole',
  'supportsEagerToolInputStreaming',
  'supportsFinishReason',
  'supportsLongCacheRetention',
  'supportsMaxOutputTokens',
  'supportsReasoningEffort',
  'supportsStore',
  'supportsStrictMode',
  'supportsStrictTools',
  'supportsTemperature',
  'supportsThinkingTokenBudget',
  'supportsUsageInStreaming',
  'thinkingFormat',
  'thinkingTokenBudgetField',
  'vllmPriority',
]

test('the fixture is the adapter envelope this page is built against', () => {
  assert.equal(typeof envelope.uid, 'number')
  assert.equal(typeof envelope.refs, 'object')
  assert.ok(Object.keys(envelope.refs).length > 100, 'expected the full uid graph')
  assert.equal(PROVIDER_REF !== undefined, true, 'providers must be a dict with an inner profile node')
  assert.ok(LEAVES.length > 0)
})

test('every schema leaf lands in exactly one presentation group', () => {
  const groups = fields.groupLeaves(LEAVES)
  const counted = new Map()
  for (const group of groups) {
    assert.ok(group.leaves.length > 0, `group ${group.id} must not be empty`)
    assert.equal(typeof group.title, 'string')
    assert.ok(group.title.length > 0, `group ${group.id} must have a title`)
    for (const leaf of group.leaves) {
      const path = leaf.path.join('.')
      counted.set(path, (counted.get(path) || 0) + 1)
    }
  }

  const orphans = LEAVES.map((leaf) => leaf.path.join('.')).filter((path) => !counted.has(path))
  assert.deepEqual(orphans, [], 'no leaf may be missing from every group')

  const duplicates = [...counted.entries()].filter(([, count]) => count > 1)
  assert.deepEqual(duplicates, [], 'no leaf may appear in two groups')

  assert.equal(
    counted.size,
    LEAVES.length,
    'the grouped leaf count must equal the schema leaf count',
  )
})

test('an unanticipated leaf still renders (forward compatibility)', () => {
  const synthetic = [
    { path: ['zzz_brand_new_upstream_field'], kind: 'string', required: false },
    { path: ['somethingElse'], kind: 'weird-kind-nobody-declared', required: false },
    { path: ['nested', 'deeply', 'unknown'], kind: 'unknown', required: false },
  ]
  const groups = fields.groupLeaves(LEAVES.concat(synthetic))
  const seen = new Set()
  for (const group of groups) {
    for (const leaf of group.leaves) seen.add(leaf.path.join('.'))
  }
  for (const leaf of synthetic) {
    assert.ok(
      seen.has(leaf.path.join('.')),
      `an unknown field (${leaf.path.join('.')}) must still be rendered by the fallback group`,
    )
  }
  // A missing presentation entry must not throw either.
  assert.deepEqual(fields.describeField('zzz_brand_new_upstream_field'), {})
  assert.ok(fields.labelFor(synthetic[0]).length > 0)
})

test('the provider profile declares exactly the 22 expected fields', () => {
  assert.equal(PROVIDER_FIELDS.length, 22, `got ${PROVIDER_FIELDS.length}: ${PROVIDER_FIELDS.join(', ')}`)
  assert.deepEqual([...PROVIDER_FIELDS].sort(), EXPECTED_PROVIDER_FIELDS)
})

test('the model profile declares exactly the 7 expected fields', () => {
  const modelsNode = providerField('models')
  assert.equal(modelsNode.type, 'array')
  const modelShape = schema.shape(envelope, modelsNode.inner)
  const names = modelShape.fields.map((field) => field.key)
  assert.equal(names.length, 7, `got ${names.length}: ${names.join(', ')}`)
  assert.deepEqual([...names].sort(), EXPECTED_MODEL_FIELDS)
})

test('the compat dict declares exactly the 26 expected keys', () => {
  const compatNode = providerField('compat')
  // `compat` is a fixed-shape object; only its two chatTemplate entries are dicts.
  assert.equal(compatNode.type, 'object')
  const valueShape = schema.shape(envelope, compatNode)
  const names = valueShape.fields.map((field) => field.key)
  assert.equal(names.length, 26, `got ${names.length}: ${names.join(', ')}`)
  assert.deepEqual([...names].sort(), EXPECTED_COMPAT_KEYS)
})

test('modelOverrides shares the model field set apart from the id', () => {
  const overridesNode = providerField('modelOverrides')
  assert.equal(overridesNode.type, 'dict')
  const overrideShape = schema.shape(envelope, overridesNode.inner)
  const names = overrideShape.fields.map((field) => field.key).sort()
  assert.deepEqual(
    names,
    EXPECTED_MODEL_FIELDS.filter((name) => name !== 'id'),
    'an override must not carry an id: the dict key is the id',
  )
})

test('the union fields are renderable, and retryPolicy keeps its branches', () => {
  const byPath = new Map(LEAVES.map((leaf) => [leaf.path.join('.'), leaf]))

  const reasoning = byPath.get('reasoning')
  assert.ok(reasoning !== undefined, 'reasoning must be a leaf')
  assert.equal(reasoning.kind, 'enum')
  assert.deepEqual(
    [...reasoning.enum],
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    'reasoning enum must expose every level the adapter accepts',
  )

  const retry = byPath.get('retryPolicy')
  assert.ok(retry !== undefined, 'retryPolicy must be a leaf')
  assert.equal(retry.kind, 'union')
  assert.ok(Array.isArray(retry.branches) && retry.branches.length === 2)
  assert.deepEqual(
    retry.branches.map((branch) => branch.value),
    ['normal', 'always'],
  )

  const efforts = byPath.get('models.reasoningEfforts')
  assert.ok(efforts !== undefined, 'per-model reasoningEfforts must be a leaf')
  assert.equal(efforts.kind, 'union')

  // Every branch body must be reachable, so the panel can render the active one.
  for (const branch of retry.branches) {
    const nested = schema.leaves(envelope, branch.ref, retry.path)
    assert.ok(nested.length > 0, `branch ${branch.label} must expose editable fields`)
  }
})

test('the 9 fields the adapter README omits are present in the schema and grouped', () => {
  const readmeOmitted = [
    'defaultInput',
    'headers',
    'reasoning',
    'thinkingBudgets',
    'cacheRetention',
    'transport',
    'timeoutMs',
    'websocketConnectTimeoutMs',
    'streamIdleTimeoutMs',
  ]
  const groups = fields.groupLeaves(LEAVES)
  const grouped = new Set()
  for (const group of groups) {
    for (const leaf of group.leaves) grouped.add(leaf.path.join('.'))
  }
  for (const name of readmeOmitted) {
    assert.ok(PROVIDER_FIELDS.includes(name), `${name} must exist in the schema`)
    const present = [...grouped].some((path) => path === name || path.startsWith(`${name}.`))
    assert.ok(present, `${name} must be reachable from a presentation group`)
  }
})

/**
 * The page's own convention, reproduced exactly.
 *
 * `lib/client.js` walks the schema with
 * `leaves(envelope, providerRef, ['providers', selected])`, so every leaf path
 * it hands the presentation module is absolute (`providers.alpha.api`,
 * `providers.alpha.compat.supportsStore`) while this table is keyed relative to
 * one provider profile. A version of `lib/client.fields.js` that did not
 * normalise that prefix put all 111 leaves into the `other` catch-all: the
 * model groups went empty, the frozen 6-group compat layout never rendered, and
 * labels degraded to `Api`/`Api Key Env`. The relative-path tests above cannot
 * see that, so this guard drives the page's real call shape.
 */
test('absolute providers.<name> paths group and label exactly like relative ones', () => {
  const prefixed = schema.leaves(envelope, PROVIDER_REF, ['providers', 'alpha'])
  assert.ok(prefixed.length > 0, 'the page-shaped walk must produce leaves')
  for (const leaf of prefixed) {
    assert.deepEqual(
      leaf.path.slice(0, 2),
      ['providers', 'alpha'],
      'the page must keep absolute paths: form.edit/remove needs them to write the right key',
    )
  }

  const relativeGroups = fields.groupLeaves(LEAVES)
  const prefixedGroups = fields.groupLeaves(prefixed)
  const shape = (groups) => groups.map((group) => `${group.id}:${group.leaves.length}`)

  assert.deepEqual(
    shape(prefixedGroups),
    shape(relativeGroups),
    'the page-shaped basePath must produce the same groups as the relative one',
  )
  assert.equal(
    prefixedGroups.some((group) => group.id === 'other'),
    false,
    'no known provider field may fall into the catch-all',
  )
  assert.equal(
    prefixedGroups.reduce((total, group) => total + group.leaves.length, 0),
    prefixed.length,
    'every leaf must still land in exactly one group',
  )

  // Curated presentation must resolve through the prefixed path, and the label
  // must not degrade to the humanized fallback.
  for (const path of [
    'api',
    'apiKeyEnv',
    'compat.supportsStore',
    'compat.thinkingFormat',
    'models.id',
    'modelOverrides.name',
    'timeoutMs',
    'retryPolicy',
  ]) {
    const relative = path.split('.')
    const absolute = ['providers', 'alpha'].concat(relative)
    const dotted = absolute.join('.')
    assert.deepEqual(
      fields.describeField(dotted),
      fields.describeField(path),
      `describeField(${dotted}) must match describeField(${path})`,
    )
    assert.equal(
      fields.labelFor({ path: absolute }),
      fields.labelFor({ path: relative }),
      `labelFor(${dotted}) must resolve the curated label`,
    )
    assert.equal(
      fields.hintFor({ path: absolute }),
      fields.hintFor({ path: relative }),
      `hintFor(${dotted}) must resolve the curated hint`,
    )
  }
  assert.equal(fields.labelFor({ path: ['providers', 'alpha', 'api'] }), '协议类型')
  assert.notEqual(fields.labelFor({ path: ['providers', 'alpha', 'api'] }), 'Api')

  // The prefixed grouping is what the panels receive, so the compat group must
  // carry the frozen 26 keys for the 6 disclosure groups to render at all.
  const compat = prefixedGroups.find((group) => group.id === 'compat')
  assert.ok(compat !== undefined, 'the compat group must survive the page-shaped path')
  assert.equal(compat.leaves.length, 26)
})

/**
 * The instance-container tag is additive: grouping must carry it through, and
 * only the repeatable groups may carry it.
 *
 * `lib/client.panels.js` renders a container group per instance from
 * `leaf.container`; if `groupLeaves()` dropped the tag (or if it appeared on an
 * ordinary field) the model / override cards would silently fall back to flat
 * rows and emit paths the host rejects.
 */
test('grouping preserves the instance container and only on the repeatable groups', () => {
  const prefixed = schema.leaves(envelope, PROVIDER_REF, ['providers', 'alpha'])
  const groups = fields.groupLeaves(prefixed)
  const byId = Object.fromEntries(groups.map((group) => [group.id, group]))

  for (const leaf of byId.models.leaves) {
    assert.deepEqual(leaf.container, { kind: 'array', path: ['providers', 'alpha', 'models'] })
  }
  for (const leaf of byId.overrides.leaves) {
    assert.deepEqual(leaf.container, { kind: 'dict', path: ['providers', 'alpha', 'modelOverrides'] })
  }
  for (const group of groups) {
    if (group.id === 'models' || group.id === 'overrides') continue
    for (const leaf of group.leaves) {
      assert.equal(
        Object.hasOwn(leaf, 'container'),
        false,
        `${leaf.path.join('.')} (${group.id}) must not be tagged as an instance container`,
      )
    }
  }
})
