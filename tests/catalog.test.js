/**
 * Model discovery: the read-only catalog remote the page offers to adopt from.
 *
 * `ctx.remote.llm.discoverModels(settingsNs, request)` is the shipped discovery
 * RPC. This plugin may not write config directly, so the whole surface is two
 * promises: activation never fails because the optional remote is missing or
 * malformed, and `discover()` always RESOLVES — `{kind:'found', models}` or
 * `{kind:'refused', message}` — so the page can never hang or crash on it.
 * Adoption is the panels chunk's `form.edit`, staged like any other change.
 *
 * This file pins the owner-level contract (the four discovery paths, plus the
 * missing/throwing remote) against real `lib/client.js` bytes, then the page
 * wiring that hands the catalog — and the probe assembled from the selected
 * provider's draft — down to the panel. The last describe block drives the REAL
 * `lib/client.panels.js`; it is the T7 red line until the catalog controls land
 * in that chunk.
 *
 * Run: node --test tests/catalog.test.js
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
const NS = 'llm-pi-ai'

/** A namespace envelope shaped like the real `{uid, refs}` graph. */
const ENVELOPE = {
  uid: 1,
  refs: {
    1: { type: 'object', dict: { providers: 2 } },
    2: { type: 'dict', inner: 3 },
    3: { type: 'object', dict: {} },
  },
}

// The catalog control lives in the `catalog: true` group of the REAL walk, so
// the UI layer drives the shipped schema/fields chunks against the real fixture
// envelope instead of a synthetic one (a stub walk renders no groups at all).
await import(pathToFileURL(join(LIB, 'client.schema.js')).href)
await import(pathToFileURL(join(LIB, 'client.fields.groups.js')).href)
await import(pathToFileURL(join(LIB, 'client.fields.hints.js')).href)
await import(pathToFileURL(join(LIB, 'client.fields.js')).href)
const schemaApi = globalThis.__dshLlmPiAiConfig?.schema
const fieldsApi = globalThis.__dshLlmPiAiConfig?.fields
assert.ok(schemaApi, 'chunk published globalThis.__dshLlmPiAiConfig.schema')
assert.ok(fieldsApi, 'chunk published globalThis.__dshLlmPiAiConfig.fields')
const FIXTURE = JSON.parse(readFileSync(join(HERE, 'fixtures', 'llm-pi-ai.schema.json'), 'utf8'))

/* ------------------------------------------------------------------ *
 * Harness (same proven shape as tests/render.test.js).
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

function makePrimitives(react) {
  return {
    StateDot: (props) =>
      react.createElement('span', {
        'data-primitive': 'StateDot',
        'data-state': props.state,
        'aria-hidden': 'true',
      }),
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
    throw new Error(`catalog test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    const fileName = specifier.startsWith('./') ? specifier.slice(2) : undefined
    const provided =
      options.chunks !== undefined && fileName !== undefined ? options.chunks[fileName] : undefined
    if (provided !== undefined) return provided
    if (fileName === undefined) throw new Error(`catalog test: no chunk stub for ${specifier}`)
    // v10: the owner requests the shared base, the fields data and the page face
    // itself; an unstubbed chunk comes from the shipped file, as in the browser.
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    const record = registrations[before]
    if (record === undefined) throw new Error(`catalog test: ${fileName} registered nothing`)
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
  const namespaces = [{ ns: NS, schema: ENVELOPE, value: {}, revision: 1 }]
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
  if (options.throwingRemote === true) {
    Object.defineProperty(ctx, 'remote', {
      get() {
        throw new Error('remote is not injected')
      },
    })
  } else if (options.remote !== undefined) {
    ctx.remote = options.remote
  }
  return {
    ctx,
    registrations,
    t: (key) => (dictionaries.get(DICT) ?? {})[key] ?? key,
  }
}

/** The chunk APIs `ensureChunks()` resolves, as a map for `makePage`. */
function makeChunks(react, options = {}) {
  const values = options.values ?? { providers: {} }
  const edits = options.edits ?? []
  return {
    // v10: the shared base chunk the page reads `StateDot` / `CodeBlock` /
    // `isComponent` off.
    core: options.core ?? loadCore(react, options.primitives ?? makeUiPrimitives(react)),
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
        getSnapshot: () => ({ values, dirty: false, saving: false, invalid: false, error: undefined }),
        edit: (path, value) => edits.push({ op: 'edit', path, value }),
        remove: (path) => edits.push({ op: 'remove', path }),
        discard() {},
        save() {},
      }),
    },
    fields: { groupLeaves: () => [], profileLabel: () => undefined },
    yaml: options.yaml ?? undefined,
    panels: options.panels ?? null,
    styles: { install: () => () => {}, uninstall: () => {} },
  }
}

