/**
 * Independent verification harness for the "模型扩展配置" blank-page incident.
 *
 * Owner: verifier3 (task-8). No framework, no third-party dependency, no
 * bundler: plain `node tests/verify.render.mjs`. It is deliberately NOT a
 * `node:test` file (like `tests/verify.integration.mjs`), so `node --test`
 * reports it separately from the shipped test suite.
 *
 * What it proves, and from what evidence:
 *
 * PHASE A — the injected-hook contract, established from the SHIPPED DSH
 * client bytes and then executed, not merely quoted:
 *   A1 `standardHookPropName` is the only name transform (executed on the real
 *      `@deepseek-ai/dsh-client-ui-slots` module).
 *   A2 the real renderer's `bindInjectSources` maps `hooks: {page: store}` to a
 *      `usePage` prop that is `observableHook(store)` — a selector hook that
 *      forwards its first argument verbatim to
 *      `useSyncExternalStoreWithSelector` (structure asserted against the
 *      shipped source text, so an upstream rename fails this harness instead of
 *      silently weakening it).
 *   A3 the REAL `useSyncExternalStoreWithSelector` body, extracted from the
 *      shipped renderer bundle and executed under a React stub: a selector call
 *      returns the selection, and calling it with NO argument throws.
 *   A4 the REAL `SlotCore` abdication mechanism: a render-time crash report
 *      retires the entry from `entriesOfSlot` (cell blank) while the raw ledger
 *      row survives (nav intact) — reproducing the live inspector's
 *      `"active": false` verbatim.
 *   A5 the shipped working consumer (`dsh-client-ui-settings-shell`) as the
 *      cross-check for the prop-name convention.
 *
 * PHASE B — the fixed `lib/client.js` is invoked as a real component with the
 * props its slot registration supplies (real selector hook from the real shim),
 * asserting it cannot throw and that a throwing panel is contained.
 *
 * @module dsh-llm-pi-ai-config/tests/verify.render
 */

import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { createContext, runInContext } from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib')

/**
 * The owner bundle under test. Defaults to the shipped `lib/client.js`; the
 * negative-control run points it at a mutated copy so the harness can be shown
 * to FAIL on the pre-fix defect instead of passing vacuously.
 */
const OWNER_LIB = process.env.VERIFY_OWNER_LIB ?? join(LIB, 'client.js')

/** Where the harness was told to lay out the shipped DSH client packages. */
const ASAR = process.env.DSH_ASAR_OUT ?? '/tmp/asarx/out/dsh/node_modules/@deepseek-ai'
const SLOTS_LIB = join(ASAR, 'dsh-client-ui-slots/lib/index.js')
const RENDERER_LIB = join(ASAR, 'dsh-client-ui-renderer/lib/client.js')
const SETTINGS_SHELL_LIB = join(ASAR, 'dsh-client-ui-settings-shell/lib/client.js')

const OWNER_ID = 'dsh-llm-pi-ai-config'

/* ------------------------------------------------------------------ *
 * check runner
 * ------------------------------------------------------------------ */

const results = []
let currentSection = '(none)'

function section(title) {
  currentSection = title
  process.stdout.write(`\n=== ${title}\n`)
}

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '' })
    process.stdout.write(`[PASS] ${name}${detail ? ` — ${detail}` : ''}\n`)
  } catch (error) {
    results.push({ name, ok: false, detail: error?.message ?? String(error) })
    process.stdout.write(`[FAIL] ${name}\n       ${(error?.stack ?? String(error)).split('\n').join('\n       ')}\n`)
  }
}

function skip(name, reason) {
  results.push({ name, ok: true, skipped: true, detail: reason })
  process.stdout.write(`[SKIP] ${name} — ${reason}\n`)
}

/* ------------------------------------------------------------------ *
 * shared helpers
 * ------------------------------------------------------------------ */

/** Read a file and fail loudly (rather than skipping) when it is absent. */
function readSource(file) {
  if (!existsSync(file)) {
    throw new Error(
      `shipped DSH source not found: ${file}\n` +
        `Set DSH_ASAR_OUT to the extracted @deepseek-ai directory (default ${ASAR}).`,
    )
  }
  return readFileSync(file, 'utf8')
}

/** md5 of a buffer, for pinning the verified revision in the output. */
function md5(buffer) {
  return createHash('md5').update(buffer).digest('hex')
}

/**
 * Remove `//` and block comments (string literals preserved), so structural
 * checks cannot be fooled by prose in a doc comment.
 *
 * @param source - JavaScript text.
 * @returns the same text with comments blanked.
 */
