/**
 * Every option the page offers has to explain itself in Chinese.
 *
 * `presentation.test.js` pins a written label and description for every FIELD;
 * this file pins the same promise for every VALUE: each enum option, each
 * `array` + `enum` modality, each `$var` placeholder of the two chat-template
 * dictionaries, and each row of a closed-dict tier table. An option without a
 * hint renders as a bare token, which is exactly the unexplained UI the project
 * forbids, so a missing entry fails here instead of shipping.
 *
 * The leaves are enumerated through the shipped schema chunk against the REAL
 * `@deepseek-ai/dsh-llm-pi-ai` envelope fixture — never a hand-written
 * stand-in — and the hints come from the shipped fields chunk.
 *
 * Run: node --test tests/hints.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// --- load the shipped bytes through the documented chunk envelope -----------
const registrations = []
globalThis.__ModuleLoader__ = {
  load(record) {
    registrations.push(record)
  },
}
await import(pathToFileURL(join(root, 'lib', 'client.schema.js')).href)
await import(pathToFileURL(join(root, 'lib', 'client.fields.groups.js')).href)
await import(pathToFileURL(join(root, 'lib', 'client.fields.hints.js')).href)
await import(pathToFileURL(join(root, 'lib', 'client.fields.js')).href)

const schema = globalThis.__dshLlmPiAiConfig?.schema
const fields = globalThis.__dshLlmPiAiConfig?.fields
assert.ok(schema, 'chunk published globalThis.__dshLlmPiAiConfig.schema')
assert.ok(fields, 'chunk published globalThis.__dshLlmPiAiConfig.fields')

const envelope = JSON.parse(readFileSync(join(here, 'fixtures', 'llm-pi-ai.schema.json'), 'utf8'))

const PROVIDER_REF = (() => {
  const rootNode = schema.node(envelope, envelope.uid)
  return schema.node(envelope, rootNode.dict.providers).inner
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

const CJK = /[\u4e00-\u9fff]/

/** A usable explanation: a non-empty string that actually says it in Chinese. */
function assertChineseHint(hint, what) {
  assert.ok(
    typeof hint === 'string' && hint.trim() !== '',
    what + ' has no explanation; every offered option must say what it means',
  )
  assert.ok(CJK.test(hint), what + ' must be explained in Chinese: ' + JSON.stringify(hint))
}

/** Every value the page offers as a choice, tagged by surface. */
function collectSurfaces() {
  const enumOptions = []
  const arrayEnumOptions = []
  const varNames = []
  const keyEnumRows = []
  for (const leaf of LEAVES) {
    const path = fields.presentationPathOf(leaf)
    if (Array.isArray(leaf.enum)) {
      for (const value of leaf.enum) {
        if (leaf.kind === 'array') arrayEnumOptions.push({ leaf, path, value })
        else enumOptions.push({ leaf, path, value })
      }
    }
    if (Array.isArray(leaf.valueEnum)) {
      for (const value of leaf.valueEnum) enumOptions.push({ leaf, path, value })
    }
    if (leaf.valueVar === true && Array.isArray(leaf.valueVarNames)) {
      for (const value of leaf.valueVarNames) varNames.push({ leaf, path, value })
    }
    if (Array.isArray(leaf.keyEnum)) {
      for (const key of leaf.keyEnum) keyEnumRows.push({ leaf, path, key })
    }
  }
  return { enumOptions, arrayEnumOptions, varNames, keyEnumRows }
}

const SURFACES = collectSurfaces()
const MODE_FIELD_PATHS = ['compat.chatTemplateKwargs', 'compat.chatTemplateArgs']

describe('chunk envelope', () => {
  test('both chunks register under the frozen shape', () => {
    // v10: the fields chunk is the logic half of a pair; its two data chunks
    // (`client.fields.groups.js`, `client.fields.hints.js`) register the same
    // way and are imported before it.
    const CHUNKS = [
      'client.schema.js',
      'client.fields.groups.js',
      'client.fields.hints.js',
      'client.fields.js',
    ]
    assert.equal(registrations.length, CHUNKS.length)
    const byChunk = Object.fromEntries(registrations.map((record) => [record.chunk, record]))
    for (const chunk of CHUNKS) {
      assert.ok(byChunk[chunk], chunk + ' must register')
      assert.equal(byChunk[chunk].id, 'dsh-llm-pi-ai-config')
      assert.match(chunk, /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/)
      assert.equal(typeof byChunk[chunk].factory, 'function')
    }
    assert.equal(byChunk['client.schema.js'].factory(), schema)
    assert.equal(byChunk['client.fields.js'].factory(), fields)
    assert.equal(
      byChunk['client.fields.groups.js'].factory().FIELDS,
      fields.fields,
      'the groups data chunk must publish the FIELDS table the logic chunk re-exports',
    )
  })
})

