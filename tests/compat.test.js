/**
 * Compat-gate assertions for the field presentation module.
 *
 * `COMPAT_GATES` in `lib/client.fields.js` is a mirror of the adapter's own
 * gate table, and it is **advisory**: the adapter stays authoritative and raises
 * a hard error naming a withheld field. The mirror exists so the page can warn
 * before a save round-trip, which means it has to agree with the adapter
 * exactly. These tests pin that agreement field by field.
 *
 * Source of truth for the expectations:
 * `@deepseek-ai/dsh-llm-pi-ai/lib/index.js`, `COMPAT_GATES` and the three
 * protocol constants it references. The three Responses protocols share one gate
 * object, which the mirror reproduces by reference sharing.
 *
 * @module dsh-llm-pi-ai-config/tests/compat
 */

import assert from 'node:assert/strict'
import test from 'node:test'

await import('../lib/client.fields.groups.js')
await import('../lib/client.fields.hints.js')
await import('../lib/client.fields.js')

const fields = globalThis.__dshLlmPiAiConfig.fields

/** Every protocol the adapter declares a gate for. */
const PROTOCOLS = [
  'mistral-conversations',
  'openai-completions',
  'openai-responses',
  'azure-openai-responses',
  'openai-codex-responses',
  'anthropic-messages',
  'bedrock-converse-stream',
]

/** The 19 fields `openai-completions` offers. */
const COMPLETIONS_OFFERED = [
  'supportsStore',
  'supportsDeveloperRole',
  'supportsReasoningEffort',
  'supportsUsageInStreaming',
  'supportsFinishReason',
  'maxTokensField',
  'requiresToolResultName',
  'requiresAssistantAfterToolResult',
  'requiresThinkingAsText',
  'requiresReasoningContentOnAssistantMessages',
  'thinkingFormat',
  'chatTemplateKwargs',
  'chatTemplateArgs',
  'supportsThinkingTokenBudget',
  'thinkingTokenBudgetField',
  'vllmPriority',
  'supportsStrictMode',
  'cacheControlFormat',
  'supportsLongCacheRetention',
]

const RESPONSES_OFFERED = [
  'supportsDeveloperRole',
  'supportsMaxOutputTokens',
  'supportsStrictMode',
  'supportsLongCacheRetention',
]

const ANTHROPIC_OFFERED = [
  'supportsEagerToolInputStreaming',
  'supportsLongCacheRetention',
  'supportsCacheControlOnTools',
  'supportsTemperature',
  'forceAdaptiveThinking',
  'allowEmptySignature',
  'supportsStrictTools',
]

test('openai-completions offers 19 fields and withholds the rest', () => {
  const gate = fields.compatGate('openai-completions')
  assert.ok(gate !== undefined)
  assert.deepEqual([...gate.offered].sort(), [...COMPLETIONS_OFFERED].sort())
  assert.equal(gate.offered.size, 19)
  for (const name of ['sessionAffinityFormat', 'supportsOpenAIGrammarTools', 'openRouterRouting']) {
    assert.ok(gate.withheld.has(name), `${name} must be withheld on openai-completions`)
    assert.equal(gate.offered.has(name), false, `${name} must not also be offered`)
  }
})

test('the three Responses protocols share one four-field offer set', () => {
  for (const protocol of ['openai-responses', 'azure-openai-responses', 'openai-codex-responses']) {
    const gate = fields.compatGate(protocol)
    assert.ok(gate !== undefined, `${protocol} must have a gate`)
    assert.deepEqual(
      [...gate.offered].sort(),
      [...RESPONSES_OFFERED].sort(),
      `${protocol} must offer exactly the Responses set`,
    )
    assert.ok(gate.withheld.has('sessionAffinityFormat'))
    assert.ok(gate.withheld.has('supportsMidConvoSystemMessages'))
  }
})

test('anthropic-messages offers exactly its seven fields', () => {
  const gate = fields.compatGate('anthropic-messages')
  assert.ok(gate !== undefined)
  assert.deepEqual([...gate.offered].sort(), [...ANTHROPIC_OFFERED].sort())
  for (const name of [
    'sendSessionAffinityHeaders',
    'sessionAffinityFormat',
    'supportsMidConvoSystemMessages',
    'supportsMidConvoToolChanges',
    'supportsMidConvoEffort',
    'allowedFallbackModels',
  ]) {
    assert.ok(gate.withheld.has(name), `${name} must be withheld on anthropic-messages`)
  }
})

test('bedrock-converse-stream offers exactly supportsStrictMode', () => {
  const gate = fields.compatGate('bedrock-converse-stream')
  assert.ok(gate !== undefined)
  assert.deepEqual([...gate.offered], ['supportsStrictMode'])
  assert.equal(gate.withheld.size, 0)
})

test('mistral-conversations offers nothing and only withholds one field', () => {
  const gate = fields.compatGate('mistral-conversations')
  assert.ok(gate !== undefined)
  assert.equal(gate.offered.size, 0)
  assert.deepEqual([...gate.withheld], ['supportsMidConvoSystemMessages'])
})

test('a protocol the adapter does not gate has no compat at all', () => {
  assert.equal(fields.compatGate('not-a-protocol'), undefined)
  assert.equal(fields.compatGate(''), undefined)
  assert.equal(fields.compatDisposition('not-a-protocol', 'supportsStore'), undefined)
})

test('offered and withheld never overlap, and dispositions agree with the sets', () => {
  for (const protocol of PROTOCOLS) {
    const gate = fields.compatGate(protocol)
    for (const name of gate.offered) {
      assert.equal(
        gate.withheld.has(name),
        false,
        `${protocol}: ${name} is both offered and withheld`,
      )
      assert.equal(fields.compatDisposition(protocol, name), 'offer')
    }
    for (const name of gate.withheld) {
      assert.equal(gate.offered.has(name), false)
      assert.equal(fields.compatDisposition(protocol, name), 'withhold')
    }
  }
})

test('the offer vocabulary is exactly the 26 compat keys the schema declares', () => {
  const vocabulary = fields.offeredCompatVocabulary()
  assert.equal(vocabulary.length, 26)
  assert.equal(new Set(vocabulary).size, 26, 'the vocabulary must be deduplicated')
  for (const name of [
    'supportsMaxOutputTokens',
    'supportsEagerToolInputStreaming',
    'supportsCacheControlOnTools',
    'supportsTemperature',
    'forceAdaptiveThinking',
    'allowEmptySignature',
    'supportsStrictTools',
  ]) {
    assert.ok(vocabulary.includes(name), `${name} must be part of the shared vocabulary`)
  }
})

/** The four protocols whose gate explicitly withholds OpenAI grammar tools. */
const GRAMMAR_TOOL_GATES = new Set([
  'openai-completions',
  'openai-responses',
  'azure-openai-responses',
  'openai-codex-responses',
])

test('a name no protocol offers stays unknown rather than becoming an offer', () => {
  for (const protocol of PROTOCOLS) {
    const disposition = fields.compatDisposition(protocol, 'supportsOpenAIGrammarTools')
    assert.notEqual(disposition, 'offer', `${protocol}: an unoffered name must never read as offered`)
    assert.equal(
      disposition,
      GRAMMAR_TOOL_GATES.has(protocol) ? 'withhold' : undefined,
      `${protocol}: unexpected disposition for supportsOpenAIGrammarTools`,
    )
  }
})
