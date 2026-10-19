/**
 * Model discovery: the group's catalog UI and the picker dialog.
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
 *  * Everything here is derived structurally from a group's own member leaves —
 *  * which leaf identifies an entry, which one names it, which keys a row may carry
 *  * — so this module names no provider/model field (AGENTS §3.2). Discovery is a
 *  * read (`catalog.discover()`); adopting entries is one `form.edit` of the
 *  * group's array container, staged like any other change.
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsCatalog
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.catalog.js'

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createCatalog(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var readPath = core.readPath
    var isExpression = core.isExpression
    var keyOf = core.keyOf
    var protocolOfProfile = core.protocolOfProfile
    var Button = ui.Button
    var Modal = ui.Modal
    var Input = ui.Input

    /** The group's own `array` container (`models[]`), or `undefined`. */
    function arrayContainerOf(leaves) {
      var list = Array.isArray(leaves) ? leaves : []
      for (var index = 0; index < list.length; index += 1) {
        var leaf = list[index]
        var container = leaf !== null && typeof leaf === 'object' ? leaf.container : undefined
        if (container !== null && container !== undefined && container.kind === 'array') {
          return container
        }
      }
      return undefined
    }

    /**
     * `true` when two container tags describe the same container.
     *
     * The schema walker hands each leaf its OWN `container` object, so the tags
     * of one container are structurally equal but never the same reference
     * (`tests/fixtures` reports 32 distinct objects for `models[]`). Comparing
     * by identity would keep exactly one member and silently drop the rest.
     */
    function sameContainer(left, right) {
      if (left === right) return true
      if (left === null || right === null) return false
      if (typeof left !== 'object' || typeof right !== 'object') return false
      if (left.kind !== right.kind) return false
      var leftPath = Array.isArray(left.path) ? left.path : []
      var rightPath = Array.isArray(right.path) ? right.path : []
      if (leftPath.length !== rightPath.length) return false
      for (var index = 0; index < leftPath.length; index += 1) {
        if (leftPath[index] !== rightPath[index]) return false
      }
      return true
    }

    /** The member leaves of exactly one container, in document order. */
    function containerMembersOf(leaves, container) {
      var list = Array.isArray(leaves) ? leaves : []
      var members = []
      for (var index = 0; index < list.length; index += 1) {
        var leaf = list[index]
        if (leaf === null || typeof leaf !== 'object') continue
        if (!sameContainer(leaf.container, container)) continue
        members.push(leaf)
      }
      return members
    }

    /**
     * One member leaf's key inside its container, or `undefined` when the leaf
     * is nested (`compat.supportsStore`) — a discovered entry only ever carries
     * the container's own top-level members.
     */
    function memberKeyOf(container, leaf) {
      var relative = components.relativeTo(container, leaf)
      return relative.length === 1 ? String(relative[0]) : undefined
    }

    /** The top-level member keys a container declares, in leaf order. */
    function memberKeysOf(container, members) {
      var keys = []
      for (var index = 0; index < members.length; index += 1) {
        var key = memberKeyOf(container, members[index])
        if (key === undefined) continue
        if (keys.indexOf(key) === -1) keys.push(key)
      }
      return keys
    }

    /**
     * The key that identifies an entry: the schema-derived required string leaf
     * (`id`), the same leaf an instance card falls back to for its title.
     */
    function identityKeyOf(container, members) {
      var leaf = components.titleLeafOf(members)
      return leaf === undefined ? undefined : memberKeyOf(container, leaf)
    }

    /**
     * The key that displays an entry: the member leaf with the lowest
     * `titleRank` (the display name), so this file names no field.
     */
    function labelKeyOf(container, members, fields) {
      var best
      for (var index = 0; index < members.length; index += 1) {
        var rank = components.titleRankOf(fields, members[index])
        if (rank === undefined) continue
        var key = memberKeyOf(container, members[index])
        if (key === undefined) continue
        if (best === undefined || rank < best.rank) best = { rank: rank, key: key }
      }
      return best === undefined ? undefined : best.key
    }

    /** `true` when `value` owns `key` (`key` may be `undefined`). */
    function owns(value, key) {
      if (value === null || typeof value !== 'object') return false
      if (typeof key !== 'string' || key === '') return false
      return Object.prototype.hasOwnProperty.call(value, key)
    }

    /** Read one member of a row by a key that may be `undefined`. */
    function memberValueOf(value, key) {
      return owns(value, key) ? value[key] : undefined
    }

    /** The own enumerable keys of a row, or `[]`. */
    function rowKeysOf(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return []
      var keys = []
      for (var key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) keys.push(key)
      }
      return keys
    }

    /**
     * The shortest own key of `row` that extends `key` (`inputModalities` for
     * `input`), or `undefined`.
     */
    function extendedKeyOf(row, key, keys) {
      var best
      for (var index = 0; index < keys.length; index += 1) {
        var candidate = keys[index]
        if (candidate.length <= key.length) continue
        if (candidate.indexOf(key) !== 0) continue
        if (best === undefined || candidate.length < best.length) best = candidate
      }
      return best
    }

    /** A detached copy of a row value, so no drafted row shares host state. */
    function detachedValueOf(value) {
      if (Array.isArray(value)) return value.slice()
      if (value !== null && typeof value === 'object') return Object.assign({}, value)
      return value
    }

    /** A modality list restricted to the two modalities the schema accepts. */
    function modalityListOf(value) {
      var list = Array.isArray(value) ? value : []
      var out = []
      for (var index = 0; index < list.length; index += 1) {
        if (list[index] === 'text' || list[index] === 'image') out.push(list[index])
      }
      return out
    }

    /** The usable discovered entries: objects that carry a non-empty identity. */
    function discoveredRowsOf(models, identityKey) {
      var list = Array.isArray(models) ? models : []
      var rows = []
      var seen = {}
      for (var index = 0; index < list.length; index += 1) {
        var model = list[index]
        if (model === null || typeof model !== 'object' || Array.isArray(model)) continue
        var identity = memberValueOf(model, identityKey)
        if (typeof identity !== 'string' || identity === '') continue
        if (seen[identity] === true) continue
        seen[identity] = true
        rows.push(model)
      }
      return rows
    }

    /**
     * One discovered entry as a drafted row.
     *
     * A declared member key with the same name is copied verbatim; a member key
     * the listing only carries in its extended spelling takes that value (a
     * modality list is then restricted to `text`/`image`). Keys the schema does
     * not declare for the container are never copied.
     */
    function adoptedRowOf(row, memberKeys) {
      var out = {}
      var keys = rowKeysOf(row)
      for (var index = 0; index < memberKeys.length; index += 1) {
        var key = memberKeys[index]
        if (owns(row, key)) {
          var direct = detachedValueOf(row[key])
          if (direct !== undefined) out[key] = direct
          continue
        }
        var extended = extendedKeyOf(row, key, keys)
        if (extended === undefined) continue
        var value = row[extended]
        out[key] = Array.isArray(value) ? modalityListOf(value) : detachedValueOf(value)
      }
      return out
    }

    /** A caught value as a displayable message, never throwing itself. */
    function messageOf(error) {
      if (error === null || error === undefined) return undefined
      if (typeof error === 'string') return error
      if (typeof error.message === 'string') return error.message
      try {
        return String(error)
      } catch (ignored) {
        return undefined
      }
    }

    /**
     * The discovered-model picker.
     *
     * Presentational: the group above owns every piece of state, this only draws
     * it. The list is keyed by each entry's own identity, so a duplicate cannot
     * collide and every checkbox reflects the picked map.
     *
     * One row is `label > input[checkbox] + code.piai-dict-key`, and its ONE
     * piece of visible text is the raw id (monospace); the display name, when
     * the listing carries a distinct one, is only the `title` (hover) and falls
     * back to the id. That mirrors the shipped Models picker and keeps a model
     * whose name equals its id from showing the same text twice. The search box
     * still matches the id AND the name.
     *
     * Props: `{open, candidates, picked, query, identityKey, labelKey,
     * onQuery, onToggle, onToggleAll, onAdopt, onClose}`.
     */
    function ModelCatalogPicker(props) {
      // A closed picker renders nothing at all: the shipped `Modal` shows no
      // content when closed, and not constructing the portalled subtree keeps
      // the page at exactly one `.piai-root` node while the dialog is shut
      // (verify.polish P2e's scope-leak invariant). The group above owns every
      // piece of state, so nothing is lost by not mounting.
      if (props.open !== true) return null

      var candidates = Array.isArray(props.candidates) ? props.candidates : []
      var picked = props.picked !== null && typeof props.picked === 'object' ? props.picked : {}
      var query = typeof props.query === 'string' ? props.query : ''
      var normalized = query.trim().toLowerCase()

      var visible = []
      for (var index = 0; index < candidates.length; index += 1) {
        var candidate = candidates[index]
        var identity = memberValueOf(candidate, props.identityKey)
        if (typeof identity !== 'string' || identity === '') continue
        var label = memberValueOf(candidate, props.labelKey)
        var labelText = typeof label === 'string' ? label : ''
        if (
          normalized !== '' &&
          identity.toLowerCase().indexOf(normalized) === -1 &&
          labelText.toLowerCase().indexOf(normalized) === -1
        ) {
          continue
        }
        visible.push({ identity: identity, label: labelText })
      }

      var allVisiblePicked = visible.length > 0
      for (var scan = 0; scan < visible.length; scan += 1) {
        if (picked[visible[scan].identity] !== true) allVisiblePicked = false
      }

      var rows = []
      for (var row = 0; row < visible.length; row += 1) {
        var entry = visible[row]
        var checked = picked[entry.identity] === true
        rows.push(
          h('label', { key: entry.identity }, [
            h('input', {
              key: 'pick',
              type: 'checkbox',
              checked: checked,
              onChange: function () {
                props.onToggle(entry.identity)
              },
            }),
            // T25: the visible text is the raw id only, and the display name
            // (when the listing carries a distinct one) lives in `title` — the
            // shipped Models picker renders exactly this, and it stops a model
            // whose name equals its id from reading as the same text twice.
            // The name is still searchable: the filter above matches it too.
            h(
              'code',
              {
                key: 'value',
                className: 'piai-dict-key',
                title: entry.label !== '' ? entry.label : entry.identity,
              },
              entry.identity,
            ),
          ]),
        )
      }

      var list =
        visible.length === 0
          ? h('p', { className: 'piai-hint', role: 'status', key: 'empty' }, '没有匹配的模型。')
          : h('div', { className: 'piai-catalog', key: 'list' }, rows)

      return h(
        Modal,
        {
          open: props.open === true,
          onClose: props.onClose,
          title: '选择要添加的模型',
          closeLabel: '关闭',
          description: '从该提供商列出的模型中选择要添加的条目；已有条目不会被覆盖。',
          footer: [
            h(Button, { key: 'cancel', variant: 'outline', onClick: props.onClose }, '取消'),
            h(Button, { key: 'adopt', variant: 'outline', onClick: props.onAdopt }, '添加所选'),
          ],
        },
        [
          // T16: the shipped `Modal` renders through `createPortal(…,
          // document.body)`, so its content leaves the page's `.piai-root`
          // subtree and every scoped rule stops matching — the list lost all of
          // its layout while the primitives' own search field stayed styled.
          // Re-entering the scope with a nested `.piai-root` restores it; the
          // wrapper adds no class and no style of its own, and the Modal's
          // title/description/footer/aria and every child below are unchanged.
          h('div', { className: 'piai-root', key: 'portal-root' }, [
            h('div', { className: 'piai-item-actions', key: 'toolbar' }, [
              h(Input, {
                key: 'search',
                type: 'search',
                value: query,
                placeholder: '搜索模型',
                'aria-label': '搜索模型',
                onChange: function (event) {
                  props.onQuery(event.target.value)
                },
              }),
              h(
                Button,
                {
                  key: 'all',
                  variant: 'ghost',
                  size: 'sm',
                  disabled: visible.length === 0,
                  onClick: function () {
                    props.onToggleAll(
                      visible.map(function (item) {
                        return item.identity
                      }),
                    )
                  },
                },
                allVisiblePicked ? '取消全选' : '全选',
              ),
            ]),
            list,
          ]),
        ],
      )
    }

    /**
     * Render one presentation group: title, optional hint, then its rows.
     *
     * Groups come from `lib/client.fields.js`, so the panels never name a field
     * themselves — the identity/model/advanced split below is by group id, not
     * by field name. A field the grouping module places anywhere is therefore
     * always rendered, which is the property this project exists to preserve.
     *
     * A group the presentation module marks `catalog` (its own array container,
     * `models[]`) additionally gets the model-discovery action: a fetch button
     * in the group head's `.piai-item-actions` slot and the picker dialog. Every
     * catalog state here is display state; adoption is one `form.edit` of the
     * container, staged like any other draft change.
     */
    function GroupBlock(props) {
      var group = props.group
      var catalog = props.catalog

      // Catalog state is owned here and read unconditionally: the groups of one
      // render keep their order, so the hook order is fixed for the life of the
      // component. A group without `catalog` simply never shows any of it.
      var viewState = react.useState({
        busy: false,
        failure: undefined,
        hint: undefined,
        open: false,
        candidates: [],
        picked: {},
        query: '',
      })
      var view = viewState[0]
      var setView = viewState[1]

      /** Merge one patch into the catalog view, over the freshest state. */
      function patchView(patch) {
        setView(function (current) {
          return Object.assign({}, current, patch)
        })
      }

      var container = catalog !== undefined ? arrayContainerOf(group.leaves) : undefined
      var members = container === undefined ? [] : containerMembersOf(group.leaves, container)
      var memberKeys = container === undefined ? [] : memberKeysOf(container, members)
      var identityKey = container === undefined ? undefined : identityKeyOf(container, members)
      var labelKey = container === undefined ? undefined : labelKeyOf(container, members, props.fields)
      var containerValue = container === undefined ? undefined : readPath(props.values || {}, container.path || [])
      var containerExpression = container !== undefined && isExpression(containerValue)
      var available =
        catalog !== undefined &&
        catalog.available === true &&
        container !== undefined &&
        typeof identityKey === 'string' &&
        !containerExpression

      /** The discovery trigger's disabled reason, shown as its `title`. */
      var reason = '当前宿主不支持模型发现。'
      if (catalog !== undefined && catalog.error !== undefined && catalog.error !== null) {
        reason = messageOf(catalog.error) || reason
      }
      if (containerExpression) reason = '当前模型列表是 !!js 表达式，无法在此添加。'

      /** Ask the host for the container's models and show what came back. */
      function onFetch() {
        if (!available || view.busy === true) return
        patchView({ busy: true, failure: undefined, hint: undefined })
        var answer
        try {
          answer = catalog.discover()
        } catch (error) {
          answer = undefined
        }
        if (answer === null || answer === undefined || typeof answer.then !== 'function') {
          patchView({ busy: false, failure: '当前宿主不支持模型发现。' })
          return
        }
        answer.then(
          function (result) {
            var kind = result !== null && typeof result === 'object' ? result.kind : undefined
            if (kind === 'refused') {
              patchView({ busy: false, failure: messageOf(result.message) || '模型发现失败。' })
              return
            }
            if (kind !== 'found') {
              patchView({ busy: false, failure: '模型发现失败。' })
              return
            }
            var found = discoveredRowsOf(result.models, identityKey)
            if (found.length === 0) {
              patchView({ busy: false, hint: '该提供商没有列出任何模型，请手动添加。' })
              return
            }
            var present = {}
            var current = Array.isArray(containerValue) ? containerValue : []
            for (var index = 0; index < current.length; index += 1) {
              var identity = memberValueOf(current[index], identityKey)
              if (typeof identity === 'string' && identity !== '') present[identity] = true
            }
            var picked = {}
            for (var scan = 0; scan < found.length; scan += 1) {
              var foundIdentity = memberValueOf(found[scan], identityKey)
              if (present[foundIdentity] !== true) picked[foundIdentity] = true
            }
            patchView({
              busy: false,
              failure: undefined,
              hint: undefined,
              open: true,
              candidates: found,
              picked: picked,
              query: '',
            })
          },
          function (error) {
            patchView({ busy: false, failure: messageOf(error) || '模型发现失败。' })
          },
        )
      }

      /** Toggle one entry; the picked map is the checkbox's only source. */
      function onToggle(identity) {
        setView(function (current) {
          var picked = Object.assign({}, current.picked)
          if (picked[identity] === true) delete picked[identity]
          else picked[identity] = true
          return Object.assign({}, current, { picked: picked })
        })
      }

      /**
       * Select every visible entry, or clear the whole selection when they are
       * all picked already (the official picker's own toggle semantics).
       */
      function onToggleAll(identities) {
        var visible = Array.isArray(identities) ? identities : []
        setView(function (current) {
          var all = visible.length > 0
          for (var index = 0; index < visible.length; index += 1) {
            if (current.picked[visible[index]] !== true) all = false
          }
          if (all) return Object.assign({}, current, { picked: {} })
          var picked = Object.assign({}, current.picked)
          for (var scan = 0; scan < visible.length; scan += 1) picked[visible[scan]] = true
          return Object.assign({}, current, { picked: picked })
        })
      }

      function onQuery(value) {
        patchView({ query: typeof value === 'string' ? value : '' })
      }

      function closePicker() {
        patchView({ open: false, candidates: [], picked: {}, query: '' })
      }

      /**
       * Stage the picked entries on the container.
       *
       * Existing rows are kept verbatim — by identity, so a user's own edit of
       * an already-listed model is never overwritten — and only genuinely new
       * entries are appended. Nothing is saved here.
       */
      function onAdopt() {
        if (container === undefined) return
        var rows = Array.isArray(containerValue) ? containerValue.slice() : []
        var present = {}
        for (var index = 0; index < rows.length; index += 1) {
          var identity = memberValueOf(rows[index], identityKey)
          if (typeof identity === 'string' && identity !== '') present[identity] = true
        }
        var added = false
        for (var scan = 0; scan < view.candidates.length; scan += 1) {
          var candidate = view.candidates[scan]
          var candidateIdentity = memberValueOf(candidate, identityKey)
          if (typeof candidateIdentity !== 'string' || candidateIdentity === '') continue
          if (view.picked[candidateIdentity] !== true) continue
          if (present[candidateIdentity] === true) continue
          present[candidateIdentity] = true
          rows.push(adoptedRowOf(candidate, memberKeys))
          added = true
        }
        if (added && typeof props.form.edit === 'function') props.form.edit(container.path, rows)
        closePicker()
      }

      var head = [h('div', { className: 'piai-group-title', key: 't' }, group.title)]
      if (group.hint !== undefined) {
        head.push(h('div', { className: 'piai-hint', key: 'h' }, group.hint))
      }
      if (catalog !== undefined) {
        var busy = view.busy === true
        var disabled = !available || busy
        var tip = !available ? reason : busy ? '正在询问提供商…' : '获取可用模型'
        head.push(
          h('div', { className: 'piai-item-actions', key: 'catalog' }, [
            h(
              Button,
              {
                key: 'fetch',
                variant: 'outline',
                size: 'sm',
                disabled: disabled,
                title: tip,
                'aria-label': '获取可用模型',
                onClick: onFetch,
              },
              busy ? '正在询问提供商…' : '获取可用模型',
            ),
          ]),
        )
      }
      if (group.id === 'compat') {
        head.push(
          h(components.CompatDisclosures, {
            key: 'f',
            leaves: group.leaves,
            form: props.form,
            fields: props.fields,
            values: props.values,
            options: props.options,
            withheld: props.withheld,
          }),
        )
      } else {
        head.push(
          h(components.FieldsBlock, {
            key: 'f',
            leaves: group.leaves,
            form: props.form,
            fields: props.fields,
            values: props.values,
            options: props.options,
            withheld: props.withheld,
          }),
        )
      }
      if (catalog !== undefined) {
        if (view.failure !== undefined) {
          head.push(
            h('div', { className: 'piai-error', key: 'catalog-failure', role: 'alert' }, view.failure),
          )
        } else if (view.hint !== undefined) {
          head.push(h('div', { className: 'piai-hint', key: 'catalog-hint' }, view.hint))
        }
        head.push(
          h(ModelCatalogPicker, {
            key: 'catalog-picker',
            open: view.open,
            candidates: view.candidates,
            picked: view.picked,
            query: view.query,
            identityKey: identityKey,
            labelKey: labelKey,
            onQuery: onQuery,
            onToggle: onToggle,
            onToggleAll: onToggleAll,
            onAdopt: onAdopt,
            onClose: closePicker,
          }),
        )
      }
      return h('section', { className: 'piai-group', key: group.id }, head)
    }

    /**
     * Mark the compat keys the selected provider's protocol does not offer.
     *
     * A gate entry of `withhold` and a key absent from the gate are the same
     * thing to the adapter — the protocol does not support it — so both are
     * marked. The mark is advisory only: the row is never disabled, because the
     * adapter is authoritative and the gate must not block a write.
     */
    function withheldKeys(groups, values, fields) {
      var marks = {}
      var list = groups || []
      for (var index = 0; index < list.length; index += 1) {
        if (list[index].id !== 'compat') continue
        var leaves = list[index].leaves || []
        for (var scan = 0; scan < leaves.length; scan += 1) {
          var path = leaves[scan].path || []
          var profilePath = path.slice(0, Math.max(0, path.length - 2))
          var api = protocolOfProfile(readPath(values, profilePath), fields)
          if (api === undefined || typeof fields.compatDisposition !== 'function') continue
          if (fields.compatDisposition(api, keyOf(path)) !== 'offer') marks[path.join('.')] = true
        }
      }
      return marks
    }

    return {
      GroupBlock: GroupBlock,
      withheldKeys: withheldKeys,
      ModelCatalogPicker: ModelCatalogPicker
    }
  }

  var api = { createCatalog: createCatalog }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsCatalog = api

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