describe('enum option hints', () => {
  test('the fixture walk offers the pinned number of choices', () => {
    // Pinned so an upstream addition fails loudly: the new value needs a hint.
    assert.equal(LEAVES.length, 125)
    assert.equal(SURFACES.enumOptions.length, 72)
    assert.equal(new Set(SURFACES.enumOptions.map((entry) => entry.path)).size, 19)
    assert.equal(SURFACES.arrayEnumOptions.length, 6)
    assert.equal(new Set(SURFACES.arrayEnumOptions.map((entry) => entry.path)).size, 3)
    assert.equal(SURFACES.varNames.length, 18)
    assert.equal(new Set(SURFACES.varNames.map((entry) => entry.path)).size, 6)
  })

  test('every enum option is explained through valueHintFor', () => {
    for (const { leaf, path, value } of SURFACES.enumOptions) {
      assertChineseHint(fields.valueHintFor(leaf, value), `${path}.${String(value)}`)
    }
  })

  test('every array + enum modality is explained through valueHintFor', () => {
    for (const { leaf, path, value } of SURFACES.arrayEnumOptions) {
      assertChineseHint(fields.valueHintFor(leaf, value), `${path}[].${String(value)}`)
    }
  })

  test('a single-select modality is still an enum option, not a tier row', () => {
    // `reasoningEfforts` is the one closed dict: its keys are tiers, not enum
    // members, so they are covered by the tier-table test below.
    const reasoning = SURFACES.enumOptions.filter((entry) => entry.path.endsWith('reasoning'))
    assert.equal(reasoning.length, 7)
    for (const { leaf, value } of reasoning) {
      assertChineseHint(fields.valueHintFor(leaf, value), 'reasoning.' + String(value))
    }
  })
})

describe('$var placeholder hints', () => {
  test('each chat-template dict names exactly the three placeholders', () => {
    for (const { leaf, path } of SURFACES.varNames.filter((entry, index) => index % 3 === 0)) {
      assert.deepEqual(
        leaf.valueVarNames,
        ['thinking.enabled', 'thinking.effort', 'thinking.budget'],
        path + ' must offer the three documented $var placeholders',
      )
    }
  })

  test('every $var placeholder is explained through valueHintFor', () => {
    for (const { leaf, path, value } of SURFACES.varNames) {
      assertChineseHint(fields.valueHintFor(leaf, value), `${path}.${value}`)
    }
  })
})

describe('literal vs $var mode copy', () => {
  test('both chat-template dicts carry all four strings, in Chinese', () => {
    const modeLeaves = LEAVES.filter((leaf) =>
      MODE_FIELD_PATHS.some((suffix) => fields.presentationPathOf(leaf).endsWith(suffix)),
    )
    assert.equal(modeLeaves.length, 6, 'each dict appears at provider, models[] and modelOverrides')
    for (const leaf of modeLeaves) {
      const path = fields.presentationPathOf(leaf)
      const copy = fields.modeHintFor(leaf)
      assert.ok(copy !== undefined, path + ' must offer the literal/$var copy')
      assert.deepEqual(
        Object.keys(copy).sort(),
        ['literalHint', 'literalLabel', 'varHint', 'varLabel'],
        path + ' must carry exactly the four documented strings',
      )
      assertChineseHint(copy.literalLabel, path + '.literalLabel')
      assertChineseHint(copy.varLabel, path + '.varLabel')
      assertChineseHint(copy.literalHint, path + '.literalHint')
      assertChineseHint(copy.varHint, path + '.varHint')
    }
  })

  test('the copy is a copy: mutating it cannot leak into the next call', () => {
    const leaf = LEAVES.find((entry) =>
      fields.presentationPathOf(entry).endsWith('compat.chatTemplateKwargs'),
    )
    const first = fields.modeHintFor(leaf)
    first.literalLabel = 'hacked'
    const second = fields.modeHintFor(leaf)
    assert.notEqual(second.literalLabel, 'hacked')
    assert.notEqual(second, first)
  })

  test('every other leaf falls back to the plain value editor', () => {
    const apiLeaf = LEAVES.find((leaf) => fields.presentationPathOf(leaf).endsWith('.api'))
    assert.ok(apiLeaf, 'the api leaf is rendered')
    assert.equal(fields.modeHintFor(apiLeaf), undefined)
  })
})

describe('closed-dict tier rows', () => {
  test('every tier row resolves a Chinese label and hint through describeField', () => {
    // The tier table (`dict` + `keyEnum`) labels its fixed rows from the FIELD
    // table, not from `valueHintFor`, so this is the guard for those rows.
    assert.equal(SURFACES.keyEnumRows.length, 14)
    for (const { path, key } of SURFACES.keyEnumRows) {
      const described = fields.describeField(path + '.' + key)
      assertChineseHint(described.label, `${path}.${key} label`)
      assertChineseHint(described.hint, `${path}.${key} hint`)
    }
  })
})

describe('lookup tolerance', () => {
  test('an unnamed value or leaf returns undefined instead of throwing', () => {
    const leaf = LEAVES.find((entry) => fields.presentationPathOf(entry).endsWith('.transport'))
    assert.ok(leaf)
    assert.equal(fields.valueHintFor(leaf, 'not-a-transport'), undefined)
    const unknown = { path: ['providers', 'alpha', 'notAField'], presentationPath: ['providers', 'alpha', 'notAField'] }
    assert.equal(fields.valueHintFor(unknown, 'x'), undefined)
    assert.equal(fields.valueHintFor(leaf, undefined), undefined)
  })

  test('an instance-rebased leaf keeps the same hint', () => {
    // `models[0]` and `modelOverrides` share one presentation entry; appending a
    // schema index must not change what the option says.
    for (const { leaf, value } of SURFACES.enumOptions.slice(0, 12)) {
      const rebased = Object.assign({}, leaf, {
        path: leaf.path.concat([0]),
        presentationPath: leaf.path,
      })
      assert.equal(
        fields.valueHintFor(rebased, value),
        fields.valueHintFor(leaf, value),
        'hint drifted for ' + fields.presentationPathOf(leaf) + '.' + String(value),
      )
    }
  })
})