function makeSelectorHook(snapshot) {
  return (selector) => selector(snapshot)
}

/** Apply the owner and hand back the `inject()` face it registered. */
function applyOwner(options = {}) {
  const harness = createReact({ lazy: true })
  const chunks = makeChunks(harness.react, options)
  const owner = loadOwner(harness.react, { chunks })
  const applied = makeApplyCtx(options)
  owner.apply(applied.ctx)
  assert.equal(
    applied.registrations.length,
    1,
    'apply() must register exactly one settings.section cell',
  )
  const registration = applied.registrations[0]
  assert.equal(registration.declaration.id, 'model-extended')
  const face = registration.declaration.inject()
  assert.ok(face.catalog, 'the inject face must expose the catalog channel')
  return { harness, chunks, owner, applied, registration, face }
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

function buttons(tree) {
  return nodes(tree).filter((node) => node.type === 'button')
}

function byClass(tree, className) {
  return nodes(tree).filter((node) => {
    const value = node.props.className
    return typeof value === 'string' && value.split(' ').indexOf(className) !== -1
  })
}

/** Walk the tree, recording each node's ancestors (for the action-slot check). */
function walk(tree, visit, ancestors = []) {
  if (tree === null || tree === undefined) return
  if (Array.isArray(tree)) {
    for (const child of tree) walk(child, visit, ancestors)
    return
  }
  if (typeof tree !== 'object') return
  visit(tree, ancestors)
  walk(tree.props.children, visit, ancestors.concat([tree]))
}

function findNodes(tree, predicate) {
  const found = []
  walk(tree, (node, ancestors) => {
    if (predicate(node)) found.push({ node, ancestors })
  })
  return found
}

function hasClass(node, className) {
  const value = node.props.className
  return typeof value === 'string' && value.split(' ').indexOf(className) !== -1
}

function disabledOf(node) {
  return (
    node.props.disabled === true ||
    node.props['aria-disabled'] === true ||
    node.props['aria-disabled'] === 'true'
  )
}

/** The frozen copy of the catalog face. */
const DISCOVER_LABEL = '获取可用模型'
const DISCOVER_BUSY = '正在询问提供商…'
const SELECTOR_TITLE = '选择要添加的模型'
const SELECT_ALL_LABEL = '全选'
const DESELECT_ALL_LABEL = '取消全选'
const ACCEPT_LABEL = '添加所选'
const EMPTY_HINT = '该提供商没有列出任何模型，请手动添加。'
const NO_MATCH = '没有匹配的模型。'

/** The one discovery control, in the models group's action slot. */
function discoveryEntry(tree) {
  const found = findNodes(
    tree,
    (node) =>
      node.type === 'button' &&
      (textContent(node) === DISCOVER_LABEL ||
        textContent(node) === DISCOVER_BUSY ||
        node.props['aria-label'] === DISCOVER_LABEL ||
        node.props['aria-label'] === DISCOVER_BUSY),
  )
  assert.equal(found.length, 1, `exactly one ${DISCOVER_LABEL} control must render`)
  return found[0]
}

/** `true` when the control sits in the group header's action slot. */
function inActionSlot(entry) {
  return entry.ancestors.some((node) => hasClass(node, 'piai-item-actions'))
}

/** `true` while the model selector is on screen. */
function selectorOpen(tree) {
  return (
    findNodes(tree, (node) => hasClass(node, 'piai-catalog')).length > 0 ||
    findNodes(tree, (node) => textContent(node) === SELECTOR_TITLE).length > 0
  )
}

function catalogList(tree) {
  const found = findNodes(tree, (node) => hasClass(node, 'piai-catalog'))
  assert.equal(found.length, 1, 'the open selector must render one .piai-catalog list')
  return found[0]
}

/** Click the one button carrying `text`. */
function clickByText(tree, text) {
  const found = findNodes(tree, (node) => node.type === 'button' && textContent(node) === text)
  assert.equal(found.length, 1, `exactly one ${text} button must render`)
  found[0].node.props.onClick()
}

/** The select-all control, whose label flips with the visible selection. */
function selectAllEntry(tree) {
  const found = findNodes(
    tree,
    (node) =>
      node.type === 'button' &&
      (textContent(node) === SELECT_ALL_LABEL || textContent(node) === DESELECT_ALL_LABEL),
  )
  assert.equal(found.length, 1, 'exactly one select-all control must render')
  return found[0]
}

function selectAllLabel(tree) {
  return textContent(selectAllEntry(tree).node)
}

function clickSelectAll(tree) {
  selectAllEntry(tree).node.props.onClick()
}

/** Type into the selector's search box, the way a controlled input reports it. */
function typeSearch(tree, value) {
  const found = findNodes(tree, (node) => node.props['aria-label'] === '搜索模型')
  assert.equal(found.length, 1, 'the selector must offer the 搜索模型 input')
  found[0].node.props.onChange({ target: { value } })
}

/** The ids of every checkbox row in the selector. */
function candidateIds(tree) {
  return findNodes(tree, (node) => hasClass(node, 'piai-dict-key')).map((entry) =>
    textContent(entry.node),
  )
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

/** Let a resolved discovery promise reach the panel's state and re-render. */
async function flushDiscovery() {
  await settle()
  await settle()
}

/**
 * A cross-realm plain copy.
 *
 * Values built inside the vm sandbox carry that realm's prototypes, so
 * `assert.deepEqual` (strict) would compare prototypes too and fail on structure
 * that is otherwise identical.
 */
function toPlain(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

/* ------------------------------------------------------------------ *
 * 1. The discovery remote contract (owner + ctx level).
 * ------------------------------------------------------------------ */

describe('discoverModels: the four paths', () => {
  test('found: ok:true with models resolves to kind:found', async () => {
    const calls = []
    const { face } = applyOwner({
      remote: {
        llm: {
          discoverModels: (ns, request) => {
            calls.push({ ns, request })
            return Promise.resolve({ ok: true, value: [{ id: 'gpt-5' }] })
          },
        },
      },
    })
    assert.equal(face.catalog.available, true)
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'found',
      models: [{ id: 'gpt-5' }],
    })
    assert.deepEqual(toPlain(calls), [{ ns: NS, request: { provider: 'alpha' } }])
  })

  test('empty: ok:true with an empty list is still kind:found', async () => {
    const { face } = applyOwner({
      remote: { llm: { discoverModels: () => Promise.resolve({ ok: true, value: [] }) } },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), { kind: 'found', models: [] })
  })

  test('a non-array payload cannot leak into the panel', async () => {
    const { face } = applyOwner({
      remote: { llm: { discoverModels: () => Promise.resolve({ ok: true, value: { nope: true } }) } },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), { kind: 'found', models: [] })
  })

  test('refused: ok:false reports the host message', async () => {
    const { face } = applyOwner({
      remote: {
        llm: {
          discoverModels: () => Promise.resolve({ ok: false, error: new Error('endpoint 401') }),
        },
      },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'refused',
      message: 'endpoint 401',
    })
  })

  test('refused: an unshaped answer reports the generic failure, not a crash', async () => {
    const { face } = applyOwner({
      remote: { llm: { discoverModels: () => Promise.resolve({}) } },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'refused',
      message: '模型发现失败。',
    })
  })

  test('refused: a rejected promise reports the error message', async () => {
    const { face } = applyOwner({
      remote: { llm: { discoverModels: () => Promise.reject(new Error('network down')) } },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'refused',
      message: 'network down',
    })
  })

  test('refused: a synchronous throw is contained', async () => {
    const { face } = applyOwner({
      remote: {
        llm: {
          discoverModels: () => {
            throw new Error('sync boom')
          },
        },
      },
    })
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'refused',
      message: 'sync boom',
    })
  })
})

