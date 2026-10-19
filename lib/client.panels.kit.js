/**
 * Row-level building blocks shared by every panel module.
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
 *  * Owns the field row itself (`Row`), the tooltip content (`hintBubble`), the
 *  * inline two-step confirmation (`ConfirmButton`), the row-level UI state
 *  * (`leafUi`), the two-column run splitter (`pairRunsOf`) and the single place a
 *  * leaf becomes visible (`renderRow`). Everything here is presentation only:
 *  * controls are chosen from `leaf.kind` by `renderControl` (in the controls
 *  * module, reached through the shared components bag), never from a field name.
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsKit
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.kit.js'

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createKit(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var useArmedConfirm = core.useArmedConfirm
    var readPath = core.readPath
    var isExpression = core.isExpression
    var isDirtyAt = core.isDirtyAt
    var controlIdOf = core.controlIdOf
    var Button = ui.Button
    var Modal = ui.Modal
    var Tooltip = ui.Tooltip
    var Tag = ui.Tag
    var Pill = ui.Pill
    var IconInfoOutlineRegular = ui.IconInfoOutlineRegular

    /**
     * The Tooltip content for one field row: the raw YAML key, then the field
     * hint, then any extra explanation lines.
     *
     * T20: the Tooltip renders its label through `createPortal(…,
     * document.body)`, so the bubble sits OUTSIDE the page root and every
     * `.piai-root`-scoped rule missed it — the key chip was plain text and the
     * lines were separated by `<br>`. The bubble therefore wraps its parts in a
     * single `.piai-root` span (the same re-entry mechanism the Modal picker
     * uses since T16) and relies on that wrapper's column layout for spacing:
     * there are no `<br>` elements any more, and inline styles stay forbidden.
     *
     * The shape is frozen by the audits: `Tooltip.label` is an array whose ONE
     * element is the scope wrapper; inside it, the chip (when a key is known)
     * comes first, then the field's own hint, then one span per extra line.
     *
     * @param keyLabel - the YAML key path, or `undefined` when unknown.
     * @param hint - the field's own hint text.
     * @param lines - extra explanation lines (each must be a string); `Row`
     *   passes the per-value lines {@link enumHintLines} built for a closed
     *   value set. The node order is frozen: chip, hint span, then one span per
     *   line.
     * @returns the React children array for a `Tooltip.label`: exactly one
     *   scope wrapper, or `[]` when there is nothing to say.
     */
    function hintBubble(keyLabel, hint, lines) {
      var parts = []
      if (typeof keyLabel === 'string' && keyLabel !== '') {
        parts.push(h('code', { key: 'key', className: 'piai-key' }, keyLabel))
      }
      if (typeof hint === 'string' && hint !== '') {
        parts.push(h('span', { key: 'text' }, hint))
      }
      var extra = Array.isArray(lines) ? lines : []
      for (var index = 0; index < extra.length; index += 1) {
        var line = extra[index]
        if (typeof line !== 'string' || line === '') continue
        parts.push(h('span', { key: 'line-' + String(index) }, line))
      }
      if (parts.length === 0) return []
      return [h('span', { key: 'bubble', className: 'piai-root' }, parts)]
    }

    /**
     * A labelled row around one control, with the dirty indicator and reset.
     *
     * @param props - `{label, controlId, useHtmlFor, keyLabel, hint, hintLines,
     *   hintId, required, withheld, invalid, describedBy, dirty, onReset,
     *   children}`. `hintLines` is optional extra tooltip content — one line per
     *   explained enum value — appended after the field hint by `hintBubble`.
     * @returns the row element.
     */
    function Row(props) {
      var keyLabel =
        props.keyLabel !== undefined && props.keyLabel !== '' ? props.keyLabel : undefined
      var infoId =
        props.hintId !== undefined
          ? props.hintId
          : props.controlId !== undefined
            ? props.controlId + '-info'
            : undefined
      var labelChildren = [props.label]
      if (props.withheld === true) {
        // Marked, never disabled: the adapter is authoritative and this gate is
        // advisory, so the row stays fully editable.
        labelChildren.push(h(Tag, { key: 'gate', tone: 'outline' }, '该协议不支持'))
      }
      var label =
        props.useHtmlFor === true && props.controlId !== undefined
          ? h('label', { className: 'piai-row-label', htmlFor: props.controlId, key: 'label' }, labelChildren)
          : h('span', { className: 'piai-row-label', key: 'label' }, labelChildren)
      var head = [label]
      if (props.required === true) {
        head.push(h('span', { className: 'piai-required', key: 'req', title: '必填' }, '*'))
      }
      if (props.hint !== undefined && props.hint !== '') {
        // v7 (docs/interaction-design.md §15.3): the field hint is disclosed by
        // the official help button (E3) beside the label. The raw YAML key chip
        // and the hint text both live in the Tooltip bubble, so the row itself
        // shows only label + trigger + control — never an inline field-level
        // `.piai-hint`. `openOnClick` pins the bubble for reading and `portal`
        // keeps it out of the cards' / action bar's clipping context (E4).
        var bubble = hintBubble(keyLabel, props.hint, props.hintLines)
        head.push(
          h(
            Tooltip,
            {
              key: 'info',
              label: bubble,
              side: 'right',
              openOnClick: true,
              portal: true,
              maxWidth: 360,
            },
            h(
              Button,
              {
                className: 'piai-info',
                size: 'sm',
                id: infoId,
                'aria-label': props.label + '：' + props.hint,
              },
              h(IconInfoOutlineRegular, { size: 12 }),
            ),
          ),
        )
      }
      if (props.dirty === true) {
        head.push(
          h(
            Pill,
            {
              className: 'piai-reset',
              key: 'reset',
              active: true,
              title: '撤销此字段的改动',
              'aria-label': props.label + '：撤销修改',
              onClick: function () {
                props.onReset()
              },
            },
            '已修改',
          ),
        )
      }
      var body = [
        h('div', { className: 'piai-row-head', key: 'head' }, head),
        h(
          'div',
          {
            className: 'piai-row-control',
            key: 'control',
            // Points at the field's `piai-info` trigger: the trigger's
            // accessible name carries label + hint, so the hint stays reachable
            // even while the Tooltip bubble is closed. Errors are still shown
            // inline, and `aria-invalid` is unchanged.
            'aria-describedby': props.describedBy,
            'aria-invalid': props.invalid === true ? 'true' : undefined,
          },
          props.children,
        ),
      ]
      return h(
        'div',
        { className: 'piai-row', 'data-withheld': props.withheld === true ? 'true' : undefined },
        body,
      )
    }

    /**
     * An inline two-step confirmation for a destructive action.
     *
     * The first click only arms the row; the second confirms. Escape anywhere
     * in the armed row (or on the document) cancels, and the armed state is
     * presentation only — it never changes what a write does.
     */
    function ConfirmButton(props) {
      // The armed/Escape behaviour is shared with the sticky bar's delete
      // (`client.core.js`: `useArmedConfirm`); only the chrome differs.
      var confirm = useArmedConfirm(react)
      var armed = confirm.armed
      if (armed !== true) {
        return h(
          Button,
          {
            variant: 'outline',
            size: 'sm',
            className: props.className,
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
          className: props.className,
          role: 'group',
          'aria-label': props.question || '确认删除？',
          onKeyDown: function (event) {
            if (event.key === 'Escape') confirm.cancel()
          },
        },
        [
          h('span', { className: 'piai-hint', key: 'q', role: 'alert' }, props.question || '确认删除？'),
          h(
            Button,
            {
              variant: 'outline',
              size: 'sm',
              key: 'yes',
              'aria-label': props.confirmLabel || '确认删除',
              onClick: function () {
                confirm.cancel()
                props.onConfirm()
              },
            },
            props.confirmLabel || '确认删除',
          ),
          h(
            Button,
            {
              variant: 'outline',
              size: 'sm',
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
     * The per-leaf accessibility wiring every control shares.
     *
     * `hintId` is the id of the row's `piai-info` trigger (v7, §15.3): the
     * trigger's accessible name carries the field label and the hint, so the
     * control is described by it. There is no inline hint node to point at.
     *
     * @param leaf - the schema leaf.
     * @param path - the leaf's schema path.
     * @param form - the staged form, for dirty/invalid state.
     * @param fields - the presentation API.
     * @returns `{controlId, hintId, hint, describedBy, invalid, label, useHtmlFor}`.
     */
    function leafUi(leaf, path, form, fields) {
      var controlId = controlIdOf(path)
      var hint = fields.hintFor(leaf)
      var invalid = form.invalid === true && isDirtyAt(form, path)
      var infoId = controlId + '-info'
      return {
        controlId: controlId,
        hintId: infoId,
        hint: hint,
        describedBy: hint !== undefined && hint !== '' ? infoId : undefined,
        invalid: invalid,
        label: fields.labelFor(leaf),
        useHtmlFor: true,
      }
    }

    /** The presentation `pair` id of one leaf, or `undefined` when it has none. */
    function pairIdOf(leaf, fields) {
      if (fields === undefined || typeof fields.presentationPathOf !== 'function') return undefined
      var described = fields.describeField(fields.presentationPathOf(leaf))
      return described.pair !== undefined && described.pair !== '' ? described.pair : undefined
    }

    /**
     * Split an ordered leaf list into runs that share a `pair` id.
     *
     * The shipped Models page puts 上下文窗口 beside 最大输出 token 数 in a
     * two-column grid (`_modelAdvanced`); which fields belong together is
     * presentation, so it comes from the fields table as a `pair` id. A run of
     * one is an ordinary row, which is how a field keeps its `pair` id at the
     * provider level and still renders alone inside `modelOverrides` (where
     * `id` does not exist).
     */
    function pairRunsOf(leaves, fields) {
      var runs = []
      for (var index = 0; index < leaves.length; index += 1) {
        var id = pairIdOf(leaves[index], fields)
        var last = runs[runs.length - 1]
        if (id !== undefined && last !== undefined && last.id === id) {
          last.leaves.push(leaves[index])
          continue
        }
        runs.push({ id: id, leaves: [leaves[index]] })
      }
      return runs
    }

    /** One leaf as a labelled row (the generic renderer FieldsBlock used to inline). */
    function renderRow(leaf, props) {
      var path = leaf.path
      var dotted = path.join('.')
      var values = props.values || {}
      var withheld = props.withheld || {}
      var value = readPath(values, path)
      if (isExpression(value)) {
        return h('div', { className: 'piai-row piai-expr', key: dotted }, expressionBody(props.fields.labelFor(leaf), value))
      }
      var ui = leafUi(leaf, path, props.form, props.fields)
      var useHtmlFor = ui.useHtmlFor
      // A row label can only be a `<label htmlFor>` when the control has ONE
      // focusable target. A boolean is a radio group, an array/dict/object a
      // group, a union a selector plus a body — and an enum/const is now a
      // radio group (§15.5.7): several inputs share the control id as their
      // `name`, so no single one of them is the htmlFor target. The group's
      // accessible name comes from `role="radiogroup"` + `aria-label` instead,
      // and a dangling htmlFor is exactly what the a11y/polish audits reject.
      if (leaf.kind === 'boolean' || leaf.kind === 'array' || leaf.kind === 'dict' || leaf.kind === 'object' || leaf.kind === 'union') {
        useHtmlFor = false
      } else if (leaf.kind === 'enum' || leaf.kind === 'const') {
        useHtmlFor = false
      }
      var controlOptions = Object.assign({}, props.options)
      return h(
        Row,
        {
          key: dotted,
          label: ui.label,
          keyLabel:
            typeof props.fields.keyLabelFor === 'function'
              ? props.fields.keyLabelFor(leaf)
              : undefined,
          controlId: ui.controlId,
          useHtmlFor: useHtmlFor,
          hint: ui.hint,
          // A closed value set explains itself option by option: the bubble
          // carries one `「label」：hint` line per explained value, so a
          // single-select / multi-select field never hides what its choices
          // mean. `undefined` keeps the original key + hint bubble.
          hintLines: components.enumHintLines(leaf, props.fields),
          hintId: ui.hintId,
          describedBy: ui.describedBy,
          invalid: ui.invalid,
          required: leaf.required === true,
          withheld: withheld[dotted] === true,
          dirty: isDirtyAt(props.form, path),
          onReset: function () {
            props.form.reset(path)
          },
        },
        components.describeControl(leaf, path, value, props, controlOptions, ui),
      )
    }

    /**
     * The read-only body of an unevaluated `!!js` expression.
     *
     * Deliberately NOT part of the R2 change (docs/interaction-design.md
     * §15.3.5): an expression row is read-only and carries no schema leaf, so
     * its notice stays inline as a `.piai-hint` — the `!!js` notice is what
     * tells the user the value is not editable here, and hiding it behind a
     * trigger would hide that fact.
     */
    function expressionBody(label, value) {
      return [
        h('div', { className: 'piai-row-label', key: 'l' }, label),
        h(
          'div',
          { className: 'piai-hint', key: 'h' },
          '这是一段 !js 表达式，本页只读显示，保存时原样保留。',
        ),
        h('code', { className: 'piai-expr-body', key: 'c' }, value.__jsExpr),
      ]
    }

    return {
      Row: Row,
      ConfirmButton: ConfirmButton,
      hintBubble: hintBubble,
      leafUi: leafUi,
      pairIdOf: pairIdOf,
      pairRunsOf: pairRunsOf,
      renderRow: renderRow,
      expressionBody: expressionBody
    }
  }

  var api = { createKit: createKit }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsKit = api

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
