/**
 * The read-only 「原代码」 face: the draft shown as YAML, and nothing else.
 *
 * The raw/form switch flips PRESENTATION only. This test drives the real page
 * component from the shipped chunks (`lib/client.page.js`'s `makePage`, reached
 * through the owner's documented `__internals.loadPage()` seam) with the real
 * `lib/client.yaml.js` serializer, and proves:
 *
 *   - the toggle the owner hands to the panels action slot selects the raw face;
 *   - the face renders `CodeBlock` when the primitives bundle ships it, and the
 *     local `<pre>` stand-in when it does not — never a throw;
 *   - the shown text is exactly `yaml.toYaml(draft)`, not a re-serialisation of
 *     the committed value;
 *   - a dirty draft shows the 「含未保存修改」 notice;
 *   - switching back restores the provider panel;
 *   - a missing serializer degrades to one bundled line;
 *   - the whole round trip stages no op and calls no `mutate`.
 *
 * The panels chunk supplies the action slot (`ProviderTabs` renders
 * `props.actions`); the raw face itself lives in the owner. The first describe
 * block drives that contract with a minimal stand-in, the last one drives the
 * REAL `lib/client.panels.js`.
 *
 * Run: node --test tests/raw.test.js
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import { loadCore } from './helpers/load-core.mjs'
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, '..', 'lib')
const OWNER_ID = 'dsh-llm-pi-ai-config'
const DICT = OWNER_ID

// --- the real serializer, through the documented chunk channel --------------
await import(pathToFileURL(join(LIB, 'client.yaml.js')).href)
const yamlApi = globalThis.__dshLlmPiAiConfig?.yaml
assert.ok(yamlApi, 'chunk published globalThis.__dshLlmPiAiConfig.yaml')

/** A namespace envelope shaped like the real `{uid, refs}` graph. */
const ENVELOPE = {
  uid: 1,
  refs: {
    1: { type: 'object', dict: { providers: 2 } },
    2: { type: 'dict', inner: 3 },
    3: { type: 'object', dict: {} },
  },
}

/* ------------------------------------------------------------------ *
 * The harness: a React that renders for real, one pass at a time.
 * Mirrors tests/render.test.js (hook cells persist across passes, so a
 * `useState` setter followed by a re-render behaves like React).
 * ------------------------------------------------------------------ */