function stripJsComments(source) {
  let out = ''
  let quote = null
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      out += ch
      if (ch === '\\') {
        out += source[i + 1] ?? ''
        i += 1
      } else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      out += ' '
      continue
    }
    out += ch
  }
  return out
}

/** 1-based line number of the first line containing `needle`. */
function lineOf(source, needle) {
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle)) return i + 1
  throw new Error(`source text not found (the cited evidence moved): ${JSON.stringify(needle)}`)
}

/**
 * Extract a brace-balanced function expression that starts right after
 * `anchor` in `source`. String literals are skipped so braces inside them
 * cannot unbalance the scan.
 *
 * @param source - bundle text.
 * @param anchor - literal text preceding the function expression.
 * @returns `{ body, line }` — the expression source and its 1-based line.
 */
function extractFunctionAfter(source, anchor) {
  const at = source.indexOf(anchor)
  if (at === -1) throw new Error(`evidence anchor not found: ${JSON.stringify(anchor)}`)
  const open = source.indexOf('{', at)
  if (open === -1) throw new Error(`no function body after anchor: ${JSON.stringify(anchor)}`)
  let depth = 0
  let quote = null
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        const line = source.slice(0, at).split('\n').length
        return { body: source.slice(at + anchor.length, i + 1).trim(), line }
      }
    }
  }
  throw new Error(`unbalanced function body after anchor: ${JSON.stringify(anchor)}`)
}

/**
 * Build the shipped `useSyncExternalStoreWithSelector` under a React stub.
 *
 * The body is the REAL shipped bytes, extracted from the renderer bundle; only
 * its free variables (`q`,`t`,`u`,`v`,`w`,`r`) are supplied. `r` is a stub that
 * mirrors React: it calls the snapshot argument once.
 *
 * @param rendererSource - the shipped renderer bundle text.
 * @returns `{ useSyncExternalStoreWithSelector, line }`.
 */
function extractSelectorShim(rendererSource) {
  const anchor = 'exports.useSyncExternalStoreWithSelector = '
  const { body, line } = extractFunctionAfter(rendererSource, anchor)
  const make = new Function('q', 't', 'u', 'v', 'w', 'r', `return (${body});`)
  const q = Object.is
  const t = (initial) => ({ current: initial }) // useRef: fresh per hook call
  const u = () => {} // useEffect
  const v = (factory) => factory() // useMemo (deps ignored: one render pass)
  const w = () => {} // useDebugValue
  const r = (_subscribe, getSnapshot) => getSnapshot() // useSyncExternalStore
  return { useSyncExternalStoreWithSelector: make(q, t, u, v, w, r), line, body }
}

