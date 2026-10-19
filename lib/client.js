window.__ModuleLoader__.load({
  id: 'dsh-llm-pi-ai-config',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var clientStore = require('@deepseek-ai/dsh-client-store')
    var h = react.createElement

    // -----------------------------------------------------------------------
    // Render-safety primitives.
    //
    // A render-time throw is not a small failure here. The slot renderer catches
    // it and *abdicates* the entry: `reportEntryError(..., {abdicate:true})`
    // adds the entry to the slots `abdicated` WeakSet, and `entriesOfSlot()`
    // skips every abdicated entry for the rest of that registration's life. The
    // nav cell survives, the body goes blank, and nothing short of a page
    // reload re-registers it. So every uncertain value below degrades to an
    // explicit state instead of throwing.
    // -----------------------------------------------------------------------

    /** Run `fn`, returning `fallback` instead of letting it throw during render. */
    function attempt(fn, fallback) {
      try {
        return fn()
      } catch (error) {
        return fallback
      }
    }

    /**
     * Best-effort localized text. Never throws and always yields a string, so a
     * missing or broken locale binding cannot take the page down.
     */
    function textOf(props, key, fallback) {
      if (props !== null && props !== undefined && typeof props.t === 'function') {
        try {
          var text = props.t(key)
          if (typeof text === 'string' && text.length > 0) return text
        } catch (error) {
          // Fall through to the bundled default.
        }
      }
      return fallback
    }

    /** A short, safe rendering of a caught value. */
    function describeError(error) {
      if (error === null || error === undefined) return ''
      if (typeof error === 'string') return error
      if (typeof error.message === 'string') return error.message
      return attempt(function () {
        return String(error)
      }, '')
    }

    /**
     * An inner error boundary for one page face.
     *
     * The slot renderer has its own boundary, but a crash there abdicates the
     * whole cell. This boundary sits one level lower: a failing panel (or a
     * failing chunk) shows an inline error and the cell stays registered.
     *
     * @returns a React component class, or a pass-through when React lacks one.
     */
    function createPageBoundary() {
      if (typeof react.Component !== 'function') {
        return function PassthroughBoundary(props) {
          return props.children
        }
      }
      return class PageErrorBoundary extends react.Component {
        constructor(props) {
          super(props)
          this.state = { failed: false, error: undefined }
        }

        static getDerivedStateFromError(error) {
          return { failed: true, error: error }
        }

        componentDidCatch(error) {
          if (
            typeof console !== 'undefined' &&
            console !== null &&
            typeof console.error === 'function'
          ) {
            console.error('dsh-llm-pi-ai-config: contained a page render failure:', error)
          }
        }

        render() {
          if (this.state.failed !== true) return this.props.children
          var failureKey =
            typeof this.props.failureKey === 'string' ? this.props.failureKey : 'renderFailed'
          var fallbackText =
            typeof this.props.fallbackText === 'string'
              ? this.props.fallbackText
              : 'The page failed to render: '
          return h(
            'div',
            { className: 'piai-error piai-boundary', role: 'alert' },
            textOf(this.props, failureKey, fallbackText) + describeError(this.state.error),
          )
        }
      }
    }

    /** Contains a panel crash so the slot cell is never abdicated. */
    var PageBoundary = createPageBoundary()

    /** Contains a chunk-load crash for the same reason. */
    var ChunkBoundary = createPageBoundary()

    // -----------------------------------------------------------------------
    // The page face lives in `client.page.js`.
    //
    // Everything that only has to exist once the page renders — the tab DOM
    // ids, `providerTabItems`, `makePage`, its helper components — is a chunk.
    // The owner is what runs before any chunk can be requested (it registers the
    // settings cell and binds the locale and the remote channels), so the only
    // React it builds here is its own render-safety layer: the two error
    // boundaries and the lazy host below.
    // -----------------------------------------------------------------------

    /**
     * The settings namespace this page edits. It belongs to the `llm-pi-ai`
     * adapter; this plugin registers no namespace of its own and persists
     * nothing itself. Every write travels the shipped settings pipeline:
     *
     *   configForms.get(NS).mutate(ops, rev)
     *     -> remote.settings.mutate -> ctx.settings.write
     *     -> ctx.configEditor.edit -> atomic YAML write of cordis.patch.yml
     *
     * @type {string}
     */
    var NS = 'llm-pi-ai'

    /** Fresh nav cell id: registering an existing id would replace that page. */
    var SECTION_ID = 'model-extended'

    /** After the shipped Models cell (order 10), before Agent presets (order 20). */
    var ORDER = 12

    /** Locale dictionary namespace owned by this plugin. */
    var DICT = 'dsh-llm-pi-ai-config'

    var zh = {
      nav: '模型扩展配置',
      title: '模型扩展配置',
      subtitle: '编辑 llm-pi-ai 的完整配置；未填写的字段保留为「默认（未设置）」，不会被写成 null。',
      providerTabs: '提供商',
      loading: '正在加载…',
      save: '保存',
      discard: '放弃修改',
      dirty: '有未保存的改动',
      clean: '暂无改动',
      saving: '保存中…',
      invalid: '当前内容未通过校验，请先修正后再保存。',
      unwritable: '当前页面无法写入配置（非本机页面会保持进程内状态）。',
      loadFailed: '页面组件加载失败：',
      renderFailed: '页面渲染失败：',
      hookMissing: '页面数据源不可用：注入的页面 store 缺失，或不是选择器 hook。',
      controllerMissing: '页面控制器不可用：未取到 llm-pi-ai 的配置表单。',
      panelMissing: '面板组件缺失：未取到该面板的导出。',
      retry: '重试',
      rawCode: '原代码',
      rawForm: '配置表单',
      rawNotice: '只读预览：以下是当前草稿的完整 llm-pi-ai 配置，含未保存的修改。',
      // The picker's own copy is hardcoded in the panels chunk, exactly like
      // every other panel label; the owner produces only this one catalog
      // string, for the degradation path of its own discovery wrapper.
      fetchUnavailable: '当前宿主不支持模型发现。',
    }
    var en = {
      nav: 'Extended model config',
      title: 'Extended model config',
      subtitle:
        'Edits the full llm-pi-ai configuration. A cleared field stays unset (shown as "Default (unset)") and is never written as null.',
      providerTabs: 'Providers',
      loading: 'Loading…',
      save: 'Save',
      discard: 'Discard',
      dirty: 'Unsaved changes',
      clean: 'No changes',
      saving: 'Saving…',
      invalid: 'The current content failed validation; fix it before saving.',
      unwritable: 'This page cannot write configuration (a non-local page keeps state in-process).',
      loadFailed: 'Failed to load the page components: ',
      renderFailed: 'The page failed to render: ',
      hookMissing:
        'The page data source is unavailable: the injected page store is missing or is not a selector hook.',
      controllerMissing: 'The page controller is unavailable: no config form for llm-pi-ai.',
      panelMissing: 'Panel component missing: the chunk did not export it.',
      retry: 'Retry',
      rawCode: 'Raw YAML',
      rawForm: 'Form',
      rawNotice:
        'Read-only preview: the complete llm-pi-ai configuration of the current draft, including unsaved changes.',
      fetchUnavailable: 'This host does not support model discovery.',
    }

    /**
     * Stand-in for a styles chunk that never arrived.
     *
     * It exists so the §7 call form — `ensureChunks().then((c) => c.styles.install())`
     * — stays safe when the stylesheet is missing: `install()` is present and
     * does nothing, so the page keeps rendering unstyled.
     */
    var NO_STYLES = {
      install: function () {
        return function () {}
      },
      uninstall: function () {},
    }

    /**
     * Request one optional chunk without ever rejecting the page's load.
     *
     * A stylesheet or the read-only YAML view is decoration: its chunk failing
     * must not blank the page — that is the failure this plugin already shipped
     * once. Any failure, including a synchronous throw from the loader, resolves
     * to `fallback` instead (`NO_STYLES` for the sheet, `undefined` for the raw
     * view, `undefined` for a stylesheet fragment).
     *
     * @param file - the chunk specifier.
     * @param fallback - the value to resolve with when it cannot be loaded.
     */
    function loadOptionalChunk(file, fallback) {
      var request
      try {
        request = require.async(file)
      } catch (error) {
        return Promise.resolve(fallback)
      }
      if (request === null || request === undefined || typeof request.then !== 'function') {
        return Promise.resolve(fallback)
      }
      return request.then(
        function (api) {
          return api === null || api === undefined ? fallback : api
        },
        function () {
          return fallback
        },
      )
    }

    /**
     * Package-local chunks, loaded once and in dependency order.
     *
     * The chunks are real files served beside this bundle, which is how the page
     * stays split into modules without a bundler. Each registers itself through
     * `__ModuleLoader__.load` with a `chunk` field.
     *
     * Two phases, because `require.async` materialises a chunk as soon as its
     * script arrives: a dependent requested in the same `Promise.all` as its
     * dependency can win the race. Only `client.page.js` and
     * `client.panels.js` read another chunk's registry entry (both read
     * `client.core.js`), so those two are requested in phase 1 — after the whole
     * of phase 0 has been materialised.
     *
     * @returns a promise of the page chunk APIs (`yaml` may be `undefined`)
     *   plus `styles`.
     */
    /**
     * The chunks this bundle requests, in load order, grouped by phase.
     *
     * A phase is awaited entire before the next one is requested, because
     * `require.async` materialises a chunk as soon as its script arrives: a
     * dependent requested in the same `Promise.all` as its dependency can win
     * the race and read an empty registry. `client.fields.js` reads the two
     * `client.fields.*.js` data chunks, and `client.panels.js` /
     * `client.page.js` read `client.core.js`, so each of those is in the phase
     * after its dependency.
     *
     * Exposed through `__internals.chunkPlan` so the module-contract test can
     * check the plan against the files on disk and against what is requested.
     */
    var CHUNK_PLAN = [
      [
        './client.core.js',
        './client.schema.js',
        './client.form.js',
        './client.fields.groups.js',
        './client.fields.hints.js',
        './client.yaml.js',
        './client.styles.chrome.js',
        './client.styles.controls.js',
        // The panels modules: each publishes a `create<X>` factory, and the
        // facade below composes them.
        './client.panels.kit.js',
        './client.panels.controls.js',
        './client.panels.collections.js',
        './client.panels.render.js',
        './client.panels.instances.js',
        './client.panels.catalog.js',
      ],
      ['./client.fields.js', './client.panels.js', './client.page.js', './client.styles.js'],
    ]

    /**
     * The chunks whose failure may not take the page down, each with the value
     * its absence degrades to: the stylesheet (and its two fragments) and the
     * read-only YAML view.
     */
    var ISOLATED_CHUNKS = {
      './client.yaml.js': function (file) {
        return loadOptionalChunk(file, undefined)
      },
      './client.styles.chrome.js': function (file) {
        return loadOptionalChunk(file, undefined)
      },
      './client.styles.controls.js': function (file) {
        return loadOptionalChunk(file, undefined)
      },
      './client.styles.js': function (file) {
        return loadOptionalChunk(file, NO_STYLES)
      },
    }

    /** Request one chunk, honouring the isolated-failure rules. */
    function loadChunk(file) {
      var isolated = ISOLATED_CHUNKS[file]
      return isolated === undefined ? require.async(file) : isolated(file)
    }

    var chunksPromise
    function ensureChunks() {
      if (chunksPromise === undefined) {
        chunksPromise = Promise.all(CHUNK_PLAN[0].map(loadChunk)).then(function (phase0) {
          return Promise.all(CHUNK_PLAN[1].map(loadChunk)).then(function (phase1) {
            var byFile = {}
            var phase = 0
            for (; phase < 2; phase += 1) {
              var files = CHUNK_PLAN[phase]
              var loaded = phase === 0 ? phase0 : phase1
              for (var index = 0; index < files.length; index += 1) {
                byFile[files[index]] = loaded[index]
              }
            }
            return {
              core: byFile['./client.core.js'],
              schema: byFile['./client.schema.js'],
              form: byFile['./client.form.js'],
              fields: byFile['./client.fields.js'],
              yaml: byFile['./client.yaml.js'],
              styles: byFile['./client.styles.js'],
              panels: byFile['./client.panels.js'],
            }
          })
        })
      }
      return chunksPromise
    }

    /**
     * A Suspense-based lazy component, with a state-based fallback so the page
     * still works if this React build lacks `lazy`.
     *
     * Both paths surface a chunk failure in the UI. A bare placeholder is
     * indistinguishable from a page that simply has not finished loading, so a
     * broken chunk used to look like a hang: now it renders the failure and a
     * retry, contained by a boundary instead of escaping into the slot.
     */
    function lazyComponent(load) {
      if (typeof react.lazy === 'function' && typeof react.Suspense === 'function') {
        var Lazy = react.lazy(function () {
          return load().then(function (component) {
            return { default: component }
          })
        })
        return function LazyHost(props) {
          return h(
            ChunkBoundary,
            {
              failureKey: 'loadFailed',
              fallbackText: 'Failed to load the page components: ',
              t: props !== null && props !== undefined ? props.t : undefined,
            },
            h(
              react.Suspense,
              {
                fallback: h(
                  'div',
                  { className: 'piai-loading' },
                  textOf(props, 'loading', 'Loading…'),
                ),
              },
              h(Lazy, props),
            ),
          )
        }
      }
      return function EagerHost(props) {
        var currentState = react.useState({ component: undefined, error: undefined })
        var current = currentState[0]
        var setCurrent = currentState[1]
        var attemptState = react.useState(0)
        var attemptCount = attemptState[0]
        var setAttempt = attemptState[1]

        react.useEffect(
          function () {
            var live = true
            setCurrent({ component: undefined, error: undefined })
            load().then(
              function (resolved) {
                if (live) setCurrent({ component: resolved, error: undefined })
              },
              function (error) {
                if (live) setCurrent({ component: undefined, error: error })
              },
            )
            return function () {
              live = false
            }
          },
          [attemptCount],
        )

        var failed =
          current !== null &&
          current !== undefined &&
          current.error !== undefined &&
          current.error !== null
        if (failed) {
          return h('div', { className: 'piai-error piai-boundary', role: 'alert' }, [
            h(
              'div',
              { key: 'message' },
              textOf(props, 'loadFailed', 'Failed to load the page components: ') +
                describeError(current.error),
            ),
            h(
              'button',
              {
                key: 'retry',
                type: 'button',
                className: 'piai-btn',
                onClick: function () {
                  setAttempt(attemptCount + 1)
                },
              },
              textOf(props, 'retry', 'Retry'),
            ),
          ])
        }

        if (current === null || current === undefined || typeof current.component !== 'function') {
          return h('div', { className: 'piai-loading' }, textOf(props, 'loading', 'Loading…'))
        }
        return h(current.component, props)
      }
    }

    /**
     * The page chunk's API, requested once.
     *
     * The page face is its own chunk (phase 1, after `client.core.js`), and this
     * is the only place it is requested. A failed load rejects the lazy host
     * below, which `ChunkBoundary` renders as a message plus a retry instead of
     * letting a render-time throw abdicate the settings cell.
     */
    var pagePromise
    function loadPage() {
      if (pagePromise === undefined) {
        // `ensureChunks()` first: the page face builds against `client.core.js`,
        // which is why it is a phase-1 chunk at all.
        pagePromise = ensureChunks().then(function () {
          return require.async('./client.page.js')
        })
      }
      return pagePromise
    }

    /**
     * The nav cell's body while the page chunks travel.
     *
     * The owner hands its own `PageBoundary` down: it is built at bundle-init
     * time, before any chunk exists, and the page must use the same class so a
     * panel crash is contained by the boundary the owner already registered.
     */
    var SectionHost = lazyComponent(function () {
      return loadPage().then(function (page) {
        return ensureChunks().then(function (chunks) {
          return page.makePage(chunks, { boundary: PageBoundary, locale: DICT })
        })
      })
    })

    // `remote` is the registry service and each namespace is its own cordis
    // service key (`remote.settings`, `remote.credentials`, `remote.llm`, …).
    // Reading a namespace the plugin has not injected throws during activation,
    // which fails the whole web-boot entry — so the credential and model
    // discovery namespaces are declared here, exactly like the shipped Models
    // page does.
    var inject = [
      'slots',
      'locale',
      'remote',
      'remote.settings',
      'remote.credentials',
      'remote.llm',
      'configForms',
      'settingsSchema',
    ]

    /**
     * Register the page while the Host serves the `llm-pi-ai` namespace.
     *
     * `whileServed` is what keeps the plugin invisible in a deployment without
     * the adapter: with nothing serving `llm-pi-ai`, no nav cell is registered
     * and no chunk is ever requested.
     *
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      var t = ctx.locale.bind(DICT)
      ctx.effect(
        function () {
          return ctx.locale.register(DICT, { zh: zh, en: en })
        },
        'llm-pi-ai-config: dictionaries',
      )

      var mirror = ctx.configForms.describe()
      var controller = ctx.configForms.get(NS)

      /**
       * Validate a draft with the settings pipeline's own schema service, over
       * the live envelope. Returns `undefined` for valid (or uncheckable)
       * drafts and a message otherwise — the same contract the staged form uses.
       */
      function validate(envelope, draft) {
        if (ctx.settingsSchema === undefined) return undefined
        try {
          var node = ctx.settingsSchema.rehydrate(envelope)
          var reported = ctx.settingsSchema.validate(node, draft)
          return reported === undefined ? undefined : String(reported)
        } catch (error) {
          // A malformed envelope disables validation rather than the page.
          return undefined
        }
      }

      /** Project the one namespace view this page needs. */
      function project() {
        var snapshot = mirror.getSnapshot()
        // `describe()` is host data, not ours: a malformed snapshot can carry no
        // `view`, or a `view` whose `namespaces` is not an array. Reading
        // `.length` off that would throw inside the mirror subscription effect —
        // not during render, so the cell is not abdicated, but the page store
        // would silently stop updating. Anything but a real array is "none".
        var view = snapshot !== null && typeof snapshot === 'object' ? snapshot.view : undefined
        var namespaces =
          view !== null && typeof view === 'object' && Array.isArray(view.namespaces)
            ? view.namespaces
            : []
        for (var index = 0; index < namespaces.length; index += 1) {
          var entry = namespaces[index]
          if (entry === null || typeof entry !== 'object') continue
          if (entry.ns === NS) {
            return {
              envelope: entry.schema,
              revision: entry.revision,
              value: entry.value,
            }
          }
        }
        return { envelope: undefined, revision: undefined, value: undefined }
      }

      var pageStore = clientStore.createSnapshotStore(project())

      // ---------------------------------------------------------------------
      // Credentials (the second, sanctioned write channel).
      //
      // `apiKeyEnv` is a credential REFERENCE (`z.string().role("credential-ref")`
      // in the adapter). The secret itself is never part of the plugin config:
      // it goes through the host's credential store, exactly like the shipped
      // Models page does (`remote.credentials.set/unset`). The profile still only
      // records the reference name, written through the ordinary settings
      // pipeline.
      // ---------------------------------------------------------------------
      var credentialEvents = clientStore.createSnapshotStore(0)
      // Defensive on purpose: a plugin activation must never fail because an
      // optional host service is shaped differently.
      var credentialsRemote = attempt(function () {
        if (ctx.remote === null || ctx.remote === undefined) return undefined
        return ctx.remote.credentials
      }, undefined)

      /** `true` when the host exposes the credential remote. */
      function credentialApiAvailable() {
        return attempt(function () {
          return (
            credentialsRemote !== null &&
            credentialsRemote !== undefined &&
            typeof credentialsRemote.describe === 'function' &&
            typeof credentialsRemote.set === 'function' &&
            typeof credentialsRemote.unset === 'function'
          )
        }, false)
      }

      /** Best-effort remote call: never throws, always reports a message. */
      function credentialCall(operation) {
        if (!credentialApiAvailable()) {
          return Promise.resolve({ ok: false, error: '当前宿主不支持凭据管理。' })
        }
        try {
          return Promise.resolve(operation()).then(
            function (response) {
              if (response !== null && response !== undefined && response.ok === true) {
                return { ok: true, value: response.value }
              }
              var message =
                response !== null && response !== undefined && response.error !== undefined
                  ? describeError(response.error)
                  : '凭据操作失败。'
              return { ok: false, error: message || '凭据操作失败。' }
            },
            function (error) {
              return { ok: false, error: describeError(error) }
            },
          )
        } catch (error) {
          return Promise.resolve({ ok: false, error: describeError(error) })
        }
      }

      /** `describe(refs)` → `{ states: {ref: {configured, source, writable}}, error? }`. */
      function describeCredentials(refs) {
        var wanted = Array.isArray(refs)
          ? refs.filter(function (ref) {
              return typeof ref === 'string' && ref !== ''
            })
          : []
        if (wanted.length === 0) return Promise.resolve({ states: {} })
        return credentialCall(function () {
          return credentialsRemote.describe(wanted)
        }).then(function (result) {
          if (result.ok !== true) return { states: {}, error: result.error }
          var value = result.value !== null && typeof result.value === 'object' ? result.value : {}
          return { states: value }
        })
      }

      function setCredential(ref, secret) {
        return credentialCall(function () {
          return credentialsRemote.set(ref, secret)
        })
      }

      function unsetCredential(ref) {
        return credentialCall(function () {
          return credentialsRemote.unset(ref)
        })
      }

      // ---------------------------------------------------------------------
      // Model discovery (the second read-only remote channel).
      //
      // `remote.llm.discoverModels(settingsNs, request)` is the shipped
      // discovery RPC (`@deepseek-ai/dsh-llm`, `LlmModelDiscoveryRequest` =
      // `{provider?, baseURL?, api?}`), registered by the adapter itself
      // (`ctx.llm.registerModelDiscovery(settingsNs, …)` in llm-pi-ai). It only
      // reads what the endpoint advertises: nothing here writes config, and the
      // answer is handed to the panels chunk, which stages any adoption through
      // `form.edit` like every other draft change.
      //
      // Defensive on purpose, exactly like the credential channel above: a
      // plugin activation must never fail because an optional host service is
      // missing or shaped differently (AGENTS §3.1).
      // ---------------------------------------------------------------------
      var llmRemote = attempt(function () {
        if (ctx.remote === null || ctx.remote === undefined) return undefined
        return ctx.remote.llm
      }, undefined)

      /** `true` when the host exposes the model-discovery remote. */
      function catalogApiAvailable() {
        return attempt(function () {
          return (
            llmRemote !== null &&
            llmRemote !== undefined &&
            typeof llmRemote.discoverModels === 'function'
          )
        }, false)
      }

      /**
       * `discoverModels(NS, request)` → `{kind:'found', models}` or
       * `{kind:'refused', message}`. Never throws and never rejects.
       */
      function discoverCatalog(request) {
        if (!catalogApiAvailable()) {
          return Promise.resolve({ kind: 'refused', message: '当前宿主不支持模型发现。' })
        }
        try {
          return Promise.resolve(llmRemote.discoverModels(NS, request)).then(
            function (response) {
              if (response !== null && response !== undefined && response.ok === true) {
                return {
                  kind: 'found',
                  models: Array.isArray(response.value) ? response.value : [],
                }
              }
              var message =
                response !== null && response !== undefined && response.error !== undefined
                  ? describeError(response.error)
                  : ''
              return { kind: 'refused', message: message || '模型发现失败。' }
            },
            function (error) {
              return { kind: 'refused', message: describeError(error) }
            },
          )
        } catch (error) {
          return Promise.resolve({ kind: 'refused', message: describeError(error) })
        }
      }

      // Keep the page in step with the host: the reference can also be satisfied
      // by another window or by an environment variable appearing later.
      ctx.effect(
        function () {
          var disposers = []
          try {
            if (
              ctx.remote === null ||
              ctx.remote === undefined ||
              typeof ctx.remote.$on !== 'function'
            ) {
              return function () {}
            }
            var bump = function () {
              credentialEvents.set(credentialEvents.getSnapshot() + 1)
            }
            disposers = [
              ctx.remote.$on('credentials/record-updated', bump),
              ctx.remote.$on('credentials/reference-updated', bump),
            ]
          } catch (error) {
            // No subscription: the page still refetches on every render pass.
            return function () {}
          }
          return function () {
            for (var index = 0; index < disposers.length; index += 1) {
              if (typeof disposers[index] === 'function') disposers[index]()
            }
          }
        },
        'llm-pi-ai-config: credential events',
      )
      ctx.effect(
        function () {
          return mirror.subscribe(function () {
            pageStore.set(project())
          })
        },
        'llm-pi-ai-config: page store',
      )

      /**
       * Mount the package stylesheet, exactly as docs/interaction-design.md §7
       * prescribes: inside `ctx.effect`, load the styles chunk, call `install()`,
       * keep the disposer and call it on cleanup.
       *
       * The watch is `whileServed([NS], …)` so an unserved deployment still
       * requests no chunk at all; the disposer `whileServed` owns is the one
       * this effect hands back to Cordis.
       *
       * Every failure is swallowed on purpose. A stylesheet is decoration: a
       * missing chunk, a rejected load or a throwing `install()` must leave the
       * page rendering unstyled, never abort `apply()`, and never reach the
       * render path — a render-time throw is what abdicates the whole cell.
       */
      ctx.effect(
        function () {
          return ctx.configForms.whileServed([NS], function () {
            var off
            var disposed = false

            function teardown() {
              if (typeof off !== 'function') return
              try {
                off()
              } catch (error) {
                // Decoration teardown must never throw.
              }
            }

            try {
              ensureChunks()
                .then(function (chunks) {
                  var styles = chunks !== null && chunks !== undefined ? chunks.styles : undefined
                  if (
                    styles === null ||
                    styles === undefined ||
                    typeof styles.install !== 'function'
                  ) {
                    return
                  }
                  off = styles.install()
                  // The effect may have been disposed while the chunk travelled;
                  // never leave an orphan <style> behind.
                  if (disposed) teardown()
                })
                .catch(function () {
                  // A broken stylesheet leaves the page unstyled, not broken.
                })
            } catch (error) {
              // A synchronous loader failure is swallowed the same way.
            }

            return function () {
              disposed = true
              teardown()
            }
          })
        },
        'llm-pi-ai-config: stylesheet',
      )

      ctx.effect(
        function () {
          return ctx.configForms.whileServed([NS], function () {
            return ctx.slots.inject('settings.section', function () {
              return ctx.slots.register(
                {
                  name: 'settings.section',
                  id: SECTION_ID,
                  order: ORDER,
                  label: function () {
                    return t('nav')
                  },
                  locale: DICT,
                  inject: function () {
                    return {
                      controller: controller,
                      validate: validate,
                      hooks: { page: pageStore, credentialEvents: credentialEvents },
                      credentials: {
                        available: credentialApiAvailable(),
                        describe: describeCredentials,
                        set: setCredential,
                        unset: unsetCredential,
                      },
                      catalog: {
                        available: catalogApiAvailable(),
                        discover: discoverCatalog,
                      },
                      t: t,
                    }
                  },
                },
                SectionHost,
              )
            })
          })
        },
        'llm-pi-ai-config: settings section',
      )
    }

    exports.apply = apply
    exports.inject = inject

    /** Identity of the surface this plugin contributes, for tests and diagnostics. */
    exports.NAMESPACE = NS
    exports.SECTION_ID = SECTION_ID
    exports.SECTION_ORDER = ORDER

    /**
     * Test seam only. `tests/render.test.js` drives the real page component and
     * the real lazy host with the props a section registration supplies, so a
     * render-time regression fails a test instead of blanking the page. Nothing
     * in the browser reads this.
     */
    exports.__internals = {
      loadPage: loadPage,
      // The page face is a chunk now, so a test that drives it directly needs
      // the same boundary class the owner hands down in production.
      pageBoundary: PageBoundary,
      lazyComponent: lazyComponent,
      ensureChunks: ensureChunks,
      chunkPlan: CHUNK_PLAN,
    }

    return module.exports
  },
})
