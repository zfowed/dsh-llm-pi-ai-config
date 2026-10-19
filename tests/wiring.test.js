/**
 * Integration test for the bundle owner, `lib/client.js`.
 *
 * The owner is a browser classic script: it calls
 * `window.__ModuleLoader__.load({id, factory})` and pulls its four chunks in with
 * `require.async("./client.<name>.js")`. None of that runs under `node --test`
 * unaided, so this file implements the small part of the loader contract the
 * owner depends on — and nothing more:
 *
 *   - `window.__ModuleLoader__.load` that records registrations
 *   - seed words for `react`, `react/jsx-runtime`, `@deepseek-ai/dsh-client-store`
 *   - `require.async` that loads a real chunk file into the same sandbox and
 *     returns its factory result, exactly as the browser module table does
 *
 * Against the shipped bytes, it proves:
 *
 *   1. the owner registers with **no** `chunk` field, and each chunk registers
 *      under its own file name and the owner id;
 *   2. every chunk the page can request exists, satisfies the loader's
 *      `client.<name>.js` rule, and exposes the API the panels expect;
 *   3. `apply()` registers one `settings.section` cell with a fresh id and the
 *      expected order, and only while `llm-pi-ai` is served;
 *   4. with the namespace absent nothing is registered and no chunk is fetched;
 *   5. the injected validator delegates to the settings schema service.
 *
 * @module dsh-llm-pi-ai-config/tests/wiring
 */

import { readFileSync } from 'node:fs'
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

/**
 * The chunks the page is allowed to request, in load order.
 *
 * T7 inserts `client.yaml.js` between `fields` and `panels`: the read-only
 * "raw YAML" view of the draft is a pure browser chunk like any other, and the
 * owner requests it before `panels` because the panels' raw face consumes it.
 */
const CHUNKS = [
  // v10 phase 0: no chunk-to-chunk dependency. `client.core.js` owns the shared
  // helpers and the primitives resolution every later chunk builds against.
  'client.core.js',
  'client.schema.js',
  'client.form.js',
  'client.fields.groups.js',
  'client.fields.hints.js',
  'client.yaml.js',
  // v10 phase 0: the stylesheet fragments the facade composes.
  'client.styles.chrome.js',
  'client.styles.controls.js',
  // v10 phase 0: the panels modules, each publishing one `create<X>` factory.
  'client.panels.kit.js',
  'client.panels.controls.js',
  'client.panels.collections.js',
  'client.panels.render.js',
  'client.panels.instances.js',
  'client.panels.catalog.js',
  // v10 phase 1: `client.fields.js` needs the two data chunks above;
  // `client.panels.js` reads `client.core.js` out of the registry.
  'client.fields.js',
  'client.panels.js',
  // The page face reads the whole chunk bag, and is requested by the owner once
  // `ensureChunks()` has resolved.
  'client.page.js',
  // v10 phase 1: the sheet facade composes the two phase-0 area fragments.
  'client.styles.js',
]

