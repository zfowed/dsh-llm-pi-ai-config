/**
 * Panels facade: the two components the page renders, composed from the
 * `client.panels.*.js` modules.
 *
 * v10 split the formerly 4000-line chunk into modules. This file keeps only the
 * composition and the two public components:
 *
 *   - `ProviderTabs` — the underline tab strip (tablist/tab/tabpanel, roving
 *     tabindex, arrow/Home/End) plus the trailing add tab. With **zero**
 *     providers it renders no tablist and no tabpanel at all: the add form is
 *     the page's only affordance (D2, docs/interaction-design §15.2.10);
 *   - `ProviderPanel` — every group the schema walker produced, in order, so a
 *     group added upstream appears without an edit and no field can hide behind
 *     a tab that no longer exists.
 *
 * Composition (see `docs/interface-contract.md`): each `client.panels.*` module
 * exports one `create<X>(shared)` factory. The facade builds the shared bag
 * (`{core, ui, react, h, require, components}`), calls the creators in
 * dependency order and merges what each returns into `shared.components`.
 * Cross-module calls are read off that bag **at call time**, which is what lets
 * the modules reference each other in a cycle (`renderRow` ← instances,
 * `FieldsBlock` ← instances, `renderControl` ← kit) without importing anything.
 *
 * Purity rules for the whole panel layer (unchanged): props only, no cordis
 * `ctx`, no `remote.*`, no I/O, and every mutation goes through the staged
 * `form` — which is what keeps "a cleared field is `unset`, never `null`" true,
 * because that is implemented once, in `lib/client.form.js`.
 *
 * Chunk envelope: plain script, no `import`/`export`. The owner requests this
 * chunk in phase 1, after `client.core.js` (phase 0) and after the
 * `client.panels.*` modules exist... the owner requests the modules itself, in
 * the same phase, so `createPanels` reads them out of the registry.
 *
 * @module dsh-llm-pi-ai-config/client.panels
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.js'

  /** The two components this chunk publishes. */
  var COMPONENT_NAMES = ['ProviderPanel', 'ProviderTabs']

  /**
   * The module creators, in dependency order.
   *
   * Each entry is `[registryKey, factoryName]`; the owner loads every one of
   * them before this chunk, so a missing key is a loud chunk-plan error rather
   * than a half-built panel.
   */
  var CREATORS = [
    ['panelsKit', 'createKit'],
    ['panelsControls', 'createControls'],
    ['panelsCollections', 'createCollections'],
    ['panelsRender', 'createRender'],
    ['panelsInstances', 'createInstances'],
    ['panelsCatalog', 'createCatalog'],
  ]

  /**
   * The shared base chunk this chunk builds against.
   *
   * `client.core.js` owns the primitives resolution and the local stand-ins, so
   * there is exactly one `isComponent` and one fallback per primitive in the
   * package. The owner loads core in phase 0, before this chunk is requested;
   * `deps.core` lets a test inject it explicitly.
   *
   * @param deps - optional `{core}` override (tests / a host shim).
   * @returns the core API, with its `ui` already built by core's factory.
   */
  function resolveCore(deps) {
    var explicit = deps !== null && deps !== undefined ? deps.core : undefined
    var registry = global.__dshLlmPiAiConfig
    var found =
      explicit !== undefined
        ? explicit
        : registry !== null && registry !== undefined
          ? registry.core
          : undefined
    var ui = found !== null && found !== undefined ? found.ui : undefined
    if (ui === null || ui === undefined) {
      throw new Error('dsh-llm-pi-ai-config: client.core.js must be loaded before client.panels.js')
    }
    return found
  }

  function createPanels(require, deps) {
    var core = resolveCore(deps)
    var ui = core.ui
    var react = ui.react
    var h = ui.h
    var Button = ui.Button
    var Input = ui.Input

    var registry = global.__dshLlmPiAiConfig
    var shared = {
      core: core,
      ui: ui,
      react: react,
      h: h,
      require: require,
      components: {},
    }

    for (var index = 0; index < CREATORS.length; index += 1) {
      var entry = CREATORS[index]
      var part = registry !== null && registry !== undefined ? registry[entry[0]] : undefined
      var factory = part !== null && part !== undefined ? part[entry[1]] : undefined
      if (typeof factory !== 'function') {
        throw new Error(
          'dsh-llm-pi-ai-config: ' + entry[0] + ' must be loaded before client.panels.js',
        )
      }
      var contributed = factory(shared)
      var keys = Object.keys(contributed)
      for (var key = 0; key < keys.length; key += 1) {
        shared.components[keys[key]] = contributed[keys[key]]
      }
    }

    var components = shared.components

    /**
     * The compact provider switcher.
     *
     * v7 / R1 (docs/interaction-design.md §15.2) replaces the small pill with
     * the shipped `PluginsSettingsSection` tab row: one underlined text tab per
     * provider, plus a trailing 「添加」 tab that is a real `role="tab"` whose
     * own `role="tabpanel"` hosts the add-provider form. The appearance is
     * copied from that page's CSS (E1) with two intentional deviations:
     *
     *   1. the tab row wraps (`flex-wrap: wrap`) — the number of providers is
     *      user input and E1's single `gap:22px` row would clip (§15.2 item 4);
     *   2. `.piai-tabs` carries its own bottom margin, because the strip and the
     *      page body are not siblings inside one flex column here (§15.2 item 5).
     *
     * Semantics and the keyboard model stay E2's: one tablist, `aria-selected` /
     * `aria-controls` / `data-active` / roving `tabIndex` per tab, and
     * Arrow/Home/End with `preventDefault()` + `stopPropagation()` before the
     * neighbour is focused and the switch requested.
     *
     * With no providers the tablist is not rendered at all and the add form is
     * shown directly, so no `role="tab"` / `role="tabpanel"` is left behind with
     * a dangling `aria-controls` (Lead's D2 ruling; the empty list still renders
     * the add-provider chrome, as `tests/render.test.js` expects).
     *
     * Props: `{providerNames, items, provider, label, adding, onSelect,
     * onSelectAdd, onAdd}`.
     */
    function ProviderTabs(props) {
      var providers = props.providerNames || []
      var items = props.items || []
      var adding = props.adding === true
      var hasTabs = providers.length > 0
      var state = react.useState('')
      var draft = state[0]
      var setDraft = state[1]

      /** Fixed DOM ids of the trailing add tab and its panel (§15.2 item 7). */
      var ADD_TAB_ID = 'model-extended-tab-add'
      var ADD_PANEL_ID = 'model-extended-panel-add'

      /** The roving-tabindex keyboard model of the shipped `SegmentedTabs`. */
      function onKeyDown(event, index) {
        var count = items.length + (hasTabs ? 1 : 0)
        var next
        switch (event.key) {
          case 'ArrowLeft':
            next = (index + count - 1) % count
            break
          case 'ArrowRight':
            next = (index + 1) % count
            break
          case 'Home':
            next = 0
            break
          case 'End':
            next = count - 1
            break
          default:
            return
        }
        event.preventDefault()
        event.stopPropagation()
        var target = event.currentTarget
        var tablist = target !== null && target !== undefined ? target.parentElement : undefined
        if (tablist !== null && tablist !== undefined && typeof tablist.querySelectorAll === 'function') {
          var found = tablist.querySelectorAll('[role="tab"]').item(next)
          if (found !== null && found !== undefined && typeof found.focus === 'function') found.focus()
        }
        if (next < items.length) {
          var nextItem = items[next]
          if (nextItem !== undefined) props.onSelect(nextItem.value)
          return
        }
        // The add tab is a real tab, so the arrow keys have to be able to land
        // on it as well.
        if (typeof props.onSelectAdd === 'function') props.onSelectAdd()
      }

      var tabs = providers.map(function (name, index) {
        var item = items[index] || { value: name, id: undefined, panelId: undefined }
        var label = typeof item.label === 'string' && item.label !== '' ? item.label : name
        var active = adding !== true && props.provider === name
        return h(
          'button',
          {
            key: name,
            type: 'button',
            role: 'tab',
            id: item.id,
            'aria-selected': active,
            'aria-controls': item.panelId,
            'data-active': active ? 'true' : undefined,
            tabIndex: active ? 0 : -1,
            'aria-label': '选择提供商 ' + label,
            onClick: function () {
              props.onSelect(name)
            },
            onKeyDown: function (event) {
              onKeyDown(event, index)
            },
          },
          label,
        )
      })

      if (hasTabs) {
        tabs.push(
          h(
            'button',
            {
              key: 'add',
              type: 'button',
              role: 'tab',
              id: ADD_TAB_ID,
              'aria-selected': adding,
              'aria-controls': ADD_PANEL_ID,
              'data-active': adding ? 'true' : undefined,
              tabIndex: adding ? 0 : -1,
              // The accessible name is the visible label and nothing else, so a
              // query for the add form's own 「添加提供商」 button cannot land on
              // the tab instead.
              'aria-label': '添加',
              onClick: function () {
                if (typeof props.onSelectAdd === 'function') props.onSelectAdd()
              },
              onKeyDown: function (event) {
                onKeyDown(event, items.length)
              },
            },
            '添加',
          ),
        )
      }

      var chrome = [
        h(Input, {
          key: 'name',
          id: 'llm-pi-ai-config-provider-add-name',
          type: 'text',
          value: draft,
          'aria-label': '新增提供商名',
          placeholder: '新增提供商名，例如 openai',
          onChange: function (event) {
            setDraft(event.target.value)
          },
        }),
        h(
          Button,
          {
            key: 'go',
            variant: 'outline',
            size: 'sm',
            'aria-label': '添加提供商',
            onClick: function () {
              var name = draft.trim()
              if (name === '' || providers.indexOf(name) !== -1) return
              setDraft('')
              props.onAdd(name)
            },
          },
          '添加提供商',
        ),
      ]

      // The add tab's own panel. While the add tab is active the owner does not
      // render the provider face, so the page holds exactly one tabpanel.
      var addForm = h(
        'div',
        {
          key: 'add',
          className: 'piai-provider-add',
          role: hasTabs ? 'tabpanel' : undefined,
          id: hasTabs ? ADD_PANEL_ID : undefined,
          'aria-labelledby': hasTabs ? ADD_TAB_ID : undefined,
        },
        chrome,
      )

      // R6 / T7: the strip is a two-slot bar — the tablist on the left and the
      // provider-level actions on the right. The right slot is always rendered
      // (a caller that supplies no actions leaves it empty), and the add panel
      // stays a SIBLING of the bar, so `.piai-tabs` remains the frozen strip
      // container and the tablist/tab/tabpanel aria contract is untouched.
      var bar = []
      if (hasTabs) {
        bar.push(
          h(
            'div',
            {
              key: 'list',
              className: 'piai-provider-list',
              role: 'tablist',
              'aria-label': props.label,
            },
            tabs,
          ),
        )
      }
      bar.push(
        h(
          'div',
          { key: 'actions', className: 'piai-item-actions' },
          props.actions === undefined || props.actions === null ? null : [props.actions],
        ),
      )

      var body = [h('div', { className: 'piai-tabs-bar', key: 'bar' }, bar)]
      if (hasTabs) {
        if (adding) body.push(addForm)
      } else {
        // No tablist: the add form is not a tabpanel here, it is the page's only
        // affordance, exactly as before v7 (§15.2 item 8 + D2).
        body.push(h('div', { className: 'piai-empty', key: 'empty' }, '请先添加一个提供商。'))
        body.push(addForm)
      }
      return h('div', { className: 'piai-tabs' }, body)
    }

    /**
     * Every configurable group of the selected provider, on one page.
     *
     * The caller supplies all groups the schema walker produced, so a group added
     * upstream shows up here without an edit to this file, and a field can never
     * be hidden behind a tab that does not exist any more.
     */
    function ProviderPanel(props) {
      var groups = props.groups || []
      if (groups.length === 0) {
        return h('div', { className: 'piai-panel piai-empty' }, '当前没有可编辑的字段。')
      }
      var withheld = components.withheldKeys(groups, props.values, props.fields)
      var sections = []
      for (var index = 0; index < groups.length; index += 1) {
        var group = groups[index]
        if (group.id === 'overrides') {
          // The adapter refuses a profile that sets `modelOverrides` for a model
          // a `models` entry already describes; say so instead of letting the
          // user discover it as a save error.
          sections.push(
            h(
              'div',
              { className: 'piai-hint', key: group.id + '-hint' },
              '按已安装目录中已有的模型 ID 覆盖参数。若某模型已在「模型列表」中完整声明，请勿再为其设置覆盖。',
            ),
          )
        }
        sections.push(
          h(components.GroupBlock, {
            key: group.id,
            group: group,
            form: props.form,
            fields: props.fields,
            values: props.values,
            options: props.options,
            withheld: withheld,
            // R7: only the group the presentation module marked `catalog`
            // (`models[]`) gets the discovery UI. The mark is a group id, never
            // a field name, so an upstream group cannot lose its field rows.
            catalog: group.catalog === true ? props.catalog : undefined,
          }),
        )
      }
      return h('div', { className: 'piai-panel piai-providers' }, sections)
    }

    return {
      ProviderTabs: ProviderTabs,
      ProviderPanel: ProviderPanel,
    }
  }

  var panels = { createPanels: createPanels, componentNames: COMPONENT_NAMES }

  // A `require` is only reachable inside the bundle factory (browser) or when a
  // caller supplies one (tests / a host shim). Node ESM has no `require`, so the
  // eager build is guarded: importing this chunk must never throw.
  var maybeRequire =
    typeof global.__dshLlmPiAiConfigRequire === 'function' ? global.__dshLlmPiAiConfigRequire : undefined
  if (maybeRequire !== undefined) {
    try {
      var eager = createPanels(maybeRequire)
      panels.ProviderTabs = eager.ProviderTabs
      panels.ProviderPanel = eager.ProviderPanel
    } catch (error) {
      panels.createError = error instanceof Error ? error.message : String(error)
    }
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panels = panels

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function (require) {
        var built = createPanels(require)
        global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {}
        global.__dshLlmPiAiConfig.panels = Object.assign({}, panels, built)
        return built
      },
    })
  }
})(globalThis)
