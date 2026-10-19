/**
 * Unit tests for `lib/client.schema.js` (chunk `schema`).
 *
 * The fixture is the REAL `volatileForm(Config).toJSON()` envelope snapshotted
 * from the installed `@deepseek-ai/dsh-llm-pi-ai` schema — never a hand-written
 * stand-in. Synthetic envelopes are added only for shapes the live snapshot does
 * not contain (`{__jsExpr}` subtrees, `lazy` nodes, cycles).
 *
 * The chunk is loaded through its shipped bytes (`await import`), exactly as the
 * browser loads them, and read back from `globalThis.__dshLlmPiAiConfig.schema`
 * per the frozen chunk envelope. A fake `__ModuleLoader__` captures the
 * registration so the contract's `{ id, chunk, factory }` shape is asserted too.
 *
 * Run: node --test tests/schema.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const envelope = JSON.parse(readFileSync(join(here, 'fixtures', 'llm-pi-ai.schema.json'), 'utf8'))
const refs = envelope.refs

// --- load the shipped bytes through the documented chunk envelope -----------
const registrations = []
globalThis.__ModuleLoader__ = {
  load(record) {
    registrations.push(record)
  },
}
await import(pathToFileURL(join(root, 'lib', 'client.schema.js')).href)

const api = globalThis.__dshLlmPiAiConfig?.schema
assert.ok(api, 'chunk published globalThis.__dshLlmPiAiConfig.schema')

const { node, leaves, shape, isExpression } = api

/** Fixture uid of the root object and of the two open containers. */
const ROOT = envelope.uid // 382
const PROVIDERS_DICT = 381
const PROFILE_OBJECT = 379
const MODELS_ARRAY = 344
const COMPAT_OBJECT = 312
const REASONING_UNION = 356
const RETRY_POLICY_UNION = 250
const CACHE_CONTROL_UNION = 303
const CHAT_TEMPLATE_KWARGS_DICT = 291
const DEFAULT_INPUT_ARRAY = 352

const ALL_KINDS = new Set([
  'string', 'number', 'integer', 'boolean', 'enum', 'const',
  'array', 'object', 'dict', 'union', 'unknown',
])

const pathOf = (leaf) => leaf.path.join('.')

