/**
 * The executable presentation record: **every configuration item has a written
 * key, a Chinese label and a Chinese description**.
 *
 * The page renders whatever the schema walker reports, but a raw identifier is
 * not an explanation: an unlisted field falls back to a humanized English title
 * with no hint. This test enumerates the leaves the page actually renders
 * (including union branches, which the top-level walk does not expand) and pins
 * the inventory, so an upstream addition fails loudly instead of shipping an
 * unexplained row.
 *
 * Run: node --test tests/presentation.test.js
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))

await import('../lib/client.schema.js')
await import('../lib/client.fields.groups.js')
await import('../lib/client.fields.hints.js')
await import('../lib/client.fields.js')

const schema = globalThis.__dshLlmPiAiConfig.schema
const fields = globalThis.__dshLlmPiAiConfig.fields

const envelope = JSON.parse(readFileSync(join(HERE, 'fixtures', 'llm-pi-ai.schema.json'), 'utf8'))
const PROVIDER_REF = (() => {
  const root = schema.node(envelope, envelope.uid)
  return schema.node(envelope, root.dict.providers).inner
})()

/** Leaves the page renders: the walk plus every union branch, recursively. */
function renderLeaves(leaves, depth = 0) {
  if (depth > 3) return leaves
  const out = []
  for (const leaf of leaves) {
    out.push(leaf)
    if (leaf.kind !== 'union') continue
    for (const branch of leaf.branches || []) {
      if (branch.ref === undefined) continue
      const base = leaf.presentationPath !== undefined ? leaf.presentationPath : leaf.path
      out.push(...renderLeaves(schema.leaves(envelope, branch.ref, leaf.path, base), depth + 1))
    }
  }
  return out
}

const LEAVES = renderLeaves(schema.leaves(envelope, PROVIDER_REF, ['providers', 'alpha']))

/** The presentation key of one leaf, relative to the provider profile. */
function presentationKey(leaf) {
  let relative = fields.presentationPathOf(leaf).split('.').slice(2).join('.')
  if (relative.indexOf('models.') === 0) relative = relative.slice('models.'.length)
  if (relative.indexOf('modelOverrides.') === 0) relative = relative.slice('modelOverrides.'.length)
  return relative
}

/** The explicit inventory this project commits to. */
const PRESENTATION_KEYS = [
  'api',
  'apiKeyEnv',
  'baseURL',
  'cacheRetention',
  'compat.allowEmptySignature',
  'compat.cacheControlFormat',
  'compat.chatTemplateArgs',
  'compat.chatTemplateKwargs',
  'compat.forceAdaptiveThinking',
  'compat.maxTokensField',
  'compat.requiresAssistantAfterToolResult',
  'compat.requiresReasoningContentOnAssistantMessages',
  'compat.requiresThinkingAsText',
  'compat.requiresToolResultName',
  'compat.supportsCacheControlOnTools',
  'compat.supportsDeveloperRole',
  'compat.supportsEagerToolInputStreaming',
  'compat.supportsFinishReason',
  'compat.supportsLongCacheRetention',
  'compat.supportsMaxOutputTokens',
  'compat.supportsReasoningEffort',
  'compat.supportsStore',
  'compat.supportsStrictMode',
  'compat.supportsStrictTools',
  'compat.supportsTemperature',
  'compat.supportsThinkingTokenBudget',
  'compat.supportsUsageInStreaming',
  'compat.thinkingFormat',
  'compat.thinkingTokenBudgetField',
  'compat.vllmPriority',
  'contextWindow',
  'defaultContextWindow',
  'defaultInput',
  'defaultMaxTokens',
  'displayName',
  'headers',
  'id',
  'input',
  'maxRequestImageBytes',
  'maxTokens',
  'name',
  'reasoning',
  'reasoningEfforts',
  'requestImageMaxBytes',
  'requestImagePixelBudget',
  'retryPolicy',
  'retryPolicy.backoff.initialDelayMs',
  'retryPolicy.backoff.jitterRatio',
  'retryPolicy.backoff.maxDelayMs',
  'retryPolicy.maxRetries',
  'retryPolicy.mode',
  'retryPolicy.retryableCodes',
  'streamIdleTimeoutMs',
  'thinkingBudgets.high',
  'thinkingBudgets.low',
  'thinkingBudgets.medium',
  'thinkingBudgets.minimal',
  'timeoutMs',
  'transport',
  'websocketConnectTimeoutMs',
]