describe('a missing or hostile discovery remote never breaks activation', () => {
  test('remote.llm absent: available false and discover refuses without calling anything', async () => {
    const { face, applied } = applyOwner({ remote: {} })
    assert.equal(face.catalog.available, false)
    assert.equal(applied.registrations.length, 1, 'the page cell is still registered')
    assert.deepEqual(toPlain(await face.catalog.discover({ provider: 'alpha' })), {
      kind: 'refused',
      message: '当前宿主不支持模型发现。',
    })
  })

  test('remote absent entirely', async () => {
    const { face } = applyOwner({})
    assert.equal(face.catalog.available, false)
    assert.equal((await face.catalog.discover({})).kind, 'refused')
  })

  test('remote.llm without discoverModels is not offered', async () => {
    const { face } = applyOwner({ remote: { llm: { somethingElse: true } } })
    assert.equal(face.catalog.available, false)
    assert.equal((await face.catalog.discover({})).kind, 'refused')
  })

  test('a non-object remote.llm is not offered', async () => {
    const { face } = applyOwner({ remote: { llm: 'not-a-service' } })
    assert.equal(face.catalog.available, false)
  })

  test('a throwing `ctx.remote` getter still registers the page', async () => {
    const { face, applied } = applyOwner({ throwingRemote: true })
    assert.equal(face.catalog.available, false)
    assert.equal(applied.registrations.length, 1)
    assert.equal((await face.catalog.discover({})).kind, 'refused')
  })
})