/** A minimal observable store, exactly the contract the renderer hooks consume. */
function makeStore(initial) {
  let current = initial
  const listeners = new Set()
  return {
    getSnapshot: () => current,
    set: (next) => {
      current = next
      for (const listener of [...listeners]) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/* ------------------------------------------------------------------ *
 * PHASE A
 * ------------------------------------------------------------------ */

async function loadShippedSlots() {
  if (!existsSync(SLOTS_LIB)) {
    throw new Error(`shipped slots module not found: ${SLOTS_LIB} (set DSH_ASAR_OUT)`)
  }
  return import(pathToFileURL(SLOTS_LIB).href)
}

async function phaseA() {
  const slots = await loadShippedSlots()
  const rendererSource = readSource(RENDERER_LIB)
  const shellSource = readSource(SETTINGS_SHELL_LIB)

  section('PHASE A — injected-hook contract (from shipped DSH bytes)')

  await check('A1 standardHookPropName("page") === "usePage" (executed on the shipped slots module)', () => {
    assert.equal(typeof slots.standardHookPropName, 'function')
    assert.equal(slots.standardHookPropName('page'), 'usePage')
    assert.equal(slots.standardHookPropName('shellCard'), 'useShellCard')
    // The transform is a fixed prefix, not a normalization: a source already
    // capitalised keeps its name, so `P` -> `useP` (documents the rule, no
    // lowercase/camel guesswork).
    assert.equal(slots.standardHookPropName('P'), 'useP')
    const line = lineOf(readSource(SLOTS_LIB), 'function standardHookPropName(name)')
    return `slots/lib/index.js:${line} (standardHookPropName) -> usePage`
  })

  await check('A2 the renderer binds `hooks: {page}` to the `usePage` prop and forwards the selector verbatim', () => {
    const bindLine = lineOf(rendererSource, 'function bindInjectSources(face)')
    const hooksLine = lineOf(rendererSource, 'const sources = face["hooks"];')
    const nameLine = lineOf(
      rendererSource,
      'const hookName = (0, _deepseek_ai_dsh_client_ui_slots.standardHookPropName)(name);',
    )
    const assignLine = lineOf(rendererSource, 'bound[hookName] = observableHook(source);')
    const hookLine = lineOf(rendererSource, 'function bindSnapshotSelector(w)')
    // The literal forwarding site: `sel` is passed through with no default.
    const forwardLine = lineOf(
      rendererSource,
      '(0, import_with_selector.useSyncExternalStoreWithSelector)(subscribe, getSnapshot, void 0, sel, eq);',
    )
    // Executable edge of the same claim: the shipped transform names the prop.
    assert.equal(slots.standardHookPropName('page'), 'usePage')
    return `renderer bindInjectSources:${bindLine} (hooks read at :${hooksLine}; name at :${nameLine}; prop assigned at :${assignLine}); observableHook->bindSnapshotSelector at :${hookLine}; selector forwarded verbatim at :${forwardLine}`
  })

  const shim = extractSelectorShim(rendererSource)

  await check('A3 the REAL selector shim returns a selection when called with a selector', () => {
    const store = makeStore({ envelope: { uid: 7 }, revision: 3 })
    let calls = 0
    const hook = (selector, equal) => {
      calls += 1
      return shim.useSyncExternalStoreWithSelector(store.subscribe, store.getSnapshot, undefined, selector, equal)
    }
    const value = hook((snapshot) => snapshot)
    assert.deepEqual(value, { envelope: { uid: 7 }, revision: 3 })
    const envelope = hook((snapshot) => snapshot.envelope)
    assert.deepEqual(envelope, { uid: 7 })
    assert.equal(calls, 2)
    return `renderer/lib/client.js:${shim.line} (shipped useSyncExternalStoreWithSelector) -> snapshot identity selector OK`
  })

  await check('A4 calling that hook with NO argument throws (the blank-page root cause)', () => {
    const store = makeStore({ envelope: { uid: 7 }, revision: 3 })
    let thrown
    try {
      // Exactly `props.usePage()`: no selector reaches the shim.
      shim.useSyncExternalStoreWithSelector(store.subscribe, store.getSnapshot, undefined, undefined, undefined)
    } catch (error) {
      thrown = error
    }
    assert.ok(thrown, 'expected the argument-less selector call to throw — if this fails the contract changed')
    assert.equal(thrown.name, 'TypeError', `expected a TypeError, got ${thrown.name}: ${thrown.message}`)
    return `throws ${thrown.name}: ${thrown.message}`
  })

  await check('A5 the shipped working consumer calls its injected hook WITH a selector', () => {
    const callLine = lineOf(shellSource, 'props.useShellCard((snapshot) => snapshot)')
    const faceLine = lineOf(shellSource, 'hooks: { shellCard: this.store },')
    assert.match(shellSource, /function ShellCard\(props\)/)
    return `shell/lib/client.js:${callLine} calls useShellCard((snapshot) => snapshot); face built at :${faceLine} (hooks.shellCard)`
  })

  section('PHASE A — abdication mechanism (executed on the shipped SlotCore)')

  await check('A6 a render-time crash retires the entry from the cell but keeps the ledger row', async () => {
    const core = new slots.SlotCore()
    // Declare a list-kind child exactly as the settings shell does.
    core.register(
      { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } },
      () => null,
    )
    const shipped = {}
    const ours = {}
    core.register({ name: 'settings.section', id: 'models', order: 10, registrant: 'shipped' }, () => shipped)
    core.register({ name: 'settings.section', id: 'model-extended', order: 12, registrant: 'mf' }, () => ours)

    assert.equal(core.entriesOfSlot('settings.section').length, 2)
    let snap = core.snapshot('settings.section')
    assert.deepEqual(
      snap[0].occupants.map((o) => [o.id, o.active]),
      [
        ['models', true],
        ['model-extended', true],
      ],
    )

    // The renderer hands reportEntryError the *entry record*, not the component:
    // read it back from the ledger the way the outlet does.
    const ourEntry = core.entries('settings.section').find((e) => e.options.id === 'model-extended')
    assert.ok(ourEntry, 'the new cell must be on the raw ledger')

    // The framework's own crash report path: SlotErrorBoundary.componentDidCatch
    // -> host.reportEntryError(key, entry, error, {abdicate: kind !== "chain"}).
    core.reportEntryError('settings.section', ourEntry, new TypeError('l is not a function'), {
      abdicate: true,
    })

    const activeIds = core.entriesOfSlot('settings.section').map((e) => e.options.id)
    assert.deepEqual(activeIds, ['models'], 'the crashed cell must leave the active projection')
    const ledgerIds = core.entries('settings.section').map((e) => e.options.id)
    assert.deepEqual(ledgerIds, ['models', 'model-extended'], 'the raw ledger row survives (nav intact)')

    snap = core.snapshot('settings.section')
    const occupants = snap[0].occupants.map((o) => ({ id: o.id, active: o.active }))
    assert.deepEqual(occupants, [
      { id: 'models', active: true },
      { id: 'model-extended', active: false },
    ])
    if (ours !== undefined) assert.ok(core.isLive(ourEntry), 'abdication does not deregister the entry')

    const abdLine = lineOf(readSource(SLOTS_LIB), 'abdicated = /* @__PURE__ */ new WeakSet();')
    const skipLine = lineOf(readSource(SLOTS_LIB), 'if (this.abdicated.has(entry)) continue;')
    const reportLine = lineOf(readSource(SLOTS_LIB), 'reportEntryError(key, entry, error, info) {')
    const activeLine = lineOf(readSource(SLOTS_LIB), 'active: active.has(entry)')
    return (
      `slots/lib/index.js:${abdLine} (abdicated WeakSet), :${reportLine} (reportEntryError), ` +
      `:${skipLine} (entriesOfSlot skip), :${activeLine} (snapshot active flag). ` +
      `Reproduced live shape: occupants=[{id:"models",active:true},{id:"model-extended",active:false}]`
    )
  })

  await check('A7 the outlet renders an empty crash face for an abdicated list cell (blank body, nav intact)', () => {
    const deadLine = lineOf(rendererSource, 'const deadCell = () =>')
    const listLine = lineOf(rendererSource, '"data-slot-error": slotKey }, `x${item.id ?? i}`)')
    const reportLine = lineOf(
      rendererSource,
      'host.reportEntryError(slotKey, entry, error, { abdicate: spec.kind !== "chain" });',
    )
    const boundaryLine = lineOf(rendererSource, 'var SlotErrorBoundary = class extends react.Component {')
    assert.match(rendererSource, /data-slot-error/)
    return (
      `renderer SlotErrorBoundary at :${boundaryLine}, abdicating report at :${reportLine}, ` +
      `empty crash face for the retired cell at :${deadLine} and :${listLine}`
    )
  })
}

/* ------------------------------------------------------------------ *
 * PHASE B — drive the real lib/client.js
 *
 * The harness owns a mini loader (the loader contract from
 * docs/interface-contract.md) and a mini renderer with React's real
 * suspension + error-boundary semantics. Nothing here is copied from the
 * product's own tests: the page component is the SHIPPED lib/client.js, the
 * selector hook is the SHIPPED `useSyncExternalStoreWithSelector`, and the
 * props are the ones the slot registration's `inject()` face produces.
 * ------------------------------------------------------------------ */

const FIXTURE_ENVELOPE = join(ROOT, 'tests', 'fixtures', 'llm-pi-ai.schema.json')

/** Mirror of React's class-component surface, minimal but faithful. */
function makeReactStub() {
  const lazyStates = []

  class Component {
    constructor(props) {
      this.props = props
      this.state = this.state ?? {}
    }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch
      this.state = Object.assign({}, this.state, next ?? {})
    }
    forceUpdate() {}
  }

  const React = {
    createElement(type, props, ...children) {
      const next = Object.assign({}, props ?? {})
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { __element: true, type, props: next }
    },
    // Hooks: one render pass, so initial values hold. The DSH renderer supplies
    // `useSyncExternalStore`, which is the only hook the page's data path needs.
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useRef(initial) {
      return { current: initial }
    },
    useMemo(factory) {
      return factory()
    },
    useCallback(fn) {
      return fn
    },
    useEffect() {},
    useLayoutEffect() {},
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
    useContext() {
      return undefined
    },
    lazy(load) {
      const state = { load, module: undefined, error: undefined, promise: undefined }
      lazyStates.push(state)
      function LazyComponent(props) {
        if (state.error !== undefined) throw state.error
        if (state.module === undefined) {
          if (state.promise === undefined) {
            state.promise = Promise.resolve()
              .then(() => load())
              .then(
                (loaded) => {
                  state.module = loaded && loaded.default !== undefined ? loaded.default : loaded
                },
                (error) => {
                  state.error = error
                },
              )
          }
          // Suspends exactly like React: the nearest Suspense shows its fallback.
          throw state.promise
        }
        return React.createElement(state.module, props)
      }
      return LazyComponent
    },
    Suspense(props) {
      return props.children ?? null
    },
    Component,
    Fragment: Symbol('Fragment'),
    memo: (component) => component,
  }
  React.Suspense.__isSuspense = true
  /** Resolve every started `react.lazy` load. */
  React.__settle = async () => {
    await Promise.all(lazyStates.map((state) => state.promise))
  }
  return React
}

/**
 * A mini renderer with React's real control flow: class error boundaries,
 * Suspense fallbacks, host/function/array elements.
 *
 * @returns `{ render, diagnostics }`.
 */
function createMiniRenderer(React) {
  const diagnostics = { boundaryCatches: [], suspensions: [] }

  function isThenable(value) {
    return value !== null && typeof value === 'object' && typeof value.then === 'function'
  }

  function isErrorLike(value) {
    return value !== null && typeof value === 'object' && typeof value.message === 'string'
  }

  function renderChildren(children, ctx) {
    if (children === undefined || children === null || typeof children === 'boolean') return null
    if (Array.isArray(children)) return children.map((child) => render(child, ctx))
    return render(children, ctx)
  }

  function render(node, ctx) {
    if (node === undefined || node === null || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return node
    if (Array.isArray(node)) return node.map((child) => render(child, ctx))
    if (node.__element !== true) return node // already-rendered host output
    const type = node.type
    const props = node.props ?? {}

    if (type === React.Fragment) return renderChildren(props.children, ctx)
    if (typeof type === 'string') {
      return { __host: true, type, props, children: renderChildren(props.children, ctx) }
    }
    if (typeof type !== 'function') {
      throw new Error(`mini-renderer: unsupported element type ${String(type)}`)
    }
    if (type.__isSuspense === true) {
      try {
        return renderChildren(props.children, ctx)
      } catch (thrown) {
        if (isThenable(thrown)) {
          diagnostics.suspensions.push(thrown)
          return renderChildren(props.fallback, ctx)
        }
        throw thrown
      }
    }
    const isClass = typeof type.prototype === 'object' && typeof type.prototype.render === 'function'
    if (isClass) {
      const instance = new type(props)
      const instanceCtx = Object.assign({}, ctx, { boundary: instance })
      const isBoundary =
        typeof type.getDerivedStateFromError === 'function' ||
        typeof instance.componentDidCatch === 'function'
      if (isBoundary) {
        try {
          return render(instance.render(), instanceCtx)
        } catch (thrown) {
          if (isThenable(thrown)) throw thrown
          if (!isErrorLike(thrown)) throw thrown
          diagnostics.boundaryCatches.push({
            boundary: type.name || '(anonymous)',
            error: thrown.message,
          })
          const derived =
            typeof type.getDerivedStateFromError === 'function'
              ? type.getDerivedStateFromError(thrown)
              : undefined
          if (derived !== undefined && derived !== null) {
            instance.state = Object.assign({}, instance.state, derived)
          } else {
            instance.state = Object.assign({}, instance.state, { failed: true })
          }
          if (typeof instance.componentDidCatch === 'function') {
            instance.componentDidCatch(thrown, { componentStack: '' })
          }
          return render(instance.render(), instanceCtx)
        }
      }
      return render(instance.render(), instanceCtx)
    }
    return render(type(props), ctx)
  }

  return { render: (element, ctx = {}) => render(element, ctx), diagnostics }
}

/** All text a rendered tree would show. */
function flattenText(node) {
  if (node === undefined || node === null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).filter(Boolean).join(' ')
  if (node.__host === true) return flattenText(node.children)
  return ''
}

/** The seed words the owner and its chunks require, stubbed to what they use. */
function seedWords(React) {
  // A permissive primitives stand-in: panels must not fail because of the stub.
  const harmless = (name) =>
    function PrimitiveStub(props) {
      return React.createElement('div', { 'data-stub': name }, props && props.children)
    }
  const primitives = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined
        return harmless(String(property))
      },
    },
  )
  return {
    react: React,
    'react/jsx-runtime': {
      jsx: React.createElement,
      jsxs: React.createElement,
      Fragment: React.Fragment,
    },
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let current = initial
        const listeners = new Set()
        return {
          getSnapshot: () => current,
          set: (next) => {
            current = next
            for (const listener of [...listeners]) listener()
          },
          subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
      },
    },
    '@deepseek-ai/dsh-client-ui-primitives': primitives,
  }
}

