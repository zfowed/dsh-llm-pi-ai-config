/**
 * Render-level regression test for the bundle owner, `lib/client.js`.
 *
 * Why this file exists
 * --------------------
 * A render-time throw in a slot entry is not a small failure. The slot renderer
 * catches it and *abdicates* the entry: `reportEntryError(..., {abdicate:true})`
 * adds it to the slots `abdicated` WeakSet, `entriesOfSlot()` skips abdicated
 * entries for the rest of that registration's life, and the page goes blank
 * while its nav cell stays visible.
 *
 * The original defect was exactly that: `inject()` supplies
 * `hooks: { page: store }`, the renderer turns that into a `usePage` prop whose
 * type is `SnapshotSelectorHook` (`<S>(sel, eq?) => S`), and the page called
 * `props.usePage()` with **no selector**. The shim invokes the selector
 * directly, so that threw `TypeError` inside render and the cell was retired.
 *
 * This test therefore renders the real page component with the props a section
 * registration supplies, through a hand-written React that mirrors the two
 * behaviours that matter here:
 *
 *   - the injected hook is a *selector* hook and throws when called bare
 *     (exactly like `useSyncExternalStoreWithSelector`);
 *   - a class error boundary catches a child render throw.
 *
 * Against the shipped bytes it proves: the hook is always called with a
 * selector; envelope-present, envelope-absent and hook-returns-undefined all
 * render without throwing; a missing hook and a missing controller degrade to a
 * visible error; a panel that throws is contained; and a rejected chunk load is
 * surfaced with a retry instead of a bare placeholder.
 *
 * @module dsh-llm-pi-ai-config/tests/render
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { loadCore } from './helpers/load-core.mjs'
import assert from 'node:assert/strict'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, '..', 'lib')
const OWNER_ID = 'dsh-llm-pi-ai-config'

/** A namespace envelope shaped like the real `{uid, refs}` graph. */
const ENVELOPE = {
  uid: 1,
  refs: {
    1: { type: 'object', dict: { providers: 2 } },
    2: { type: 'dict', inner: 3 },
    3: { type: 'object', dict: {} },
  },
}

/** `Object.is`-style dependency comparison for the hook stub. */
function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

/**
 * A tiny React that renders for real, one pass at a time.
 *
 * It keeps per-component-type hook cells so a second render sees the state a
 * `setState`-style setter wrote (needed for the chunk-loading host), and it
 * implements error boundaries the way React does: a class with
 * `getDerivedStateFromError` catches a throw from its children.
 *
 * @param options - `{lazy}` to install `lazy`/`Suspense` stubs.
 * @returns `{react, render, flushEffects}`.
 */
function createReact(options = {}) {
  const cells = new Map()
  let current = null

  class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }

    setState(next) {
      this.state = Object.assign(
        {},
        this.state,
        typeof next === 'function' ? next(this.state) : next,
      )
    }
  }
  Component.prototype.isReactComponent = {}

  function cellFor(type) {
    let cell = cells.get(type)
    if (cell === undefined) {
      cell = { hooks: [], cursor: 0 }
      cells.set(type, cell)
    }
    return cell
  }

  function useState(initial) {
    const cell = current
    const index = cell.cursor
    cell.cursor += 1
    if (!(index in cell.hooks)) {
      cell.hooks[index] = typeof initial === 'function' ? initial() : initial
    }
    const setter = (next) => {
      cell.hooks[index] = typeof next === 'function' ? next(cell.hooks[index]) : next
    }
    return [cell.hooks[index], setter]
  }

  function useMemo(factory, deps) {
    const cell = current
    const index = cell.cursor
    cell.cursor += 1
    const previous = cell.hooks[index]
    if (previous === undefined || !sameDeps(previous.deps, deps)) {
      cell.hooks[index] = { value: factory(), deps }
    }
    return cell.hooks[index].value
  }

  function useEffect(effect, deps) {
    const cell = current
    const index = cell.cursor
    cell.cursor += 1
    const previous = cell.hooks[index]
    if (previous === undefined || !sameDeps(previous.deps, deps)) {
      cell.hooks[index] = { effect, deps, pending: true }
    }
  }

  function useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot()
  }

  function createElement(type, props, ...children) {
    let child
    if (children.length === 1) child = children[0]
    else if (children.length > 1) child = children
    return { type, props: Object.assign({}, props, { children: child }) }
  }

  function renderClass(type, props) {
    const instance = new type(props)
    instance.props = props
    if (instance.state === undefined || instance.state === null) instance.state = {}
    try {
      return renderNode(instance.render())
    } catch (error) {
      if (typeof type.getDerivedStateFromError !== 'function') throw error
      instance.state = Object.assign(
        {},
        instance.state,
        type.getDerivedStateFromError(error) || {},
      )
      if (typeof instance.componentDidCatch === 'function') instance.componentDidCatch(error, {})
      return renderNode(instance.render())
    }
  }

  function renderNode(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(renderNode)

    const { type, props } = node
    if (typeof type === 'string') {
      return {
        kind: 'host',
        type,
        props: Object.assign({}, props, { children: renderNode(props.children) }),
      }
    }
    if (typeof type === 'function') {
      const isClass =
        type.prototype !== undefined &&
        (type.prototype.isReactComponent !== undefined ||
          typeof type.getDerivedStateFromError === 'function')
      if (isClass) return renderClass(type, props)

      const cell = cellFor(type)
      const previous = current
      current = cell
      cell.cursor = 0
      let output
      try {
        output = type(props)
      } finally {
        current = previous
      }
      return renderNode(output)
    }
    throw new TypeError(`render: unsupported element type ${String(type)}`)
  }

  function flushEffects() {
    for (const cell of cells.values()) {
      for (const hook of cell.hooks) {
        if (hook !== null && typeof hook === 'object' && hook.pending === true) {
          hook.pending = false
          hook.effect()
        }
      }
    }
  }

  const react = { createElement, Component, useState, useMemo, useEffect, useSyncExternalStore }
  if (options.lazy === true) {
    react.lazy = () => function LazyStub() {
      return null
    }
    react.Suspense = function SuspenseStub(props) {
      return props.children
    }
  }
  return { react, render: renderNode, flushEffects }
}