/* ------------------------------------------------------------------ *
 * 2. The page wiring: probe from the draft, catalog into the panel.
 * ------------------------------------------------------------------ */

describe('the page hands the catalog to the provider panel', () => {
  async function renderPanel(options) {
    const harness = createReact({ lazy: true })
    const captures = []
    const edits = options.edits ?? []
    const panels = {
      ProviderTabs: (props) =>
        harness.react.createElement('div', { className: 'piai-provider-list' }, props.label),
      ProviderPanel: (props) => {
        captures.push(props)
        return harness.react.createElement('div', { className: 'panel-provider' }, 'provider panel')
      },
    }
    const chunks = makeChunks(harness.react, { values: options.values, edits, panels })
    const owner = loadOwner(harness.react, { chunks })
    const applied = makeApplyCtx({ remote: options.remote })
    owner.apply(applied.ctx)
    const face = applied.registrations[0].declaration.inject()
    const pageApi = await owner.__internals.loadPage()
    const page = pageApi.makePage(chunks, { boundary: owner.__internals.pageBoundary })
    const element = harness.react.createElement(page, {
      usePage: makeSelectorHook({ envelope: ENVELOPE }),
      controller: {
        getSnapshot: () => ({ value: {}, revision: 4, writable: true }),
        subscribe: () => () => {},
        mutate: async () => true,
      },
      validate: () => undefined,
      t: applied.t,
      catalog: face.catalog,
    })
    // Two passes: the first render has no provider selected yet, and the effect
    // that selects the first one lands after it — exactly React's shape.
    harness.render(element)
    harness.flushEffects()
    captures.length = 0
    const tree = harness.render(element)
    harness.flushEffects()
    return { tree, captures, edits, face, harness }
  }

  test('the probe carries the selected provider, its baseURL and its api', async () => {
    const calls = []
    const { captures } = await renderPanel({
      values: { providers: { alpha: { baseURL: 'https://api.example/v1', api: 'anthropic-messages' } } },
      remote: {
        llm: {
          discoverModels: (ns, request) => {
            calls.push({ ns, request })
            return Promise.resolve({ ok: true, value: [{ id: 'm' }] })
          },
        },
      },
    })
    const panel = captures.find((props) => props.catalog !== undefined)
    assert.ok(panel, 'the provider panel must receive the catalog')
    assert.equal(panel.catalog.available, true)
    assert.deepEqual(toPlain(panel.catalog.probe), {
      provider: 'alpha',
      baseURL: 'https://api.example/v1',
      api: 'anthropic-messages',
    })
    assert.deepEqual(toPlain(await panel.catalog.discover()), { kind: 'found', models: [{ id: 'm' }] })
    assert.deepEqual(toPlain(calls), [
      { ns: NS, request: { provider: 'alpha', baseURL: 'https://api.example/v1', api: 'anthropic-messages' } },
    ])
  })

  test('an empty or unset field is absent from the probe, and an expression node too', async () => {
    const { captures } = await renderPanel({
      values: {
        providers: {
          alpha: { baseURL: '   ', api: { __jsExpr: 'process.env.API' } },
        },
      },
      remote: { llm: { discoverModels: () => Promise.resolve({ ok: true, value: [] }) } },
    })
    const panel = captures.find((props) => props.catalog !== undefined)
    assert.deepEqual(toPlain(panel.catalog.probe), { provider: 'alpha' })
  })

  test('with no discovery remote the panel is told it is unavailable, and the page renders', async () => {
    const { tree, captures } = await renderPanel({
      values: { providers: { alpha: {} } },
      remote: {},
    })
    assert.equal(byClass(tree, 'piai-page').length, 1)
    const panel = captures.find((props) => props.catalog !== undefined)
    assert.equal(panel.catalog.available, false)
  })
})