const CJK = /[\u4e00-\u9fff]/

test('every rendered leaf resolves an explicit, Chinese label and hint', () => {
  for (const leaf of LEAVES) {
    const path = fields.presentationPathOf(leaf)
    const described = fields.describeField(path)
    const hint = described.hint !== undefined ? described.hint : leaf.description
    assert.ok(
      described.label !== undefined && described.label !== '',
      path + ' has no presentation entry; it would render a humanized identifier',
    )
    assert.ok(CJK.test(described.label), path + ' label must be Chinese: ' + JSON.stringify(described.label))
    assert.ok(
      hint !== undefined && hint !== '',
      path + ' has no description; every item must say what it configures',
    )
    assert.ok(CJK.test(hint), path + ' hint must be Chinese: ' + JSON.stringify(hint))
  }
})

test('every row can show its raw YAML key', () => {
  for (const leaf of LEAVES) {
    const key = fields.keyLabelFor(leaf)
    assert.ok(typeof key === 'string' && key !== '', fields.presentationPathOf(leaf) + ' has no key label')
    assert.equal(key.indexOf('providers.'), -1, 'the key label must drop the provider prefix: ' + key)
    assert.equal(/\[\d+\]/.test(key), false, 'the key label must mark indexes structurally: ' + key)
  }
})

test('the presentation inventory is pinned (an upstream addition fails here)', () => {
  const covered = [...new Set(LEAVES.map(presentationKey))].sort()
  assert.deepEqual(
    covered,
    PRESENTATION_KEYS,
    'the set of configurable items changed; give every new item a Chinese label and description',
  )
})

test('every union branch has a Chinese selector label', () => {
  for (const leaf of LEAVES) {
    if (leaf.kind !== 'union') continue
    for (const branch of leaf.branches || []) {
      const label = fields.branchLabelFor(leaf, branch)
      assert.ok(typeof label === 'string' && label !== '', presentationKey(leaf) + ' branch has no label')
      assert.ok(
        CJK.test(label),
        presentationKey(leaf) + ' branch "' + String(branch.value !== undefined ? branch.value : branch.kind) + '" must be labelled in Chinese: ' + JSON.stringify(label),
      )
    }
  }
})

test('instance-rebased leaves keep the same presentation', () => {
  for (const leaf of LEAVES) {
    const rebased = Object.assign({}, leaf, {
      path: leaf.path.concat([0]),
      presentationPath: leaf.path,
    })
    assert.equal(fields.labelFor(rebased), fields.labelFor(leaf), 'label drifted for ' + fields.presentationPathOf(leaf))
    assert.equal(fields.hintFor(rebased), fields.hintFor(leaf), 'hint drifted for ' + fields.presentationPathOf(leaf))
    assert.equal(fields.keyLabelFor(rebased), fields.keyLabelFor(leaf), 'key drifted for ' + fields.presentationPathOf(leaf))
  }
})

test('every `pair` id groups at least two rendered leaves', () => {
  // The two-column grid exists only for fields that belong together (v6). An id
  // left on a single field would be a no-op layout flag, so it must fail here
  // rather than silently do nothing.
  const counts = new Map()
  for (const leaf of LEAVES) {
    const described = fields.describeField(fields.presentationPathOf(leaf))
    const pair = described.pair
    if (pair === undefined) continue
    counts.set(pair, (counts.get(pair) || 0) + 1)
  }
  assert.ok(counts.size >= 5, `expected at least five pair groups, got ${counts.size}`)
  for (const [pair, count] of counts) {
    assert.ok(count >= 2, `pair "${pair}" groups ${count} leaf/leaves; a pair of one renders as a row`)
  }
  assert.ok(counts.has('size'), 'the token-limit pair is declared')
})

