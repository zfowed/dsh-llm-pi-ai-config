/**
 * Structural contract for the v10 module layout.
 *
 * `node --test` runs the shipped bytes, but nothing else in the suite checks the
 * *shape* of `lib/` itself: that the chunk files on disk are exactly the ones the
 * owner loads, that every chunk keeps the browser envelope, and that no file
 * quietly grows back into a monolith. This file is that guard.
 *
 * It is deliberately owner-driven: the plan is read out of the shipped owner
 * bundle (`__internals.chunkPlan`) rather than restated here, so adding a chunk
 * means editing the owner and the load order is checked in one place.
 *
 * @module dsh-llm-pi-ai-config/tests/module-contract
 */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, '..', 'lib')
const OWNER_ID = 'dsh-llm-pi-ai-config'

/** The host's own rule for a package-local chunk file name. */
const CLIENT_CHUNK = /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/

/** Hard ceiling on one delivered file (code lines after comments/blanks). */
const MAX_CODE_LINES = 700
/** Hard ceiling on the raw size of any delivered file, comments included. */
const MAX_TOTAL_LINES = 1000

/** Every chunk file shipped beside the owner. */
function chunkFiles() {
  return readdirSync(LIB)
    .filter((name) => name !== 'client.js' && name.startsWith('client') && name.endsWith('.js'))
    .sort()
}

/** Count code lines: blanks and comment-only lines do not count. */
function codeLineCount(source) {
  let inBlock = false
  let code = 0
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    if (inBlock) {
      if (line.includes('*/')) inBlock = false
      continue
    }
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true
      continue
    }
    if (line.startsWith('//')) continue
    code += 1
  }
  return code
}

/**
 * Build the mini loader and evaluate the owner, exactly as `wiring.test.js`
 * does — but with `require.async` resolving the shipped files from disk.
 *
 * @returns `{owner, requireStub, requested, registrations, sandbox}`.
 */
function loadOwner(options = {}) {
  const skipped = options.skip ?? []
  const stubbed = options.stub ?? {}
  const registrations = []
  const requested = []
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    JSON,
    Number,
    String,
    Boolean,
    Error,
    Symbol,
    Set,
    Map,
    Date,
    RegExp,
    Math,
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  createContext(sandbox)

  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? undefined : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    lazy: () => function LazyStub() {},
    Suspense: function SuspenseStub() {},
  }
  const seeds = {
    react,
    'react/jsx-runtime': { jsx: react.createElement, jsxs: react.createElement, Fragment: Symbol('F') },
    '@deepseek-ai/dsh-client-ui-primitives': {},
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let current = initial
        return {
          getSnapshot: () => current,
          set: (next) => {
            current = next
          },
          subscribe: () => () => {},
        }
      },
    },
  }
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`module-contract: unexpected seed require(${specifier})`)
  }
  requireStub.async = async (specifier) => {
    assert.ok(specifier.startsWith('./'), 'a chunk request must be relative: ' + specifier)
    const fileName = specifier.slice(2)
    if (skipped.includes(fileName)) {
      // Whatever the loader does with a chunk it cannot serve, the owner sees a
      // rejection (the browser transport fails, or the factory throws).
      throw new Error(`module-contract: ${fileName} skipped`)
    }
    if (Object.prototype.hasOwnProperty.call(stubbed, fileName)) return stubbed[fileName]
    assert.match(fileName, CLIENT_CHUNK, 'chunk ' + fileName + ' must match client.<name>.js')
    requested.push(specifier)
    const before = registrations.length
    const file = join(LIB, fileName)
    runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
    const added = registrations.slice(before)
    assert.equal(added.length, 1, fileName + ' must register exactly once')
    assert.equal(added[0].id, OWNER_ID, fileName + ' must register under the owner id')
    assert.equal(added[0].chunk, fileName, fileName + ' must carry its own file name as `chunk`')
    return added[0].factory(requireStub)
  }

  const ownerFile = join(LIB, 'client.js')
  runInContext(readFileSync(ownerFile, 'utf8'), sandbox, { filename: ownerFile })
  assert.equal(registrations.length, 1, 'the owner must register exactly once')
  assert.equal(registrations[0].chunk, undefined, 'the owner bundle carries no chunk field')
  return { owner: registrations[0].factory(requireStub), requireStub, requested, registrations, sandbox }
}

test('every chunk file on disk matches the host rule and keeps the envelope', () => {
  const files = chunkFiles()
  assert.ok(files.length >= 10, `expected the split module set, found ${files.length} chunks`)

  for (const fileName of files) {
    assert.match(fileName, CLIENT_CHUNK, `${fileName} must match the host's chunk rule`)
    const raw = readFileSync(join(LIB, fileName), 'utf8')
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.equal(/^\s*import\s/m.test(source), false, `${fileName} must not use import`)
    assert.equal(/^\s*export\s/m.test(source), false, `${fileName} must not use export`)
    assert.equal(source.includes('module.exports'), false, `${fileName} must not use module.exports`)
    assert.match(source, /\(function \(global\) \{/, `${fileName} must keep the chunk IIFE`)
    assert.match(source, /\}\)\(globalThis\)/, `${fileName} must close its IIFE over globalThis`)
    assert.ok(
      source.includes(`var CHUNK = '${fileName}'`),
      `${fileName} must declare CHUNK as its own file name`,
    )
  }
})