/* ------------------------------------------------------------------ *
 * 3. The real panels chunk: the frozen catalog UI contract (T7).
 *
 * Every string, class and merge rule below is the frozen T7 contract, not a
 * guess: the control is `获取可用模型` inside the models group's
 * `.piai-item-actions`, the selector is `.piai-catalog` in a `Modal`, and
 * adoption is exactly ONE `form.edit(['providers', p, 'models'], merged)` that
 * keeps every existing row object and appends the new candidates by id.
 * ------------------------------------------------------------------ */

function loadRealPanels(react, primitives) {
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
    if (specifier === 'react') return react
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`catalog test: unexpected panels require(${JSON.stringify(specifier)})`)
  }
  // v10: `client.core.js` must be materialised (its factory publishes the built
  // `ui`), because the panels chunk builds against it.
  const coreRecord = registrations.find((entry) => entry.chunk === 'client.core.js')
  assert.ok(coreRecord, 'the core chunk must register itself')
  coreRecord.factory(requireStub)
  return record.factory(requireStub)
}

/**
 * The primitives bundle the panels chunk reads.
 *
 * `Button` / `Input` / `Modal` are the three controls the frozen catalog
 * contract names; they render real host elements so a test can click and read
 * them. Any other primitive renders its children, so an unrelated import can
 * never break the tree.
 */
function makeUiPrimitives(react) {
  const explicit = {
    StateDot: (props) =>
      react.createElement('span', {
        'data-primitive': 'StateDot',
        'data-state': props.state,
        'aria-hidden': 'true',
      }),
    Button: (props) => {
      const children = props.children !== undefined ? props.children : props.label
      return react.createElement(
        'button',
        {
          type: props.type ?? 'button',
          className: props.className,
          disabled: props.disabled === true,
          'aria-label':
            props['aria-label'] !== undefined
              ? props['aria-label']
              : typeof children === 'string'
                ? children
                : undefined,
          onClick: props.onClick,
        },
        children,
      )
    },
    Input: (props) =>
      react.createElement('input', {
        type: props.type ?? 'text',
        className: props.className,
        value: props.value === undefined || props.value === null ? '' : props.value,
        placeholder: props.placeholder,
        disabled: props.disabled === true,
        'aria-label': props['aria-label'],
        onChange: props.onChange,
      }),
    Modal: (props) => {
      for (const key of ['open', 'visible', 'shown', 'isOpen', 'active']) {
        if (props[key] === false) return null
      }
      const parts = []
      if (props.title !== undefined) {
        parts.push(react.createElement('div', { key: 'title', className: 'piai-modal-title' }, props.title))
      }
      if (props.description !== undefined) {
        parts.push(
          react.createElement('p', { key: 'description', className: 'piai-modal-description' }, props.description),
        )
      }
      if (props.children !== undefined) {
        parts.push(react.createElement('div', { key: 'body' }, props.children))
      }
      if (props.footer !== undefined) {
        parts.push(react.createElement('div', { key: 'footer', className: 'piai-modal-footer' }, props.footer))
      }
      return react.createElement('div', { className: props.className ?? 'piai-modal' }, parts)
    },
  }
  return new Proxy(explicit, {
    get(target, property) {
      if (typeof property === 'symbol' || property === 'then') return undefined
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property]
      return (props) =>
        react.createElement(
          'div',
          { 'data-primitive': String(property) },
          props === undefined ? undefined : props.children,
        )
    },
  })
}

