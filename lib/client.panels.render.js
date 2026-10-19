/**
 * Composite controls and the leaf list renderer.
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
 *  * The union branch selector, the bare object and array controls, and
 *  * `FieldsBlock` — the one place that partitions a leaf list into direct rows
 *  * (with `pair` runs) and instance containers, so no leaf can be dropped.
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsRender
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.render.js'

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createRender(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var readPath = core.readPath
    var preview = core.preview
    var controlIdOf = core.controlIdOf
    var Button = ui.Button

    /**
     * A discriminated union (`retryPolicy`, `reasoningEfforts`).
     *
     * The selector is driven by each branch's identity, labelled through the
     * presentation table (`<field>.branch.<value|kind>`), so no branch ever
     * shows a raw schema word like `dict`. Selecting a branch writes what that
     * branch *is*: a const branch writes its own literal (`false`), a
     * discriminated object branch writes `{ <discriminator>: <value> }`, and a
     * structural branch (the tiers table) writes nothing at all — its own
     * control writes the first real value, so a selection can never persist the
     * empty `{}` the adapter rejects (docs/verification.md §14).
     *
     * A branch whose node sits at the union's own path (a scalar `false` or the
     * `dict` table) is rendered WITHOUT a second label — the selector already
     * named it. Deeper branches get one titled block instead of repeating the
     * field name once per child; v8 (R2) titles it `<branch label>的参数`, so the
     * block says which branch it belongs to, and falls back to the generic
     * 「分支参数」 only when the presentation table has no label for that branch.
     */
    function UnionControl(props) {
      var leaf = props.leaf
      var branches = leaf.branches || []
      var value = props.value
      var pendingState = react.useState(undefined)
      var pending = pendingState[0]
      var setPending = pendingState[1]
      var realId = selectedBranchIdOf(leaf, branches, value)
      var pendingId =
        pending !== undefined &&
        branches.some(function (branch) {
          return branchIdOf(branch) === pending
        })
          ? pending
          : undefined
      // Pending wins over the stored value: a structural branch (the tiers
      // table) has no literal to persist, so picking it only records "selected,
      // not yet written" and lets its own control write the first real value
      // (docs/interaction-design.md §15.5's single-select semantics — exactly
      // one option is selected — and §15.9: a selection may never persist the
      // empty `{}`). With the stored value winning instead, a field already at
      // `false` (realId on the const branch) could never be switched to the
      // tiers table: `setPending` was shadowed, so the table neither expanded
      // nor wrote (verifier-2 FINDING-2). Picking a real branch still does
      // `setPending(undefined)`, and 默认 clears it in `onClear`.
      var activeId = pendingId !== undefined ? pendingId : realId
      var active = branches.filter(function (branch) {
        return branchIdOf(branch) === activeId
      })[0]
      var selector = h(components.EnumControl, {
        key: 'branch',
        id: props.ui.controlId,
        label: props.ui.label,
        describedBy: props.ui.describedBy,
        invalid: props.ui.invalid,
        value: activeId,
        unsetText: '默认（未设置）',
        options: branches.map(function (branch) {
          var label =
            typeof props.fields.branchLabelFor === 'function'
              ? props.fields.branchLabelFor(leaf, branch)
              : branch.label
          return { value: branchIdOf(branch), label: label }
        }),
        onChange: function (next) {
          var branch = branches.filter(function (entry) {
            return branchIdOf(entry) === next
          })[0]
          if (branch === undefined) return
          if (branch.value === undefined) {
            // A structural branch has no literal to write: reveal its body and
            // let its own control write the first value.
            setPending(next)
            return
          }
          setPending(undefined)
          if (branch.kind === 'const') {
            props.form.edit(props.path, branch.value)
            return
          }
          if (leaf.discriminator === undefined) return
          var seed = {}
          seed[leaf.discriminator] = branch.value
          props.form.edit(props.path, seed)
        },
        onClear: function () {
          setPending(undefined)
          props.form.remove(props.path)
        },
      })

      var selected = active
      var body = []
      if (selected !== undefined && selected.ref !== undefined && props.options.schema !== undefined) {
        var presentationBase =
          Array.isArray(leaf.presentationPath) ? leaf.presentationPath : props.path
        var nested = props.options.schema.leaves(
          props.options.envelope,
          selected.ref,
          props.path,
          presentationBase,
        )
        var atPath = nested.filter(function (entry) {
          return entry.path.length === props.path.length
        })
        var deeper = nested.filter(function (entry) {
          return entry.path.length > props.path.length
        })
        for (var index = 0; index < atPath.length; index += 1) {
          var same = atPath[index]
          // A const branch IS the value the selector picked; rendering it again
          // would duplicate the label and offer a read-only box.
          if (same.kind === 'const') continue
          var sameValue = readPath(props.options.values, same.path)
          body.push(
            h(
              'div',
              { key: 'same:' + String(index) },
              components.renderControl(
                same,
                same.path,
                sameValue,
                props.form,
                props.fields,
                props.options,
                components.leafUi(same, same.path, props.form, props.fields),
              ),
            ),
          )
        }
        if (deeper.length > 0) {
          // v8 R2: title the block after the branch the selector actually
          // picked, rather than a fixed label. The name comes from the same
          // presentation lookup the selector uses, so this file still names no
          // field; a branch with no label keeps the generic wording.
          var branchTitle = ''
          if (active !== undefined) {
            var activeLabel =
              typeof props.fields.branchLabelFor === 'function'
                ? props.fields.branchLabelFor(leaf, active)
                : active.label
            if (typeof activeLabel === 'string' && activeLabel !== '') branchTitle = activeLabel
          }
          body.push(
            h('div', { className: 'piai-nested', key: 'nested' }, [
              h(
                'div',
                { className: 'piai-nested-title', key: 'title' },
                branchTitle !== '' ? branchTitle + '的参数' : '分支参数',
              ),
              h(FieldsBlock, {
                key: 'fields',
                leaves: deeper,
                form: props.form,
                fields: props.fields,
                values: props.options.values,
                options: props.options,
              }),
            ]),
          )
        }
      }
      return h('div', { className: 'piai-union' }, [selector].concat(body))
    }

    /** A nested object node, rendered as its own indented field block. */
    function ObjectControl(props) {
      var schema = props.options.schema
      var leaves =
        props.leaf.children !== undefined
          ? props.leaf.children
          : schema !== undefined
            ? schema.leaves(props.options.envelope, props.leaf.node, props.path)
            : []
      return h(FieldsBlock, {
        leaves: leaves,
        form: props.form,
        fields: props.fields,
        values: props.options.values,
        options: props.options,
      })
    }

    /**
     * A repeatable list whose items are scalars or objects.
     *
     * Used for `models`, `retryableCodes` and any array without an item enum.
     * Entries are addressed by index, which is exactly how the host's `unset`
     * splices them.
     */
    function ArrayControl(props) {
      var items = Array.isArray(props.value) ? props.value : []
      var schema = props.options.schema
      var itemLeaves =
        props.leaf.itemLeaves !== undefined
          ? props.leaf.itemLeaves
          : schema !== undefined && props.leaf.node !== undefined && props.leaf.node.inner !== undefined
            ? schema.leaves(props.options.envelope, props.leaf.node.inner, props.path.concat([0]))
            : []
      var rows = items.map(function (item, index) {
        var itemPath = props.path.concat([index])
        var inner =
          itemLeaves.length > 0
            ? h(FieldsBlock, {
                key: 'f',
                leaves: itemLeaves.map(function (entry) {
                  return Object.assign({}, entry, { path: itemPath.concat(entry.path.slice(props.path.length + 1)) })
                }),
                form: props.form,
                fields: props.fields,
                values: props.options.values,
                options: props.options,
              })
            : h(components.TextControl, {
                key: 'f',
                id: controlIdOf(itemPath),
                value: typeof item === 'string' ? item : preview(item),
                onChange: function (next) {
                  props.form.edit(itemPath, next)
                },
                onClear: function () {
                  props.form.remove(itemPath)
                },
              })
        return h('div', { className: 'piai-array-row', key: String(index) }, [
          h('div', { className: 'piai-array-index', key: 'i' }, '#' + String(index + 1)),
          inner,
          h(
            Button,
            {
              key: 'del',
              variant: 'outline',
              size: 'sm',
              'aria-label': '移除第 ' + String(index + 1) + ' 项',
              onClick: function () {
                props.form.remove(itemPath)
              },
            },
            '移除',
          ),
        ])
      })
      rows.push(
        h(
          Button,
          {
            key: 'add',
            variant: 'outline',
            size: 'sm',
            'aria-label': '添加一项',
            onClick: function () {
              var seed = itemLeaves.length > 0 ? {} : ''
              props.form.edit(props.path.concat([items.length]), seed)
            },
          },
          '添加一项',
        ),
      )
      return h('div', { className: 'piai-array' }, rows)
    }

    /**
     * Render a list of leaves as labelled rows.
     *
     * This is the single place a field becomes visible, so every leaf the schema
     * walker produced is reachable from here — that is what makes the field set
     * impossible to hardcode.
     *
     * Leaves tagged with `leaf.container` belong to a repeatable instance group
     * (`models[]`, `modelOverrides`). They are rendered by {@link ArraySection} /
     * {@link InstanceDictSection}, which re-base each leaf onto a real instance
     * path; the leaves are partitioned by container so no leaf is dropped, and a
     * bucket keeps the order in which its first leaf appeared.
     */
    function FieldsBlock(props) {
      var direct = []
      var buckets = []
      var byKey = {}
      for (var index = 0; index < props.leaves.length; index += 1) {
        var leaf = props.leaves[index]
        var container = leaf !== null && typeof leaf === 'object' ? leaf.container : undefined
        if (container === undefined || container === null || typeof container !== 'object') {
          direct.push(leaf)
          continue
        }
        var key = (container.path || []).join('\u0000') + '|' + String(container.kind)
        if (byKey[key] === undefined) {
          byKey[key] = { container: container, leaves: [] }
          buckets.push(byKey[key])
        }
        byKey[key].leaves.push(leaf)
      }

      var children = []
      var runs = components.pairRunsOf(direct, props.fields)
      for (var run = 0; run < runs.length; run += 1) {
        var grouped = runs[run]
        if (grouped.id !== undefined && grouped.leaves.length > 1) {
          children.push(
            h(
              'div',
              { className: 'piai-row-pair', key: 'pair:' + grouped.id + ':' + String(run) },
              grouped.leaves.map(function (groupedLeaf) {
                return components.renderRow(groupedLeaf, props)
              }),
            ),
          )
          continue
        }
        for (var loose = 0; loose < grouped.leaves.length; loose += 1) {
          children.push(components.renderRow(grouped.leaves[loose], props))
        }
      }
      for (var scan = 0; scan < buckets.length; scan += 1) {
        var bucket = buckets[scan]
        if (bucket.container.kind === 'array') {
          children.push(
            h(components.ArraySection, {
              key: 'container:' + (bucket.container.path || []).join('.'),
              container: bucket.container,
              leaves: bucket.leaves,
              form: props.form,
              fields: props.fields,
              values: props.values,
              options: props.options,
              withheld: props.withheld,
            }),
          )
        } else if (bucket.container.kind === 'dict') {
          children.push(
            h(components.InstanceDictSection, {
              key: 'container:' + (bucket.container.path || []).join('.'),
              container: bucket.container,
              leaves: bucket.leaves,
              form: props.form,
              fields: props.fields,
              values: props.values,
              options: props.options,
              withheld: props.withheld,
            }),
          )
        } else {
          // An unknown container kind must not hide anything: fall back to rows.
          for (var fallback = 0; fallback < bucket.leaves.length; fallback += 1) {
            children.push(components.renderRow(bucket.leaves[fallback], props))
          }
        }
      }
      return h('div', { className: 'piai-fields' }, children)
    }

    /**
     * The stable identity of one union branch, used as the option value of the
     * branch selector. Always a string: it becomes a DOM id suffix and a React
     * key inside the primitive, and `undefined` would mean "nothing selected"
     * (its indicator then sits at index -1, outside the track).
     */
    function branchIdOf(branch) {
      return branch.value === undefined
        ? 'kind:' + String(branch.kind)
        : 'value:' + String(branch.value)
    }

    /**
     * Which branch a stored value selects.
     *
     * A scalar selects the branch carrying that literal (`false`, `"normal"`,
     * `"always"`); an object selects the branch its discriminator names, or —
     * for a union with no discriminator (`reasoningEfforts`: `false` or a tiers
     * table) — the one structural branch that carries no literal.
     *
     * @returns a branch id, or `undefined` when the field holds no branch.
     */
    function selectedBranchIdOf(leaf, branches, value) {
      if (value === undefined || value === null) return undefined
      var index
      if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
        for (index = 0; index < branches.length; index += 1) {
          if (branches[index].value === value) return branchIdOf(branches[index])
        }
        return undefined
      }
      if (typeof value !== 'object') return undefined
      if (leaf.discriminator !== undefined) {
        for (index = 0; index < branches.length; index += 1) {
          if (branches[index].value === value[leaf.discriminator]) return branchIdOf(branches[index])
        }
        return undefined
      }
      for (index = 0; index < branches.length; index += 1) {
        if (branches[index].value === undefined) return branchIdOf(branches[index])
      }
      return undefined
    }

    return {
      UnionControl: UnionControl,
      ObjectControl: ObjectControl,
      ArrayControl: ArrayControl,
      FieldsBlock: FieldsBlock
    }
  }

  var api = { createRender: createRender }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsRender = api

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