/** Seed words a bundle may require, stubbed to the minimum the owner uses. */
function seedWords() {
  const react = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? undefined : initial, () => {}],
    useEffect: () => {},
    useMemo: (factory) => factory(),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
    lazy: () => function LazyStub() {},
    Suspense: function SuspenseStub() {},
  }
  return {
    react,
    'react/jsx-runtime': {
      jsx: react.createElement,
      jsxs: react.createElement,
      Fragment: Symbol('Fragment'),
    },
    '@deepseek-ai/dsh-client-ui-primitives': {
      Checkbox: function CheckboxStub() {},
      Button: function ButtonStub() {},
      Input: function InputStub() {},
      SettingsForm: function SettingsFormStub() {},
      SettingsFormModel: function SettingsFormModelStub() {},
      SettingsValueField: function SettingsValueFieldStub() {},
      SettingsSecretField: function SettingsSecretFieldStub() {},
      settingsTextField: () => ({}),
      settingsNumberField: () => ({}),
    },
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let current = initial
        const listeners = new Set()
        return {
          getSnapshot: () => current,
          set: (next) => {
            current = next
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
}

/**
 * Load one bundle file in a sandbox that records its registration.
 *
 * @param sandbox - shared vm context, so chunks and owner see one globalThis.
 * @param file - absolute bundle path.
 * @returns the single registration that file performed.
 */
function loadBundle(sandbox, file) {
  const before = sandbox.window.__ModuleLoader__.registrations.length
  runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  const added = sandbox.window.__ModuleLoader__.registrations.slice(before)
  assert.equal(added.length, 1, `${file} must call __ModuleLoader__.load exactly once`)
  return added[0]
}

/**
 * Build the mini loader and evaluate the owner bundle.
 *
 * @returns `{owner, requireStub, requested}`.
 */
function loadOwner() {
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
  }
  sandbox.globalThis = sandbox
  // In a browser `window === globalThis`; the chunks read `global.__ModuleLoader__`
  // and the owner writes `window.__ModuleLoader__`, so the harness must alias them.
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  sandbox.window = sandbox
  createContext(sandbox)

  const seeds = seedWords()
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`wiring test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    requested.push(specifier)
    assert.ok(specifier.startsWith('./'), `a chunk request must be relative: ${specifier}`)
    const fileName = specifier.slice(2)
    assert.match(fileName, CLIENT_CHUNK, `chunk ${fileName} must match client.<name>.js`)
    const registration = loadBundle(sandbox, join(LIB, fileName))
    assert.equal(registration.chunk, fileName, 'a chunk registers under its own file name')
    assert.equal(registration.id, OWNER_ID, 'a chunk registers under the owner id')
    return registration.factory(requireStub)
  }

  const owner = loadBundle(sandbox, join(LIB, 'client.js'))
  assert.equal(owner.id, OWNER_ID)
  assert.equal(owner.chunk, undefined, 'the owner bundle carries no chunk field')
  return { owner, requireStub, requested, sandbox }
}

/**
 * A settings context stub exposing only what `apply()` touches.
 *
 * @param options - `{served, schemaService}`.
 */
function makeCtx(options) {
  const registrations = []
  const cleanups = []
  let watched
  const namespaces = options.served
    ? [
        {
          ns: 'llm-pi-ai',
          schema: { uid: 1, refs: { 1: { type: 'object', meta: {}, dict: {} } } },
          value: { providers: {} },
          revision: 4,
        },
      ]
    : []
  const mirror = {
    getSnapshot: () => ({ view: { namespaces } }),
    subscribe: () => () => {},
    ensure: () => {},
  }
  const controller = {
    getSnapshot: () => ({ value: { providers: {} }, revision: 4, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const ctx = {
    locale: { bind: () => (key) => key, register: () => () => {} },
    settingsSchema: options.schemaService ?? {
      rehydrate: (value) => value,
      validate: () => undefined,
    },
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
      whileServed: (watchedNamespaces, register) => {
        watched = watchedNamespaces
        const off = options.served ? register(new Set(watchedNamespaces)) : undefined
        return () => {
          if (typeof off === 'function') off()
        }
      },
    },
    effect: (callback) => {
      const off = callback()
      if (typeof off === 'function') cleanups.push(off)
    },
    remote: options.remote,
  }
  return { ctx, registrations, cleanups, watched: () => watched }
}

test('the owner bundle registers itself with no chunk and exports its surface', () => {
  const { owner, requireStub } = loadOwner()
  const exported = owner.factory(requireStub)
  assert.equal(typeof exported.apply, 'function')
  // Spread into a host array: `inject` was built inside the vm realm.
  // T7 adds `remote.llm`: the model-catalog picker talks to the shipped
  // discovery RPC `remote.llm.discoverModels`, right after the credential
  // namespace (AGENTS.md §3.1: never read a namespace that was not injected).
  assert.deepEqual([...exported.inject], [
    'slots',
    'locale',
    'remote',
    'remote.settings',
    'remote.credentials',
    'remote.llm',
    'configForms',
    'settingsSchema',
  ])
  assert.equal(exported.NAMESPACE, 'llm-pi-ai')
  assert.equal(exported.SECTION_ID, 'model-extended', 'a fresh id must not replace the models cell')
  assert.equal(exported.SECTION_ORDER, 12)
})

test('every chunk the page requests exists and exposes its expected API', async () => {
  const { requireStub, sandbox } = loadOwner()
  const loaded = {}
  for (const fileName of CHUNKS) {
    loaded[fileName] = await requireStub.async(`./${fileName}`)
  }
  assert.deepEqual(
    Object.keys(loaded),
    CHUNKS,
    'the chunks must match the names the owner asks for',
  )
  assert.equal(typeof loaded['client.schema.js'].leaves, 'function')
  assert.equal(typeof loaded['client.schema.js'].node, 'function')
  assert.equal(typeof loaded['client.form.js'].createStagedForm, 'function')
  assert.equal(typeof loaded['client.form.js'].diffOps, 'function')
  assert.equal(typeof loaded['client.fields.js'].groupLeaves, 'function')
  assert.equal(typeof loaded['client.fields.js'].compatGate, 'function')
  // T7's yaml chunk turns the draft into the read-only raw view. It is a
  // chunk like any other: the owner must be able to load it, and the panels'
  // raw face must survive its absence (`yaml` is allowed to be `undefined`),
  // so the only frozen surface is the converter itself.
  assert.equal(typeof loaded['client.yaml.js'].toYaml, 'function')
  // The styles chunk (§7) is a chunk like any other: STYLESHEET + CLASSES and an
  // idempotent install/uninstall pair. Its absence used to be invisible here.
  assert.equal(typeof loaded['client.styles.js'].STYLESHEET, 'string')
  assert.equal(Array.isArray(loaded['client.styles.js'].CLASSES), true)
  assert.equal(typeof loaded['client.styles.js'].install, 'function')
  assert.equal(typeof loaded['client.styles.js'].uninstall, 'function')
  // The panels chunk's factory returns the components themselves, which is what
  // the owner receives from `require.async`.
  for (const name of ['ProviderTabs', 'ProviderPanel']) {
    assert.equal(
      typeof loaded['client.panels.js'][name],
      'function',
      `${name} must be a component on the chunk's exports`,
    )
  }
  // The registry additionally keeps the deferred factory that Node tests use.
  const registry = sandbox.__dshLlmPiAiConfig.panels
  assert.equal(typeof registry.createPanels, 'function')
  const built = registry.createPanels(requireStub)
  assert.deepEqual(
    [...Object.keys(built)].sort(),
    ['ProviderPanel', 'ProviderTabs'],
  )
})