/**
 * The primitives the owner resolves at load time.
 *
 * Only `StateDot` remains owner-side: the provider tab strip now lives in the
 * panels chunk, whose own primitives are stubbed at the chunk boundary. The
 * stub reports itself with `data-primitive`, so a test can tell the real
 * component apart from the bundle's local stand-in.
 *
 * @param react - the React stub the components render through.
 * @returns the primitives module stub.
 */
function makePrimitives(react) {
  return {
    StateDot: function StateDot(props) {
      return react.createElement('span', {
        'data-primitive': 'StateDot',
        'data-state': props.state,
        'aria-hidden': 'true',
      })
    },
  }
}

/**
 * Evaluate the shipped owner bundle with only the seed words it requires.
 *
 * @param react - the React stub to install.
 * @param sink - optional array that collects `console` calls, so a contained
 *   crash can be asserted without spilling a stack trace into the test output.
 * @param options - `{chunks, primitives}`. `chunks` maps a chunk file name to
 *   the API `require.async` resolves with (or to a promise, so a rejected load
 *   can be simulated). Without it, no chunk may be fetched.
 * @returns the bundle's exports.
 */
function loadOwner(react, sink = [], options = {}) {
  const registrations = []
  const sandbox = {
    console: {
      log: (...args) => sink.push(args),
      warn: (...args) => sink.push(args),
      error: (...args) => sink.push(args),
    },
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
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  sandbox.window = sandbox
  createContext(sandbox)

  const seeds = {
    react,
    '@deepseek-ai/dsh-client-ui-primitives': options.primitives ?? makePrimitives(react),
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let currentSnapshot = initial
        const listeners = new Set()
        return {
          getSnapshot: () => currentSnapshot,
          set: (next) => {
            currentSnapshot = next
            for (const listener of listeners) listener()
          },
          subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
      },
    },
  }

  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`render test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    const fileName = specifier.startsWith('./') ? specifier.slice(2) : undefined
    const provided =
      options.chunks !== undefined && fileName !== undefined
        ? options.chunks[fileName]
        : undefined
    if (provided !== undefined) return provided
    if (fileName === undefined) throw new Error(`render test: no chunk stub for ${specifier}`)
    // v10: the owner's chunk plan grows as the page is split up, so a chunk a
    // test does not stub is loaded from the shipped file — exactly what the
    // browser loader does — instead of every test having to enumerate the plan.
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    const record = registrations[before]
    if (record === undefined) {
      throw new Error(`render test: ${fileName} registered nothing while loading it`)
    }
    return record.factory(requireStub)
  }

  const file = join(LIB, 'client.js')
  runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  assert.equal(registrations.length, 1, 'the owner must register exactly once')
  const owner = registrations[0]
  assert.equal(owner.id, OWNER_ID)
  assert.equal(owner.chunk, undefined, 'the owner bundle carries no chunk field')
  return owner.factory(requireStub)
}

/** The four chunk APIs the page needs, stubbed to the shapes it reads. */
function makeChunks(react, overrides = {}) {
  // Opt-in sink for the props each stand-in chunk receives, so an owner-side
  // test can assert what the page hands down without replacing the stand-ins.
  const received = overrides.record ?? {}
  return {
    // v10: `StateDot`, `CodeBlock` and `isComponent` come from the shared base
    // chunk; the harness builds the real one so the primitives fallbacks stay
    // under test.
    core: overrides.core ?? loadCore(react, makePrimitives(react)),
    schema: {
      node: (_envelope, ref) => {
        if (ref === 1) return { dict: { providers: 2 } }
        if (ref === 2) return { inner: 3 }
        return undefined
      },
      leaves: () => overrides.leaves ?? [],
    },
    form: Object.assign(
      {
        createStagedForm: () => {
          const snapshot = {
            values: overrides.values ?? { providers: {} },
            dirty: false,
            saving: false,
            invalid: false,
            error: undefined,
          }
          return {
            subscribe: () => () => {},
            getSnapshot: () => snapshot,
            edit: () => {},
            remove: () => {},
            discard: () => {},
            save: () => {},
          }
        },
      },
      overrides.form,
    ),
    fields: {
      groupLeaves: () => overrides.groups ?? [],
      profileLabel: (profile) =>
        profile !== null && typeof profile === 'object' && typeof profile.displayName === 'string'
          ? profile.displayName
          : undefined,
    },
    // T7: the owner requests `client.yaml.js` for the read-only raw face. Its
    // absence is allowed (the face degrades), so a test that wants the real
    // code view supplies one through `overrides.yaml`.
    yaml: overrides.yaml ?? {
      toYaml: (value) => 'stub-yaml: ' + JSON.stringify(value),
    },
    panels: overrides.panels ?? {
      // The switcher mirrors the v7 contract the owner relies on (§15.2): one
      // role=tab per provider, the trailing 「添加」 tab as a real tab with its
      // own panel id, and its add tabpanel rendered only while `adding` is
      // true (which is when the owner drops the provider face).
      ProviderTabs: (props) => {
        const items = Array.isArray(props.items) ? props.items : []
        const hasTabs = items.length > 0
        const tabs = items.map((item) =>
          react.createElement(
            'button',
            {
              key: item.value,
              id: item.id,
              type: 'button',
              role: 'tab',
              'aria-selected': props.adding !== true && item.value === props.provider,
              'aria-controls': item.panelId,
              tabIndex: props.adding !== true && item.value === props.provider ? 0 : -1,
              onClick: () => props.onSelect(item.value),
            },
            item.label,
          ),
        )
        if (hasTabs) {
          tabs.push(
            react.createElement(
              'button',
              {
                key: 'add',
                id: 'model-extended-tab-add',
                type: 'button',
                role: 'tab',
                'aria-selected': props.adding === true,
                'aria-controls': 'model-extended-panel-add',
                tabIndex: props.adding === true ? 0 : -1,
                onClick: () => props.onSelectAdd(),
              },
              '添加',
            ),
          )
        }
        const children = hasTabs
          ? tabs
          : []
        // T7 (R6): the strip is a two-slot bar — the tablist on the left, the
        // caller's provider-level actions on the right. The right slot is always
        // rendered (empty without `actions`), and the add panel stays a SIBLING
        // of the bar so `.piai-tabs` remains the frozen strip container.
        const bar = []
        if (hasTabs) {
          bar.push(
            react.createElement(
              'div',
              {
                key: 'list',
                className: 'piai-provider-list',
                role: 'tablist',
                'aria-label': props.label,
              },
              children,
            ),
          )
        }
        bar.push(
          react.createElement(
            'div',
            { key: 'actions', className: 'piai-item-actions' },
            props.actions === undefined || props.actions === null ? null : [props.actions],
          ),
        )
        const strip = [
          react.createElement('div', { key: 'bar', className: 'piai-tabs-bar' }, bar),
        ]
        if (hasTabs && props.adding === true) {
          strip.push(
            react.createElement(
              'div',
              {
                key: 'add-panel',
                className: 'piai-provider-add',
                role: 'tabpanel',
                id: 'model-extended-panel-add',
                'aria-labelledby': 'model-extended-tab-add',
              },
              'add provider',
            ),
          )
        }
        received.tabs = props
        return react.createElement(
          'div',
          { className: 'piai-tabs', 'data-panel': 'tabs' },
          strip,
        )
      },
      ProviderPanel: (props) => {
        received.panel = props
        return react.createElement('div', { className: 'panel-provider' }, 'provider panel')
      },
    },
  }
}

/** The props a `settings.section` registration supplies to its component. */
function makeProps(options = {}) {
  return {
    usePage: options.usePage,
    controller:
      'controller' in options
        ? options.controller
        : {
            getSnapshot: () => ({ value: { providers: {} }, revision: 4, writable: true }),
            mutate: async () => true,
          },
    validate: options.validate ?? (() => undefined),
    // T7: the model-discovery face the page hands down to the panels chunk.
    // `undefined` means "the host offers no remote.llm" — the panels stand-in
    // then sees no catalog at all.
    catalog: options.catalog,
    t: options.t ?? ((key) => key),
  }
}

/**
 * The real injected hook: a selector hook.
 *
 * It mirrors `bindSnapshotSelector` + `useSyncExternalStoreWithSelector`, which
 * call the selector directly — so a bare `hook()` throws `TypeError`, which is
 * precisely what retired the cell.
 *
 * @param snapshot - what the underlying store currently holds.
 * @returns the hook, with a `calls` log of the selectors it received.
 */
function makeSelectorHook(snapshot) {
  const calls = []
  const hook = (selector) => {
    calls.push(selector)
    if (typeof selector !== 'function') {
      throw new TypeError('usePage: the injected hook is a selector hook; a selector is required')
    }
    return selector(snapshot)
  }
  hook.calls = calls
  return hook
}

/** Every rendered node, flattened. */
function nodes(tree) {
  const found = []
  const visit = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (typeof node !== 'object') return
    found.push(node)
    visit(node.props.children)
  }
  visit(tree)
  return found
}

/** Every rendered node carrying `className`. */
function byClass(tree, className) {
  return nodes(tree).filter((node) => {
    const value = node.props.className
    return typeof value === 'string' && value.split(' ').indexOf(className) !== -1
  })
}

/** Every rendered node whose attribute equals `value`. */
function byAttr(tree, name, value) {
  return nodes(tree).filter((node) => node.props[name] === value)
}

/** Let every already-scheduled microtask and timer turn settle. */
function settle() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * The chunk APIs `ensureChunks()` resolves, as `require.async` stubs.
 *
 * @param react - the React stub the panel stubs render through.
 * @param styles - the `client.styles.js` value: an API object, or a promise
 *   (a rejected one simulates a broken stylesheet).
 * @returns a `{fileName: api}` map for `loadOwner`'s `chunks` option.
 */
function makeChunkStubs(react, styles, overrides = {}) {
  const chunks = makeChunks(react, overrides)
  return {
    'client.core.js': chunks.core,
    'client.schema.js': chunks.schema,
    'client.form.js': chunks.form,
    'client.fields.js': chunks.fields,
    'client.yaml.js': chunks.yaml,
    'client.panels.js': chunks.panels,
    'client.styles.js': styles,
  }
}

/**
 * A `settings.section` context stub that captures `ctx.effect` cleanups.
 *
 * @param options - `{served}`; `served: false` keeps the namespace absent.
 * @returns `{ctx, registrations, effects, runCleanups}`.
 */
function makeApplyCtx(options = {}) {
  const registrations = []
  const effects = []
  const namespaces =
    options.served === false
      ? []
      : [{ ns: 'llm-pi-ai', schema: ENVELOPE, value: {}, revision: 1 }]
  const mirror = {
    getSnapshot: () => ({ view: { namespaces } }),
    subscribe: () => () => {},
    ensure: () => {},
  }
  const controller = {
    getSnapshot: () => ({ value: {}, revision: 1, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const ctx = {
    locale: { bind: () => (key) => key, register: () => () => {} },
    settingsSchema: { rehydrate: (value) => value, validate: () => undefined },
    slots: {
      inject: (_slot, register) => register(),
      register: (declaration, component) => {
        registrations.push({ declaration, component })
        return () => {}
      },
    },
    configForms: {
      describe: () => mirror,
      get: () => controller,
      whileServed: (_namespaces, register) => {
        const off = options.served === false ? undefined : register(new Set(_namespaces))
        return () => {
          if (typeof off === 'function') off()
        }
      },
    },
    effect: (callback) => {
      effects.push({ cleanup: callback() })
    },
  }
  return {
    ctx,
    registrations,
    effects,
    runCleanups: () => {
      for (const effect of effects) {
        if (typeof effect.cleanup === 'function') effect.cleanup()
      }
    },
  }
}

/** All text under the tree, concatenated. */
function textContent(tree) {
  const parts = []
  const visit = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      for (const child of node) visit(child)
      return
    }
    if (typeof node === 'string') {
      parts.push(node)
      return
    }
    if (typeof node !== 'object') return
    visit(node.props.children)
  }
  visit(tree)
  return parts.join('')
}

/**
 * Build the real page component from the shipped bundle.
 *
 * v10: the page face is `lib/client.page.js`, loaded through the owner's
 * `__internals.loadPage()`, and it is given the owner's own `PageBoundary` so
 * the boundary assertions below exercise the class production uses.
 */
async function makePage(harness, overrides) {
  return makePageFrom(loadOwner(harness.react), makeChunks(harness.react, overrides))
}

/** The same seam for a test that already built its own owner and chunk map. */
async function makePageFrom(owner, chunks) {
  const page = await owner.__internals.loadPage()
  return page.makePage(chunks, { boundary: owner.__internals.pageBoundary })
}

test('the page calls the injected page hook as a selector hook', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  assert.equal(hook.calls.length, 1, 'usePage must be called exactly once per render')
  assert.equal(
    typeof hook.calls[0],
    'function',
    'the injected hook is a selector hook and must receive a selector',
  )
  assert.ok(tree !== null && tree !== undefined, 'the page must render something')
  assert.equal(byClass(tree, 'piai-page').length, 1)
  assert.equal(byClass(tree, 'panel-provider').length, 1)

  // The original defect, in one line: no selector => TypeError => abdication.
  assert.throws(() => hook(), TypeError)
})

test('an envelope present renders the panel without throwing', async () => {
  const harness = createReact()
  const page = await makePage(harness, { values: { providers: { alpha: { baseUrl: 'x' } } } })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()

  assert.equal(byClass(tree, 'piai-page').length, 1)
  assert.equal(byClass(tree, 'piai-loading').length, 0)
  assert.equal(byClass(tree, 'piai-boundary').length, 0)
})

test('an envelope absent renders the explicit loading state', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook({ envelope: undefined })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  assert.equal(byClass(tree, 'piai-loading').length, 1)
  assert.match(textContent(tree), /loading/)
  assert.equal(byClass(tree, 'piai-boundary').length, 0)
})

test('a hook that yields undefined renders the loading state instead of throwing', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook(undefined)

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  assert.equal(byClass(tree, 'piai-loading').length, 1)
})

test('a missing injected hook degrades to a visible error, not a blank page', async () => {
  const harness = createReact()
  const page = await makePage(harness)

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: undefined })))

  assert.equal(byClass(tree, 'piai-page').length, 1)
  assert.equal(byClass(tree, 'piai-boundary').length, 1)
  assert.match(textContent(tree), /hookMissing/)
})

test('a missing controller degrades to a visible error, not a blank page', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook, controller: undefined })))

  assert.equal(byClass(tree, 'piai-page').length, 1)
  assert.equal(byClass(tree, 'piai-boundary').length, 1)
  assert.match(textContent(tree), /controllerMissing/)
})

test('a panel that throws is contained by the error boundary', async () => {
  const harness = createReact()
  const chunks = makeChunks(harness.react)
  chunks.panels.ProviderPanel = () => {
    throw new Error('panel exploded')
  }
  const errors = []
  const page = await makePageFrom(loadOwner(harness.react, errors), chunks)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree
  assert.doesNotThrow(() => {
    tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook, t: (key) => `T:${key}` })))
  })

  assert.equal(byClass(tree, 'piai-page').length, 1, 'the page shell must survive the panel crash')
  assert.equal(byClass(tree, 'piai-boundary').length, 1)
  assert.match(textContent(tree), /T:renderFailed/)
  assert.match(textContent(tree), /panel exploded/)
  assert.equal(errors.length, 1, 'the boundary must report the contained crash once')
})

test('a missing panel export renders a visible stand-in instead of throwing', async () => {
  const harness = createReact()
  const chunks = makeChunks(harness.react)
  delete chunks.panels.ProviderPanel
  const page = await makePageFrom(loadOwner(harness.react), chunks)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  assert.equal(byClass(tree, 'piai-page').length, 1)
  assert.match(textContent(tree), /panel missing/)
})

test('a rejected chunk load surfaces a failure and a retry (eager host)', async () => {
  const harness = createReact()
  const owner = loadOwner(harness.react)
  const host = owner.__internals.lazyComponent(() => Promise.reject(new Error('chunk 404')))
  const props = { t: (key) => key }

  let tree = harness.render(harness.react.createElement(host, props))
  assert.equal(byClass(tree, 'piai-loading').length, 1, 'the first pass shows loading')

  harness.flushEffects()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()

  tree = harness.render(harness.react.createElement(host, props))
  assert.equal(byClass(tree, 'piai-boundary').length, 1)
  assert.match(textContent(tree), /chunk 404/)
  assert.equal(byClass(tree, 'piai-btn').length, 1, 'a retry control must be offered')
})

test('a resolved chunk load renders the loaded component (eager host)', async () => {
  const harness = createReact()
  const owner = loadOwner(harness.react)
  const loaded = () => harness.react.createElement('div', { className: 'loaded-page' }, 'loaded')
  const host = owner.__internals.lazyComponent(() => Promise.resolve(loaded))
  const props = { t: (key) => key }

  let tree = harness.render(harness.react.createElement(host, props))
  assert.equal(byClass(tree, 'piai-loading').length, 1)

  harness.flushEffects()
  await Promise.resolve()
  await Promise.resolve()

  tree = harness.render(harness.react.createElement(host, props))
  assert.equal(byClass(tree, 'loaded-page').length, 1)
})

test('the lazy host puts its Suspense child inside a chunk boundary', () => {
  const harness = createReact({ lazy: true })
  const owner = loadOwner(harness.react)
  const host = owner.__internals.lazyComponent(() => Promise.resolve(() => null))

  const inner = host({ t: (key) => key })

  assert.equal(
    typeof inner.type.getDerivedStateFromError,
    'function',
    'a rejected lazy import must be caught by the chunk boundary, not the slot boundary',
  )
  assert.ok(inner.props.children !== undefined, 'the Suspense child must be wrapped')
})

test('the boundary fallback is localized through the injected t', async () => {
  const harness = createReact()
  const chunks = makeChunks(harness.react)
  chunks.panels.ProviderPanel = () => {
    throw new Error('boom')
  }
  const page = await makePageFrom(loadOwner(harness.react), chunks)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook, t: (key) => `zh:${key}` })))

  assert.match(textContent(tree), /zh:renderFailed/)
})

test('readView tolerates a missing hook and passes a selector when present', () => {
  // v10: `readView` moved into the shared base chunk (`client.core.js`), which
  // owns the "always pass a selector" rule the blank-page incident came from.
  const harness = createReact()
  const readView = loadCore(harness.react, makePrimitives(harness.react)).readView
  assert.equal(readView(undefined), undefined)

  const hook = makeSelectorHook({ envelope: ENVELOPE })
  assert.deepEqual(readView(hook), { envelope: ENVELOPE })
  assert.equal(typeof hook.calls[0], 'function')
})

/* ------------------------------------------------------------------ *
 * Page shell: scoped root, provider strip, sticky bar, styles lifecycle
 * ------------------------------------------------------------------ */

test('the page root carries piai-root alongside piai-page', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const roots = byClass(tree, 'piai-root')
  assert.equal(roots.length, 1, 'exactly one scoped root')
  assert.equal(roots[0].type, 'div')
  assert.ok(
    roots[0].props.className.split(' ').includes('piai-page'),
    'the root keeps piai-page as well',
  )
  assert.equal(roots[0].props['data-piai'], '1')
  assert.equal(byClass(tree, 'piai-header').length, 1)
  assert.equal(byClass(tree, 'piai-tabs').length, 1, 'the provider strip is rendered once')
  assert.equal(byClass(tree, 'piai-body').length, 1)
  assert.equal(byClass(tree, 'piai-bar').length, 1)
})

test('the provider strip is a tablist and the panel is a labelled tabpanel', async () => {
  const harness = createReact()
  const page = await makePage(harness, { values: { providers: { alpha: { baseUrl: 'x' } } } })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const strips = byClass(tree, 'piai-tabs')
  assert.equal(strips.length, 1, 'the strip is emitted exactly once')

  const tablists = byClass(tree, 'piai-provider-list')
  assert.equal(tablists.length, 1, 'the strip has one underlined tab row')
  assert.equal(tablists[0].props.role, 'tablist')

  const tabs = nodes(tree).filter((node) => node.props.role === 'tab')
  assert.equal(tabs.length, 2, 'one tab per configured provider plus the add tab')
  assert.deepEqual(
    tabs.map((tab) => tab.props.id),
    ['model-extended-tab-0-alpha', 'model-extended-tab-add'],
  )
  assert.equal(tabs.filter((tab) => tab.props['aria-selected'] === true).length, 1)
  assert.equal(tabs[1].props['aria-selected'], false, 'the add tab is not the active one')
  assert.equal(tabs[1].props['aria-controls'], 'model-extended-panel-add')
  assert.equal(tabs[1].props.tabIndex, -1, 'roving tabindex stays on the provider tab')
  assert.equal(textContent(tabs[1]), '添加', 'the add tab is a real tab (§15.2 item 8)')

  const panels = nodes(tree).filter((node) => node.props.role === 'tabpanel')
  assert.equal(panels.length, 1)
  assert.equal(typeof panels[0].props.id, 'string')
  assert.equal(typeof panels[0].props['aria-labelledby'], 'string')

  const selected = tabs.find((tab) => tab.props['aria-selected'] === true)
  assert.equal(selected.props.id, panels[0].props['aria-labelledby'])
  assert.equal(selected.props['aria-controls'], panels[0].props.id)
})

test('the add tab is a real tab whose panel replaces the provider face', async () => {
  const harness = createReact()
  const page = await makePage(harness, { values: { providers: { alpha: { baseUrl: 'x' } } } })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  assert.equal(byClass(tree, 'panel-provider').length, 1, 'the provider face renders first')

  const addTab = nodes(tree).find((node) => node.props.id === 'model-extended-tab-add')
  assert.ok(addTab !== undefined, 'the add tab must be rendered')
  addTab.props.onClick()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const panels = nodes(tree).filter((node) => node.props.role === 'tabpanel')
  assert.equal(panels.length, 1, 'while adding, the strip owns the only tabpanel')
  assert.equal(panels[0].props.id, 'model-extended-panel-add')
  assert.equal(panels[0].props['aria-labelledby'], 'model-extended-tab-add')
  assert.equal(
    byClass(tree, 'panel-provider').length,
    0,
    'the provider face must not render behind the add panel',
  )
  const active = nodes(tree).filter(
    (node) => node.props.role === 'tab' && node.props['aria-selected'] === true,
  )
  assert.equal(active.length, 1)
  assert.equal(active[0].props.id, 'model-extended-tab-add')
  assert.equal(active[0].props.tabIndex, 0, 'the active add tab takes the tab stop')
})

test('the provider tab label prefers displayName and falls back to the key', async () => {
  const harness = createReact()
  const page = await makePage(harness, {
    values: {
      providers: {
        alpha: { displayName: 'Deepseek 月卡' },
        'api-plain': {},
      },
    },
  })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const tabs = nodes(tree).filter(
    (node) => node.props.role === 'tab' && node.props.id !== 'model-extended-tab-add',
  )
  assert.deepEqual(
    tabs.map((tab) => textContent(tab)),
    ['Deepseek 月卡', 'api-plain'],
  )
})

test('with no providers there is no tablist and no tabpanel', async () => {
  const harness = createReact()
  const page = await makePage(harness, { values: { providers: {} } })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  assert.equal(byClass(tree, 'piai-tabs').length, 1, 'the add-provider chrome still renders')
  assert.equal(byClass(tree, 'piai-provider-list').length, 0, 'no tablist without providers')
  assert.equal(nodes(tree).filter((node) => node.props.role === 'tab').length, 0)
  assert.equal(nodes(tree).filter((node) => node.props.role === 'tabpanel').length, 0)
  assert.equal(
    byClass(tree, 'panel-provider').length,
    1,
    'the body still renders the panel face instead of a stale tabpanel',
  )
})

test('selecting another provider moves the tabpanel to that provider', async () => {
  const harness = createReact()
  const page = await makePage(harness, {
    values: { providers: { alpha: { baseUrl: 'x' }, beta: { baseUrl: 'y' } } },
  })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const beta = nodes(tree).find(
    (node) => node.props.role === 'tab' && String(node.props.id).endsWith('-beta'),
  )
  assert.ok(beta !== undefined, 'the second provider has a tab')
  beta.props.onClick()

  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  const panels = nodes(tree).filter((node) => node.props.role === 'tabpanel')
  assert.equal(panels[0].props['aria-labelledby'], beta.props.id)
  assert.equal(panels[0].props.id, beta.props['aria-controls'])
})

test('the sticky bar carries StateDot, piai-dirty, aria-live and all three actions', async () => {
  const harness = createReact()
  const page = await makePage(harness)
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const bars = byClass(tree, 'piai-bar')
  assert.equal(bars.length, 1)

  const status = byClass(tree, 'piai-dirty')
  assert.equal(status.length, 1)
  assert.equal(status[0].props['aria-live'], 'polite')
  assert.equal(byAttr(tree, 'data-primitive', 'StateDot').length, 1, 'StateDot is the status dot')

  // Scoped to the bar: since T7 the page also draws `.piai-btn` buttons in the
  // tab strip's right-hand actions slot (the raw/form toggle), so a page-wide
  // `.piai-btn` count no longer means "the bar's three actions".
  const buttons = byClass(bars[0], 'piai-btn')
  assert.equal(buttons.length, 3, 'the provider delete, Discard and Save')
  const labels = buttons.map((button) => button.props['aria-label'] || textContent(button))
  assert.ok(
    labels.includes('删除当前提供商'),
    'v7: the destructive provider action lives in the bar, not in the strip',
  )
  const primary = byClass(tree, 'piai-btn-primary')
  assert.equal(primary.length, 1)
  assert.equal(primary[0].props.disabled, true, 'Save is disabled while the draft is clean')
})

test('the bar delete takes a second step and Escape cancels it (§15.2 item 9)', async () => {
  const harness = createReact()
  const removals = []
  const values = { providers: { alpha: { baseUrl: 'x' } } }
  const form = {
    createStagedForm: () => ({
      subscribe: () => () => {},
      getSnapshot: () => ({
        values,
        dirty: false,
        saving: false,
        invalid: false,
        error: undefined,
      }),
      edit: () => {},
      remove: (path) => removals.push(path),
      discard: () => {},
      save: () => {},
    }),
  }
  const page = await makePage(harness, { values, form })
  const hook = makeSelectorHook({ envelope: ENVELOPE })
  const render = () => {
    harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
    harness.flushEffects()
    return harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  }

  let tree = render()
  const arm = () =>
    nodes(tree).find(
      (node) => node.type === 'button' && node.props['aria-label'] === '删除当前提供商',
    )
  assert.ok(arm() !== undefined, 'the bar must offer the delete')
  assert.notEqual(arm().props.disabled, true, 'a writable controller with a provider allows it')

  arm().props.onClick()
  tree = render()
  assert.deepEqual(removals, [], 'the first click only arms the control')
  const alerts = nodes(tree).filter((node) => node.props.role === 'alert')
  assert.equal(alerts.length, 1, 'the armed state announces itself')
  assert.ok(textContent(alerts[0]).includes('alpha'), 'and names the provider it would delete')

  const group = nodes(tree).find((node) => node.props.role === 'group')
  assert.ok(group !== undefined, 'the armed control is a group with confirm/cancel')
  group.props.onKeyDown({ key: 'Escape' })
  tree = render()
  assert.equal(
    nodes(tree).filter((node) => node.props.role === 'alert').length,
    0,
    'Escape must restore the unarmed control',
  )
  assert.deepEqual(removals, [])

  arm().props.onClick()
  tree = render()
  const confirm = nodes(tree).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '确认删除',
  )
  assert.ok(confirm !== undefined)
  confirm.props.onClick()
  assert.deepEqual(
    JSON.parse(JSON.stringify(removals)),
    [['providers', 'alpha']],
    'the second step removes the selected provider once',
  )
})

test('the styles effect installs on mount and the disposer runs on cleanup', async () => {
  const harness = createReact()
  const calls = []
  const styles = {
    install: () => {
      calls.push('install')
      return () => calls.push('dispose')
    },
    uninstall: () => calls.push('uninstall'),
  }
  const owner = loadOwner(harness.react, [], { chunks: makeChunkStubs(harness.react, styles) })
  const applied = makeApplyCtx({ served: true })

  owner.apply(applied.ctx)
  await settle()
  assert.deepEqual(calls, ['install'], 'the stylesheet is installed on mount')

  applied.runCleanups()
  assert.deepEqual(calls, ['install', 'dispose'], 'cleanup runs the captured disposer')
})

test('the styles effect does not install while the namespace is unserved', async () => {
  const harness = createReact()
  const calls = []
  const styles = {
    install: () => {
      calls.push('install')
      return () => calls.push('dispose')
    },
    uninstall: () => {},
  }
  const owner = loadOwner(harness.react, [], { chunks: makeChunkStubs(harness.react, styles) })
  const applied = makeApplyCtx({ served: false })

  owner.apply(applied.ctx)
  await settle()

  assert.deepEqual(calls, [], 'an unserved deployment must not load or install the stylesheet')
  assert.deepEqual(applied.registrations, [], 'and must register no section')
})

test('a rejected styles chunk leaves the page rendering and does not throw', async () => {
  const harness = createReact()
  const owner = loadOwner(harness.react, [], {
    chunks: makeChunkStubs(harness.react, Promise.reject(new Error('styles 404'))),
  })
  const applied = makeApplyCtx({ served: true })

  assert.doesNotThrow(() => owner.apply(applied.ctx))
  await settle()

  // The styles failure must not poison the page chunks: ensureChunks still
  // resolves with all four page APIs plus a no-op styles stand-in.
  const loaded = await owner.__internals.ensureChunks()
  assert.equal(typeof loaded.schema.node, 'function')
  assert.equal(typeof loaded.form.createStagedForm, 'function')
  assert.equal(typeof loaded.fields.groupLeaves, 'function')
  assert.equal(typeof loaded.panels.ProviderPanel, 'function')
  assert.equal(typeof loaded.styles.install, 'function')

  const page = await makePageFrom(owner, loaded)
  const hook = makeSelectorHook({ envelope: ENVELOPE })
  let tree
  assert.doesNotThrow(() => {
    tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  })
  assert.equal(byClass(tree, 'piai-page').length, 1, 'the page still renders, just unstyled')

  applied.runCleanups()
})

test('a throwing styles install leaves the page rendering and does not throw', async () => {
  const harness = createReact()
  const owner = loadOwner(harness.react, [], {
    chunks: makeChunkStubs(harness.react, {
      install: () => {
        throw new Error('install exploded')
      },
      uninstall: () => {},
    }),
  })
  const applied = makeApplyCtx({ served: true })

  assert.doesNotThrow(() => owner.apply(applied.ctx))
  await settle()
  assert.doesNotThrow(() => applied.runCleanups())

  const loaded = await owner.__internals.ensureChunks()
  assert.equal(typeof loaded.panels.ProviderPanel, 'function')
})

test('the frozen strip class lives in the panels layer and piai-tab stays removed', () => {
  const owner = readFileSync(join(LIB, 'client.js'), 'utf8')
  const page = readFileSync(join(LIB, 'client.page.js'), 'utf8')
  // v10: the strip is emitted by the facade; the modules are scanned too, so a
  // retired class cannot come back in one of them unnoticed.
  const panels = [
    'client.panels.js',
    'client.panels.kit.js',
    'client.panels.controls.js',
    'client.panels.collections.js',
    'client.panels.render.js',
    'client.panels.instances.js',
    'client.panels.catalog.js',
  ]
    .map((name) => readFileSync(join(LIB, name), 'utf8'))
    .join('\n')

  for (const [name, source] of [
    ['client.js', owner],
    ['client.page.js', page],
    ['client.panels*.js', panels],
  ]) {
    const literals = new Set(source.match(/piai-[a-z0-9-]+/g) ?? [])
    assert.equal(literals.has('piai-tab'), false, `${name} must not resurrect piai-tab`)
    assert.equal(
      [...literals].some((entry) => entry.startsWith('piai-tab-')),
      false,
      `no piai-tab-* variant may remain in ${name}`,
    )
  }
  assert.equal(
    panels.includes("className: 'piai-tabs'") || panels.includes("'piai-tabs'"),
    true,
    'piai-tabs is the frozen strip container, emitted by the panels facade',
  )
})

test('R6 — the tab strip bar is two slots: the tablist left, the owner actions right', async () => {
  const harness = createReact()
  const record = {}
  const page = await makePage(harness, {
    values: { providers: { alpha: { baseUrl: 'x' } } },
    record,
  })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  let tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()
  tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))

  const strips = byClass(tree, 'piai-tabs')
  assert.equal(strips.length, 1)
  const bars = byClass(strips[0], 'piai-tabs-bar')
  assert.equal(bars.length, 1, 'the strip is one two-slot bar')

  // Left slot: the tablist, and only while a provider exists.
  const lists = byClass(bars[0], 'piai-provider-list')
  assert.equal(lists.length, 1, 'the left slot carries the tablist')
  assert.equal(lists[0].props.role, 'tablist')

  // Right slot: always rendered, and it carries the owner's action.
  const slots = byClass(bars[0], 'piai-item-actions')
  assert.equal(slots.length, 1, 'the right slot is always rendered')
  const toggle = nodes(slots[0]).find((node) => node.type === 'button')
  assert.ok(toggle !== undefined, 'the owner action renders inside the right slot')
  assert.equal(toggle.props.className, 'piai-btn')
  assert.equal(typeof toggle.props['aria-pressed'], 'boolean', 'aria-pressed is boolean, not a string')
  assert.equal(toggle.props['aria-pressed'], false, 'the form face is the default')
  assert.equal(textContent(toggle), 'rawCode', 'the label comes from the injected t')

  // The add panel stays a SIBLING of the bar, never inside it.
  assert.equal(
    byClass(bars[0], 'piai-provider-add').length,
    0,
    'the add panel must not nest inside the two-slot bar',
  )
  assert.equal(record.tabs.adding, false)
})

test('R6 — with no providers the right slot still renders (an empty action slot)', async () => {
  const harness = createReact()
  const page = await makePage(harness, { values: { providers: {} } })
  const hook = makeSelectorHook({ envelope: ENVELOPE })

  const tree = harness.render(harness.react.createElement(page, makeProps({ usePage: hook })))
  harness.flushEffects()

  const bars = byClass(tree, 'piai-tabs-bar')
  assert.equal(bars.length, 1)
  assert.equal(byClass(bars[0], 'piai-provider-list').length, 0, 'no tablist without providers')
  assert.equal(byClass(bars[0], 'piai-item-actions').length, 1, 'the right slot survives')
  assert.equal(
    nodes(byClass(bars[0], 'piai-item-actions')[0]).filter((node) => node.type === 'button').length,
    1,
    'the owner action is still offered without a provider',
  )
})

test('G — the raw toggle flips presentation only; the read-only face stages no write', async () => {
  const harness = createReact()
  const mutations = []
  let dirty = false
  const form = {
    createStagedForm: () => ({
      subscribe: () => () => {},
      getSnapshot: () => ({
        values: { providers: { alpha: { baseUrl: 'x' } } },
        dirty,
        saving: false,
        invalid: false,
        error: undefined,
      }),
      edit: () => mutations.push('edit'),
      remove: () => mutations.push('remove'),
      discard: () => mutations.push('discard'),
      save: () => mutations.push('save'),
    }),
  }
  const page = await makePage(harness, { values: { providers: { alpha: { baseUrl: 'x' } } }, form })
  const hook = makeSelectorHook({ envelope: ENVELOPE })
  const controller = {
    getSnapshot: () => ({ value: { providers: {} }, revision: 4, writable: true }),
    mutate: async () => {
      mutations.push('mutate')
      return true
    },
  }

  const render = () =>
    harness.render(harness.react.createElement(page, makeProps({ usePage: hook, controller })))

  let tree = render()
  harness.flushEffects()
  tree = render()
  assert.equal(byClass(tree, 'panel-provider').length, 1, 'the form face renders first')

  const toggleOf = (current) =>
    nodes(byClass(current, 'piai-item-actions')[0]).find((node) => node.type === 'button')

  // Flip to raw.
  dirty = true
  toggleOf(tree).props.onClick()
  tree = render()
  assert.equal(toggleOf(tree).props['aria-pressed'], true, 'the toggle reads as pressed')
  assert.equal(textContent(toggleOf(tree)), 'rawForm', 'the label names the face it returns to')
  assert.equal(byClass(tree, 'panel-provider').length, 0, 'raw mode replaces the form face')

  // The read-only notice is disclosed while the draft is dirty, and the body
  // carries the serialized draft (the stand-in yaml chunk).
  const hints = byClass(tree, 'piai-hint').map(textContent)
  assert.ok(
    hints.some((text) => text.indexOf('rawNotice') !== -1),
    'a dirty draft is announced as an unsaved read-only preview: ' + JSON.stringify(hints),
  )
  assert.ok(
    textContent(tree).indexOf('stub-yaml:') !== -1,
    'the raw face renders the serialized draft',
  )
  assert.equal(mutations.length, 0, 'switching faces must not stage or save anything')

  // Flip back.
  toggleOf(tree).props.onClick()
  tree = render()
  assert.equal(toggleOf(tree).props['aria-pressed'], false)
  assert.equal(byClass(tree, 'panel-provider').length, 1, 'the form face returns')
  assert.equal(mutations.length, 0, 'still nothing staged')
})

test('F — the catalog face follows remote.llm and degrades without it', async () => {
  const harness = createReact()
  const record = {}
  const page = await makePage(harness, { record })
  const hook = makeSelectorHook({ envelope: ENVELOPE })
  const discovered = []
  const catalog = {
    available: true,
    discover: (request) => {
      discovered.push(request)
      return Promise.resolve({ kind: 'found', models: [{ id: 'm-1' }] })
    },
  }

  let tree = harness.render(
    harness.react.createElement(page, makeProps({ usePage: hook, catalog })),
  )
  harness.flushEffects()
  tree = harness.render(
    harness.react.createElement(page, makeProps({ usePage: hook, catalog })),
  )

  assert.equal(record.panel.catalog.available, true, 'the available face reaches the panels chunk')
  const answer = await record.panel.catalog.discover()
  assert.equal(answer.kind, 'found')
  assert.deepEqual(answer.models, [{ id: 'm-1' }])

  // Without the remote the page must still render and hand down `undefined`.
  const bare = createReact()
  const bareRecord = {}
  const barePage = await makePage(bare, {
    record: bareRecord,
    values: { providers: { alpha: { baseUrl: 'x' } } },
  })
  const bareHook = makeSelectorHook({ envelope: ENVELOPE })
  const bareTree = bare.render(
    bare.react.createElement(barePage, makeProps({ usePage: bareHook })),
  )
  bare.flushEffects()
  assert.equal(byClass(bareTree, 'piai-page').length, 1, 'a host without remote.llm still renders')
  // The face is always handed down; availability is the explicit flag, so the
  // panels chunk never has to guess whether `catalog` means anything.
  assert.equal(bareRecord.panel.catalog.available, false, 'no remote.llm means an unavailable face')
  const bareAnswer = await bareRecord.panel.catalog.discover()
  assert.equal(bareAnswer.kind, 'refused', 'and discovery refuses instead of throwing')
})

test('F — the owner derives the discovery face from remote.llm.discoverModels', async () => {
  const harness = createReact()
  const owner = loadOwner(harness.react, [], { chunks: makeChunkStubs(harness.react, { install: () => () => {}, uninstall: () => {} }) })
  const requests = []
  const withRemote = makeApplyCtx({ served: true })
  withRemote.ctx.remote = {
    llm: {
      discoverModels: (ns, request) => {
        requests.push({ ns, request })
        return Promise.resolve({ ok: true, value: [{ id: 'gpt-x' }] })
      },
    },
  }
  owner.apply(withRemote.ctx)
  await settle()

  const face = withRemote.registrations[0].declaration.inject()
  assert.equal(face.catalog.available, true, 'the discovery remote is offered')
  const found = await face.catalog.discover({ provider: 'alpha' })
  // Cross-realm object (the bundle ran in a vm), so compare a JSON copy.
  assert.deepEqual(JSON.parse(JSON.stringify(found)), { kind: 'found', models: [{ id: 'gpt-x' }] })
  assert.equal(requests.length, 1)
  assert.equal(requests[0].ns, 'llm-pi-ai', 'discovery runs against the adapter namespace')

  // A hostile/absent namespace must degrade, never throw (AGENTS §3.1).
  const bare = loadOwner(harness.react, [], { chunks: makeChunkStubs(harness.react, { install: () => () => {}, uninstall: () => {} }) })
  const without = makeApplyCtx({ served: true })
  assert.doesNotThrow(() => bare.apply(without.ctx))
  await settle()
  const bareFace = without.registrations[0].declaration.inject()
  assert.equal(bareFace.catalog.available, false, 'no remote.llm means no discovery')
  const refused = await bareFace.catalog.discover({})
  assert.equal(refused.kind, 'refused', 'and the answer is a refusal, not a throw')
  assert.equal(typeof refused.message, 'string')
  assert.ok(refused.message.length > 0)
})