function sameDeps(left, right) {
  if (left === undefined || right === undefined) return false
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function createReact(options = {}) {
  const cells = new Map()
  let current = null

  class Component {
    constructor(props) {
      this.props = props
      this.state = {}
    }

    setState(next) {
      this.state = Object.assign({}, this.state, typeof next === 'function' ? next(this.state) : next)
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
      instance.state = Object.assign({}, instance.state, type.getDerivedStateFromError(error) || {})
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
      return { kind: 'host', type, props: Object.assign({}, props, { children: renderNode(props.children) }) }
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

/** Primitives the owner resolves at load time, with/without `CodeBlock`. */
function makePrimitives(react, options = {}) {
  const primitives = {
    StateDot: (props) =>
      react.createElement('span', {
        'data-primitive': 'StateDot',
        'data-state': props.state,
        'aria-hidden': 'true',
      }),
  }
  if (options.codeBlock === true) {
    primitives.CodeBlock = (props) =>
      react.createElement('pre', { 'data-primitive': 'CodeBlock', 'data-lang': props.lang }, props.code)
  }
  return primitives
}

/** The panels contract for this face: `ProviderTabs` renders the action slot. */
function makePanelsStub(react) {
  return {
    ProviderTabs: (props) => {
      const items = Array.isArray(props.items) ? props.items : []
      const children = [
        react.createElement(
          'div',
          { key: 'list', className: 'piai-provider-list', role: 'tablist' },
          items.map((item) =>
            react.createElement(
              'button',
              { key: item.value, type: 'button', role: 'tab', onClick: () => props.onSelect(item.value) },
              item.label,
            ),
          ),
        ),
      ]
      if (props.actions !== undefined && props.actions !== null) {
        children.push(react.createElement('div', { key: 'actions', className: 'piai-item-actions' }, props.actions))
      }
      return react.createElement('div', { className: 'piai-tabs' }, children)
    },
    ProviderPanel: () => react.createElement('div', { className: 'panel-provider' }, 'provider panel'),
  }
}

/** Evaluate the shipped owner bundle with only the seed words it requires. */
function loadOwner(react, options = {}) {
  const registrations = []
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
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
    throw new Error(`raw test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    const fileName = specifier.startsWith('./') ? specifier.slice(2) : undefined
    const provided =
      options.chunks !== undefined && fileName !== undefined ? options.chunks[fileName] : undefined
    if (provided !== undefined) return provided
    if (fileName === undefined) throw new Error(`raw test: no chunk stub for ${specifier}`)
    // v10: the owner requests the shared base, the fields data and the page face
    // itself, so a chunk a test does not stub is loaded from the shipped file —
    // exactly what the browser loader does.
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    const record = registrations[before]
    if (record === undefined) throw new Error(`raw test: ${fileName} registered nothing`)
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

/** A section-render context exposing only what `apply()` touches. */
function makeApplyCtx(options = {}) {
  const registrations = []
  const dictionaries = new Map()
  const namespaces = [{ ns: 'llm-pi-ai', schema: ENVELOPE, value: {}, revision: 1 }]
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
    locale: {
      bind: (namespace) => (key) => (dictionaries.get(namespace) ?? {})[key] ?? key,
      register: (namespace, table) => {
        dictionaries.set(namespace, table.zh ?? table.en ?? {})
        return () => {}
      },
    },
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
      whileServed: (served, callback) => {
        const off = callback(new Set(served))
        return () => {
          if (typeof off === 'function') off()
        }
      },
    },
    effect: (callback) => {
      callback()
    },
  }
  if (options.remote !== undefined) ctx.remote = options.remote
  return {
    ctx,
    registrations,
    t: (key) => (dictionaries.get(DICT) ?? {})[key] ?? key,
    zh: dictionaries.get(DICT) ?? {},
  }
}

/** The chunk APIs `ensureChunks()` resolves, as a map for `makePage`. */
function makeChunks(react, options = {}) {
  const values = options.values ?? { providers: {} }
  return {
    // v10: the page reads `StateDot` / `CodeBlock` / `isComponent` off the shared
    // base chunk, so every chunk map carries the real core API.
    core: options.core ?? loadCore(react, options.primitives ?? makePrimitives(react)),
    schema: {
      node: (_envelope, ref) => {
        if (ref === 1) return { dict: { providers: 2 } }
        if (ref === 2) return { inner: 3 }
        return undefined
      },
      leaves: () => [],
    },
    form: {
      createStagedForm: () => ({
        subscribe: () => () => {},
        getSnapshot: () => ({
          values,
          dirty: options.dirty === true,
          saving: false,
          invalid: false,
          error: undefined,
        }),
        edit() {},
        remove() {},
        discard() {},
        save() {},
      }),
    },
    fields: { groupLeaves: () => [], profileLabel: () => undefined },
    yaml: 'yaml' in options ? options.yaml : yamlApi,
    panels: options.panels ?? makePanelsStub(react),
    styles: { install: () => () => {}, uninstall: () => {} },
  }
}

/** The page hook: a selector hook, exactly like the shipped binding. */
function makeSelectorHook(snapshot) {
  return (selector) => selector(snapshot)
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

function byClass(tree, className) {
  return nodes(tree).filter((node) => {
    const value = node.props.className
    return typeof value === 'string' && value.split(' ').indexOf(className) !== -1
  })
}

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

/** The one raw/form toggle the owner hands to the panel action slot. */
function rawToggle(tree) {
  const found = nodes(tree).filter(
    (node) => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean',
  )
  assert.equal(found.length, 1, 'the panel action slot must carry exactly one raw/form toggle')
  return found[0]
}

/**
 * Build the page once and expose render/click helpers over the same instance.
 *
 * v10: the page face is its own chunk, handed the owner's boundary class.
 */
async function makeHarness(scenario = {}) {
  const harness = createReact({ lazy: true })
  const primitives = scenario.primitives ?? makePrimitives(harness.react, { codeBlock: true })
  // v10: the page's primitives, including `CodeBlock`, are resolved by
  // `client.core.js`, so the chunk map has to see the same bundle the owner does.
  const chunks = makeChunks(harness.react, Object.assign({}, scenario, { primitives }))
  const owner = loadOwner(harness.react, { chunks, primitives })
  const applied = makeApplyCtx({ remote: scenario.remote })
  owner.apply(applied.ctx)

  const mutateCalls = []
  const controller =
    scenario.controller ?? {
      getSnapshot: () => ({ value: {}, revision: 4, writable: true }),
      subscribe: () => () => {},
      mutate: (ops, revision) => {
        mutateCalls.push({ ops, revision })
        return Promise.resolve(true)
      },
    }

  const pageApi = await owner.__internals.loadPage()
  const page = pageApi.makePage(chunks, { boundary: owner.__internals.pageBoundary })
  const element = harness.react.createElement(page, {
    usePage: makeSelectorHook({ envelope: ENVELOPE }),
    controller,
    validate: () => undefined,
    t: applied.t,
    catalog: scenario.catalog,
  })

  const draw = () => {
    const tree = harness.render(element)
    harness.flushEffects()
    return tree
  }
  /** Click the raw/form toggle and re-render, as the renderer would. */
  const toggle = (tree) => {
    rawToggle(tree).props.onClick()
    return draw()
  }
  return { harness, chunks, owner, applied, draw, toggle, mutateCalls, page, element }
}

/** The YAML a scenario's draft must render. */
function draftYaml(scenario) {
  return yamlApi.toYaml(scenario.values ?? { providers: {} })
}

describe('the raw face renders the draft, never the committed value', () => {
  test('the toggle selects the raw face and shows exactly toYaml(draft)', async () => {
    const scenario = { values: { providers: { alpha: { baseURL: 'https://api.example/v1' } } } }
    const harness = await makeHarness(scenario)

    const before = harness.draw()
    assert.equal(byClass(before, 'panel-provider').length, 1, 'form mode shows the provider panel')
    assert.equal(rawToggle(before).props['aria-pressed'], false)

    const after = harness.toggle(before)
    const blocks = nodes(after).filter((node) => node.props['data-primitive'] === 'CodeBlock')
    assert.equal(blocks.length, 1, 'the raw face must render CodeBlock when primitives ship it')
    assert.equal(blocks[0].props['data-lang'], 'yaml')
    assert.equal(textContent(blocks[0]), draftYaml(scenario), 'the shown text is the draft, serialised')
    assert.equal(byClass(after, 'panel-provider').length, 0, 'the provider panel is replaced while raw')
    assert.equal(rawToggle(after).props['aria-pressed'], true)
  })

  test('switching back restores the form panel', async () => {
    const harness = await makeHarness({ values: { providers: { alpha: {} } } })
    let tree = harness.draw()
    tree = harness.toggle(tree)
    assert.equal(byClass(tree, 'panel-provider').length, 0)
    tree = harness.toggle(tree)
    assert.equal(byClass(tree, 'panel-provider').length, 1, 'the form face comes back')
    assert.equal(nodes(tree).filter((node) => node.props['data-primitive'] === 'CodeBlock').length, 0)
  })

  test('a draft change is what the raw face shows', async () => {
    const scenario = { values: { providers: { alpha: { displayName: '"quoted"' } } } }
    const harness = await makeHarness(scenario)
    const tree = harness.toggle(harness.draw())
    const code = textContent(nodes(tree).find((node) => node.props['data-primitive'] === 'CodeBlock'))
    assert.equal(code, 'providers:\n  alpha:\n    displayName: "\\"quoted\\""')
    assert.equal(code, draftYaml(scenario))
  })

  test('a missing CodeBlock primitive falls back to the local <pre>', async () => {
    const scenario = { values: { providers: { alpha: {} } } }
    const harness = await makeHarness({
      ...scenario,
      primitives: makePrimitives(createReact({ lazy: true }).react),
    })
    const tree = harness.toggle(harness.draw())
    const pres = byClass(tree, 'piai-expr-body')
    assert.equal(pres.length, 1, 'the fallback <pre> carries the expression body class')
    assert.equal(textContent(pres[0]), draftYaml(scenario))
  })

  test('a dirty draft shows the unsaved-changes notice', async () => {
    const harness = await makeHarness({ values: { providers: { alpha: {} } }, dirty: true })
    const tree = harness.toggle(harness.draw())
    const text = textContent(tree)
    assert.match(text, /含未保存的修改/, 'the dirty draft must say it contains unsaved changes')
    assert.match(text, /只读预览/, 'the notice must say the view is read-only')
  })

  test('a clean draft shows the code without the notice', async () => {
    const harness = await makeHarness({ values: { providers: {} }, dirty: false })
    const tree = harness.toggle(harness.draw())
    assert.doesNotMatch(textContent(tree), /含未保存的修改/)
  })

  test('a missing serializer degrades to one bundled line instead of throwing', async () => {
    const harness = await makeHarness({ values: { providers: {} }, yaml: undefined })
    const tree = harness.toggle(harness.draw())
    assert.equal(byClass(tree, 'piai-page').length, 1, 'the page still renders')
    assert.equal(nodes(tree).filter((node) => node.props['data-primitive'] === 'CodeBlock').length, 0)
    assert.match(textContent(tree), /原代码视图不可用/)
  })

  test('the whole round trip stages no op and never calls mutate', async () => {
    const harness = await makeHarness({ values: { providers: { alpha: { baseURL: 'x' } } } })
    let tree = harness.draw()
    tree = harness.toggle(tree)
    tree = harness.toggle(tree)
    await Promise.resolve()
    assert.equal(harness.mutateCalls.length, 0, 'the raw face must not write')
    assert.equal(byClass(tree, 'piai-page').length, 1)
  })
})

describe('the real panels chunk supplies the toggle', () => {
  test('the shipped ProviderTabs renders the owner action slot', async () => {
    // T7 lands this slot; until then the real chunk drops `props.actions` and
    // this test is the red line that says so.
    const harness = createReact({ lazy: true })
    const registrations = []
    const sandbox = {
      console: { log() {}, warn() {}, error() {} },
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
    sandbox.window = sandbox
    sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
    createContext(sandbox)
    // v10: panels build against the shared base chunk, which must be loaded and
    // materialised (its factory publishes the built `ui` to the registry).
    runInContext(readFileSync(join(LIB, 'client.core.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.core.js'),
    })
    // v10: the panels facade composes the six panels modules out of the
    // registry, so they are materialised first.
    runInContext(readFileSync(join(LIB, 'client.panels.kit.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.kit.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.controls.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.controls.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.collections.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.collections.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.render.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.render.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.instances.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.instances.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.catalog.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.catalog.js'),
    })
    runInContext(readFileSync(join(LIB, 'client.panels.js'), 'utf8'), sandbox, {
      filename: join(LIB, 'client.panels.js'),
    })
    const record = registrations.find((entry) => entry.chunk === 'client.panels.js')
    assert.ok(record, 'the panels chunk must register itself')
    const requireStub = (specifier) => {
      if (specifier === 'react') return harness.react
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
        return makePrimitives(harness.react, { codeBlock: true })
      }
      throw new Error(`raw test: unexpected panels require(${JSON.stringify(specifier)})`)
    }
    const coreRecord = registrations.find((entry) => entry.chunk === 'client.core.js')
    assert.ok(coreRecord, 'the core chunk must register itself')
    coreRecord.factory(requireStub)
    const realPanels = record.factory(requireStub)

    const chunks = makeChunks(harness.react, { values: { providers: { alpha: {} } }, panels: realPanels })
    const owner = loadOwner(harness.react, { chunks })
    const applied = makeApplyCtx()
    owner.apply(applied.ctx)
    const pageApi = await owner.__internals.loadPage()
    const page = pageApi.makePage(chunks, { boundary: owner.__internals.pageBoundary })
    const tree = harness.render(
      harness.react.createElement(page, {
        usePage: makeSelectorHook({ envelope: ENVELOPE }),
        controller: {
          getSnapshot: () => ({ value: {}, revision: 4, writable: true }),
          subscribe: () => () => {},
          mutate: async () => true,
        },
        validate: () => undefined,
        t: applied.t,
      }),
    )
    assert.equal(
      nodes(tree).filter((node) => node.type === 'button' && typeof node.props['aria-pressed'] === 'boolean').length,
      1,
      'the real tab strip must render the owner-supplied raw/form toggle',
    )
  })
})