test('the owner requests exactly the declared chunks, stylesheet and yaml included', async () => {
  const served = makeCtx({ served: true })
  const { owner, requireStub, requested } = loadOwner()
  assert.equal(owner.chunk, undefined, 'the owner bundle carries no chunk field')
  owner.factory(requireStub).apply(served.ctx)
  // The owner asks for phase 1 only after phase 0 has been materialised, so the
  // last request lands a microtask later (v10: `client.panels.js` reads
  // `client.core.js` out of the registry).
  await new Promise((resolve) => setImmediate(resolve))

  assert.deepEqual(
    [...requested].sort(),
    [
      './client.core.js',
      './client.fields.groups.js',
      './client.fields.hints.js',
      './client.fields.js',
      './client.form.js',
      './client.page.js',
      './client.panels.catalog.js',
      './client.panels.collections.js',
      './client.panels.controls.js',
      './client.panels.instances.js',
      './client.panels.js',
      './client.panels.kit.js',
      './client.panels.render.js',
      './client.schema.js',
      './client.styles.chrome.js',
      './client.styles.controls.js',
      './client.styles.js',
      './client.yaml.js',
    ],
    'a dropped or renamed chunk request (including the stylesheet and yaml) must fail here',
  )
  assert.ok(
    requested.indexOf('./client.core.js') < requested.indexOf('./client.panels.js'),
    'the shared base chunk must be requested in the phase before its consumers',
  )
})

