/**
 * Instance containers and the compat disclosures.
 *
 * v10 split the panels chunk into modules: the facade (`client.panels.js`)
 * composes them through a shared bag, so a module never imports another. Two
 * rules make that work:
 *
 *   - **cross-module calls go through `shared.components.<name>` at call time**
 *     (`renderRow` is reached by the instances and catalog modules, `FieldsBlock`
 *     by the instances module, `renderControl` by the kit — a cycle that only
 *     late binding can express). Never capture one at creation time.
 *   - this module's own functions are called directly; nothing is re-exported
 *     through the bag except at the end.
 *
 * 
 *  * `models[]` and `modelOverrides` are rendered as one card per instance: the
 *  * member leaves arrive path-transparent with `leaf.container`, and this module
 *  * re-bases them onto a real instance path (`providers.p.models.0.id`) — the only
 *  * shape the host's `applyPathOp` accepts. The card head is self-written (v7), and
 *  * the frozen compat grouping is disclosed through the same head (v8).
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsInstances
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.instances.js'

  /**
   * The frozen compat disclosure grouping (docs/interaction-design.md §6).
   *
   * Six groups, 26 keys. This is a presentation table over *compat* keys, not
   * over provider/model fields: it cannot hide a field. A compat key that is
   * not listed (an adapter addition) is disclosed by the fallback group built
   * in {@link compatSections}.
   */
  var COMPAT_SECTIONS = [
    {
      title: '通用能力',
      keys: [
        'supportsStore',
        'supportsDeveloperRole',
        'supportsReasoningEffort',
        'supportsUsageInStreaming',
        'supportsFinishReason',
      ],
    },
    {
      title: 'Token 与字段名',
      keys: [
        'maxTokensField',
        'supportsMaxOutputTokens',
        'supportsThinkingTokenBudget',
        'thinkingTokenBudgetField',
      ],
    },
    {
      title: '推理 / Thinking',
      keys: [
        'thinkingFormat',
        'requiresThinkingAsText',
        'requiresReasoningContentOnAssistantMessages',
        'forceAdaptiveThinking',
        'allowEmptySignature',
      ],
    },
    {
      title: '工具调用',
      keys: [
        'requiresToolResultName',
        'requiresAssistantAfterToolResult',
        'supportsStrictMode',
        'supportsStrictTools',
        'supportsEagerToolInputStreaming',
        'supportsCacheControlOnTools',
      ],
    },
    {
      title: '缓存',
      keys: ['cacheControlFormat', 'supportsLongCacheRetention'],
    },
    {
      title: '模板与路由',
      keys: ['chatTemplateKwargs', 'chatTemplateArgs', 'vllmPriority', 'supportsTemperature'],
    },
  ]

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createInstances(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var readPath = core.readPath
    var isExpression = core.isExpression
    var controlIdOf = core.controlIdOf
    var keyOf = core.keyOf
    var Button = ui.Button
    var IconChevronRightOutlineRegular = ui.IconChevronRightOutlineRegular
    var IconChevronDownOutlineRegular = ui.IconChevronDownOutlineRegular
    var IconTrashOutlineRegular = ui.IconTrashOutlineRegular

    /**
     * The relative path of a member leaf inside its instance container.
     *
     * @param leaf - a leaf tagged with `leaf.container`.
     * @param container - that container `{kind, path}`.
     * @returns the path segments below the container.
     */
    function relativeTo(container, leaf) {
      var path = leaf.path || []
      var base = container.path || []
      return path.slice(base.length)
    }

    /**
     * Re-base the member leaves of one instance onto its real path.
     *
     * The `container` tag is dropped: the returned leaves are ordinary rows for
     * the section's own container-free field block, which is what stops the
     * partition from recursing into itself.
     *
     * @param container - the instance container.
     * @param leaves - the member leaves.
     * @param instance - the index or key of the instance.
     * @returns leaves with absolute instance paths.
     */
    function instanceLeaves(container, leaves, instance) {
      var out = []
      for (var index = 0; index < leaves.length; index += 1) {
        var leaf = leaves[index]
        out.push(
          Object.assign({}, leaf, {
            path: (container.path || []).concat([instance]).concat(relativeTo(container, leaf)),
            // Presentation is keyed relative to the provider profile and knows
            // no instance segment; keep the pre-rebase path for label/hint/unit
            // lookups while reads and writes use the instance path above.
            presentationPath: leaf.presentationPath !== undefined ? leaf.presentationPath : leaf.path,
            container: undefined,
          }),
        )
      }
      return out
    }

    /**
     * The leaf whose value titles an instance card when no ranked candidate has
     * a non-empty value.
     *
     * Chosen from schema metadata only — the first member leaf that is required
     * and a string — so this file names no field. It is what lets a model card
     * read `#2 deepseek-v4-pro` without knowing that `id` exists.
     *
     * @param leaves - the member leaves.
     * @returns the leaf, or `undefined`.
     */
    function titleLeafOf(leaves) {
      for (var index = 0; index < leaves.length; index += 1) {
        var leaf = leaves[index]
        if (leaf.required === true && leaf.kind === 'string') return leaf
      }
      return undefined
    }

    /**
     * One member leaf's card-title priority, from pure presentation metadata.
     *
     * `fields.describeField(...).titleRank` is how the panel learns that the
     * display name outranks the other leaves without ever naming a field
     * (AGENTS §3.2; docs/interaction-design.md §15.4, §15.9 D1).
     *
     * @param fields - the presentation API.
     * @param leaf - a member leaf.
     * @returns the rank, or `undefined` when the leaf is not a candidate.
     */
    function titleRankOf(fields, leaf) {
      if (fields === null || fields === undefined || typeof fields.describeField !== 'function') {
        return undefined
      }
      var path =
        typeof fields.presentationPathOf === 'function'
          ? fields.presentationPathOf(leaf)
          : (leaf.path || []).join('.')
      var described = fields.describeField(path)
      var rank = described === null || described === undefined ? undefined : described.titleRank
      return typeof rank === 'number' ? rank : undefined
    }

    /**
     * The card title text for one instance: the value of the highest-priority
     * member leaf that holds a non-empty string, else `''` (the card then shows
     * only its `#n` / dict key).
     *
     * Ranked candidates come first, lowest `titleRank` winning; when none of
     * them has a value the schema-derived required-string leaf is the fallback.
     *
     * @param container - the instance container.
     * @param leaves - its member leaves.
     * @param values - the whole settings value tree.
     * @param instance - the array index or the dict key.
     * @param fields - the presentation API.
     * @returns the title text, or `''`.
     */
    function instanceTitle(container, leaves, values, instance, fields) {
      var list = Array.isArray(leaves) ? leaves : []
      var ranked = []
      for (var index = 0; index < list.length; index += 1) {
        var rank = titleRankOf(fields, list[index])
        if (rank !== undefined) ranked.push({ leaf: list[index], rank: rank, order: index })
      }
      ranked.sort(function (left, right) {
        return left.rank === right.rank ? left.order - right.order : left.rank - right.rank
      })
      var ordered = ranked.map(function (candidate) {
        return candidate.leaf
      })
      var fallback = titleLeafOf(list)
      if (fallback !== undefined) ordered.push(fallback)
      for (var scan = 0; scan < ordered.length; scan += 1) {
        var leaf = ordered[scan]
        var value = readPath(values, (container.path || []).concat([instance]).concat(relativeTo(container, leaf)))
        if (typeof value === 'string' && value !== '') return value
      }
      return ''
    }

    /**
     * The delete control of an instance card.
     *
     * It lives in the head's action slot, so it is always in the DOM — deleting
     * never requires expanding the card first. It is a SIBLING of the disclosure
     * button, never nested inside it, so no interactive control sits inside
     * another (docs/interaction-design.md §15.4). Its accessible name is
     * localized and it always carries a `title`.
     *
     * The two-step confirmation is the page's existing one: the first click
     * arms, Escape cancels, the second click writes `form.remove(instancePath)`
     * — the path still carries the instance segment, unchanged.
     */
    function ItemRemove(props) {
      var state = react.useState(false)
      var armed = state[0]
      var setArmed = state[1]
      react.useEffect(
        function () {
          if (armed !== true) return undefined
          if (typeof document === 'undefined' || document === null) return undefined
          if (typeof document.addEventListener !== 'function') return undefined
          var onKey = function (event) {
            if (event.key === 'Escape') setArmed(false)
          }
          document.addEventListener('keydown', onKey)
          return function () {
            document.removeEventListener('keydown', onKey)
          }
        },
        [armed],
      )
      if (armed !== true) {
        return h(
          'button',
          {
            type: 'button',
            role: 'button',
            className: 'piai-item-remove',
            'aria-label': props.label,
            title: props.label,
            onClick: function () {
              setArmed(true)
            },
          },
          h(IconTrashOutlineRegular, { key: 'icon', size: 14 }),
        )
      }
      return h(
        'span',
        {
          role: 'group',
          'aria-label': props.question,
          onKeyDown: function (event) {
            if (event.key === 'Escape') setArmed(false)
          },
        },
        [
          h('span', { className: 'piai-hint', key: 'q', role: 'alert' }, props.question),
          h(
            Button,
            {
              variant: 'outline',
              size: 'sm',
              key: 'yes',
              'aria-label': props.confirmLabel,
              onClick: function () {
                setArmed(false)
                props.onConfirm()
              },
            },
            props.confirmLabel,
          ),
          h(
            Button,
            {
              variant: 'outline',
              size: 'sm',
              key: 'no',
              'aria-label': '取消删除',
              onClick: function () {
                setArmed(false)
              },
            },
            '取消',
          ),
        ],
      )
    }

    /**
     * The self-written head of a collapsible group.
     *
     * v7 uses it for the instance cards (`models[]` / `modelOverrides`,
     * interaction-design §15.4); v8 uses the very same head for the compat
     * groups (§16 R3), so both collapse the same way. `DisclosureRow` could not
     * host either: the primitive has no right-hand action slot, and its
     * `collapsedContent` is rendered inside a 24px `overflow: hidden` row, which
     * would clip a delete button. So the head is a plain row — a native
     * disclosure button (chevron + title, so the title is clickable too and
     * Enter/Space toggle for free) plus an optional action slot.
     *
     * @param options - `{key, title, expanded, bodyId, onToggle}`, plus either
     *   `actions` (the exact children of `.piai-item-actions`; `[]` renders no
     *   action slot at all) or the delete control's `{removeKey, removeLabel,
     *   question, confirmLabel, onRemove}`. Omitting `actions` keeps the delete
     *   button the instance cards have had since v7.
     * @returns the head element.
     */
    function instanceCardHead(options) {
      var actions =
        options.actions !== undefined
          ? options.actions
          : [
              h(ItemRemove, {
                key: options.removeKey,
                label: options.removeLabel,
                question: options.question,
                confirmLabel: options.confirmLabel,
                onConfirm: options.onRemove,
              }),
            ]
      var children = [
        h(
          'button',
          {
            key: 'toggle',
            type: 'button',
            role: 'button',
            'aria-expanded': options.expanded === true,
            'aria-controls': options.bodyId,
            onClick: options.onToggle,
          },
          [
            options.expanded === true
              ? h(IconChevronDownOutlineRegular, { key: 'chevron', size: 14 })
              : h(IconChevronRightOutlineRegular, { key: 'chevron', size: 14 }),
            options.title,
          ],
        ),
      ]
      if (actions.length > 0) {
        children.push(h('div', { className: 'piai-item-actions', key: 'actions' }, actions))
      }
      return h('div', { className: 'piai-item-head', key: options.key }, children)
    }

    /** The value of a container path, or `undefined` when the path is absent. */
    function containerValue(container, values) {
      return readPath(values || {}, container.path || [])
    }

    /**
     * A repeatable array of objects (`models[]`) as one collapsible card per item.
     *
     * Addresses each item by INDEX, which is exactly how the host's `unset`
     * splices and how `set` appends; a path without the index would be rejected
     * with `Config array index "<field>" is out of range`.
     */
    function ArraySection(props) {
      var container = props.container
      var state = react.useState({})
      var open = state[0]
      var setOpen = state[1]
      var current = containerValue(container, props.values)
      if (isExpression(current)) {
        return h(
          'div',
          { className: 'piai-array' },
          h('div', { className: 'piai-row piai-expr' }, components.expressionBody(props.fields.labelFor(props.leaves[0]), current)),
        )
      }
      var items = Array.isArray(current) ? current : []
      var rows = []
      for (var index = 0; index < items.length; index += 1) {
        var instancePath = (container.path || []).concat([index])
        var expanded = open[index] === true
        var bodyId = controlIdOf(instancePath) + '-body'
        var titleText = instanceTitle(container, props.leaves, props.values || {}, index, props.fields)
        var number = '#' + String(index + 1)
        var titleNodes = [h('span', { className: 'piai-array-index', key: 'i' }, number)]
        if (titleText !== '') titleNodes.push(h('span', { key: 't' }, ' ' + titleText))
        var name = titleText === '' ? number : titleText
        rows.push(
          h('div', { className: 'piai-array-row', key: 'item:' + String(index) }, [
            instanceCardHead({
              key: 'head',
              title: titleNodes,
              expanded: expanded,
              bodyId: bodyId,
              onToggle: function (at, isOpen) {
                return function () {
                  var next = Object.assign({}, isOpen)
                  next[at] = next[at] !== true
                  setOpen(next)
                }
              }(index, open),
              removeKey: 'remove:' + String(index),
              removeLabel: '删除模型 ' + name,
              question: '确认删除模型 ' + name + '？',
              confirmLabel: '确认删除',
              onRemove: function (path) {
                return function () {
                  props.form.remove(path)
                }
              }(instancePath),
            }),
            h(
              'div',
              { id: bodyId, hidden: expanded !== true, key: 'body' },
              expanded === true
                ? [
                    h(components.FieldsBlock, {
                      key: 'fields',
                      leaves: instanceLeaves(container, props.leaves, index),
                      form: props.form,
                      fields: props.fields,
                      values: props.values,
                      options: props.options,
                      withheld: props.withheld,
                    }),
                  ]
                : [],
            ),
          ]),
        )
      }
      rows.push(
        h(
          Button,
          {
            key: 'add',
            id: controlIdOf((container.path || []).concat(['add'])) + '-go',
            variant: 'outline',
            size: 'sm',
            'aria-label': '添加一项',
            onClick: function () {
              props.form.edit((container.path || []).concat([items.length]), {})
            },
          },
          '添加一项',
        ),
      )
      return h('div', { className: 'piai-array' }, rows)
    }

    /**
     * An open map of objects (`modelOverrides`) as one collapsible card per key.
     *
     * The key IS the instance, so it is the map key of the settings path — the
     * same shape the adapter expects for an override.
     */
    function InstanceDictSection(props) {
      var container = props.container
      var state = react.useState({})
      var open = state[0]
      var setOpen = state[1]
      var current = containerValue(container, props.values)
      if (isExpression(current)) {
        return h(
          'div',
          { className: 'piai-dict' },
          h('div', { className: 'piai-row piai-expr' }, components.expressionBody(props.fields.labelFor(props.leaves[0]), current)),
        )
      }
      var map = current !== null && typeof current === 'object' && !Array.isArray(current) ? current : {}
      var keys = Object.keys(map)
      var rows = keys.map(function (key) {
        var instancePath = (container.path || []).concat([key])
        var expanded = open[key] === true
        var bodyId = controlIdOf(instancePath) + '-body'
        // The dict key IS the card title (docs/interaction-design.md §15.4):
        // `modelOverrides` never enters the `titleRank` candidate flow.
        var titleNodes = [h('code', { className: 'piai-dict-key', key: 'k' }, key)]
        return h('div', { className: 'piai-dict-row', key: 'key:' + key }, [
          instanceCardHead({
            key: 'head',
            title: titleNodes,
            expanded: expanded,
            bodyId: bodyId,
            onToggle: function () {
              var next = Object.assign({}, open)
              next[key] = next[key] !== true
              setOpen(next)
            },
            removeKey: 'remove:' + key,
            removeLabel: '删除模型 ' + key,
            question: '确认删除键 ' + key + '？',
            confirmLabel: '确认删除',
            onRemove: function () {
              props.form.remove(instancePath)
            },
          }),
          h(
            'div',
            { id: bodyId, hidden: expanded !== true, key: 'body' },
            expanded === true
              ? [
                  h(components.FieldsBlock, {
                    key: 'fields',
                    leaves: instanceLeaves(container, props.leaves, key),
                    form: props.form,
                    fields: props.fields,
                    values: props.values,
                    options: props.options,
                    withheld: props.withheld,
                  }),
                ]
              : [],
          ),
        ])
      })
      rows.push(
        h(components.AddKey, {
          key: 'add',
          id: controlIdOf((container.path || []).concat(['add'])),
          existing: keys,
          onAdd: function (key) {
            props.form.edit((container.path || []).concat([key]), {})
          },
        }),
      )
      return h('div', { className: 'piai-dict' }, rows)
    }

    /**
     * Split the compat leaves into the frozen disclosure sections.
     *
     * A key the frozen table does not list is disclosed by a trailing fallback
     * section, so an adapter addition can never become invisible here.
     *
     * @param leaves - the compat group's leaves.
     * @returns `[{title, leaves}]`.
     */
    function compatSections(leaves) {
      var list = Array.isArray(leaves) ? leaves : []
      var claimed = {}
      var sections = []
      for (var index = 0; index < COMPAT_SECTIONS.length; index += 1) {
        var definition = COMPAT_SECTIONS[index]
        var picked = []
        for (var scan = 0; scan < definition.keys.length; scan += 1) {
          var key = definition.keys[scan]
          claimed[key] = true
          for (var find = 0; find < list.length; find += 1) {
            if (keyOf(list[find].path) === key) {
              picked.push(list[find])
              break
            }
          }
        }
        sections.push({ title: definition.title, leaves: picked })
      }
      var rest = []
      for (var restIndex = 0; restIndex < list.length; restIndex += 1) {
        if (claimed[keyOf(list[restIndex].path)] !== true) rest.push(list[restIndex])
      }
      if (rest.length > 0) sections.push({ title: '其他兼容项', leaves: rest })
      return sections
    }

    /**
     * The compat group as collapsible disclosures.
     *
     * Fold state is presentation only: a collapsed group still renders its rows
     * when open and never changes what a write does or whether a field is
     * editable.
     *
     * v8 R3: the head is the same self-written one the instance cards use — a
     * constantly visible chevron (collapsed ▸ / expanded ▾), the whole title
     * clickable, no count badge — and the body carries `piai-disclosure-body`
     * so its content lines up with the title text instead of the row edge. The
     * body element stays in the DOM (so `aria-controls` always resolves) while
     * its fields mount only when open, which keeps the invariant "a collapsed
     * group holds no compat control" true.
     */
    function CompatDisclosures(props) {
      var state = react.useState({})
      var open = state[0]
      var setOpen = state[1]
      var sections = compatSections(props.leaves)
      return h(
        'div',
        { className: 'piai-disclosure' },
        sections.map(function (section, index) {
          var expanded = open[section.title] === true
          // The id must come from the INDEX, never the title: `controlIdOf`
          // replaces every character outside [A-Za-z0-9_-] with `-`, so the part
          // Chinese section titles would all collapse to the same id.
          var bodyId = controlIdOf(['compat-section', String(index)]) + '-body'
          return h('div', { key: section.title }, [
            instanceCardHead({
              key: 'head',
              title: h('span', null, section.title),
              expanded: expanded,
              bodyId: bodyId,
              onToggle: function () {
                var next = Object.assign({}, open)
                next[section.title] = expanded !== true
                setOpen(next)
              },
              // No counter badge, no delete: an empty slot renders nothing.
              actions: [],
            }),
            h(
              'div',
              { className: 'piai-disclosure-body', id: bodyId, hidden: expanded !== true, key: 'body' },
              expanded === true
                ? [
                    h(components.FieldsBlock, {
                      key: 'fields',
                      leaves: section.leaves,
                      form: props.form,
                      fields: props.fields,
                      values: props.values,
                      options: props.options,
                      withheld: props.withheld,
                    }),
                  ]
                : [],
            ),
          ])
        }),
      )
    }

    return {
      ArraySection: ArraySection,
      InstanceDictSection: InstanceDictSection,
      instanceCardHead: instanceCardHead,
      relativeTo: relativeTo,
      titleLeafOf: titleLeafOf,
      titleRankOf: titleRankOf,
      compatSections: compatSections,
      CompatDisclosures: CompatDisclosures
    }
  }

  var api = { createInstances: createInstances }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsInstances = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function () {
        return api
      },
    })
  }
})(globalThis)
