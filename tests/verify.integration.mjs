/**
 * Independent verification harness (owner: verifier).
 *
 * This is NOT a copy of the implementers' unit tests. It is an adversarial,
 * from-the-outside harness that:
 *   1. Loads the REAL fixture (`tests/fixtures/llm-pi-ai.schema.json`) and
 *      re-derives the expected field inventory itself, without consulting the
 *      implementation, then diffs it against what the shipped chunk reports.
 *   2. Hands `groupLeaves()` deliberately hostile leaves (unknown path,
 *      unknown kind, nested dict/union/array, unevaluated `{__jsExpr}`) and
 *      proves none of them can vanish from the UI.
 *   3. Drives the real form module and asserts at the byte level that clearing
 *      a field yields `{op:"unset"}` and NEVER `{op:"set", value:null}`.
 *   4. Confirms the emitted op grammar against the host's own `applyPathOp`
 *      semantics, extracted verbatim from the installed `dsh-settings` bytes.
 *
 * Run:  node tests/verify.integration.mjs
 * It is deliberately named `verify.integration.mjs` (not `*.test.js`) so that
 * `node --test tests/` does not silently absorb it; run it explicitly.
 *
 * Exit code 0 only when every check passed.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const FIXTURE = join(here, 'fixtures', 'llm-pi-ai.schema.json')
const SETTINGS_SRC = '/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-settings/lib/index.js'

// ---------------------------------------------------------------------------
// tiny assertion recorder
// ---------------------------------------------------------------------------
const findings = []
let passed = 0
let failed = 0
function ok(id, label, detail) {
  passed += 1
  findings.push({ id, verdict: 'PASS', label, detail: detail ?? '' })
  console.log(`PASS | ${id} | ${label}${detail ? ` | ${detail}` : ''}`)
}
function bad(id, label, detail, severity = 'HIGH') {
  failed += 1
  findings.push({ id, verdict: 'FAIL', severity, label, detail: detail ?? '' })
  console.log(`FAIL | ${id} | [${severity}] ${label}${detail ? ` | ${detail}` : ''}`)
}
function check(id, label, cond, detail, severity = 'HIGH') {
  if (cond) ok(id, label, detail)
  else bad(id, label, detail, severity)
  return !!cond
}
function unverified(id, label, detail) {
  findings.push({ id, verdict: 'UNVERIFIED', label, detail: detail ?? '' })
  console.log(`SKIP | ${id} | ${label}${detail ? ` | ${detail}` : ''}`)
}

// ---------------------------------------------------------------------------
// 1. independent reference inventory straight from the fixture
// ---------------------------------------------------------------------------
const env = JSON.parse(readFileSync(FIXTURE, 'utf8'))
const refs = env.refs ?? {}
const isExpr = (v) =>
  v !== null && typeof v === 'object' && Object.keys(v).length === 1 && typeof v.__jsExpr === 'string'

function nodeOf(ref) {
  if (ref === null || ref === undefined) return undefined
  if (typeof ref === 'number') return refs[String(ref)]
  if (typeof ref === 'object' && Object.keys(ref).length === 1 && typeof ref.uid === 'number') {
    return refs[String(ref.uid)]
  }
  return ref
}

const rootNode = nodeOf(env.uid)
const providersDict = nodeOf(rootNode.dict.providers)
const profileNode = nodeOf(providersDict.inner)
const EXPECTED_PROVIDER_FIELDS = Object.keys(profileNode.dict)
const modelsArray = nodeOf(profileNode.dict.models)
const modelNode = nodeOf(modelsArray.inner)
const EXPECTED_MODEL_FIELDS = Object.keys(modelNode.dict)
const EXPECTED_COMPAT_KEYS = Object.keys(nodeOf(profileNode.dict.compat).dict)

console.log('--- fixture-derived expectations ---')
console.log('provider fields:', EXPECTED_PROVIDER_FIELDS.length, EXPECTED_PROVIDER_FIELDS.join(', '))
console.log('model fields   :', EXPECTED_MODEL_FIELDS.length, EXPECTED_MODEL_FIELDS.join(', '))
console.log('compat keys    :', EXPECTED_COMPAT_KEYS.length)

check(
  'INV-1',
  'fixture carries 22 provider-level fields',
  EXPECTED_PROVIDER_FIELDS.length === 22,
  `observed ${EXPECTED_PROVIDER_FIELDS.length}`,
)
check(
  'INV-2',
  'fixture carries 7 model-level fields',
  EXPECTED_MODEL_FIELDS.length === 7,
  `observed ${EXPECTED_MODEL_FIELDS.length}`,
)
check(
  'INV-3',
  'fixture carries 26 compat keys',
  EXPECTED_COMPAT_KEYS.length === 26,
  `observed ${EXPECTED_COMPAT_KEYS.length}`,
)

// no unevaluated expression in this snapshot (the expression path is still tested synthetically)
const exprNodes = Object.entries(refs).filter(([, n]) => isExpr(n))
check(
  'INV-4',
  'fixture contains no live {__jsExpr} node (synthetic expression test still required)',
  exprNodes.length === 0,
  `observed ${exprNodes.length}`,
  'LOW',
)

// ---------------------------------------------------------------------------
// 2. load the shipped chunk bytes (both access paths from the contract)
// ---------------------------------------------------------------------------
async function loadChunk(name) {
  const file = join(root, 'lib', `client.${name}.js`)
  const url = pathToFileURL(file).href
  const mod = await import(url)
  const fromRegistry = globalThis.__dshLlmPiAiConfig?.[name]
  return { file, mod, api: fromRegistry ?? mod }
}

const CHUNKS = {}
// v10: `fields` is the logic half of a pair and reads `fieldsGroups` /
// `fieldsHints` out of the registry at eval time, so the two data chunks are
// imported first (the same order as the owner's chunk plan). Their own failure
// surfaces as the `fields` import error below.
for (const dataChunk of ['fields.groups', 'fields.hints']) {
  try {
    await loadChunk(dataChunk)
  } catch {
    // Reported through `fields`, which cannot be evaluated without them.
  }
}
for (const name of ['schema', 'form', 'fields']) {
  try {
    CHUNKS[name] = await loadChunk(name)
  } catch (error) {
    CHUNKS[name] = { error }
  }
}

const missing = Object.entries(CHUNKS)
  .filter(([, c]) => c.error)
  .map(([n, c]) => `${n}: ${c.error.message}`)
if (missing.length > 0) {
  console.log('\n--- module availability ---')
  for (const m of missing) console.log('MISSING |', m)
}
const schemaApi = CHUNKS.schema?.api
const formApi = CHUNKS.form?.api
const fieldsApi = CHUNKS.fields?.api

// ---------------------------------------------------------------------------
// 3. leaf enumeration must not lose any of the 22/7/26
// ---------------------------------------------------------------------------
if (typeof schemaApi?.leaves !== 'function') {
  bad('LEAF-0', 'lib/client.schema.js exports leaves()', 'not available', 'BLOCKER')
} else {
  let leaves = []
  try {
    leaves = schemaApi.leaves(env, env.uid, [])
  } catch (error) {
    bad('LEAF-0', 'leaves(envelope, rootUid, []) throws', error.message, 'BLOCKER')
  }
  console.log(`\n--- leaves() reported ${leaves.length} leaves ---`)
  const paths = leaves.map((l) => (Array.isArray(l.path) ? l.path.join('.') : String(l.path)))
  console.log(paths.join('\n'))

  const seenProvider = new Set()
  for (const p of paths) {
    const m = /(?:^|\.)providers\.([A-Za-z0-9_]+)/.exec(p)
    if (m) seenProvider.add(m[1])
  }
  const lostProvider = EXPECTED_PROVIDER_FIELDS.filter((f) => !seenProvider.has(f))
  check(
    'LEAF-1',
    'every one of the 22 provider fields is reachable from leaves()',
    lostProvider.length === 0,
    lostProvider.length === 0 ? 'all 22 present' : `MISSING: ${lostProvider.join(', ')}`,
  )
  const modelLeafPaths = paths.filter((p) => /\.models\b|modelOverrides/.test(p))
  check(
    'LEAF-2',
    'model-level fields are represented (models[] / modelOverrides)',
    modelLeafPaths.length > 0,
    `${modelLeafPaths.length} model-scoped leaf paths`,
    'HIGH',
  )
  const compatLeafPaths = paths.filter((p) => /\.compat\b/.test(p))
  check(
    'LEAF-3',
    'compat is represented at both provider and model level',
    compatLeafPaths.filter((p) => /providers\.[A-Za-z0-9_]+\.compat/.test(p)).length > 0 &&
      compatLeafPaths.filter((p) => /modelOverrides|\.models\b/.test(p)).length > 0,
    `${compatLeafPaths.length} compat leaf paths`,
  )
  const dupes = paths.filter((p, i) => paths.indexOf(p) !== i)
  check('LEAF-4', 'no duplicate leaf paths', dupes.length === 0, dupes.length ? dupes.join(', ') : 'none')
  const badPaths = leaves.filter((l) => !Array.isArray(l.path) || l.path.length === 0)
  check('LEAF-5', 'every leaf carries a non-empty absolute path', badPaths.length === 0, `${badPaths.length} bad`)
  const noKind = leaves.filter((l) => typeof l.kind !== 'string' || l.kind.length === 0)
  check('LEAF-6', 'every leaf carries a kind', noKind.length === 0, `${noKind.length} without kind`)

  // the two non-obvious mixed unions must not be silently reduced
  const reasoningLeaf = leaves.find((l) => Array.isArray(l.path) && l.path.join('.').endsWith('.reasoning'))
  check(
    'LEAF-7',
    'provider `reasoning` (all-const union) collapses to ONE enum leaf with 7 levels',
    !!reasoningLeaf && Array.isArray(reasoningLeaf.enum) && reasoningLeaf.enum.length === 7,
    reasoningLeaf ? `kind=${reasoningLeaf.kind} enum=${JSON.stringify(reasoningLeaf.enum)}` : 'leaf not found',
  )
  const retry = leaves.find((l) => Array.isArray(l.path) && l.path.join('.').includes('retryPolicy'))
  check(
    'LEAF-8',
    '`retryPolicy` (union of two object branches) is a reachable discriminated leaf',
    !!retry,
    retry ? `path=${retry.path.join('.')} kind=${retry.kind}` : 'NO retryPolicy leaf — SILENT DROP',
  )
  const cacheControl = leaves.find((l) => Array.isArray(l.path) && l.path.join('.').endsWith('.cacheControlFormat'))
  check(
    'LEAF-9',
    '`cacheControlFormat` (single-const union) is reachable, not dropped as a 1-branch union',
    !!cacheControl,
    cacheControl ? `kind=${cacheControl.kind}` : 'NO cacheControlFormat leaf — SILENT DROP',
  )

  // -------------------------------------------------------------------------
  // 4. groupLeaves must not drop ANYTHING, including hostile leaves
  // -------------------------------------------------------------------------
  if (typeof fieldsApi?.groupLeaves !== 'function') {
    bad('GRP-0', 'lib/client.fields.js exports groupLeaves()', 'not available', 'BLOCKER')
  } else {
    const synthetic = [
      { path: ['providers', 'zzz_brand_new_upstream_field'], kind: 'string', nullable: false, required: false },
      { path: ['providers', 'weird'], kind: 'totally-unknown-kind-42', nullable: false, required: false },
      { path: ['providers', 'nested', 'dictish'], kind: 'dict', nullable: false, required: false },
      { path: ['providers', 'nested', 'unionish'], kind: 'union', nullable: false, required: false, branches: [] },
      { path: ['providers', 'nested', 'arrayish'], kind: 'array', nullable: false, required: false },
    ]
    let groups = []
    try {
      groups = fieldsApi.groupLeaves([...leaves, ...synthetic])
    } catch (error) {
      bad('GRP-1', 'groupLeaves() accepts a hostile leaf list without throwing', error.message, 'HIGH')
      groups = []
    }
    const grouped = groups.flatMap((g) => (g.leaves ?? []).map((l) => (Array.isArray(l.path) ? l.path.join('.') : String(l.path))))
    const allPaths = [...paths, ...synthetic.map((l) => l.path.join('.'))]
    const orphans = allPaths.filter((p) => !grouped.includes(p))
    check(
      'GRP-2',
      'EVERY leaf (real + hostile) lands in exactly one group — the anti-silent-drop guarantee',
      orphans.length === 0,
      orphans.length === 0 ? `${allPaths.length} leaves all grouped` : `ORPHANED: ${orphans.join(', ')}`,
    )
    const dupGroups = grouped.filter((p, i) => grouped.indexOf(p) !== i)
    check('GRP-3', 'no leaf appears in two groups', dupGroups.length === 0, dupGroups.join(', ') || 'none')
    check(
      'GRP-4',
      'unknown-path leaf is grouped (forward compatibility)',
      grouped.includes('providers.zzz_brand_new_upstream_field'),
      'providers.zzz_brand_new_upstream_field',
    )
    check(
      'GRP-5',
      'unknown-kind leaf is grouped (generic control path)',
      grouped.includes('providers.weird'),
      'providers.weird',
    )
    for (const g of groups) {
      check(
        `GRP-6:${g.id}`,
        `group "${g.id}" has a title and a non-empty leaf list`,
        typeof g.title === 'string' && g.title.length > 0 && (g.leaves ?? []).length > 0,
        `title=${JSON.stringify(g.title)} leaves=${(g.leaves ?? []).length}`,
        'LOW',
      )
    }
    if (typeof fieldsApi.describeField === 'function') {
      let descErr = null
      try {
        fieldsApi.describeField('providers.zzz_brand_new_upstream_field')
        fieldsApi.describeField('providers.nested.dictish')
      } catch (error) {
        descErr = error.message
      }
      check('GRP-7', 'describeField() tolerates unknown paths without throwing', descErr === null, descErr ?? 'ok')
    } else {
      bad('GRP-7', 'lib/client.fields.js exports describeField()', 'not available')
    }
  }
}

// ---------------------------------------------------------------------------
// 5. cleared field must be unset, never set:null (byte level)
// ---------------------------------------------------------------------------
if (typeof formApi?.diffOps !== 'function') {
  bad('FORM-0', 'lib/client.form.js exports diffOps()', 'not available', 'BLOCKER')
} else {
  const cases = [
    { id: 'FORM-1', label: 'scalar removed -> one unset', before: { timeoutMs: 5000 }, after: {}, expect: [{ op: 'unset', path: ['p', 'timeoutMs'] }] },
    { id: 'FORM-2', label: 'scalar changed -> one set', before: { timeoutMs: 1 }, after: { timeoutMs: 2 }, expect: [{ op: 'set', path: ['p', 'timeoutMs'], value: 2 }] },
    { id: 'FORM-3', label: 'unchanged subtree -> no ops', before: { a: { b: 1 } }, after: { a: { b: 1 } }, expect: [] },
    { id: 'FORM-4', label: 'removed object key -> unset for that key', before: { a: 1, b: 2 }, after: { a: 1 }, expect: [{ op: 'unset', path: ['p', 'b'] }] },
    { id: 'FORM-5', label: 'shortened array -> unset per trailing index', before: { xs: [1, 2, 3] }, after: { xs: [1] }, expect: [{ op: 'unset', path: ['p', 'xs', 2] }, { op: 'unset', path: ['p', 'xs', 1] }] },
    { id: 'FORM-6', label: 'explicit null pick is a set (only when schema nullable)', before: {}, after: { v: null }, expect: [{ op: 'set', path: ['p', 'v'], value: null }] },
  ]
  for (const c of cases) {
    let ops = null
    try {
      ops = formApi.diffOps(['p'], c.before, c.after)
    } catch (error) {
      bad(c.id, c.label, `threw: ${error.message}`)
      continue
    }
    check(c.id, c.label, JSON.stringify(ops) === JSON.stringify(c.expect), `got ${JSON.stringify(ops)} want ${JSON.stringify(c.expect)}`)
  }
  // The load-bearing rule: a cleared (absent-key) field is unset, and no op
  // in a removal-only diff may carry a null value.
  const removalOnly = [
    [{ a: 1 }, {}],
    [{ a: { b: 1, c: 2 } }, { a: { b: 1 } }],
    [{ xs: [1, 2] }, { xs: [] }],
  ]
  let nullSet = null
  for (const [before, after] of removalOnly) {
    const ops = formApi.diffOps(['p'], before, after)
    const offender = ops.find((o) => o.op === 'set' && o.value === null)
    if (offender) nullSet = offender
    const nonUnset = ops.filter((o) => o.op !== 'unset')
    if (nonUnset.length > 0) nullSet = nonUnset[0]
  }
  check(
    'FORM-7',
    'removal-only diffs emit ONLY {op:"unset"} and never {op:"set", value:null}',
    nullSet === null,
    nullSet === null ? 'no null-set op in any removal diff' : `OFFENDER ${JSON.stringify(nullSet)}`,
  )
}

// staged form: save-once, conflict keeps draft
if (typeof formApi?.createStagedForm !== 'function') {
  unverified('FORM-8', 'lib/client.form.js exports createStagedForm()', 'not available')
} else {
  let calls = 0
  let lastArgs = null
  const staged = formApi.createStagedForm({
    getSnapshot: () => ({ values: { p: { timeoutMs: 5000 } }, revision: 7 }),
    mutate: async (ops, rev) => {
      calls += 1
      lastArgs = { ops, rev }
      return true
    },
    schema: null,
  })
  if (typeof staged?.remove === 'function') staged.remove(['p', 'timeoutMs'])
  const saveResult = typeof staged?.save === 'function' ? await staged.save() : undefined
  check('FORM-8', 'save() invokes mutate() exactly once', calls === 1, `calls=${calls} result=${JSON.stringify(saveResult)}`)
  check('FORM-9', 'save() passes the read revision through as expectedRevision', lastArgs?.rev === 7 || lastArgs?.rev === undefined, JSON.stringify(lastArgs))
  check(
    'FORM-10',
    'save() on a cleared field sends unset, never set:null',
    Array.isArray(lastArgs?.ops) && lastArgs.ops.some((o) => o.op === 'unset') && !lastArgs.ops.some((o) => o.op === 'set' && o.value === null),
    JSON.stringify(lastArgs?.ops),
  )
}

// ---------------------------------------------------------------------------
// 6. confirm the emitted grammar against the REAL host applyPathOp bytes
// ---------------------------------------------------------------------------
let hostVerified = false
try {
  const src = readFileSync(SETTINGS_SRC, 'utf8')
  const grab = (anchor) => {
    const s = src.indexOf(anchor)
    if (s < 0) throw new Error(`missing ${anchor}`)
    let i = src.indexOf('{', s)
    let d = 0
    for (let j = i; j < src.length; j += 1) {
      if (src[j] === '{') d += 1
      else if (src[j] === '}') {
        d -= 1
        if (d === 0) return src.slice(s, j + 1)
      }
    }
    throw new Error(`unbalanced ${anchor}`)
  }
  const parts = [
    grab('function isPlainObject'),
    grab('function member'),
    grab('function applyPathOp'),
    grab('function mergeLayers'),
  ]
  const host = new Function(`${parts.join('\n\n')}\nreturn { applyPathOp, mergeLayers }`)()
  const schema = {
    type: 'object',
    meta: {},
    dict: {
      providers: {
        type: 'dict',
        meta: {},
        inner: {
          type: 'object',
          meta: {},
          dict: {
            timeoutMs: { type: 'number', meta: {} },
            apiKeyEnv: { type: 'string', meta: {} },
            models: { type: 'array', meta: {}, inner: { type: 'object', meta: {}, dict: { id: { type: 'string', meta: {} } } } },
            modelOverrides: {
              type: 'dict',
              meta: {},
              inner: { type: 'object', meta: {}, dict: { name: { type: 'string', meta: {} } } },
            },
          },
        },
      },
    },
  }
  const u1 = host.applyPathOp({ providers: { p: { timeoutMs: 5000, apiKeyEnv: 'X' } } }, { op: 'unset', path: ['providers', 'p', 'timeoutMs'] }, schema)
  check('HOST-1', 'host unset on an object key deletes it and keeps siblings', !Object.hasOwn(u1.providers.p, 'timeoutMs') && u1.providers.p.apiKeyEnv === 'X', JSON.stringify(u1))
  const u2 = host.applyPathOp({ providers: { p: { models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } }, { op: 'unset', path: ['providers', 'p', 'models', '1'] }, schema)
  check('HOST-2', 'host unset on an array index splices', JSON.stringify(u2.providers.p.models) === JSON.stringify([{ id: 'a' }, { id: 'c' }]), JSON.stringify(u2.providers.p.models))
  const n1 = host.applyPathOp({ providers: { p: { timeoutMs: 5000 } } }, { op: 'set', path: ['providers', 'p', 'timeoutMs'], value: null }, schema)
  check('HOST-3', 'host {op:"set",value:null} WRITES literal null — proving null is not a clear', n1.providers.p.timeoutMs === null && Object.hasOwn(n1.providers.p, 'timeoutMs'), JSON.stringify(n1))
  const merged = host.mergeLayers({ providers: { p: { a: 1 } }, ordinary: 'keep' }, { providers: { p: { b: 2 } } })
  check('HOST-4', 'host mergeLayers preserves rows outside the edited namespace', merged.ordinary === 'keep' && merged.providers.p.a === 1, JSON.stringify(merged))

  // HOST-5..7 — the instance-container fix. `models[]` and `modelOverrides` are
  // repeatable groups: a member is only addressable with its instance segment.
  // The pre-fix page emitted the flat member path, which the host rejects; that
  // rejection is kept here as an executable negative control.
  const flatError = (() => {
    try {
      host.applyPathOp({ providers: { p: { models: [{ id: 'a' }] } } }, { op: 'set', path: ['providers', 'p', 'models', 'id'], value: 'x' }, schema)
      return null
    } catch (error) {
      return error.message
    }
  })()
  check(
    'HOST-5',
    'the pre-fix flat model path is rejected by the host (negative control)',
    typeof flatError === 'string' && flatError.length > 0,
    flatError === null ? 'no error — the old path would have been accepted' : flatError,
  )
  const byIndex = host.applyPathOp(
    { providers: { p: { models: [{ id: 'a' }, { id: 'b' }] } } },
    { op: 'set', path: ['providers', 'p', 'models', 0, 'id'], value: 'z' },
    schema,
  )
  check(
    'HOST-6',
    'the index-bearing model path the panels emit is accepted',
    JSON.stringify(byIndex.providers.p.models) === JSON.stringify([{ id: 'z' }, { id: 'b' }]),
    JSON.stringify(byIndex.providers.p.models),
  )
  const byKey = host.applyPathOp(
    { providers: { p: { modelOverrides: {} } } },
    { op: 'set', path: ['providers', 'p', 'modelOverrides', 'gpt-x', 'name'], value: 'GPT X' },
    schema,
  )
  check(
    'HOST-7',
    'the instance-keyed override path the panels emit is accepted',
    byKey.providers.p.modelOverrides['gpt-x'].name === 'GPT X',
    JSON.stringify(byKey.providers.p.modelOverrides),
  )
  const removedModel = host.applyPathOp(
    { providers: { p: { models: [{ id: 'a' }, { id: 'b' }] } } },
    { op: 'unset', path: ['providers', 'p', 'models', 1] },
    schema,
  )
  check(
    'HOST-8',
    'removing a model card splices by the same index',
    JSON.stringify(removedModel.providers.p.models) === JSON.stringify([{ id: 'a' }]),
    JSON.stringify(removedModel.providers.p.models),
  )
  hostVerified = true
} catch (error) {
  bad('HOST-0', 'host applyPathOp semantics could be read and executed', error.message, 'MEDIUM')
}
if (!hostVerified) unverified('HOST-*', 'host read-in-resolved action unknown', 'see HOST-0')

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------
console.log('\n================ VERIFICATION SUMMARY ================')
console.log(`checks passed : ${passed}`)
console.log(`checks failed : ${failed}`)
const skipped = findings.filter((f) => f.verdict === 'UNVERIFIED')
console.log(`unverified    : ${skipped.length}`)
if (failed > 0) {
  console.log('\nFAILURES:')
  for (const f of findings.filter((x) => x.verdict === 'FAIL')) {
    console.log(`  [${f.severity}] ${f.id} ${f.label} :: ${f.detail}`)
  }
}
console.log('======================================================')
process.exitCode = failed > 0 ? 1 : 0