/**
 * Load the shipped owner bundle plus its real chunks into a fresh sandbox.
 *
 * @param options - `{ failChunks, transformChunk }`.
 * @returns `{ exports, requested, registrations, sandbox }`.
 */
function loadOwner(options = {}) {
  const React = options.React ?? makeReactStub()
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
    TypeError,
    Symbol,
    Set,
    Map,
    Date,
    RegExp,
    Math,
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox // the chunks read `global.__ModuleLoader__`
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  createContext(sandbox)

  const seeds = seedWords(React)
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`render harness: unexpected require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    requested.push(specifier)
    assert.ok(specifier.startsWith('./'), `a chunk request must be relative: ${specifier}`)
    const fileName = specifier.slice(2)
    assert.match(fileName, /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/, `chunk ${fileName}`)
    if (options.failChunks !== undefined && options.failChunks.includes(fileName)) {
      throw new Error(`render harness: simulated chunk failure for ${fileName}`)
    }
    const before = sandbox.__ModuleLoader__.registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    const added = sandbox.__ModuleLoader__.registrations.slice(before)
    assert.equal(added.length, 1, `${fileName} must register exactly once`)
    assert.equal(added[0].chunk, fileName, `${fileName} must carry its own chunk field`)
    assert.equal(added[0].id, OWNER_ID)
    const api = added[0].factory(requireStub)
    return options.transformChunk === undefined ? api : options.transformChunk(fileName, api)
  }

  const before = registrations.length
  runInContext(readFileSync(OWNER_LIB, 'utf8'), sandbox, { filename: OWNER_LIB })
  const added = registrations.slice(before)
  assert.equal(added.length, 1, 'the owner must register exactly once')
  assert.equal(added[0].id, OWNER_ID)
  assert.equal(added[0].chunk, undefined, 'the owner bundle must carry no chunk field')
  return { exports: added[0].factory(requireStub), requested, sandbox, React }
}

/**
 * A `settings.section` render context exposing only what `apply()` touches.
 *
 * @param options - `{ mirrorSnapshot, served, controller }`.
 * @returns `{ ctx, captured, mirror, cleanups }`.
 */
function makeCtx(options) {
  const captured = { registration: undefined }
  const cleanups = []
  const dictionaries = new Map()
  let mirrorSnapshot = options.mirrorSnapshot
  const mirrorListeners = new Set()
  const mirror = {
    getSnapshot: () => mirrorSnapshot,
    subscribe: (listener) => {
      mirrorListeners.add(listener)
      return () => mirrorListeners.delete(listener)
    },
    setSnapshot: (next) => {
      mirrorSnapshot = next
      for (const listener of [...mirrorListeners]) listener()
    },
    ensure: () => {},
  }
  const controller =
    options.controller ??
    {
      getSnapshot: () => ({ value: { providers: {} }, revision: 4, writable: true }),
      subscribe: () => () => {},
      mutate: async () => true,
    }
  const ctx = {
    locale: {
      // Resolved lazily so `bind()` before the register effect still reads copy.
      bind: (namespace) => (key) => (dictionaries.get(namespace) ?? {})[key] ?? key,
      register: (namespace, table) => {
        dictionaries.set(namespace, table.en ?? table.zh ?? {})
        return () => {}
      },
    },
    settingsSchema: { rehydrate: (envelope) => envelope, validate: () => undefined },
    configForms: {
      describe: () => mirror,
      get: () => controller,
      whileServed: (namespaces, callback) => {
        if (options.served !== false) callback(new Set(namespaces))
        return () => {}
      },
    },
    slots: {
      inject: (_key, callback) => callback(),
      register: (registrationOptions, component) => {
        captured.registration = {
          key: 'settings.section',
          options: registrationOptions,
          component,
        }
        return () => {}
      },
    },
    effect: (callback) => {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => {}
    },
  }
  return { ctx, captured, mirror, cleanups, dictionaries }
}

/** A namespace snapshot carrying the real fixture envelope. */
function servedSnapshot(envelope, value) {
  return {
    view: {
      namespaces:
        envelope === undefined
          ? []
          : [
              {
                ns: 'llm-pi-ai',
                schema: envelope,
                revision: 4,
                value: value ?? { providers: {} },
              },
            ],
    },
  }
}

/**
 * Bind a registration's `inject()` face the way the shipped renderer does:
 * every `hooks.<name>` source becomes a `use<Name>` selector hook
 * (`slotInjectCache`/`bindInjectSources`, renderer/lib/client.js:424-439).
 *
 * @param face - the `inject()` result.
 * @param slots - the shipped slots module (for `standardHookPropName`).
 * @param shim - the shipped `useSyncExternalStoreWithSelector`.
 * @param hookCalls - out-parameter recording `{name, selector, equal}`.
 * @returns the props object the component receives.
 */
function bindInjectFace(face, slots, shim, hookCalls) {
  const bound = Object.assign({}, face)
  delete bound.hooks
  delete bound.keyedHooks
  for (const [name, source] of Object.entries(face.hooks ?? {})) {
    const propName = slots.standardHookPropName(name)
    const subscribe = (listener) => source.subscribe(listener)
    const getSnapshot = () => source.getSnapshot()
    bound[propName] = function useSelector(selector, equal) {
      hookCalls.push({ name: propName, selector, selectorType: typeof selector, equal })
      return shim.useSyncExternalStoreWithSelector(subscribe, getSnapshot, undefined, selector, equal)
    }
  }
  return bound
}

/** Build the registration for one scenario and render the shipped cell twice. */
async function renderCell(scenarioOptions) {
  const React = makeReactStub()
  const owner = loadOwner({
    React,
    failChunks: scenarioOptions.failChunks,
    transformChunk: scenarioOptions.transformChunk,
  })
  const { ctx, captured, mirror } = makeCtx({
    mirrorSnapshot: scenarioOptions.mirrorSnapshot,
    controller: scenarioOptions.controller,
  })
  owner.exports.apply(ctx)
  assert.ok(captured.registration, 'apply() must register one settings.section cell')
  assert.equal(captured.registration.key, 'settings.section')
  assert.equal(captured.registration.options.id, 'model-extended')
  assert.equal(captured.registration.options.order, 12)

  const slots = await loadShippedSlots()
  const shim = extractSelectorShim(readSource(RENDERER_LIB))
  const hookCalls = []
  const face = captured.registration.options.inject()
  let props = bindInjectFace(face, slots, shim, hookCalls)
  if (scenarioOptions.mutateProps !== undefined) props = scenarioOptions.mutateProps(props)

  const mini = createMiniRenderer(React)
  const element = React.createElement(captured.registration.component, props)
  const outcome = {}
  try {
    outcome.firstPass = mini.render(element, {})
  } catch (error) {
    outcome.firstPassError = error
  }
  await React.__settle()
  try {
    outcome.tree = mini.render(element, {})
    outcome.text = flattenText(outcome.tree)
    outcome.ok = true
  } catch (error) {
    outcome.error = error
    outcome.ok = false
  }
  return { outcome, hookCalls, diagnostics: mini.diagnostics, requested: owner.requested }
}

/** Run the render harness only once the fix landed (checked by the caller). */
async function phaseB() {
  section('PHASE B — render the shipped cell (real bytes, independent mini-renderer)')

  const envelope = JSON.parse(readFileSync(FIXTURE_ENVELOPE, 'utf8'))
  const value = { providers: { alpha: { model: 'alpha-model' } } }
  const wellFormed = servedSnapshot(envelope, value)

  await check('B1 well-formed snapshot renders without throwing', async () => {
    const { outcome, hookCalls } = await renderCell({ mirrorSnapshot: wellFormed })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    assert.ok(outcome.tree !== undefined && outcome.tree !== null, 'render produced no tree')
    assert.match(outcome.text, /Extended model config/, `page header missing; text=${outcome.text}`)
    assert.ok(hookCalls.length >= 1, 'the injected selector hook was never called')
    return `text="${outcome.text.slice(0, 160)}"; hook calls=${hookCalls.map((c) => `${c.name}(${c.selectorType})`).join(',')}`
  })

  await check('B2 absent envelope renders the loading state without throwing', async () => {
    const { outcome } = await renderCell({ mirrorSnapshot: servedSnapshot(undefined) })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    assert.ok(outcome.tree !== undefined && outcome.tree !== null, 'render produced no tree')
    assert.match(outcome.text, /Loading/, `loading copy missing; text=${outcome.text}`)
    return `text="${outcome.text}"`
  })

  await check('B3 a hook that returns undefined does not throw', async () => {
    const { outcome } = await renderCell({
      mirrorSnapshot: wellFormed,
      mutateProps: (props) => Object.assign({}, props, { usePage: () => undefined }),
    })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    assert.ok(outcome.tree !== undefined && outcome.tree !== null, 'render produced no tree')
    return `text="${String(outcome.text).slice(0, 120)}"`
  })

  await check('B4 the selector-requiring hook is called WITH a selector', async () => {
    const { outcome, hookCalls } = await renderCell({ mirrorSnapshot: wellFormed })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    const bad = hookCalls.filter((call) => call.selectorType !== 'function')
    assert.deepEqual(bad, [], `selector hook called without a function selector: ${JSON.stringify(bad)}`)
    return `observed calls: ${hookCalls.map((c) => `${c.name}(${c.selectorType})`).join(',')}`
  })

  await check('B5 a throwing panel is contained (boundary catches it, page survives)', async () => {
    const boom = () => {
      throw new Error('harness: simulated panel crash')
    }
    const { outcome, diagnostics } = await renderCell({
      mirrorSnapshot: wellFormed,
      transformChunk: (fileName, api) => {
        if (fileName !== 'client.panels.js') return api
        const patched = Object.assign({}, api)
        for (const name of ['ProviderTabs', 'ProviderPanel']) {
          if (typeof patched[name] === 'function') patched[name] = boom
        }
        return patched
      },
    })
    assert.ok(!outcome.error, `the panel crash escaped the boundary: ${outcome.error && outcome.error.message}`)
    assert.ok(diagnostics.boundaryCatches.length >= 1, 'no error boundary caught the panel crash')
    assert.match(outcome.text, /Extended model config/, 'the page itself disappeared')
    return `boundary catches=${JSON.stringify(diagnostics.boundaryCatches)}; fallback text="${outcome.text}"`
  })

  await check('B6 a rejected chunk produces a visible message, not a bare cell', async () => {
    const { outcome } = await renderCell({
      mirrorSnapshot: wellFormed,
      failChunks: ['client.panels.js'],
    })
    assert.ok(!outcome.error, `the chunk failure escaped: ${outcome.error && outcome.error.message}`)
    const text = String(outcome.text)
    assert.ok(text.trim().length > 0, 'the cell rendered no visible text at all')
    assert.match(
      text,
      /Failed to load the page components|loadFailed/,
      `chunk failure not surfaced with the loadFailed copy; text="${text}"`,
    )
    return `text="${text}"`
  })

  await check('B7 the owner is still chunk-envelope conformant', () => {
    const code = stripJsComments(readSource(OWNER_LIB))
    assert.doesNotMatch(code, /(^|\n)\s*import\s/, 'lib/client.js must not use import')
    assert.doesNotMatch(code, /(^|\n)\s*export\s/, 'lib/client.js must not use export')
    assert.doesNotMatch(code, /\bmodule\.exports\s*=/, 'lib/client.js must not use module.exports')
    return 'no import / export / module.exports in lib/client.js (comments excluded)'
  })

  await check('B8 the empty-argument hook call that caused the blank page is gone', () => {
    // v10: the hook is read in the page face (`client.page.js`) through
    // `client.core.js`'s `readView`; the rule is asserted over both, because the
    // owner no longer renders the page.
    const sources = [OWNER_LIB, join(LIB, 'client.page.js'), join(LIB, 'client.core.js')]
    for (const file of sources) {
      const code = stripJsComments(readSource(file))
      const bad = code.match(/props\.usePage\s*\(\s*\)/)
      assert.equal(bad, null, `${file} still calls props.usePage() with no selector`)
    }
    const pageCode = stripJsComments(readSource(join(LIB, 'client.page.js')))
    const correct = pageCode.match(/props\.usePage|readView\(/)
    assert.ok(correct, 'the page no longer reads the injected hook at all')
    const coreCode = stripJsComments(readSource(join(LIB, 'client.core.js')))
    assert.match(coreCode, /usePage\(identity\)|function readView\(/, 'core must own the selector rule')
    return 'no `props.usePage()` empty-argument call in executable code'
  })
}

/* ------------------------------------------------------------------ *
 * main
 * ------------------------------------------------------------------ */

process.stdout.write(`verify.render.mjs — independent render/hook verification\n`)
process.stdout.write(`project: ${ROOT}\nshipped DSH packages: ${ASAR}\n`)
try {
  const ownerBytes = existsSync(OWNER_LIB) ? readFileSync(OWNER_LIB) : undefined
  process.stdout.write(`lib/client.js: ${ownerBytes ? `${ownerBytes.length} bytes, md5 ${md5(ownerBytes)}` : 'MISSING'}\n`)
} catch {}
process.stdout.write(`checked at: ${new Date().toISOString()}\n`)

try {
  await phaseA()
} catch (error) {
  process.stdout.write(`\n[HARNESS ERROR] ${error?.stack ?? error}\n`)
  process.exitCode = 1
}

if (process.env.VERIFY_RENDER_PHASE !== 'A') {
  try {
    await phaseB()
  } catch (error) {
    process.stdout.write(`\n[HARNESS ERROR] ${error?.stack ?? error}\n`)
    process.exitCode = 1
  }
}

const failed = results.filter((r) => !r.ok)
process.stdout.write(
  `\n--- summary: ${results.filter((r) => r.ok && !r.skipped).length} passed, ` +
    `${results.filter((r) => r.skipped).length} skipped, ${failed.length} failed ---\n`,
)
if (failed.length > 0) {
  for (const f of failed) process.stdout.write(`  FAILED: ${f.name}\n`)
  process.exitCode = 1
}