test('every `titleRank` candidate is a rendered leaf, and exactly one wins', () => {
  // v7 §15.4 / §15.9 D1: the instance-card title priority is presentation
  // metadata, so it has to be attached to a leaf that is actually rendered —
  // a `titleRank` nothing carries would be a flag that silently does nothing
  // (the same failure mode the `pair` test above guards against).
  const ranked = []
  for (const leaf of LEAVES) {
    const described = fields.describeField(fields.presentationPathOf(leaf))
    if (described.titleRank === undefined) continue
    assert.equal(
      typeof described.titleRank,
      'number',
      presentationKey(leaf) + ' titleRank must be a number',
    )
    assert.ok(
      described.label !== undefined && CJK.test(described.label),
      presentationKey(leaf) + ' titleRank candidate must still have a Chinese label',
    )
    ranked.push({ key: presentationKey(leaf), rank: described.titleRank })
  }
  assert.ok(ranked.length >= 1, 'at least one rendered leaf must carry a titleRank')
  const best = Math.min(...ranked.map((entry) => entry.rank))
  // The same presentation entry is shared by `models[]` and `modelOverrides`
  // (both key to `name`), so the winner is counted by presentation key.
  const winners = [...new Set(ranked.filter((entry) => entry.rank === best).map((entry) => entry.key))]
  assert.equal(
    winners.length,
    1,
    `exactly one leaf may outrank the rest, got ${JSON.stringify(winners)}`,
  )
})

test('every choice the page offers explains itself in Chinese', () => {
  // The field-level promise above ("every rendered leaf resolves a Chinese label
  // and hint") has a value-level twin: an enum option, an `array` + `enum`
  // modality or a chat-template `$var` placeholder that resolves no hint renders
  // as a bare token — the unexplained UI this project forbids.
  //
  // `tests/hints.test.js` owns the pinned VALUE inventory and its counts; this
  // test is the presentation-side counterpart, walking the same render leaves
  // (union branches included) and requiring the shipped fields chunk to answer
  // for each choice through its own API.
  const assertChinese = (text, what) => {
    assert.ok(typeof text === 'string' && text !== '', what + ' must have a hint')
    assert.ok(CJK.test(text), what + ' hint must be Chinese: ' + JSON.stringify(text))
  }

  let enumValues = 0
  let varValues = 0
  let modeFields = 0
  for (const leaf of LEAVES) {
    const path = fields.presentationPathOf(leaf)
    const choices = []
    if (leaf.kind === 'enum' && Array.isArray(leaf.enum)) choices.push(...leaf.enum)
    if (leaf.kind === 'array' && Array.isArray(leaf.enum)) choices.push(...leaf.enum)
    for (const value of choices) {
      assertChinese(fields.valueHintFor(leaf, value), path + '.' + String(value))
      enumValues += 1
    }
    if (Array.isArray(leaf.valueVarNames)) {
      for (const name of leaf.valueVarNames) {
        assertChinese(fields.valueHintFor(leaf, name), path + '.' + name)
        varValues += 1
      }
    }
    // The two chat-template dicts additionally explain their literal / $var
    // mode switch; every other leaf must not claim one.
    const mode = fields.modeHintFor(leaf)
    if (mode !== undefined) {
      modeFields += 1
      for (const key of ['literalLabel', 'varLabel', 'literalHint', 'varHint']) {
        assertChinese(mode[key], path + '.' + key)
      }
    }
  }
  assert.ok(enumValues > 0, 'the fixture must expose enum choices')
  assert.ok(varValues > 0, 'the chat-template dicts must expose their $var choices')
  assert.ok(modeFields > 0, 'the chat-template dicts must expose the literal/$var copy')
})
