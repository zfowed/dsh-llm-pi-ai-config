/**
 * The settings page face: the 「模型扩展配置」 page component itself.
 *
 * v10 extracted this out of the bundle owner. The owner is what runs *before*
 * any chunk can be requested — it registers the settings cell, binds the locale
 * and the two remote channels (`credentials`, `llm`) — while everything that
 * only has to exist once the page renders belongs here.
 *
 * This chunk owns:
 *
 *   - `makePage(chunks, deps)`: the page body — provider tabs, the sticky bar,
 *     the read-only 「原代码」 face and the tabpanel wiring;
 *   - the tab DOM ids and the tab item list (position-based: a provider key may
 *     contain any character and two keys can sanitise alike);
 *   - the page-local helpers the face needs: `providerProfileRef`,
 *     `providerNamesOf`, `MissingPanel`, `panelOf`, `useExternalStore`,
 *     `ProviderDeleteButton`. Path reads go through core's `readPath`.
 *
 * It reads `client.core.js` out of the registry (phase 0) for the shared helpers
 * and the resolved primitives (`StateDot`, `CodeBlock`, `isComponent`), and gets
 * the owner's `PageBoundary` through `deps.boundary` — the owner has to build
 * that boundary at bundle-init time, before any chunk exists.
 *
 * Nothing here writes: every edit goes through the staged `form` prop, and the
 * only remote calls are the read-only discovery probe and the credential
 * channel, both injected as props.
 *
 * Chunk envelope: plain script, no `import`/`export`.
 *
 * @module dsh-llm-pi-ai-config/client.page
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.page.js'

  /**
   * Build the page face against one bundle `require`.
   *
   * @param require - the bundle require, offering `react`.
   * @returns `{makePage}`.
   */
  function createPage(require) {
    var react = require('react')
    var h = react.createElement

    /** A stable no-op subscription for a form whose controller never arrived. */
    function noopSubscribe() {
      return function () {}
    }

    /** A stable empty snapshot for a form whose controller never arrived. */
    function emptySnapshot() {
      return {}
    }

    /** Renders its children untouched: the default when a caller passes no boundary. */
    function PassthroughBoundary(props) {
      return props.children
    }

    /**
     * Stable DOM ids the tab contract needs: the tablist item carries `id`, its
     * panel carries the matching `id` and `aria-labelledby`. Deliberately not
     * `piai-*`: those are class names, and the frozen class list is compared
     * against every `piai-*` literal in this file.
     *
     * The id is per POSITION, not per name: a provider key may contain any
     * character and two keys can sanitise to the same text, so the index is what
     * keeps the ids unique and stable for the life of a render.
     */
    var TAB_DOM_PREFIX = 'model-extended-tab-'
    var PANEL_DOM_PREFIX = 'model-extended-panel-'

    /** Sanitise one path segment into a DOM-id-safe token. */
    function sanitizeIdPart(value) {
      return String(value).replace(/[^A-Za-z0-9_-]/g, '-')
    }

    /** The tablist item id for one provider position. */
    function tabDomId(index, name) {
      return TAB_DOM_PREFIX + String(index) + '-' + sanitizeIdPart(name)
    }

    /** The tabpanel id for one provider position. */
    function tabPanelDomId(index, name) {
      return PANEL_DOM_PREFIX + String(index) + '-' + sanitizeIdPart(name)
    }

    function providerProfileRef(envelope, schemaApi) {
      if (envelope === null || typeof envelope !== 'object') return undefined
      var root = schemaApi.node(envelope, envelope.uid)
      if (root === undefined || root.dict === undefined) return undefined
      var providers = schemaApi.node(envelope, root.dict.providers)
      if (providers === undefined) return undefined
      return providers.inner
    }

    /** The configured route names, in document order. */
    function providerNamesOf(providers) {
      return providers !== null && typeof providers === 'object' && !Array.isArray(providers)
        ? Object.keys(providers)
        : []
    }

    /**
     * `useSyncExternalStore` when React provides it, else a `useState` bridge.
     *
     * The store contract is already satisfied (`subscribe` + `getSnapshot`), so
     * the fallback only changes how re-renders are scheduled.
     */
    function useExternalStore(subscribe, getSnapshot) {
      if (typeof react.useSyncExternalStore === 'function') {
        return react.useSyncExternalStore(subscribe, getSnapshot)
      }
      var state = react.useState(getSnapshot)
      var snapshot = state[0]
      var setSnapshot = state[1]
      react.useEffect(
        function () {
          return subscribe(function () {
            setSnapshot(getSnapshot())
          })
        },
        [subscribe, getSnapshot],
      )
      return snapshot
    }


    /**
     * Build the page component.
     *
     * @param chunks - `{schema, form, fields, yaml, panels}` as `ensureChunks()`
     *   resolves them; `yaml` is `undefined` when the serializer chunk could not
     *   be fetched.
     * @param deps - `{boundary}`: the owner's `PageBoundary` class. Callers that
     *   omit it (tests / a host shim) get a pass-through, so the page still
     *   renders without one.
     * @returns the section component.
     */
    function makePage(chunks, deps) {
      var options = deps !== null && deps !== undefined ? deps : {}
      var PageBoundary = options.boundary !== undefined ? options.boundary : PassthroughBoundary
      // The locale namespace the panels are told about. The owner binds and
      // registers the dictionaries and passes its own id down; the bundled
      // default keeps the face renderable for a caller that passes no deps.
      var DICT = typeof options.locale === 'string' ? options.locale : 'dsh-llm-pi-ai-config'

      // The shared base chunk, as `ensureChunks()` resolved it. Reading it from
      // the chunk bag (instead of from a global) is what keeps this face free of
      // load-order coupling: the owner hands the whole bag down.
      var core = chunks.core
      var ui = core !== null && core !== undefined ? core.ui : undefined
      if (ui === null || ui === undefined) {
        throw new Error('dsh-llm-pi-ai-config: the chunk bag must carry client.core.js')
      }
      var attempt = core.attempt
      var describeError = core.describeError
      var textOf = core.textOf
      var identity = core.identity
      var readView = core.readView
      var readPath = core.readPath
      var snapshotOf = core.snapshotOf
      var isComponent = core.isComponent
      var useArmedConfirm = core.useArmedConfirm
      var StateDot = ui.StateDot
      var CodeBlock = ui.CodeBlock

    /**
     * The sticky bar's two-step, keyboard-cancellable provider delete.
     *
     * v7 / R1 (docs/interaction-design.md §15.2 item 9) moves the destructive
     * action out of the tab strip and into `.piai-bar`, keeping §6's inline
     * confirmation semantics: the first click only arms the control, Escape
     * (anywhere on the document, or inside the armed group) cancels it, and the
     * armed state is presentation only — it never changes what the write does
     * (§8 item 8). The controls are the same native `.piai-btn` buttons the
     * discard/save actions already use in this row.
     *
     * @param props - `{label, question, confirmLabel, disabled, onConfirm}`.
     */
    function ProviderDeleteButton(props) {
      // The armed/Escape behaviour is shared with the sticky bar's delete
      // (`client.core.js`: `useArmedConfirm`); only the chrome differs.
      var confirm = useArmedConfirm(react)
      var armed = confirm.armed
      if (props.disabled === true) {
        return h(
          'button',
          {
            type: 'button',
            className: 'piai-btn',
            disabled: true,
            'aria-label': props.label,
          },
          props.label,
        )
      }
      if (armed !== true) {
        return h(
          'button',
          {
            type: 'button',
            className: 'piai-btn',
            'aria-label': props.label,
            onClick: function () {
              confirm.arm()
            },
          },
          props.label,
        )
      }
      return h(
        'span',
        {
          role: 'group',
          'aria-label': props.question,
          onKeyDown: function (event) {
            if (event.key === 'Escape') confirm.cancel()
          },
        },
        [
          h('span', { className: 'piai-hint', key: 'q', role: 'alert' }, props.question),
          h(
            'button',
            {
              type: 'button',
              className: 'piai-btn',
              key: 'yes',
              'aria-label': props.confirmLabel,
              onClick: function () {
                confirm.cancel()
                props.onConfirm()
              },
            },
            props.confirmLabel,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'piai-btn',
              key: 'no',
              'aria-label': '取消删除',
              onClick: function () {
                confirm.cancel()
              },
            },
            '取消',
          ),
        ],
      )
    }

    /**
     * The tab items `ProviderTabs` renders, in document order.
     *
     * The label prefers the provider's own `displayName` and falls back to the
     * map key; the read lives in the fields chunk (the presentation module that
     * owns field labels), so this file names no field and a missing or broken
     * helper simply shows the key.
     */
    function providerTabItems(values, names, fieldsApi) {
      var providers =
        values !== null && typeof values === 'object' && values.providers !== null && typeof values.providers === 'object'
          ? values.providers
          : {}
      return names.map(function (name, index) {
        var label
        if (fieldsApi !== null && fieldsApi !== undefined && typeof fieldsApi.profileLabel === 'function') {
          label = attempt(function () {
            return fieldsApi.profileLabel(providers[name])
          }, undefined)
        }
        if (typeof label !== 'string' || label === '') label = name
        return {
          value: name,
          label: label,
          id: tabDomId(index, name),
          panelId: tabPanelDomId(index, name),
        }
      })
    }

    /** Bundled English default for a panel export that never arrived. */
    var MISSING_PANEL_FALLBACK = 'panel missing'

    /**
     * Bundled text for a raw-config view whose YAML chunk never arrived.
     *
     * The raw view is presentation only; without a serializer there is nothing
     * truthful to show, so it degrades to one line instead of a stack trace.
     */
    var RAW_VIEW_FALLBACK = '原代码视图不可用'

    /**
     * A stand-in that reports a missing panel export instead of throwing.
     *
     * The copy comes from the `panelMissing` dictionary entry through the
     * injected `t` reader, which {@link panelOf} hands over. A reader that
     * answers with the key itself carries no entry for it — an unregistered
     * locale, or a test stub — so the bundled English default is shown instead
     * of a raw key.
     */
    function MissingPanel(props) {
      var label = textOf(props, 'panelMissing', MISSING_PANEL_FALLBACK)
      if (label === 'panelMissing') label = MISSING_PANEL_FALLBACK
      return h('div', { className: 'piai-error piai-boundary', role: 'alert' }, label)
    }

    /**
     * One panel component, or a visible stand-in when the chunk export is absent.
     *
     * @param isComponent - `client.core.js`'s shape-based component test (a
     *   panel export may be a `forwardRef`/`memo` wrapper object).
     * @param panels - the panels chunk exports.
     * @param name - the export name to read.
     * @param reader - the page's `t` reader, for the stand-in only: the real
     *   panels keep their documented prop set, so it never reaches them.
     */
    function panelOf(isComponent, panels, name, reader) {
      var component = panels === null || panels === undefined ? undefined : panels[name]
      if (isComponent(component)) return component
      return function LocalizedMissingPanel() {
        return h(MissingPanel, { t: reader })
      }
    }

      var schemaApi = chunks.schema
      var formApi = chunks.form
      var fieldsApi = chunks.fields
      var yamlApi = chunks.yaml
      var panels = chunks.panels

      return function ModelExtendedPage(props) {
        var t = typeof props.t === 'function' ? props.t : function (key) { return key }
        var usePage = props.usePage
        var hookMissing = typeof usePage !== 'function'
        var view = readView(usePage)
        var envelope = view !== null && typeof view === 'object' ? view.envelope : undefined
        var controller = props.controller
        var hasController =
          controller !== null &&
          controller !== undefined &&
          typeof controller.getSnapshot === 'function'

        var selectedState = react.useState(undefined)
        var selected = selectedState[0]
        var setSelected = selectedState[1]

        // The raw-config face is presentation only: it renders the draft as
        // YAML and never edits it. The toggle is drawn by the panels chunk in
        // the tab strip's action slot, so the state is owned here.
        var rawState = react.useState(false)
        var rawMode = rawState[0]
        var setRawMode = rawState[1]

        // v7 / R1: the trailing 「添加」 tab is a real tab, so "which tab is
        // active" is now two-valued. `adding` is owned here because the page
        // body has to know it too: while the add tab is active the provider face
        // is not rendered at all (§15.2 item 8).
        var addState = react.useState(false)
        var adding = addState[0]
        var setAdding = addState[1]

        // One staged editor per controller; it owns the draft and the op diff.
        // A controller that cannot build one leaves `staged` undefined, which the
        // form store below tolerates and the body reports explicitly.
        var staged = react.useMemo(
          function () {
            if (!hasController) return undefined
            return attempt(function () {
              return formApi.createStagedForm({
                getSnapshot: function () {
                  return controller.getSnapshot()
                },
                mutate: function (ops, revision) {
                  return controller.mutate(ops, revision)
                },
              })
            }, undefined)
          },
          [controller],
        )

        var formSnapshot = useExternalStore(
          staged === undefined ? noopSubscribe : staged.subscribe,
          staged === undefined ? emptySnapshot : staged.getSnapshot,
        )
        if (formSnapshot === null || typeof formSnapshot !== 'object') formSnapshot = {}
        var controllerSnapshot = snapshotOf(controller)

        var providerRef = attempt(function () {
          return providerProfileRef(envelope, schemaApi)
        }, undefined)
        var values = formSnapshot.values || {}
        var providerNames = providerNamesOf(values.providers)
        var providerKey = providerNames.join('\u0000')

        // ---------------------------------------------------------------------
        // Model discovery (a read-only host call).
        //
        // `remote.llm.discoverModels(NS, request)` is the shipped discovery RPC
        // (`@deepseek-ai/dsh-llm`), and its request is `LlmModelDiscoveryRequest`
        // = `{provider?, baseURL?, api?}`. The OWNER — never the panels chunk —
        // assembles that probe from the selected provider's draft entry, which
        // is why the two provider field names below (`baseURL`, `api`) live in
        // this file. AGENTS §3.2 bans field-name literals in
        // `lib/client.panels.js` because that chunk maps fields by group id;
        // the probe is not a field mapping. It is the argument of the adapter's
        // own discovery call, which reads exactly these two values from the
        // route being probed.
        // ---------------------------------------------------------------------
        var catalogApi = props.catalog
        var catalogAvailable =
          catalogApi !== null &&
          catalogApi !== undefined &&
          catalogApi.available === true &&
          typeof catalogApi.discover === 'function'
        var catalogDiscover = catalogAvailable ? catalogApi.discover : undefined
        var probe = {
          provider: selected,
        }
        var selectedProviderValues =
          values.providers !== null && typeof values.providers === 'object'
            ? values.providers[selected]
            : undefined
        if (selectedProviderValues !== null && typeof selectedProviderValues === 'object') {
          // Only a usable string travels: an unset field is genuinely absent,
          // and a `!!js` expression node is not something the host can fetch
          // from (the official Models page builds the same three-part request).
          var probeBaseURL = selectedProviderValues.baseURL
          if (typeof probeBaseURL === 'string' && probeBaseURL.trim() !== '') {
            probe.baseURL = probeBaseURL
          }
          var probeApi = selectedProviderValues.api
          if (typeof probeApi === 'string' && probeApi.trim() !== '') probe.api = probeApi
        }

        /**
         * Ask the host for the probe's models.
         *
         * Always resolves — `{kind:'found', models}` or `{kind:'refused',
         * message}` — and never writes anything: adoption is the panels chunk's
         * `form.edit`, staged like any other draft change.
         */
        function discover() {
          if (typeof catalogDiscover !== 'function') {
            return Promise.resolve({ kind: 'refused', message: t('fetchUnavailable') })
          }
          var answer = attempt(function () {
            return catalogDiscover(probe)
          }, undefined)
          if (answer === null || answer === undefined || typeof answer.then !== 'function') {
            return Promise.resolve({ kind: 'refused', message: t('fetchUnavailable') })
          }
          return answer.then(identity, function (error) {
            return { kind: 'refused', message: describeError(error) }
          })
        }

        var catalog = {
          available: catalogAvailable,
          error: catalogApi !== null && catalogApi !== undefined ? catalogApi.error : undefined,
          probe: probe,
          discover: discover,
        }

        // Keep the selection valid as providers are added and removed.
        react.useEffect(
          function () {
            if (selected !== undefined && providerKey.split('\u0000').indexOf(selected) !== -1) return
            setSelected(providerNames.length > 0 ? providerNames[0] : undefined)
          },
          [selected, providerKey],
        )

        var providerLeaves = []
        if (providerRef !== undefined && selected !== undefined) {
          providerLeaves =
            attempt(function () {
              return schemaApi.leaves(envelope, providerRef, ['providers', selected])
            }, []) || []
          if (!Array.isArray(providerLeaves)) providerLeaves = []
        }

        // Grouped by presentation group id, never by field name: a group added
        // upstream appears on the page on its own. Every group is rendered —
        // there is no tab that could hide one.
        var providerGroups = attempt(function () {
          return fieldsApi.groupLeaves(providerLeaves)
        }, [])
        if (!Array.isArray(providerGroups)) providerGroups = []

        // Credential references are identified by the schema's own role
        // (`meta.role === "credential-ref"`), never by a field name.
        var credentialPaths = []
        for (var credentialIndex = 0; credentialIndex < providerLeaves.length; credentialIndex += 1) {
          var credentialNode = providerLeaves[credentialIndex].node
          var credentialRole =
            credentialNode !== null && credentialNode !== undefined && credentialNode.meta !== undefined
              ? credentialNode.meta.role
              : undefined
          if (credentialRole === 'credential-ref') credentialPaths.push(providerLeaves[credentialIndex].path)
        }
        var credentialRefs = []
        for (var refIndex = 0; refIndex < credentialPaths.length; refIndex += 1) {
          var refValue = readPath(values, credentialPaths[refIndex])
          if (typeof refValue === 'string' && refValue.trim() !== '') credentialRefs.push(refValue.trim())
        }
        var credentialKey = credentialRefs.join('\u0000')
        var credentialsApi = props.credentials
        var credentialsAvailable =
          credentialsApi !== null &&
          credentialsApi !== undefined &&
          credentialsApi.available === true &&
          typeof credentialsApi.describe === 'function'

        var credentialStore = react.useState({ states: {}, error: undefined })
        var credentialSnapshot = credentialStore[0]
        var setCredentialSnapshot = credentialStore[1]
        var credentialVersion =
          typeof props.useCredentialEvents === 'function' ? props.useCredentialEvents(identity) : undefined

        react.useEffect(
          function () {
            if (!credentialsAvailable || credentialRefs.length === 0) return undefined
            var live = true
            credentialsApi.describe(credentialRefs).then(
              function (result) {
                if (!live) return
                setCredentialSnapshot({ states: (result && result.states) || {}, error: result && result.error })
              },
              function () {},
            )
            return function () {
              live = false
            }
          },
          [credentialKey, credentialVersion, credentialsAvailable],
        )

        function refreshCredentials() {
          if (!credentialsAvailable || credentialRefs.length === 0) return Promise.resolve(undefined)
          return credentialsApi.describe(credentialRefs).then(
            function (result) {
              setCredentialSnapshot({ states: (result && result.states) || {}, error: result && result.error })
              return result
            },
            function (error) {
              return { states: {}, error: describeError(error) }
            },
          )
        }

        var credentialUi = {
          available: credentialsAvailable,
          state: credentialSnapshot.states || {},
          error: credentialSnapshot.error,
          set: function (ref, secret) {
            return credentialsApi.set(ref, secret).then(function (result) {
              if (result !== null && result !== undefined && result.ok === true) {
                return refreshCredentials().then(function () {
                  return result
                })
              }
              return result
            })
          },
          unset: function (ref) {
            return credentialsApi.unset(ref).then(function (result) {
              if (result !== null && result !== undefined && result.ok === true) {
                return refreshCredentials().then(function () {
                  return result
                })
              }
              return result
            })
          },
        }

        var tabItems = providerTabItems(values, providerNames, fieldsApi)
        var selectedIndex = providerNames.indexOf(selected)
        var selectedTab = selectedIndex === -1 ? undefined : tabItems[selectedIndex]

        // Validation is the settings pipeline's own, over the draft. A failure
        // disables Save but never blocks the field being edited.
        var failure
        if (envelope !== undefined && typeof props.validate === 'function') {
          failure = attempt(function () {
            return props.validate(envelope, formSnapshot.values)
          }, undefined)
        }
        var invalid = formSnapshot.invalid === true || failure !== undefined
        var message = failure !== undefined ? failure : formSnapshot.invalid === true ? t('invalid') : undefined

        var panelProps = {
          form: staged,
          schema: schemaApi,
          fields: fieldsApi,
          envelope: envelope,
          values: values,
          options: {
            schema: schemaApi,
            fields: fieldsApi,
            envelope: envelope,
            values: values,
            credentials: credentialUi,
          },
          provider: selected,
          providerNames: providerNames,
          groups: providerGroups,
          leaves: providerLeaves,
          catalog: catalog,
          locale: DICT,
          onSelect: function (name) {
            // Selecting a provider leaves add mode, whichever tab asked.
            setAdding(false)
            setSelected(name)
          },
          onAdd: function (name) {
            staged.edit(['providers', name], {})
            // §15.2 item 8: a successful add selects the new provider and moves
            // the active tab to it.
            setAdding(false)
            setSelected(name)
          },
          onRemove: function (name) {
            staged.remove(['providers', name])
            var remaining = providerNames.filter(function (entry) {
              return entry !== name
            })
            setSelected(remaining.length > 0 ? remaining[0] : undefined)
          },
        }

        // The raw/form switch. It flips presentation only: no op is staged, no
        // revision is touched, and the sticky bar keeps working unchanged. The
        // panels chunk draws it in the tab strip's right-hand action slot.
        var rawActions = h(
          'button',
          {
            type: 'button',
            className: 'piai-btn',
            'aria-pressed': rawMode,
            onClick: function () {
              setRawMode(rawMode !== true)
            },
          },
          rawMode ? t('rawForm') : t('rawCode'),
        )

        // The provider switcher gets the tab items; the panel gets everything
        // else. Both are pure components, so nothing here may throw.
        var tabsProps = Object.assign({}, panelProps, {
          items: tabItems,
          label: t('providerTabs'),
          adding: adding,
          actions: rawActions,
          onSelectAdd: function () {
            setAdding(true)
          },
        })

        // Explicit states, in order of what is actually wrong. Nothing here may
        // throw: an escaping throw abdicates the cell in the slot renderer.
        var missing
        if (hookMissing) {
          missing = 'hookMissing'
        } else if (!hasController || staged === undefined) {
          missing = 'controllerMissing'
        }

        function missingFace(key) {
          return h('div', { className: 'piai-error piai-boundary', role: 'alert' }, t(key))
        }

        /**
         * The read-only raw-config face: the current draft as YAML.
         *
         * Pure presentation — it reads `formSnapshot.values`, renders, and
         * returns. No op is staged, nothing is saved, and the sticky bar below
         * keeps its ordinary meaning. A missing serializer degrades to one
         * bundled line rather than throwing during render.
         */
        function rawFace() {
          var yamlText = attempt(function () {
            if (yamlApi === null || yamlApi === undefined || typeof yamlApi.toYaml !== 'function') {
              return undefined
            }
            var text = yamlApi.toYaml(formSnapshot.values)
            return typeof text === 'string' ? text : undefined
          }, undefined)
          var children = []
          if (formSnapshot.dirty === true) {
            children.push(h('div', { className: 'piai-hint', key: 'notice' }, t('rawNotice')))
          }
          if (typeof yamlText === 'string') {
            children.push(
              h(CodeBlock, { key: 'code', code: yamlText, lang: 'yaml', lineNumbers: true }),
            )
          } else {
            children.push(h('div', { className: 'piai-hint', key: 'code' }, RAW_VIEW_FALLBACK))
          }
          return children
        }

        var body
        if (missing !== undefined) {
          body = missingFace(missing)
        } else if (envelope === undefined) {
          // The namespace is served but its schema has not arrived yet.
          body = h('div', { className: 'piai-loading' }, t('loading'))
        } else if (rawMode === true) {
          body = rawFace()
        } else {
          body = h(panelOf(isComponent, panels, 'ProviderPanel', t), panelProps)
        }

        var tabs = h(panelOf(isComponent, panels, 'ProviderTabs', t), Object.assign({ key: 'tabs' }, tabsProps))

        var notices = []
        if (missing !== undefined) {
          notices.push(
            h('div', { className: 'piai-error', key: 'missing', role: 'alert' }, t(missing)),
          )
        }
        if (controllerSnapshot.writable === false) {
          notices.push(h('div', { className: 'piai-warn', key: 'w' }, t('unwritable')))
        }
        if (formSnapshot.error !== undefined && formSnapshot.error !== null) {
          notices.push(
            h(
              'div',
              { className: 'piai-error', key: 'e', role: 'alert' },
              String(formSnapshot.error),
            ),
          )
        } else if (message !== undefined) {
          notices.push(h('div', { className: 'piai-error', key: 'm', role: 'alert' }, message))
        }

        var barDisabled = staged === undefined
        // The dot is the non-colour half of the unsaved-state signal; the text
        // next to it is the accessible one (§8.4, §8.5).
        var statusState = 'done'
        if (formSnapshot.error !== undefined && formSnapshot.error !== null) {
          statusState = 'error'
        } else if (invalid) {
          statusState = 'warning'
        } else if (formSnapshot.dirty) {
          statusState = 'ongoing'
        }

        var bar = h('div', { className: 'piai-bar', key: 'bar' }, [
          h('span', { className: 'piai-dirty', key: 'd', 'aria-live': 'polite' }, [
            h(StateDot, { key: 'dot', state: statusState }),
            h('span', { key: 'text' }, formSnapshot.dirty ? t('dirty') : t('clean')),
          ]),
          // v7 / R1 (§15.2 item 9): the destructive action lives here now, not in
          // the tab strip. Disabled without a selected provider or without a
          // writable controller; the two-step confirmation is unchanged.
          h(ProviderDeleteButton, {
            key: 'del',
            label: '删除当前提供商',
            question: selected === undefined ? '' : '确认删除提供商 ' + selected + '？',
            confirmLabel: '确认删除',
            disabled:
              barDisabled || selected === undefined || controllerSnapshot.writable === false,
            onConfirm: function () {
              if (typeof panelProps.onRemove === 'function') panelProps.onRemove(selected)
            },
          }),
          h(
            'button',
            {
              key: 'discard',
              type: 'button',
              className: 'piai-btn',
              disabled: barDisabled || !formSnapshot.dirty || formSnapshot.saving === true,
              onClick: function () {
                if (barDisabled) return
                staged.discard()
              },
            },
            t('discard'),
          ),
          h(
            'button',
            {
              key: 'save',
              type: 'button',
              className: 'piai-btn piai-btn-primary',
              disabled:
                barDisabled || !formSnapshot.dirty || formSnapshot.saving === true || invalid,
              onClick: function () {
                if (barDisabled || !formSnapshot.dirty || invalid) return
                staged.save()
              },
            },
            formSnapshot.saving === true ? t('saving') : t('save'),
          ),
        ])

        // The provider switcher is page chrome; the panel body sits under it.
        // While the add tab is active the strip's own add panel is the page's
        // tabpanel, so the provider face is not rendered at all (§15.2 item 8);
        // with no providers there is no tablist, so no tabpanel either.
        var panelContainer
        if (adding) {
          panelContainer = null
        } else if (selectedTab === undefined) {
          panelContainer = h('div', null, body)
        } else {
          panelContainer = h(
            'div',
            {
              role: 'tabpanel',
              id: selectedTab.panelId,
              'aria-labelledby': selectedTab.id,
            },
            body,
          )
        }

        // Both page faces come from the panels chunk, so both get their own
        // boundary: a crash in the switcher must not take the field panel (or
        // the cell) down with it, and vice versa.
        var tabsBlock =
          missing !== undefined || envelope === undefined
            ? null
            : h(
                PageBoundary,
                {
                  key: 'tabs',
                  failureKey: 'renderFailed',
                  fallbackText: 'The page failed to render: ',
                  t: props.t,
                },
                tabs,
              )

        return h('div', { className: 'piai-root piai-page', 'data-piai': '1' }, [
          h('div', { className: 'piai-header', key: 'head' }, [
            h('div', { className: 'piai-title', key: 't' }, t('title')),
            h('div', { className: 'piai-subtitle', key: 's' }, t('subtitle')),
          ]),
          tabsBlock,
          h('div', { className: 'piai-notices', key: 'n' }, notices),
          h(
            'div',
            { className: 'piai-body', key: 'body' },
            h(
              PageBoundary,
              {
                // Remount on provider change so per-provider fold state and a
                // crashed panel both reset with the selection (and on the switch
                // into the add tab, which has no provider face at all).
                key: adding ? 'add' : selectedTab === undefined ? 'none' : selectedTab.value,
                failureKey: 'renderFailed',
                fallbackText: 'The page failed to render: ',
                t: props.t,
              },
              panelContainer,
            ),
          ),
          bar,
        ])
      }
    }

    return { makePage: makePage }
  }

  var api = { createPage: createPage }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.page = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function (require) {
        // The built API replaces the deferred one so the owner (and any later
        // chunk) reads `{makePage}` off the registry.
        var built = createPage(require)
        var live = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
        live.page = built
        return built
      },
    })
  }
})(globalThis)