test('the owner loads exactly the chunk files that exist — no orphan, no missing', async () => {
  const { owner, requested } = loadOwner()
  const plan = [...owner.__internals.chunkPlan]
  assert.ok(Array.isArray(plan) && plan.length >= 2, 'the owner must declare a phased chunk plan')

  const planned = plan.flat().map((specifier) => specifier.slice(2)).sort()
  assert.deepEqual(
    planned,
    chunkFiles(),
    'the chunk plan and the files on disk must be the same set (add the file to the plan, ' +
      'and load it through require.async, or this fails)',
  )

  await owner.__internals.ensureChunks()
  assert.deepEqual(
    [...requested].map((specifier) => specifier.slice(2)).sort(),
    chunkFiles(),
    'the owner must fetch every planned chunk',
  )
})

test('a dependent chunk is always requested in a later phase than its dependency', () => {
  const { owner } = loadOwner()
  const plan = owner.__internals.chunkPlan
  const phaseOf = new Map()
  plan.forEach((phase, index) => {
    for (const specifier of phase) phaseOf.set(specifier.slice(2), index)
  })

  /** `[dependent, dependency]` pairs the facades read out of the registry. */
  const EDGES = [
    ['client.fields.js', 'client.fields.groups.js'],
    ['client.fields.js', 'client.fields.hints.js'],
    ['client.panels.js', 'client.core.js'],
    ['client.panels.js', 'client.panels.kit.js'],
    ['client.panels.js', 'client.panels.controls.js'],
    ['client.panels.js', 'client.panels.collections.js'],
    ['client.panels.js', 'client.panels.render.js'],
    ['client.panels.js', 'client.panels.instances.js'],
    ['client.panels.js', 'client.panels.catalog.js'],
    ['client.styles.js', 'client.styles.chrome.js'],
    ['client.styles.js', 'client.styles.controls.js'],
  ]
  for (const [dependent, dependency] of EDGES) {
    assert.ok(phaseOf.has(dependent), `${dependent} must be in the plan`)
    assert.ok(phaseOf.has(dependency), `${dependency} must be in the plan`)
    assert.ok(
      phaseOf.get(dependency) < phaseOf.get(dependent),
      `${dependency} must be loaded before ${dependent} (require.async materialises a chunk as ` +
        `soon as its script arrives, so same-phase dependents can read an empty registry)`,
    )
  }
})

test('the composed chunk set is complete and none of the facades degraded', async () => {
  const { owner } = loadOwner()
  const chunks = await owner.__internals.ensureChunks()

  assert.equal(typeof chunks.schema.leaves, 'function')
  assert.equal(typeof chunks.form.createStagedForm, 'function')
  assert.ok(chunks.fields.groups.length >= 5, 'the fields facade must carry its data tables')
  assert.equal(chunks.fields.fields['api'] !== undefined, true, 'FIELDS must be re-exported')
  assert.equal(chunks.styles.COMPLETE, true, 'both stylesheet fragments must have arrived')
  assert.ok(chunks.styles.STYLESHEET.length > 10_000, 'the composed sheet must be the real one')
  assert.equal(typeof chunks.panels.ProviderPanel, 'function')
  assert.equal(typeof chunks.panels.ProviderTabs, 'function')
  assert.equal(typeof chunks.core.ui.StateDot, 'function', 'core must expose the built ui layer')

  const registry = owner.__internals
  assert.equal(typeof registry.loadPage, 'function')
  const page = await registry.loadPage()
  assert.equal(typeof page.makePage, 'function', 'the page face must build')
})

test('no delivered file has grown back into a monolith', () => {
  const files = ['client.js', ...chunkFiles()]
  const report = []
  for (const fileName of files) {
    const source = readFileSync(join(LIB, fileName), 'utf8')
    const code = codeLineCount(source)
    const total = source.split('\n').length
    report.push({ fileName, code, total })
    assert.ok(
      code <= MAX_CODE_LINES,
      `${fileName} has ${code} code lines (cap ${MAX_CODE_LINES}); split it by feature instead of growing it`,
    )
    assert.ok(
      total <= MAX_TOTAL_LINES,
      `${fileName} has ${total} lines (cap ${MAX_TOTAL_LINES})`,
    )
  }
  const biggest = report.reduce((worst, entry) => (entry.code > worst.code ? entry : worst), report[0])
  assert.ok(
    biggest.code <= MAX_CODE_LINES,
    `the largest file is ${biggest.fileName} at ${biggest.code} code lines`,
  )
})

test('a missing stylesheet fragment degrades to "no styles", never half a sheet', async () => {
  // v10 introduced this failure mode: the sheet is composed from two fragments.
  // Losing one must not install a partial sheet (the controls would lose their
  // layout while the page kept the host defaults elsewhere).
  const { owner } = loadOwner({ skip: ['client.styles.controls.js'] })
  const chunks = await owner.__internals.ensureChunks()
  assert.equal(chunks.styles.COMPLETE, false, 'an incomplete sheet must say so')
  assert.equal(chunks.styles.STYLESHEET, '', 'an incomplete sheet must stay empty')
  const dispose = chunks.styles.install()
  assert.equal(typeof dispose, 'function', 'install() keeps returning a disposer')
  assert.doesNotThrow(() => dispose())
})

test('a missing panels module rejects the load instead of building half a panel', async () => {
  // The browser transport fails first, so a chunk that cannot be served must
  // reject `ensureChunks()` — the page then renders the load-failure face.
  const { owner } = loadOwner({ skip: ['client.panels.kit.js'] })
  await assert.rejects(() => owner.__internals.ensureChunks())
})

test('a module that loads but publishes no creator is named, not left to render', async () => {
  // The defensive half of the same contract: a chunk whose `createKit` is missing
  // (a renamed registry key, a half-served script) must fail with a message that
  // names it, instead of `components.renderRow is not a function` at render time.
  const { owner } = loadOwner({ stub: { 'client.panels.kit.js': {} } })
  await assert.rejects(
    () => owner.__internals.ensureChunks(),
    /panelsKit must be loaded before client\.panels\.js/,
  )
})