describe('chunk envelope', () => {
  test('registers with the module loader under the frozen shape', () => {
    assert.equal(registrations.length, 1)
    const record = registrations[0]
    assert.equal(record.id, 'dsh-llm-pi-ai-config')
    assert.equal(record.chunk, 'client.schema.js')
    assert.match(record.chunk, /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/)
    assert.equal(typeof record.factory, 'function')
    assert.equal(record.factory(), api)
  })

  test('exposes exactly the four contract exports', () => {
    for (const name of ['node', 'leaves', 'shape', 'isExpression']) {
      assert.equal(typeof api[name], 'function', `${name} is exported`)
    }
  })

  test('shipped bytes carry no import/export/module.exports', () => {
    const source = readFileSync(join(root, 'lib', 'client.schema.js'), 'utf8')
    assert.doesNotMatch(source, /^\s*import\s/m)
    assert.doesNotMatch(source, /^\s*export\s/m)
    assert.doesNotMatch(source, /module\.exports\s*=/)
    assert.doesNotMatch(source, /^\s*const\s+\w+\s*=\s*require\(/m)
  })
})

describe('fixture sanity (independent of the implementation)', () => {
  test('is the real 144-node graph rooted at uid 382', () => {
    assert.equal(envelope.uid, 382)
    assert.equal(Object.keys(refs).length, 144)
  })

  test('has no live expression or lazy node (so those paths are synthetic-only)', () => {
    const expressions = Object.values(refs).filter(
      (n) => n !== null && typeof n === 'object' && typeof n.__jsExpr === 'string',
    )
    const lazies = Object.values(refs).filter((n) => n.type === 'lazy')
    assert.equal(expressions.length, 0)
    assert.equal(lazies.length, 0)
  })

  test('projects the documented inventory: 22 provider, 7 model, 26 compat', () => {
    const profile = node(envelope, PROVIDERS_DICT).inner
    const providerFields = Object.keys(node(envelope, profile).dict)
    const modelFields = Object.keys(node(envelope, node(envelope, MODELS_ARRAY).inner).dict)
    const compatKeys = Object.keys(node(envelope, COMPAT_OBJECT).dict)
    assert.equal(providerFields.length, 22)
    assert.equal(modelFields.length, 7)
    assert.equal(compatKeys.length, 26)
  })
})

describe('node()', () => {
  test('accepts a bare uid number', () => {
    assert.equal(node(envelope, ROOT), refs[String(ROOT)])
    assert.equal(node(envelope, PROFILE_OBJECT).type, 'object')
  })

  test('accepts an already-inlined object', () => {
    const inline = { type: 'string', meta: {} }
    assert.equal(node(envelope, inline), inline)
    assert.equal(node(envelope, refs[String(PROFILE_OBJECT)]), refs[String(PROFILE_OBJECT)])
  })

  test('accepts a { uid } wrapper', () => {
    assert.equal(node(envelope, { uid: PROFILE_OBJECT }), refs[String(PROFILE_OBJECT)])
  })

  test('accepts a decimal-string uid (defensive)', () => {
    assert.equal(node(envelope, String(PROFILE_OBJECT)), refs[String(PROFILE_OBJECT)])
  })

  test('returns undefined for unresolvable or empty references', () => {
    assert.equal(node(envelope, 999999), undefined)
    assert.equal(node(envelope, undefined), undefined)
    assert.equal(node(envelope, null), undefined)
    assert.equal(node({}, 1), undefined)
    assert.equal(node(envelope, 'not-a-uid'), undefined)
  })

  test('returns an expression wrapper untouched', () => {
    const expression = { __jsExpr: 'process.env.FOO' }
    assert.equal(node(envelope, expression), expression)
  })
})

describe('isExpression()', () => {
  test('detects {__jsExpr: string} and nothing else', () => {
    assert.equal(isExpression({ __jsExpr: 'a' }), true)
    assert.equal(isExpression({ __jsExpr: '' }), true)
    assert.equal(isExpression({ __jsExpr: 1 }), false)
    assert.equal(isExpression({}), false)
    assert.equal(isExpression({ a: 1 }), false)
    assert.equal(isExpression(null), false)
    assert.equal(isExpression('x'), false)
    assert.equal(isExpression([{ __jsExpr: 'a' }]), false)
  })
})

describe('leaves() over the real schema', () => {
  const all = leaves(envelope, ROOT, [])
  const paths = all.map(pathOf)

  test('enumerates leaves with absolute non-empty paths', () => {
    assert.ok(all.length > 0)
    for (const leaf of all) {
      assert.ok(Array.isArray(leaf.path), 'path is an array')
      assert.ok(leaf.path.length > 0, `non-empty path for ${JSON.stringify(leaf.path)}`)
      assert.equal(typeof leaf.node, 'object')
    }
  })

  test('assigns a known kind to every leaf', () => {
    for (const leaf of all) {
      assert.ok(ALL_KINDS.has(leaf.kind), `kind "${leaf.kind}" for ${pathOf(leaf)}`)
    }
  })

  test('never repeats a path', () => {
    assert.equal(new Set(paths).size, paths.length)
  })

  test('reaches every one of the 22 provider fields', () => {
    const expected = Object.keys(node(envelope, node(envelope, PROVIDERS_DICT).inner).dict)
    for (const field of expected) {
      assert.ok(
        paths.some((p) => p.startsWith(`providers.${field}`) || p === `providers.${field}`),
        `provider field ${field} is reachable`,
      )
    }
    assert.equal(expected.length, 22)
  })

  test('reaches model-level fields through both models[] and modelOverrides', () => {
    for (const scope of ['providers.models', 'providers.modelOverrides']) {
      for (const field of ['id', 'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'compat']) {
        if (scope === 'providers.modelOverrides' && field === 'id') continue // overrides key IS the id
        assert.ok(
          paths.some((p) => p.startsWith(`${scope}.${field}`)),
          `${scope}.${field} is reachable`,
        )
      }
    }
  })

  test('reaches all 26 compat keys at provider, models[] and modelOverrides level', () => {
    const expected = Object.keys(node(envelope, COMPAT_OBJECT).dict)
    for (const scope of ['providers.compat', 'providers.models.compat', 'providers.modelOverrides.compat']) {
      for (const key of expected) {
        assert.ok(paths.includes(`${scope}.${key}`), `${scope}.${key} is reachable`)
      }
    }
  })

  test('collapses an all-const union (reasoning, 7 branches) into ONE enum leaf', () => {
    const reasoning = all.filter((leaf) => pathOf(leaf) === 'providers.reasoning')
    assert.equal(reasoning.length, 1)
    assert.equal(reasoning[0].kind, 'enum')
    assert.deepEqual(reasoning[0].enum, ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  })

  test('keeps a single-const union (cacheControlFormat) instead of dropping it', () => {
    const leaf = all.find((l) => pathOf(l) === 'providers.compat.cacheControlFormat')
    assert.ok(leaf, 'cacheControlFormat survived')
    assert.equal(leaf.kind, 'enum')
    assert.deepEqual(leaf.enum, ['anthropic'])
  })

  test('keeps a union of two object branches (retryPolicy) as a discriminated union', () => {
    const leaf = all.find((l) => pathOf(l) === 'providers.retryPolicy')
    assert.ok(leaf, 'retryPolicy is not silently dropped')
    assert.equal(leaf.kind, 'union')
    assert.equal(leaf.branches.length, 2)
    assert.deepEqual(leaf.branches.map((b) => b.value), ['normal', 'always'])
    for (const branch of leaf.branches) {
      assert.equal(node(envelope, branch.ref).type, 'object')
    }
    // Without the discriminator KEY the panel could only ever write `{}` when a
    // branch is picked; a selection is `{<key>: <branch value>}` (see
    // docs/verification.md §14). The key belongs to the union, not to a branch.
    assert.equal(leaf.discriminator, 'mode', 'the union reports how a selection is written back')
  })

  test('a union with no discriminator (reasoningEfforts) reports none', () => {
    const leaf = all.find((l) => pathOf(l) === 'providers.models.reasoningEfforts')
    assert.ok(leaf)
    assert.equal(leaf.discriminator, undefined, 'a const/dict union has no key to write')
  })

  test('a union branch is described as a branch, not inlined (no duplicate paths)', () => {
    // The two retryPolicy branches share the `backoff` node; inlining would
    // emit providers.retryPolicy.backoff.* twice.
    assert.equal(paths.filter((p) => p.startsWith('providers.retryPolicy.')).length, 0)
    const leaf = all.find((l) => pathOf(l) === 'providers.retryPolicy')
    const normalBranch = node(envelope, leaf.branches[0].ref)
    const branchLeaves = leaves(envelope, leaf.branches[0].ref, ['providers', 'retryPolicy'])
    const branchPaths = branchLeaves.map(pathOf)
    for (const field of Object.keys(normalBranch.dict)) {
      assert.ok(
        branchPaths.some((p) => p.startsWith(`providers.retryPolicy.${field}`)),
        `${field} walkable in branch`,
      )
    }
  })

  test('a union of consts and a dict (reasoningEfforts) stays a variant, never flattened', () => {
    const leaf = all.find((l) => pathOf(l) === 'providers.models.reasoningEfforts')
    assert.ok(leaf)
    assert.equal(leaf.kind, 'union')
    assert.equal(leaf.branches.length, 2)
    assert.equal(leaf.branches[0].value, false)
    assert.equal(leaf.branches[0].label, 'false')
    assert.equal(node(envelope, leaf.branches[1].ref).type, 'dict')
  })

  test('an open dict with a scalar inner is ONE dict leaf', () => {
    const headers = all.find((l) => pathOf(l) === 'providers.headers')
    assert.equal(headers.kind, 'dict')
    for (const name of ['chatTemplateKwargs', 'chatTemplateArgs']) {
      const leaf = all.find((l) => pathOf(l) === `providers.compat.${name}`)
      assert.ok(leaf, `${name} present`)
      assert.equal(leaf.kind, 'dict')
    }
  })

  test('a dict whose inner is an object is path-transparent', () => {
    assert.ok(!paths.includes('providers.modelOverrides'), 'no container leaf')
    assert.ok(paths.includes('providers.modelOverrides.compat.supportsStore'))
  })

  test('an array with no object inner is ONE array leaf (with the item enum when const)', () => {
    const retryable = all.find((l) => pathOf(l) === 'providers.retryPolicy.retryableCodes')
    assert.ok(!retryable, 'branch leaves are not inlined at the root walk')
    const leaf = leaves(envelope, RETRY_POLICY_UNION, ['p'])
    assert.ok(leaf.length > 0)

    const defaultInput = all.find((l) => pathOf(l) === 'providers.defaultInput')
    assert.equal(defaultInput.kind, 'array')
    assert.deepEqual(defaultInput.enum, ['text', 'image'])
    assert.ok(!paths.includes('providers.defaultInput.text'))
  })

  test('an array whose inner is an object is path-transparent too (models[])', () => {
    assert.ok(!paths.includes('providers.models'), 'no container leaf for models[]')
    assert.equal(all.find((l) => pathOf(l) === 'providers.models.id').kind, 'string')
  })

  test('an object node contributes no leaf of its own', () => {
    assert.ok(!paths.includes('providers.compat'))
    assert.ok(!paths.includes('providers.thinkingBudgets'))
  })

  test('a fixed object emits its members; meta without bounds invents none', () => {
    const budgets = all.filter((l) => pathOf(l).startsWith('providers.thinkingBudgets.'))
    assert.deepEqual(budgets.map(pathOf).sort(), [
      'providers.thinkingBudgets.high',
      'providers.thinkingBudgets.low',
      'providers.thinkingBudgets.medium',
      'providers.thinkingBudgets.minimal',
    ])
    for (const leaf of budgets) {
      assert.equal(leaf.kind, 'number')
      // The fixture's thinkingBudgets nodes carry an EMPTY meta: no bounds and
      // no default exist, so none may be invented here.
      assert.equal(leaf.min, undefined)
      assert.equal(leaf.max, undefined)
      assert.equal(leaf.def, undefined)
    }
  })

  test('meta bounds/defaults are surfaced verbatim where they do exist', () => {
    const policy = all.find((l) => pathOf(l) === 'providers.retryPolicy')
    const normalBranch = leaves(envelope, policy.branches[0].ref, ['providers', 'retryPolicy'])
    const initial = normalBranch.find((l) => pathOf(l) === 'providers.retryPolicy.backoff.initialDelayMs')
    assert.ok(initial)
    assert.equal(initial.kind, 'number')
    assert.equal(initial.def, 500)
    assert.equal(initial.max, 2147483647)
    const jitter = normalBranch.find((l) => pathOf(l) === 'providers.retryPolicy.backoff.jitterRatio')
    assert.equal(jitter.min, 0)
    assert.equal(jitter.max, 1)
    assert.equal(jitter.def, 0.1)
    const retries = normalBranch.find((l) => pathOf(l) === 'providers.retryPolicy.maxRetries')
    assert.equal(retries.kind, 'integer')
    assert.equal(retries.def, 5)
    assert.equal(retries.step, 1)
  })

  test('meta.step === 1 reads as integer; an unconstrained number stays number', () => {
    assert.equal(all.find((l) => pathOf(l) === 'providers.timeoutMs').kind, 'integer')
    assert.equal(all.find((l) => pathOf(l) === 'providers.timeoutMs').min, 0)
    assert.equal(all.find((l) => pathOf(l) === 'providers.timeoutMs').step, 1)
    assert.equal(all.find((l) => pathOf(l) === 'providers.defaultContextWindow').kind, 'integer')
    assert.equal(all.find((l) => pathOf(l) === 'providers.streamIdleTimeoutMs').kind, 'number')
    assert.equal(all.find((l) => pathOf(l) === 'providers.timeoutMs').def, undefined, 'no invented default')
  })

  test('required reflects meta.required only; absence means optional, never invented', () => {
    const apiKeyEnvNode = node(envelope, node(envelope, PROFILE_OBJECT).dict.apiKeyEnv)
    assert.equal(apiKeyEnvNode.meta.role, 'credential-ref')
    assert.equal(Object.prototype.hasOwnProperty.call(apiKeyEnvNode.meta, 'required'), false)
    assert.equal(all.find((l) => pathOf(l) === 'providers.apiKeyEnv').required, false)
    assert.equal(all.find((l) => pathOf(l) === 'providers.reasoning').required, false)
    assert.equal(all.find((l) => pathOf(l) === 'providers.timeoutMs').required, false)
  })

  test('a plain union reads as nullable:false; a const null branch is what marks nullable', () => {
    // Nothing in the fixture is nullable: the two `reasoningEfforts` unions hold
    // a const `null` branch, but that branch sits inside a DICT (`{ id: const null }`),
    // so the union itself has no literal null alternative.
    const effortsNode = node(envelope, node(envelope, node(envelope, 336).dict.reasoningEfforts))
    assert.deepEqual(effortsNode.list.map((r) => node(envelope, r).type), ['const', 'dict'])
    assert.equal(node(envelope, effortsNode.list[1]).inner, 315)
    assert.deepEqual(all.filter((l) => l.nullable).map(pathOf), [])
  })

  test('a union with a literal const null branch is nullable; nothing else is', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: { type: 'union', meta: {}, list: [2, 3] },
        2: { type: 'string', meta: {} },
        3: { type: 'const', value: null, meta: {} },
      },
    }
    const out = leaves(synthetic, 1, ['p'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'union')
    assert.equal(out[0].nullable, true)
    assert.equal(out[0].branches[1].label, 'null')
    assert.equal(out[0].branches[1].value, null)
  })

  test('open containers take the caller-supplied instance segment', () => {
    const provider = leaves(envelope, PROVIDERS_DICT, ['providers', 'zeta'])
    assert.equal(provider.length, all.length)
    for (const leaf of provider) {
      assert.equal(leaf.path[0], 'providers')
      assert.equal(leaf.path[1], 'zeta')
    }
    const deep = leaves(envelope, MODELS_ARRAY, ['providers', 'zeta', 'models'])
    assert.ok(deep.some((l) => l.path.join('.') === 'providers.zeta.models.contextWindow'))
  })

  test('a caller-supplied basePath is not mutated', () => {
    const base = ['providers']
    leaves(envelope, PROVIDERS_DICT, base)
    assert.deepEqual(base, ['providers'])
  })

  test('returns [] for an unresolvable root instead of throwing', () => {
    assert.deepEqual(leaves(envelope, 999999, []), [])
    assert.deepEqual(leaves({}, ROOT, []), [])
    assert.deepEqual(leaves(envelope, undefined, []), [])
  })

  test('a node shared by two subtrees is enumerated at both paths', () => {
    // `compat` (312) is one node referenced by profile, models[] and modelOverrides.
    const compatLeaves = all.filter((l) => pathOf(l).endsWith('.compat.supportsStore'))
    assert.deepEqual(compatLeaves.map(pathOf).sort(), [
      'providers.compat.supportsStore',
      'providers.modelOverrides.compat.supportsStore',
      'providers.models.compat.supportsStore',
    ])
  })
})

describe('leaf.container (instance containers)', () => {
  // The page's own call: assert on one provider profile, exactly like lib/client.js.
  const scoped = leaves(envelope, PROFILE_OBJECT, ['providers', 'alpha'])
  const containerOf = (suffix) => scoped.find((leaf) => pathOf(leaf) === suffix)?.container

  test('every models[] member carries the models array container, with the caller basePath', () => {
    const members = scoped.filter((leaf) => pathOf(leaf).startsWith('providers.alpha.models.'))
    assert.equal(members.length, 32)
    for (const leaf of members) {
      assert.deepEqual(leaf.container, { kind: 'array', path: ['providers', 'alpha', 'models'] })
    }
  })

  test('every modelOverrides member carries the overrides dict container', () => {
    const members = scoped.filter((leaf) => pathOf(leaf).startsWith('providers.alpha.modelOverrides.'))
    assert.equal(members.length, 31)
    for (const leaf of members) {
      assert.deepEqual(leaf.container, { kind: 'dict', path: ['providers', 'alpha', 'modelOverrides'] })
    }
  })

  test('the outermost container wins: a model compat key keeps the models container', () => {
    assert.deepEqual(containerOf('providers.alpha.models.compat.supportsStore'), {
      kind: 'array',
      path: ['providers', 'alpha', 'models'],
    })
  })

  test('provider-level fields carry no container at all', () => {
    for (const suffix of [
      'providers.alpha.api',
      'providers.alpha.baseURL',
      'providers.alpha.compat.supportsStore',
      'providers.alpha.retryPolicy',
      'providers.alpha.headers',
    ]) {
      const leaf = scoped.find((entry) => pathOf(entry) === suffix)
      assert.ok(leaf, `${suffix} must exist`)
      assert.equal(Object.hasOwn(leaf, 'container'), false, `${suffix} must not carry a container key`)
    }
  })

  test('the container descriptor is a copy, not a shared reference', () => {
    const first = containerOf('providers.alpha.models.id')
    const second = containerOf('providers.alpha.models.name')
    assert.notEqual(first, second)
    first.path.push('mutated')
    assert.deepEqual(second.path, ['providers', 'alpha', 'models'])
  })

  test('a root walk sets exactly one instance segment per level (providers dict here)', () => {
    const rootLeaves = leaves(envelope, ROOT, [])
    const containers = new Set(
      rootLeaves
        .filter((leaf) => leaf.container !== undefined)
        .map((leaf) => `${leaf.container.kind}:${leaf.container.path.join('.')}`),
    )
    assert.deepEqual([...containers], ['dict:providers'])
  })
})

describe('leaves() on synthetic shapes the snapshot does not contain', () => {
  test('skips {__jsExpr} subtrees entirely', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: {
          type: 'object',
          meta: {},
          dict: {
            visible: { type: 'string', meta: {} },
            computed: { __jsExpr: 'ctx.env.SECRET' },
          },
        },
        2: { type: 'array', meta: {}, inner: { __jsExpr: 'a + b' } },
        3: {
          type: 'object',
          meta: {},
          dict: { nested: { type: 'object', meta: {}, dict: { hidden: { __jsExpr: 'x' } } } },
        },
      },
    }
    assert.deepEqual(leaves(synthetic, 1, []).map(pathOf), ['visible'])
    const arrayLeaf = leaves(synthetic, 2, ['p'])
    assert.equal(arrayLeaf.length, 1)
    assert.equal(arrayLeaf[0].kind, 'array')
    assert.equal(arrayLeaf[0].enum, undefined)
    assert.deepEqual(leaves(synthetic, 3, []), [], 'a subtree containing only expressions vanishes')
  })

  test('an expression node reached as a root yields no leaf', () => {
    const synthetic = { uid: 1, refs: { 1: { __jsExpr: 'x' } } }
    assert.deepEqual(leaves(synthetic, 1, []), [])
  })

  test('a lazy node never throws and still yields something', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: { type: 'lazy', meta: {}, inner: { toJSON: () => ({ type: 'string', meta: {} }) } },
        2: { type: 'lazy', meta: {}, inner: { toJSON: () => undefined } },
      },
    }
    const resolved = leaves(synthetic, 1, ['p'])
    assert.equal(resolved.length, 1)
    assert.equal(resolved[0].kind, 'string')
    const unresolved = leaves(synthetic, 2, ['p'])
    assert.equal(unresolved.length, 1)
    assert.equal(unresolved[0].kind, 'unknown')
  })

  test('an unknown node type degrades to kind "unknown" instead of vanishing', () => {
    const synthetic = { uid: 1, refs: { 1: { type: 'totally-new-kind', meta: {} } } }
    const out = leaves(synthetic, 1, ['p'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'unknown')
  })

  test('a self-referencing inlined node terminates', () => {
    const cyclic = { uid: 900, type: 'object', meta: {}, dict: {} }
    cyclic.dict.self = cyclic
    const synthetic = { uid: 900, refs: { 900: cyclic } }
    assert.deepEqual(leaves(synthetic, 900, []), [])
  })

  test('a deep chain stops at the depth guard instead of overflowing', () => {
    const refs = {}
    for (let i = 0; i < 400; i += 1) {
      refs[i] = { type: 'object', meta: {}, dict: { child: i + 1 } }
    }
    refs[400] = { type: 'string', meta: {} }
    assert.doesNotThrow(() => leaves({ uid: 0, refs }, 0, []))
  })

  test('a dict with an object inner is path-transparent', () => {
    const synthetic = {
      uid: 10,
      refs: {
        10: { type: 'dict', meta: {}, inner: 11, sKey: 12 },
        11: { type: 'object', meta: {}, dict: { x: { type: 'string', meta: {} } } },
        12: { type: 'string', meta: {} },
      },
    }
    assert.deepEqual(leaves(synthetic, 10, ['k']).map(pathOf), ['k.x'])
  })

  test('an all-const union with a single branch still becomes an enum leaf', () => {
    const synthetic = { uid: 1, refs: { 1: { type: 'union', meta: {}, list: [2] }, 2: { type: 'const', value: 'only', meta: {} } } }
    const out = leaves(synthetic, 1, ['p'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'enum')
    assert.deepEqual(out[0].enum, ['only'])
  })

  test('an empty union is surfaced as unknown rather than dropped', () => {
    const synthetic = { uid: 1, refs: { 1: { type: 'union', meta: {}, list: [] } } }
    const out = leaves(synthetic, 1, ['p'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'unknown')
  })
})

describe('shape()', () => {
  test('an object node reports closed fields with required flags', () => {
    const profile = shape(envelope, PROFILE_OBJECT)
    assert.equal(profile.kind, 'object')
    assert.equal(profile.open, false)
    assert.equal(profile.fields.length, 22)
    const apiKeyEnv = profile.fields.find((f) => f.key === 'apiKeyEnv')
    assert.equal(apiKeyEnv.ref, node(envelope, PROFILE_OBJECT).dict.apiKeyEnv)
    assert.equal(apiKeyEnv.node.type, 'string')
    assert.equal(apiKeyEnv.required, false)
    const names = profile.fields.map((f) => f.key)
    assert.deepEqual(names, Object.keys(node(envelope, PROFILE_OBJECT).dict), 'document order')
  })

  test('a dict node reports open:true with its key node and value shape', () => {
    const providers = shape(envelope, PROVIDERS_DICT)
    assert.equal(providers.kind, 'dict')
    assert.equal(providers.open, true)
    assert.deepEqual(providers.fields, [], 'keys are user-chosen')
    assert.equal(providers.keyRef, 380)
    assert.equal(providers.keyNode.type, 'string')
    assert.equal(providers.valueShape.kind, 'object')
    assert.equal(providers.valueShape.fields.length, 22)
    assert.equal(providers.inner, PROFILE_OBJECT)
  })

  test('a dict with a scalar inner has no value shape', () => {
    const headers = shape(envelope, 354) // headers: dict(inner string, sKey string)
    assert.equal(headers.kind, 'dict')
    assert.equal(headers.valueShape, undefined)
    assert.equal(headers.keyNode.type, 'string')
  })

  test('a scalar, array, union or unresolvable node has no shape', () => {
    assert.equal(shape(envelope, MODELS_ARRAY), undefined)
    assert.equal(shape(envelope, COMPAT_OBJECT).kind, 'object')
    assert.equal(shape(envelope, REASONING_UNION), undefined)
    assert.equal(shape(envelope, node(envelope, PROFILE_OBJECT).dict.apiKeyEnv), undefined)
    assert.equal(shape(envelope, 999999), undefined)
    assert.equal(shape(envelope, undefined), undefined)
  })

  test('shape() of a dict exposes the row template for a repeatable group', () => {
    const overrides = shape(envelope, 345) // modelOverrides: dict(inner = model object)
    assert.equal(overrides.kind, 'dict')
    assert.equal(overrides.valueShape.kind, 'object')
    // 336 is the override object: `id` is the dict KEY, so it has 6 members.
    assert.equal(overrides.valueShape.fields.length, 6)
    assert.deepEqual(overrides.valueShape.fields.map((f) => f.key), [
      'name', 'contextWindow', 'maxTokens', 'input', 'reasoningEfforts', 'compat',
    ])
  })
})

describe('valueVar / valueVarNames on dict leaves (structural $var binding)', () => {
  const all = leaves(envelope, ROOT, [])
  /** The live fixture's variable-aware dicts: refs 291 and 293 both wrap union 266. */
  const CHAT_TEMPLATE_DICTS = {
    291: 'providers.compat.chatTemplateKwargs',
    293: 'providers.compat.chatTemplateArgs',
  }

  test('the fixture really nests an object/$var branch (independent of the walk)', () => {
    for (const ref of Object.keys(CHAT_TEMPLATE_DICTS)) {
      const dict = refs[ref]
      assert.equal(dict.type, 'dict')
      assert.equal(dict.inner, 266, `${ref} wraps the shared value union`)
      const branches = refs[String(dict.inner)].list.map((r) => refs[String(r)])
      assert.equal(branches.filter((b) => b.type === 'object').length, 1)
      const objectBranch = branches.find((b) => b.type === 'object')
      assert.ok(Object.prototype.hasOwnProperty.call(objectBranch.dict, '$var'))
      assert.deepEqual(
        refs[String(objectBranch.dict.$var)].list.map((r) => refs[String(r)].value),
        ['thinking.enabled', 'thinking.effort', 'thinking.budget'],
      )
    }
  })

  test('the variable-aware dict leaves carry the flag and the const vocabulary', () => {
    const expected = ['thinking.enabled', 'thinking.effort', 'thinking.budget']
    for (const path of Object.values(CHAT_TEMPLATE_DICTS)) {
      const leaf = all.find((l) => pathOf(l) === path)
      assert.ok(leaf, `${path} is a dict leaf`)
      assert.equal(leaf.kind, 'dict')
      assert.equal(leaf.valueVar, true)
      assert.deepEqual(leaf.valueVarNames, expected)
      assert.equal(leaf.valueNullable, true, 'the null alternative is still reported')
    }
  })

  test('a dict without a $var branch has no valueVar key at all', () => {
    const headers = all.find((l) => pathOf(l) === 'providers.headers')
    assert.equal(headers.kind, 'dict')
    assert.equal(headers.valueVar, undefined)
    assert.equal(
      Object.prototype.hasOwnProperty.call(headers, 'valueVar'),
      false,
      'the flag is additive: absent, not false',
    )
    assert.equal(headers.valueVarNames, undefined)
  })

  test('synthetic: branch order, extra keys and duplicates do not hide the binding', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: { type: 'dict', meta: {}, inner: 2, sKey: 5 },
        2: { type: 'union', meta: {}, list: [6, 3, 7] },
        // The object branch sits last and carries extra keys around `$var`.
        3: { type: 'object', meta: {}, dict: { zExtra: 8, $var: 4, omitWhenOff: 9 } },
        4: { type: 'union', meta: {}, list: [10, 11, 10] },
        5: { type: 'string', meta: {} },
        6: { type: 'const', meta: {}, value: null },
        7: { type: 'number', meta: {} },
        8: { type: 'boolean', meta: {} },
        9: { type: 'boolean', meta: {} },
        10: { type: 'const', meta: {}, value: 'a' },
        11: { type: 'const', meta: {}, value: 'b' },
      },
    }
    const out = leaves(synthetic, 1, ['k'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'dict')
    assert.equal(out[0].valueVar, true)
    assert.deepEqual(out[0].valueVarNames, ['a', 'b'], 'schema order, de-duplicated')
    assert.equal(out[0].valueNullable, true)
  })

  test('synthetic: a value union with no object branch reports no valueVar', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: { type: 'dict', meta: {}, inner: 2, sKey: 3 },
        2: { type: 'union', meta: {}, list: [4, 5] },
        3: { type: 'string', meta: {} },
        4: { type: 'const', meta: {}, value: 'x' },
        5: { type: 'const', meta: {}, value: 'y' },
      },
    }
    const out = leaves(synthetic, 1, ['k'])
    assert.equal(out.length, 1)
    assert.equal(out[0].kind, 'dict')
    assert.deepEqual(out[0].valueEnum, ['x', 'y'], 'a const union stays a plain value enum')
    assert.equal(Object.prototype.hasOwnProperty.call(out[0], 'valueVar'), false)
  })

  test('synthetic: a $var node that is not a const set yields an empty vocabulary', () => {
    const synthetic = {
      uid: 1,
      refs: {
        1: { type: 'dict', meta: {}, inner: 2, sKey: 3 },
        2: { type: 'union', meta: {}, list: [4, 5] },
        3: { type: 'string', meta: {} },
        4: { type: 'boolean', meta: {} },
        5: { type: 'object', meta: {}, dict: { $var: 6 } },
        6: { type: 'string', meta: {} },
      },
    }
    const out = leaves(synthetic, 1, ['k'])
    assert.equal(out.length, 1)
    assert.equal(out[0].valueVar, true, 'the shape is recognised without a closed vocabulary')
    assert.deepEqual(out[0].valueVarNames, [])
  })
})
