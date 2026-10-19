/**
 * Collection-shaped controls.
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
 *  * Check groups (`array`+`enum`), free-scalar tag lists, dictionaries, the
 *  * chat-template argument tables and the tier table. Each writes through the
 *  * staged `form` only; clearing a field is always `form.remove` (an `unset`
 *  * operation), never a value-typed `null`.
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsCollections
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.collections.js'

  /** `$var` values the adapter accepts inside the chatTemplate dicts. */
  var TEMPLATE_VARS = ['thinking.enabled', 'thinking.effort', 'thinking.budget']

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createCollections(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var preview = core.preview
    var Button = ui.Button
    var Input = ui.Input
    var Checkbox = ui.Checkbox
    var Tooltip = ui.Tooltip
    var IconInfoOutlineRegular = ui.IconInfoOutlineRegular

    /**
     * A closed multi-select, one `Checkbox` per allowed value.
     *
     * This is how `input` / `defaultInput` (text, image) render: the point of
     * the row is to show *what* the model accepts, so every allowed value must
     * be visible. The previous chip editor hid the unchosen values behind an
     * 「添加」 menu and a free-text box, which also invited values the adapter
     * rejects (docs/verification.md §14). Unchecking the last value clears the
     * field (`unset`), never writes `null`.
     */
    function CheckboxGroupControl(props) {
      var selected = Array.isArray(props.value) ? props.value : []
      var options = props.options || []
      function toggle(entry, next) {
        var kept = selected.filter(function (item) {
          return item !== entry
        })
        var result = next === true ? kept.concat([entry]) : kept
        if (result.length === 0) props.onClear()
        else props.onChange(result)
      }
      return h(
        'div',
        {
          className: 'piai-checks',
          id: props.id,
          role: 'group',
          'aria-label': props.label,
          'aria-describedby': props.describedBy,
          'aria-invalid': props.invalid === true ? 'true' : undefined,
        },
        options.map(function (option) {
          return h(Checkbox, {
            key: String(option.value),
            checked: selected.indexOf(option.value) !== -1,
            label: option.label,
            // The explanation of the value this box toggles, so a multi-select
            // option is readable without opening anything else.
            title: option.hint,
            onChange: function (next) {
              toggle(option.value, next)
            },
          })
        }),
      )
    }

    /**
     * An editable list of free scalars, rendered as removable chips.
     *
     * Only the open case remains here (`retryableCodes`): a list whose values
     * are a closed set is a `CheckboxGroupControl`, so the two shapes can never
     * drift back into one another. Emptying the list clears the field
     * (`unset`), never writes `null`.
     */
    function TagListControl(props) {
      var draftState = react.useState('')
      var draft = draftState[0]
      var setDraft = draftState[1]
      var selected = Array.isArray(props.value) ? props.value : []
      function write(next) {
        if (next.length === 0) props.onClear()
        else props.onChange(next)
      }
      function addDraft() {
        var next = draft.trim()
        if (next === '' || selected.indexOf(next) !== -1) return
        setDraft('')
        write(selected.concat([next]))
      }

      var chips = selected.map(function (entry) {
        return h('span', { className: 'piai-tag', key: String(entry) }, [
          h('span', { key: 'label' }, String(entry)),
          h(
            'button',
            {
              key: 'remove',
              type: 'button',
              'aria-label': '移除 ' + String(entry),
              onClick: function () {
                write(
                  selected.filter(function (item) {
                    return item !== entry
                  }),
                )
              },
            },
            '×',
          ),
        ])
      })

      var adder = h('span', { className: 'piai-tag-add', key: 'add', 'data-tag-add': 'free' }, [
        h(Input, {
          key: 'value',
          id: props.id + '-value',
          type: 'text',
          value: draft,
          'aria-label': props.label + '：新增值',
          placeholder: '新增值',
          onChange: function (event) {
            setDraft(event.target.value)
          },
          onKeyDown: function (event) {
            if (event.key !== 'Enter') return
            event.preventDefault()
            addDraft()
          },
        }),
        h(
          Button,
          {
            key: 'go',
            id: props.id + '-go',
            variant: 'outline',
            size: 'sm',
            'aria-label': '添加到 ' + props.label,
            onClick: addDraft,
          },
          '添加',
        ),
      ])

      return h(
        'div',
        {
          className: 'piai-tags',
          id: props.id,
          'aria-describedby': props.describedBy,
          'aria-invalid': props.invalid === true ? 'true' : undefined,
        },
        chips.concat([adder]),
      )
    }

    /**
     * A key/value map: `headers`, `compat.chatTemplate*`, `reasoningEfforts`.
     *
     * Three shapes share one editor:
     *
     *   - a closed key set (`leaf.keyEnum`, e.g. `reasoningEfforts`) → the add
     *     affordance offers the remaining allowed keys and every present key
     *     shows its Chinese label;
     *   - a closed value set (`leaf.valueEnum`) → the value control is a select;
     *   - a value node that allows `null` (`leaf.valueNullable`) → an explicit
     *     `null` toggle, so the literal the adapter wants is a deliberate pick,
     *     never the side effect of an emptied input.
     *
     * Removing a key is destructive and takes the inline two-step confirmation.
     */
    function DictControl(props) {
      var leaf = props.leaf || {}
      var fields = props.fields
      var raw = props.value
      var value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      var keys = Object.keys(value)
      var keyEnum = Array.isArray(leaf.keyEnum) ? leaf.keyEnum : undefined
      var valueOptions = Array.isArray(leaf.valueEnum)
        ? leaf.valueEnum.map(function (entry) {
            var optionHint =
              fields !== undefined && typeof fields.valueHintFor === 'function'
                ? fields.valueHintFor(leaf, entry)
                : undefined
            return {
              value: entry,
              label: entry === null ? 'null' : String(entry),
              // EnumControl writes this as the option radio's `title`.
              hint: typeof optionHint === 'string' && optionHint !== '' ? optionHint : undefined,
            }
          })
        : undefined

      function keyLabel(key) {
        if (fields === undefined || typeof fields.presentationPathOf !== 'function') return key
        var described = fields.describeField(fields.presentationPathOf(leaf) + '.' + key)
        if (described.label !== undefined && described.label !== '') return described.label
        return key
      }

      function valueControls(key, entry) {
        var controlId = props.id + '-' + key
        if (valueOptions !== undefined) {
          return [
            h(components.EnumControl, {
              key: 'value',
              id: controlId,
              label: keyLabel(key),
              value: entry,
              unsetText: '默认（未设置）',
              options: valueOptions,
              onChange: function (next) {
                props.onEntry(key, next)
              },
              onClear: function () {
                props.onRemoveKey(key)
              },
            }),
          ]
        }
        var parts = [
          h(components.TextControl, {
            key: 'literal',
            id: controlId,
            value: entry === null ? '' : typeof entry === 'string' ? entry : preview(entry),
            placeholder: leaf.valueNullable === true ? 'null' : '',
            onChange: function (next) {
              props.onEntry(key, next)
            },
            onClear: function () {
              props.onRemoveKey(key)
            },
          }),
        ]
        if (leaf.valueNullable === true) {
          parts.push(
            h(
              'button',
              {
                key: 'null',
                type: 'button',
                className: 'piai-clear',
                'aria-pressed': entry === null,
                'aria-label': keyLabel(key) + '：null',
                onClick: function () {
                  props.onEntry(key, null)
                },
              },
              'null',
            ),
          )
        }
        return parts
      }

      var rows = keys.map(function (key) {
        var entry = value[key]
        var isVar = entry !== null && typeof entry === 'object' && typeof entry.$var === 'string'
        var controls
        if (isVar) {
          controls = [
            h(components.EnumControl, {
              key: 'var',
              id: props.id + '-var-' + key,
              value: entry.$var,
              label: keyLabel(key),
              unsetLabel: '（选择变量）',
              options: TEMPLATE_VARS.map(function (name) {
                return { value: name, label: name }
              }),
              onChange: function (next) {
                props.onEntry(key, { $var: next, omitWhenOff: entry.omitWhenOff === true })
              },
              onClear: function () {
                props.onEntry(key, { $var: 'thinking.enabled', omitWhenOff: entry.omitWhenOff === true })
              },
            }),
            // No `id`: the primitives' `Checkbox({checked, onChange, label,
            // disabled, title, className})` has no rest spread, so an id passed
            // here can never reach the DOM (verifier-2 FINDING-1). Its accessible
            // name comes from `label`, which the primitive renders as its own
            // `<label>` text.
            h(Checkbox, {
              key: 'omit',
              checked: entry.omitWhenOff === true,
              label: '关闭时省略',
              onChange: function (next) {
                props.onEntry(key, { $var: entry.$var, omitWhenOff: next })
              },
            }),
          ]
        } else {
          controls = valueControls(key, entry)
        }
        if (keyEnum === undefined && !isVar) {
          controls.push(
            h(
              Button,
              {
                key: 'mode',
                variant: 'outline',
                size: 'sm',
                title: '在字面值与 $var 表达式之间切换',
                onClick: function () {
                  props.onEntry(key, isVar ? '' : { $var: 'thinking.enabled', omitWhenOff: true })
                },
              },
              isVar ? '变量' : '字面值',
            ),
          )
        }
        controls.push(
          h(components.ConfirmButton, {
            key: 'del',
            label: '删除',
            question: '确认删除 ' + key + '？',
            confirmLabel: '确认删除',
            onConfirm: function () {
              props.onRemoveKey(key)
            },
          }),
        )
        return h('div', { className: 'piai-dict-row', key: key }, [
          h('code', { className: 'piai-dict-key', key: 'key' }, key),
          h('span', { key: 'label' }, keyLabel(key)),
        ].concat(controls))
      })

      var adder
      if (keyEnum === undefined) {
        adder = h(AddKey, { key: 'add', id: props.id + '-add', onAdd: props.onAddKey, existing: keys })
      } else {
        var remaining = keyEnum.filter(function (key) {
          return keys.indexOf(key) === -1
        })
        adder =
          remaining.length === 0
            ? null
            : h(
                'div',
                { className: 'piai-dict-add', key: 'add' },
                remaining.map(function (key) {
                  return h(
                    Button,
                    {
                      key: key,
                      id: props.id + '-add-' + key,
                      variant: 'outline',
                      size: 'sm',
                      'aria-label': '添加档位 ' + keyLabel(key),
                      onClick: function () {
                        props.onAddKey(key)
                      },
                    },
                    '添加 ' + keyLabel(key),
                  )
                }),
              )
      }
      return h('div', { className: 'piai-dict' }, adder === null ? rows : rows.concat([adder]))
    }

    /** The "add a key" affordance for a dict control. */
    function AddKey(props) {
      var state = react.useState('')
      var draft = state[0]
      var setDraft = state[1]
      return h('div', { className: 'piai-dict-add' }, [
        h(Input, {
          key: 'name',
          id: props.id,
          type: 'text',
          value: draft,
          'aria-label': '新增键名',
          placeholder: '新增键名',
          onChange: function (event) {
            setDraft(event.target.value)
          },
        }),
        h(
          Button,
          {
            key: 'go',
            id: props.id + '-go',
            variant: 'outline',
            size: 'sm',
            'aria-label': '添加键',
            onClick: function () {
              var key = draft.trim()
              if (key === '' || props.existing.indexOf(key) !== -1) return
              setDraft('')
              props.onAdd(key)
            },
          },
          '添加',
        ),
      ])
    }

    /**
     * The `$var`-capable chat-template dicts (`compat.chatTemplateKwargs` /
     * `compat.chatTemplateArgs`).
     *
     * Every key holds either a literal (sent verbatim) or a `$var` object that
     * pi-ai resolves at dispatch from this request's thinking state. The two
     * are mutually exclusive for one key, so a row carries a mode radio group
     * instead of two competing editors, and that group's own info trigger
     * discloses what each mode means.
     *
     * Semantics (verified against the adapter and pi-ai; the read-only
     * evidence is recorded in `UNSET_VS_NULL.md` §A):
     *
     *   - the adapter's `configuredCompatEntries` treats an empty dict exactly
     *     like an absent key, so removing the last entry clears the whole field
     *     (`unset`) instead of leaving `{}` behind — `onRemoveKey` does that;
     *   - pi-ai's `buildChatTemplateValues` drops an entry whose resolved value
     *     is `undefined` but KEEPS `null`, so a literal `null` is a deliberate
     *     "send null" while a removed key is "do not send this key at all".
     *
     * A key whose Chinese label equals the raw key renders only the key chip; a
     * named key renders chip + label, never the same token twice.
     */
    function TemplateArgsControl(props) {
      var leaf = props.leaf || {}
      var fields = props.fields
      var raw = props.value
      var value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      var keys = Object.keys(value)
      var varNames = Array.isArray(leaf.valueVarNames) ? leaf.valueVarNames : []
      var modeHints =
        fields !== undefined && typeof fields.modeHintFor === 'function'
          ? fields.modeHintFor(leaf)
          : undefined
      var literalLabel =
        modeHints !== undefined &&
        typeof modeHints.literalLabel === 'string' &&
        modeHints.literalLabel !== ''
          ? modeHints.literalLabel
          : '字面值'
      var literalHint = modeHints !== undefined ? modeHints.literalHint : undefined
      var varLabel =
        modeHints !== undefined && typeof modeHints.varLabel === 'string' && modeHints.varLabel !== ''
          ? modeHints.varLabel
          : '$var 变量'
      var varHint = modeHints !== undefined ? modeHints.varHint : undefined
      var fieldPath = ''
      if (fields !== undefined && typeof fields.keyLabelFor === 'function') {
        fieldPath = fields.keyLabelFor(leaf)
      }

      function keyLabel(key) {
        if (fields === undefined || typeof fields.presentationPathOf !== 'function') return key
        var described = fields.describeField(fields.presentationPathOf(leaf) + '.' + key)
        if (described.label !== undefined && described.label !== '') return described.label
        return key
      }

      function variableHint(name) {
        if (fields === undefined || typeof fields.valueHintFor !== 'function') return undefined
        return fields.valueHintFor(leaf, name)
      }

      var rows = keys.map(function (key) {
        var entry = value[key]
        var isVar =
          entry !== null &&
          typeof entry === 'object' &&
          !Array.isArray(entry) &&
          typeof entry.$var === 'string'
        var label = keyLabel(key)
        var nameNodes =
          label === key
            ? [h('code', { className: 'piai-dict-key', key: 'key' }, key)]
            : [
                h('code', { className: 'piai-dict-key', key: 'key' }, key),
                h('span', { key: 'label' }, label),
              ]
        var modeLines = []
        if (typeof literalHint === 'string' && literalHint !== '') modeLines.push(literalHint)
        if (typeof varHint === 'string' && varHint !== '') modeLines.push(varHint)
        var controls = [
          h(components.EnumControl, {
            key: 'mode',
            id: props.id + '-mode-' + key,
            label: key + '：' + literalLabel + ' / ' + varLabel,
            value: isVar ? 'var' : 'literal',
            includeUnset: false,
            options: [
              { value: 'literal', label: literalLabel, hint: literalHint },
              { value: 'var', label: varLabel, hint: varHint },
            ],
            onChange: function (next) {
              if (next === 'var') {
                // The first variable the schema declares is the seed; write
                // nothing when the value union carried no variable name, so the
                // row simply stays on the literal it already shows.
                if (varNames.length === 0) return
                props.onEntry(key, { $var: varNames[0], omitWhenOff: true })
                return
              }
              // Back to a literal: pi-ai KEEPS a null, while an absent key is
              // dropped, so the explicit literal starts as null.
              props.onEntry(key, null)
            },
            onClear: function () {
              props.onEntry(key, null)
            },
          }),
        ]
        if (modeLines.length > 0) {
          controls.push(
            h(
              Tooltip,
              {
                key: 'mode-info',
                label: components.hintBubble(
                  fieldPath !== '' ? fieldPath + '.' + key : key,
                  props.hint,
                  modeLines,
                ),
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
                  id: props.id + '-mode-' + key + '-info',
                  'aria-label': key + '：' + modeLines.join(' '),
                },
                h(IconInfoOutlineRegular, { size: 12 }),
              ),
            ),
          )
        }
        if (isVar) {
          controls.push(
            h(components.EnumControl, {
              key: 'var',
              id: props.id + '-var-' + key,
              label: key + '：' + varLabel,
              value: entry.$var,
              includeUnset: false,
              options: varNames.map(function (name) {
                return { value: name, label: name, hint: variableHint(name) }
              }),
              onChange: function (next) {
                props.onEntry(key, { $var: next, omitWhenOff: entry.omitWhenOff === true })
              },
              onClear: function () {
                props.onEntry(key, { $var: entry.$var, omitWhenOff: entry.omitWhenOff === true })
              },
            }),
          )
          controls.push(
            // No `id`: the primitives' Checkbox has no rest spread (see
            // DictControl) — its accessible name is this `label`.
            h(Checkbox, {
              key: 'omit',
              checked: entry.omitWhenOff === true,
              label: '关闭时省略',
              onChange: function (next) {
                props.onEntry(key, { $var: entry.$var, omitWhenOff: next })
              },
            }),
          )
        } else {
          controls.push(
            h(Input, {
              key: 'literal',
              id: props.id + '-literal-' + key,
              type: 'text',
              value: entry === null ? '' : typeof entry === 'string' ? entry : preview(entry),
              placeholder: 'null',
              'aria-label': key + '：值',
              onChange: function (event) {
                var next = event.target.value
                // An emptied literal removes its key (unset), never writes ''.
                if (next === '') {
                  props.onRemoveKey(key)
                  return
                }
                props.onEntry(key, next)
              },
            }),
          )
          controls.push(
            h(
              'button',
              {
                key: 'null',
                type: 'button',
                className: 'piai-clear',
                'aria-pressed': entry === null,
                'aria-label': key + '：null',
                onClick: function () {
                  props.onEntry(key, null)
                },
              },
              'null',
            ),
          )
        }
        controls.push(
          h(components.ConfirmButton, {
            key: 'del',
            label: '删除',
            question: '确认删除 ' + key + '？',
            confirmLabel: '确认删除',
            onConfirm: function () {
              props.onRemoveKey(key)
            },
          }),
        )
        return h('div', { className: 'piai-dict-row', key: key }, nameNodes.concat(controls))
      })

      var adder = h(AddKey, {
        key: 'add',
        id: props.id + '-add',
        onAdd: props.onAddKey,
        existing: keys,
      })
      return h('div', { className: 'piai-dict' }, rows.concat([adder]))
    }

    /**
     * A closed key set with scalar values (`reasoningEfforts`), rendered as a
     * compact tiers table.
     *
     * Every key the schema declares renders, always, as one labelled row: the
     * key's Chinese label (the table names `off` as 'off 档位') and one input,
     * both wired through the ordinary row, so each tier carries its own hint
     * tooltip and an accessible name instead of a bare key chip. There is no
     * add/remove row, no per-entry card and no `null` toggle — the adapter's
     * rule is that a present key must carry a non-empty wire spelling and that
     * only `off` may be empty. An emptied input therefore removes its key
     * (该档位不声明), a filled one writes the string, and a table with no keys
     * left clears the field (default). `off: null` consequently has no UI
     * entry; that trade-off is recorded in docs/field-coverage.md.
     */
    function TierTableControl(props) {
      var leaf = props.leaf || {}
      var fields = props.fields
      var raw = props.value
      var value = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      var keys = Array.isArray(leaf.keyEnum) ? leaf.keyEnum : []
      var keyPath = ''
      if (fields !== undefined && typeof fields.keyLabelFor === 'function') {
        keyPath = fields.keyLabelFor(leaf)
      }
      function describedFor(key) {
        if (fields === undefined || typeof fields.presentationPathOf !== 'function') {
          return { label: key }
        }
        return fields.describeField(fields.presentationPathOf(leaf) + '.' + key)
      }
      function write(key, next) {
        var base = Object.assign({}, value)
        if (next === '') delete base[key]
        else base[key] = next
        if (Object.keys(base).length === 0) props.onClear()
        else props.onReplace(base)
      }
      var rows = keys.map(function (key) {
        var described = describedFor(key)
        var tierLabel = described.label !== undefined && described.label !== '' ? described.label : key
        var entry = value[key]
        var controlId = props.id + '-' + key
        var hintId = controlId + '-info'
        var hint = described.hint !== undefined && described.hint !== '' ? described.hint : undefined
        return h(
          'div',
          { className: 'piai-tier', key: key },
          h(
            components.Row,
            {
              label: tierLabel,
              keyLabel: keyPath !== '' ? keyPath + '.' + key : key,
              controlId: controlId,
              useHtmlFor: true,
              hint: hint,
              hintId: hintId,
              describedBy: hint !== undefined ? hintId : undefined,
              dirty: false,
            },
            h(Input, {
              key: 'value',
              id: controlId,
              type: 'text',
              value: entry === undefined || entry === null ? '' : typeof entry === 'string' ? entry : preview(entry),
              placeholder: '留空 = 不声明',
              'aria-describedby': hint !== undefined ? hintId : undefined,
              onChange: function (event) {
                write(key, event.target.value)
              },
            }),
          ),
        )
      })
      return h('div', { className: 'piai-tiers' }, rows)
    }

    return {
      CheckboxGroupControl: CheckboxGroupControl,
      TagListControl: TagListControl,
      DictControl: DictControl,
      AddKey: AddKey,
      TemplateArgsControl: TemplateArgsControl,
      TierTableControl: TierTableControl
    }
  }

  var api = { createCollections: createCollections }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsCollections = api

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