/** Chunk APIs for the real walk: real schema/fields, real panels, spy form. */
function makeRealChunks(react, options = {}) {
  const values = options.values ?? { providers: {} }
  const edits = options.edits ?? []
  const primitives = options.primitives ?? makeUiPrimitives(react)
  return {
    core: options.core ?? loadCore(react, primitives),
    schema: schemaApi,
    fields: fieldsApi,
    form: {
      createStagedForm: () => ({
        subscribe: () => () => {},
        getSnapshot: () => ({ values, dirty: false, saving: false, invalid: false, error: undefined }),
        edit: (path, value) => edits.push({ op: 'edit', path, value }),
        remove: (path) => edits.push({ op: 'remove', path }),
        discard() {},
        save() {},
      }),
    },
    yaml: undefined,
    panels: options.panels ?? loadRealPanels(react, primitives),
    styles: { install: () => () => {}, uninstall: () => {} },
  }
}

describe('the frozen catalog UI contract', () => {
  /** Render the shipped page with the real walk and the real panels chunk. */
  async function renderCatalogPage(options) {
    const harness = createReact({ lazy: true })
    const edits = []
    const mutateCalls = []
    const primitives = options.primitives ?? makeUiPrimitives(harness.react)
    const chunks = makeRealChunks(harness.react, {
      values: options.values,
      edits,
      primitives,
    })
    const owner = loadOwner(harness.react, { chunks, primitives })
    const applied = makeApplyCtx({ remote: options.remote })
    owner.apply(applied.ctx)
    const face = applied.registrations[0].declaration.inject()
    const pageApi = await owner.__internals.loadPage()
    const page = pageApi.makePage(chunks, { boundary: owner.__internals.pageBoundary })
    const element = harness.react.createElement(page, {
      usePage: makeSelectorHook({ envelope: FIXTURE }),
      controller: {
        getSnapshot: () => ({ value: {}, revision: 4, writable: true }),
        subscribe: () => () => {},
        mutate: (ops, revision) => {
          mutateCalls.push({ ops, revision })
          return Promise.resolve(true)
        },
      },
      validate: () => undefined,
      t: applied.t,
      catalog: face.catalog,
    })
    const draw = () => {
      const tree = harness.render(element)
      harness.flushEffects()
      return tree
    }
    draw() // first pass: no provider selected yet
    return { harness, draw, edits, mutateCalls, face, chunks }
  }

  /** Open the page and click the discovery control without settling. */
  function clickDiscovery(env) {
    const tree = env.draw()
    discoveryEntry(tree).node.props.onClick()
    return env.draw()
  }

  const FOUND = (models) => ({ ok: true, value: models })

  test('the control lives in the models group action slot and is disabled without the remote', async () => {
    const env = await renderCatalogPage({ values: { providers: { alpha: {} } }, remote: {} })
    const tree = env.draw()
    const entry = discoveryEntry(tree)
    assert.equal(textContent(entry.node), DISCOVER_LABEL)
    assert.equal(entry.node.props['aria-label'], DISCOVER_LABEL)
    assert.equal(disabledOf(entry.node), true, 'an unavailable remote must disable the control')
    assert.equal(inActionSlot(entry), true, 'the control belongs to the group header action slot')
  })

  test('while the request is in flight the control says so and stays disabled', async () => {
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: { llm: { discoverModels: () => pending } },
    })
    const busy = clickDiscovery(env)
    const entry = discoveryEntry(busy)
    assert.equal(textContent(entry.node), DISCOVER_BUSY, 'the busy copy is the frozen one')
    assert.equal(disabledOf(entry.node), true, 'a request in flight disables the control')

    release(FOUND([{ id: 'gpt-5', name: 'GPT-5' }]))
    await flushDiscovery()
    const settled = env.draw()
    assert.equal(textContent(discoveryEntry(settled).node), DISCOVER_LABEL)
  })

  test('found + non-empty opens the selector with one checkbox row per model', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(FOUND([{ id: 'gpt-5', name: 'GPT-5', contextWindow: 400000 }])),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    const tree = env.draw()
    assert.equal(selectorOpen(tree), true, 'a non-empty answer opens the selector')
    catalogList(tree)
    const checks = findNodes(tree, (node) => node.type === 'input' && node.props.type === 'checkbox')
    assert.equal(checks.length, 1, 'one checkbox per discovered model')
    assert.deepEqual(candidateIds(tree), ['gpt-5'])
    assert.ok(
      findNodes(tree, (node) => textContent(node) === SELECTOR_TITLE).length >= 1,
      'the selector shows its frozen title',
    )
  })

  test('a refusal shows the host message verbatim and opens nothing', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: { discoverModels: () => Promise.resolve({ ok: false, error: { message: 'endpoint 401' } }) },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    const tree = env.draw()
    const errors = findNodes(tree, (node) => hasClass(node, 'piai-error'))
    assert.ok(
      errors.some((entry) => textContent(entry.node) === 'endpoint 401'),
      'the refusal copy is the host message, not a replacement',
    )
    assert.equal(selectorOpen(tree), false, 'a refusal must not open the selector')
  })

  test('an empty answer shows the empty hint and opens nothing', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: { llm: { discoverModels: () => Promise.resolve(FOUND([])) } },
    })
    clickDiscovery(env)
    await flushDiscovery()
    const tree = env.draw()
    const hints = findNodes(tree, (node) => hasClass(node, 'piai-hint'))
    assert.ok(
      hints.some((entry) => textContent(entry.node) === EMPTY_HINT),
      'an empty catalog gets the frozen hint',
    )
    assert.equal(selectorOpen(tree), false, 'an empty answer must not open the selector')
  })

  test('a search with no match reports the frozen status line', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(FOUND([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    typeSearch(env.draw(), 'zzz')
    const tree = env.draw()
    const statuses = findNodes(tree, (node) => node.props.role === 'status')
    assert.ok(
      statuses.some((entry) => textContent(entry.node) === NO_MATCH),
      'an unmatched search says so',
    )
    assert.deepEqual(candidateIds(tree), [])
  })

  test('adopting writes ONE merged array edit and never overwrites an existing row', async () => {
    const kept = { id: 'kept', name: 'Kept As Configured', contextWindow: 1234 }
    const other = { id: 'other', name: 'Other' }
    const env = await renderCatalogPage({
      values: { providers: { alpha: { models: [kept, other] } } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(
              FOUND([
                { id: 'kept', name: 'SHOULD NOT WIN', contextWindow: 999999 },
                {
                  id: 'fresh',
                  name: 'Fresh',
                  contextWindow: 200000,
                  maxTokens: 8000,
                  inputModalities: ['text', 'image', 'audio'],
                },
              ]),
            ),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    clickSelectAll(env.draw())
    clickByText(env.draw(), ACCEPT_LABEL)
    await flushDiscovery()

    const modelEdits = env.edits.filter(
      (entry) => Array.isArray(entry.path) && entry.path[0] === 'providers' && entry.path[2] === 'models',
    )
    assert.equal(modelEdits.length, 1, 'adoption is exactly one form.edit of the whole array')
    assert.deepEqual(toPlain(modelEdits[0].path), ['providers', 'alpha', 'models'])
    const merged = modelEdits[0].value
    assert.equal(Array.isArray(merged), true, 'the edit writes the merged array')
    assert.equal(merged.length, 3, 'two existing rows plus one appended candidate')
    assert.equal(merged[0], kept, 'the existing row keeps its identity')
    assert.equal(merged[1], other, 'and its index')
    assert.deepEqual(toPlain(merged[0]), kept, 'a same-id candidate may not rewrite the row')
    assert.deepEqual(toPlain(merged[2]), {
      id: 'fresh',
      name: 'Fresh',
      contextWindow: 200000,
      maxTokens: 8000,
      input: ['text', 'image'],
    })
    assert.equal(selectorOpen(env.draw()), false, 'adoption closes the selector')
    assert.equal(env.mutateCalls.length, 0, 'adoption stages a draft; it never saves')
  })

  test('select-all takes only the rows the search shows', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(FOUND([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    // Discovery pre-selects every candidate that is not already a row, so the
    // control starts on 「取消全选」: clear everything before scoping a select-all.
    assert.equal(selectAllLabel(env.draw()), DESELECT_ALL_LABEL)
    clickSelectAll(env.draw())
    typeSearch(env.draw(), 'a') // only `a` is visible now
    assert.equal(selectAllLabel(env.draw()), SELECT_ALL_LABEL, 'nothing is selected after the clear')
    clickSelectAll(env.draw()) // picks the visible row only
    typeSearch(env.draw(), '')
    clickByText(env.draw(), ACCEPT_LABEL)
    await flushDiscovery()

    const merged = env.edits.find((entry) => Array.isArray(entry.value))?.value ?? []
    const added = merged.filter((model) => model !== null && ['a', 'b', 'c'].includes(model.id))
    assert.deepEqual(toPlain(added.map((model) => model.id)), ['a'], 'select-all covers the visible row only')
  })

  test('deselect-all clears the selection the search is hiding', async () => {
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(FOUND([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }])),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()
    typeSearch(env.draw(), 'a') // `a` visible and picked; `b` picked but hidden
    assert.equal(selectAllLabel(env.draw()), DESELECT_ALL_LABEL)
    clickSelectAll(env.draw()) // the frozen rule clears ALL, hidden rows included
    typeSearch(env.draw(), '')
    assert.equal(selectAllLabel(env.draw()), SELECT_ALL_LABEL, 'the hidden row was cleared too')
    const before = env.edits.length
    clickByText(env.draw(), ACCEPT_LABEL)
    await flushDiscovery()

    const merged = env.edits.slice(before).find((entry) => Array.isArray(entry.value))?.value ?? []
    const added = merged.filter((model) => model !== null && ['a', 'b'].includes(model.id))
    assert.deepEqual(toPlain(added), [], 'nothing stays selected after deselect-all')
  })

  test('a candidate row shows only its id; the name lives in title and stays searchable', async () => {
    // T25: the shipped Models picker renders the raw id as the row's only text
    // and keeps the display name in `title`. These three assertions are the
    // regression guard: the shape (checkbox + id chip, no name span), the title
    // fallback (name -> id), and — most importantly — that the now-HIDDEN name
    // is still matched by the search.
    const env = await renderCatalogPage({
      values: { providers: { alpha: {} } },
      remote: {
        llm: {
          discoverModels: () =>
            Promise.resolve(
              FOUND([
                { id: 'plain-id' }, // no name at all
                { id: 'same-id', name: 'same-id' }, // name === id
                { id: 'model-x', name: 'Friendly Name' }, // a distinct display name
              ]),
            ),
        },
      },
    })
    clickDiscovery(env)
    await flushDiscovery()

    const rows = catalogList(env.draw()).node.props.children
    assert.equal(rows.length, 3, 'one row per candidate')
    for (const row of rows) {
      assert.equal(row.type, 'label', 'a candidate row is a label')
      const children = row.props.children
      // `children` is built inside the vm realm, so compare a plain copy (the
      // same cross-realm reason `toPlain` exists for the ops below).
      assert.deepEqual(
        toPlain(children.map((child) => child.type)),
        ['input', 'code'],
        'T25: a candidate row is exactly a checkbox plus the raw id — no name span',
      )
      const id = textContent(children[1])
      assert.equal(
        textContent(row),
        id,
        'the row carries exactly one visible text (the raw id), never the name as well',
      )
      assert.equal(
        children[1].props.title,
        id === 'model-x' ? 'Friendly Name' : id,
        'the chip title is the display name, falling back to the id',
      )
    }
    assert.deepEqual(candidateIds(env.draw()), ['plain-id', 'same-id', 'model-x'])

    // The visible id still filters.
    typeSearch(env.draw(), 'model-x')
    const byId = catalogList(env.draw()).node.props.children
    assert.equal(byId.length, 1, 'searching the visible id matches its row')
    assert.equal(textContent(byId[0]), 'model-x')

    // The hidden name still filters — `friendly` is not a substring of any id,
    // so this can only pass because the name is still part of the search.
    typeSearch(env.draw(), 'friendly')
    const byName = catalogList(env.draw()).node.props.children
    assert.equal(byName.length, 1, 'the hidden display name stays searchable')
    assert.equal(textContent(byName[0]), 'model-x', 'and the matched row still shows only its id')

    // A miss falls back to the frozen status line (no list at all).
    typeSearch(env.draw(), 'no-such-model')
    assert.equal(selectorOpen(env.draw()), true, 'the selector stays open on a miss')
    assert.ok(
      findNodes(env.draw(), (node) => node.props.role === 'status').length >= 1,
      'an unmatched search reports the frozen status line',
    )
  })
})