test('apply() registers one settings cell and follows the adapter namespace', () => {
  const served = makeCtx({ served: true })
  const { owner, requireStub } = loadOwner()
  owner.factory(requireStub).apply(served.ctx)

  assert.deepEqual([...served.watched()], ['llm-pi-ai'])
  assert.equal(served.registrations.length, 1)
  const { declaration, component } = served.registrations[0]
  assert.equal(declaration.name, 'settings.section')
  assert.equal(declaration.id, 'model-extended')
  assert.equal(declaration.order, 12)
  assert.equal(declaration.locale, 'dsh-llm-pi-ai-config')
  assert.equal(typeof declaration.label, 'function')
  assert.equal(typeof declaration.inject, 'function')
  assert.equal(typeof component, 'function')

  const injected = declaration.inject()
  assert.equal(typeof injected.validate, 'function')
  assert.equal(typeof injected.t, 'function')
  assert.ok(injected.controller !== undefined)
  assert.ok(injected.hooks.page !== undefined, 'the cell reads its view through a hook store')
})

test('with the adapter absent, apply() registers nothing and fetches no chunk', () => {
  const missing = makeCtx({ served: false })
  const { owner, requireStub, requested } = loadOwner()
  owner.factory(requireStub).apply(missing.ctx)
  assert.deepEqual([...missing.watched()], ['llm-pi-ai'])
  assert.deepEqual(missing.registrations, [], 'an unserved namespace must leave no trace')
  assert.deepEqual(requested, [], 'no chunk may be fetched while the page is not registered')
})

test('the injected validator delegates to the settings schema service', () => {
  const calls = []
  const served = makeCtx({
    served: true,
    schemaService: {
      rehydrate: (envelope) => ({ rehydrated: envelope }),
      validate: (node, draft) => {
        calls.push({ node, draft })
        return 'validation-message'
      },
    },
  })
  const { owner, requireStub } = loadOwner()
  owner.factory(requireStub).apply(served.ctx)
  const validator = served.registrations[0].declaration.inject().validate

  assert.equal(validator({ uid: 7 }, { a: 1 }), 'validation-message')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].node, { rehydrated: { uid: 7 } })
  assert.deepEqual(calls[0].draft, { a: 1 })
})

test('a throwing schema service disables validation instead of breaking the page', () => {
  const served = makeCtx({
    served: true,
    schemaService: {
      rehydrate: () => {
        throw new Error('malformed envelope')
      },
      validate: () => undefined,
    },
  })
  const { owner, requireStub } = loadOwner()
  owner.factory(requireStub).apply(served.ctx)
  const validator = served.registrations[0].declaration.inject().validate
  assert.equal(validator({ uid: 1 }, {}), undefined)
})

/**
 * The primitive resolver must accept the shapes the shipped bundle really
 * exports.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` exports `Button` and `Input` as
 * `React.forwardRef(...)` and `DisclosureRow` as `React.memo(...)` — objects, not
 * functions. A resolver written as `typeof export === 'function'` therefore
 * treats all three as missing and silently swaps in the local stand-ins, which
 * is exactly the "inputs and buttons have no style" defect recorded in
 * docs/verification.md §11. This guard keeps the resolver shape-based.
 */
test('primitive resolution is shape-based, and defined exactly once', () => {
  // v10: the resolver, the wrapper tags and every local stand-in live in
  // `client.core.js` only. The owner consumes it off `chunks.core`, the panels
  // chunk via `resolveCore`, so a second copy here is the regression this guard
  // exists to catch.
  for (const fileName of ['client.js', 'client.panels.js']) {
    const source = readFileSync(join(LIB, fileName), 'utf8')
    assert.equal(
      source.includes('function isComponent('),
      false,
      `${fileName} must consume core's isComponent instead of defining one`,
    )
    assert.equal(
      /typeof (found|candidate|component|value) === 'function'/.test(source),
      false,
      `${fileName} must not judge a primitive export by typeof === 'function'`,
    )
  }

  const source = readFileSync(join(LIB, 'client.core.js'), 'utf8')
  assert.ok(source.includes('function isComponent('), 'client.core.js must define isComponent')
  assert.ok(
    /isComponent\(found\)/.test(source),
    'client.core.js must resolve primitives through isComponent',
  )
  // The wrapper tags the resolver must know about.
  for (const tag of ['react.forward_ref', 'react.memo', 'react.lazy']) {
    assert.ok(source.includes(tag), `client.core.js must accept ${tag} wrappers`)
  }
  // Executable code only: the doc comment above the helper names that tag too.
  const executable = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.equal(
    executable.includes('react.element'),
    false,
    'client.core.js must not accept an already-rendered element as a component type',
  )
})

/**
 * The credential channel is deliberately narrow.
 *
 * `apiKeyEnv` is a credential REFERENCE; the secret belongs to the host's
 * credential store. The page may therefore use `remote.credentials.describe`
 * (read state), `.set` (store a secret) and `.unset` (remove it) — and nothing
 * else. It must never place a secret into the settings ops, and it must degrade
 * to a hint when the host exposes no credential remote.
 */
test('the credential API is exposed only when the host offers it, and degrades otherwise', () => {
  const describeCalls = []
  const events = []
  const remote = {
    $on: (event, handler) => {
      events.push(event)
      return () => events.push(`off:${event}`)
    },
    credentials: {
      describe: async (refs) => {
        describeCalls.push(refs)
        return { ok: true, value: { [refs[0]]: { configured: true, source: 'file', writable: true } } }
      },
      set: async () => ({ ok: true }),
      unset: async () => ({ ok: true }),
    },
  }
  const withRemote = makeCtx({ served: true, remote })
  const { owner, requireStub } = loadOwner()
  owner.factory(requireStub).apply(withRemote.ctx)
  const face = withRemote.registrations[0].declaration.inject()
  assert.equal(face.credentials.available, true)
  assert.equal(typeof face.credentials.describe, 'function')
  assert.equal(typeof face.credentials.set, 'function')
  assert.equal(typeof face.credentials.unset, 'function')
  assert.deepEqual(
    events.filter((entry) => !entry.startsWith('off:')).sort(),
    ['credentials/record-updated', 'credentials/reference-updated'],
    'the page must refresh when the host reports a credential change',
  )

  const withoutRemote = makeCtx({ served: true })
  const second = loadOwner()
  assert.doesNotThrow(() => second.owner.factory(second.requireStub).apply(withoutRemote.ctx))
  const degraded = withoutRemote.registrations[0].declaration.inject()
  assert.equal(degraded.credentials.available, false, 'no credential remote must degrade, not throw')
})

test('a hostile/uninjected remote namespace must never fail activation', () => {
  // The real failure this guards: reading an uninjected cordis remote key
  // (`ctx.remote.credentials`) throws during activation, which fails the whole
  // web-boot entry and bricks the app. Access is therefore wrapped, and the row
  // degrades to a hint instead.
  const hostile = {
    get credentials() {
      throw new Error('Service "remote.credentials" is not available')
    },
    $on() {
      throw new Error('remote events are not available')
    },
  }
  const applied = makeCtx({ served: true, remote: hostile })
  const { owner, requireStub } = loadOwner()
  assert.doesNotThrow(() => owner.factory(requireStub).apply(applied.ctx))
  assert.equal(applied.registrations.length, 1, 'the settings cell must still register')
  const face = applied.registrations[0].declaration.inject()
  assert.equal(face.credentials.available, false, 'a hostile namespace must degrade to unavailable')
})

test('no secret and no credential field name leaks into the config surface', () => {
  const owner = readFileSync(join(LIB, 'client.js'), 'utf8')
  const panels = readFileSync(join(LIB, 'client.panels.js'), 'utf8')
  for (const [name, source] of [
    ['client.js', owner],
    ['client.panels.js', panels],
  ]) {
    // Comments name the field to explain the rule; only code is checked.
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    assert.equal(
      executable.includes('apiKeyEnv'),
      false,
      `${name} must identify credential references by schema role, never by field name`,
    )
    assert.equal(
      /credentials\.(write|mutate|setSecret)/.test(source),
      false,
      `${name} may only call remote.credentials.describe/set/unset`,
    )
  }
  assert.equal(
    owner.includes("credentialsRemote.set") && owner.includes("credentialsRemote.unset"),
    true,
    'the owner must use the two documented credential writes',
  )
})
