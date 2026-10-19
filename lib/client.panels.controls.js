/**
 * Scalar controls and the kind-based dispatch.
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
 *  * `renderControl(leaf, path, value, form, fields, options, ui)` is the single
 *  * dispatch point: it chooses a control from `leaf.kind` and structure alone, so
 *  * a field added upstream renders without an edit here. The enum, the boolean
 *  * triple, the credential row and the two numeric/text inputs live here; every
 *  * collection-shaped control lives in `client.panels.collections.js`.
 *
 * Chunk envelope: plain script, no `import`/`export`. The facade requests this
 * chunk in the phase after `client.panels.js`'s own dependencies (phase 0 is the
 * base layer, phase 1 the facades).
 *
 * @module dsh-llm-pi-ai-config/client.panelsControls
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.panels.controls.js'

  /**
   * Build this module's part of the panels.
   *
   * @param shared - the panels bag: `{core, ui, react, h, require, components}`.
   *   `components` is filled by every creator before the page renders.
   * @returns the functions this module contributes to the bag.
   */
  function createControls(shared) {
    var h = shared.h
    var react = shared.react
    var components = shared.components
    var ui = shared.ui
    var core = shared.core
    var UNSET_VALUE = core.UNSET_VALUE
    var Button = ui.Button
    var Input = ui.Input
    var Tag = ui.Tag

    /**
     * A closed value set, as a radio group of self-drawn boxes.
     *
     * Every value is one native `<input type="radio">` inside its own `<label>`,
     * and the radios of one group share the control id as their `name` — that
     * single attribute is what makes the group single-valued, with no listener
     * and no second piece of state. The platform's round radio is replaced by a
     * 16px square via `appearance: none` (drawn by `.piai-select` in the
     * stylesheet): the primitives bundle ships no Radio at all
     * (docs/interaction-design.md §15.1 E8), so a real radio is the only way to
     * get the semantics — arrow keys, space, one-of-these grouping — for free.
     *
     * Every option is flat. §15.5 retired both the ≤4 `SegmentedControl` track
     * and the 5+ `Menu`: the track positioned its indicator at
     * `options.findIndex(value)`, so an unset field slid the indicator clean out
     * of the control (docs/verification.md §14), and the menu hid every option
     * but the selected one. `flex-wrap: wrap` on the group is now the only
     * layout decision, so an enum reads the same at any option count.
     *
     * The default (unset) choice is the LAST radio and calls `onClear()` — an
     * `unset`, never a `null` write. `unsetText` is its visible label and
     * `unsetHint` its `title` (default: the label itself); `includeUnset: false`
     * drops that radio entirely, which is what the mode / variable pickers
     * inside one row need. An option may carry its own `hint`, used as that
     * radio's `title`, and a value a hand-written config left outside the enum
     * is appended as an extra 「未识别」 radio, so exactly one option is always
     * selected (the v5 guard against a control that shows nothing).
     */
    function EnumControl(props) {
      var options = props.options || []
      var value = props.value
      var label = props.label
      if (options.length === 0) {
        return h(TextControl, {
          id: props.id,
          value: value,
          describedBy: props.describedBy,
          invalid: props.invalid,
          onChange: props.onChange,
          onClear: props.onClear,
        })
      }
      var listed = options.some(function (option) {
        return option.value === value
      })
      var unusual = value !== undefined && value !== null && listed !== true
      var choices =
        listed === true || unusual !== true
          ? options
          : options.concat([{ value: value, label: String(value) + '（未识别）' }])
      var known = choices.some(function (option) {
        return option.value === value
      })
      var clearLabel =
        props.unsetText !== undefined && props.unsetText !== ''
          ? props.unsetText
          : props.unsetLabel !== undefined && props.unsetLabel !== ''
            ? props.unsetLabel
            : '默认（未设置）'
      var clearHint =
        props.unsetHint !== undefined && props.unsetHint !== '' ? props.unsetHint : clearLabel
      var includeUnset = props.includeUnset !== false
      var disabled = props.disabled === true

      /**
       * One radio: the box, then its text.
       *
       * `name` is the control id, so the radios of *this* enum are mutually
       * exclusive and cannot collide with another enum row on the page. The
       * option `<label>` also carries `htmlFor` → the radio's own id: a wrapping
       * label already names the input, but the explicit association is what the
       * a11y audit can verify (and it keeps every radio addressable). The caller
       * decides the write: a real value goes through `props.onChange` (which may
       * be a literal, a `$var` object or a branch id, depending on the call
       * site), the inherit radio goes through `props.onClear`.
       */
      function radio(inputId, optionValue, text, title, checked, select) {
        return h('label', { key: inputId, title: title, htmlFor: inputId }, [
          h('input', {
            key: 'box',
            id: inputId,
            type: 'radio',
            name: props.id,
            value: String(optionValue),
            checked: checked,
            disabled: disabled,
            onChange: select,
          }),
          h('span', { key: 'text' }, text),
        ])
      }

      var radios = choices.map(function (entry, index) {
        var optionTitle = entry.hint !== undefined && entry.hint !== '' ? entry.hint : entry.label
        return radio(
          props.id + '-opt-' + String(index),
          entry.value,
          entry.label,
          // Long option labels are ellipsized inside the column, so the full
          // text must stay reachable; an option may also carry its own hint.
          optionTitle,
          known === true && entry.value === value,
          function () {
            props.onChange(entry.value)
          },
        )
      })
      if (includeUnset === true) {
        radios.push(
          radio(props.id + '-opt-unset', UNSET_VALUE, clearLabel, clearHint, known !== true, function () {
            props.onClear()
          }),
        )
      }
      return h(
        'div',
        {
          className: 'piai-select',
          id: props.id,
          role: 'radiogroup',
          'aria-label': label,
        },
        radios,
      )
    }

    /**
     * A boolean leaf as a three-way radio group: 开启 / 关闭 / 默认.
     *
     * `false` and `undefined` are different states: `false` is an explicit
     * "off" the adapter sees, `undefined` is "not written here" (the field
     * follows the model catalog and the protocol defaults). The third radio is
     * the only path back to `undefined` — it calls `form.remove`, never
     * `form.edit(path, null)`.
     *
     * The group is the shared enum control, so a hand-written value the schema
     * does not name still renders as its own 「未识别」 radio instead of
     * silently snapping to a real state.
     */
    function BooleanControl(props) {
      return h(
        'div',
        {
          className: 'piai-bool',
          'aria-describedby': props.describedBy,
          'aria-invalid': props.invalid === true ? 'true' : undefined,
        },
        h(EnumControl, {
          id: props.id,
          label: props.label,
          value: props.value,
          options: [
            { value: true, label: '开启' },
            { value: false, label: '关闭' },
          ],
          unsetText: '默认（未设置）',
          unsetHint: '不写入该字段，跟随模型目录与协议默认。',
          onChange: props.onChange,
          onClear: props.onClear,
        }),
      )
    }

    /** A numeric leaf. An emptied input clears the field (inherit), never `null`. */
    function NumberControl(props) {
      var text = props.value === undefined || props.value === null ? '' : String(props.value)
      return h(Input, {
        id: props.id,
        type: 'number',
        value: text,
        step: props.step,
        min: props.min,
        max: props.max,
        placeholder: props.def !== undefined ? String(props.def) : '',
        'aria-describedby': props.describedBy,
        'aria-invalid': props.invalid === true ? 'true' : undefined,
        onChange: function (event) {
          var next = event.target.value
          if (next === '') {
            props.onClear()
            return
          }
          var parsed = Number(next)
          if (!Number.isFinite(parsed)) return
          props.onChange(props.integer === true ? Math.trunc(parsed) : parsed)
        },
      })
    }

    /** A text leaf. An emptied input clears the field (inherit), never `null`. */
    function TextControl(props) {
      return h(Input, {
        id: props.id,
        type: 'text',
        value: props.value === undefined || props.value === null ? '' : String(props.value),
        placeholder: props.placeholder || '',
        'aria-describedby': props.describedBy,
        'aria-invalid': props.invalid === true ? 'true' : undefined,
        onChange: function (event) {
          var next = event.target.value
          if (next === '') props.onClear()
          else props.onChange(next)
        },
      })
    }

    /** `true` when the schema marks this leaf as a credential reference. */
    function isCredentialRef(leaf) {
      var node = leaf !== null && leaf !== undefined ? leaf.node : undefined
      if (node === null || node === undefined) return false
      var meta = node.meta
      if (meta === null || meta === undefined || typeof meta !== 'object') return false
      return meta.role === 'credential-ref'
    }

    /**
     * The credential row for a `credential-ref` field (`apiKeyEnv`).
     *
     * The field holds a REFERENCE name, not a secret: the adapter resolves it
     * through the host's credential store. So the reference is shown read-only
     * (with copy), the host reports whether it is satisfied, and the secret is
     * entered here but sent straight to `remote.credentials.set` — it never
     * enters the draft, an op, or the config file.
     */
    function CredentialControl(props) {
      var state = react.useState({
        open: false,
        draft: '',
        busy: false,
        message: undefined,
        copied: false,
      })
      var ui = state[0]
      var setUi = state[1]
      var credentials = props.credentials
      var available =
        credentials !== undefined && credentials !== null && credentials.available === true
      var ref = typeof props.value === 'string' ? props.value.trim() : ''
      var info =
        available && ref !== '' && credentials.state !== undefined ? credentials.state[ref] : undefined
      var configured = info !== undefined && info.configured === true
      var fromEnv = configured && info.source === 'env'
      var writable = configured && info.writable === false

      function update(patch) {
        setUi(Object.assign({}, ui, patch))
      }

      function saveSecret() {
        var secret = ui.draft
        if (secret === '' || ui.busy === true) return
        update({ busy: true, message: undefined })
        credentials.set(ref, secret).then(
          function (result) {
            if (result !== null && result !== undefined && result.ok === true) {
              setUi({ open: false, draft: '', busy: false, message: '已保存到凭据存储。', copied: false })
              return
            }
            setUi(
              Object.assign({}, ui, {
                busy: false,
                message: result !== null && result !== undefined ? result.error : '凭据操作失败。',
              }),
            )
          },
          function (error) {
            setUi(Object.assign({}, ui, { busy: false, message: String(error) }))
          },
        )
      }

      function removeSecret() {
        update({ busy: true, message: undefined })
        credentials.unset(ref).then(
          function (result) {
            if (result !== null && result !== undefined && result.ok === true) {
              setUi({ open: false, draft: '', busy: false, message: '已清除凭据。', copied: false })
              return
            }
            setUi(
              Object.assign({}, ui, {
                busy: false,
                message: result !== null && result !== undefined ? result.error : '凭据操作失败。',
              }),
            )
          },
          function (error) {
            setUi(Object.assign({}, ui, { busy: false, message: String(error) }))
          },
        )
      }

      function copyRef() {
        try {
          if (
            typeof navigator !== 'undefined' &&
            navigator !== null &&
            navigator.clipboard !== undefined &&
            typeof navigator.clipboard.writeText === 'function'
          ) {
            navigator.clipboard.writeText(ref).then(
              function () {
                update({ copied: true })
              },
              function () {},
            )
          }
        } catch (error) {
          // Clipboard access is best-effort decoration.
        }
      }

      var children = [
        h('code', { className: 'piai-readonly', key: 'ref' }, ref === '' ? '（未设置引用名）' : ref),
      ]
      if (available && ref !== '') {
        children.push(
          h(
            Tag,
            { key: 'status', tone: configured ? 'neutral' : 'quiet' },
            statusLabelOf(info),
          ),
        )
        children.push(
          h(
            Button,
            {
              key: 'copy',
              variant: 'outline',
              size: 'sm',
              'aria-label': props.label + '：复制引用名',
              onClick: copyRef,
            },
            ui.copied === true ? '已复制' : '复制',
          ),
        )
        children.push(
          h(
            Button,
            {
              key: 'set',
              variant: 'outline',
              size: 'sm',
              'aria-expanded': ui.open === true,
              'aria-label': props.label + (configured ? '：更新密钥' : '：设置密钥'),
              onClick: function () {
                update({ open: ui.open !== true, message: undefined })
              },
            },
            configured ? '更新密钥' : '设置密钥',
          ),
        )
        if (configured && writable !== true) {
          children.push(
            h(components.ConfirmButton, {
              key: 'clear',
              label: '清除密钥',
              question: '确认清除该凭据？',
              confirmLabel: '确认清除',
              onConfirm: removeSecret,
            }),
          )
        }
      }
      if (ref === '') {
        // A new provider still needs to name its reference; that name goes
        // through the ordinary settings pipeline, never the credential store.
        children.push(
          h('div', { className: 'piai-cred-editor', key: 'ref-edit' }, [
            h(TextControl, {
              key: 'input',
              id: props.id,
              value: '',
              placeholder: '例如 MY_PROVIDER_API_KEY',
              describedBy: props.describedBy,
              invalid: props.invalid,
              onChange: function (next) {
                props.onChange(next)
              },
              onClear: function () {
                props.onClear()
              },
            }),
          ]),
        )
      }
      if (ui.open === true && ref !== '') {
        children.push(
          h('div', { className: 'piai-cred-editor', key: 'editor' }, [
            h(Input, {
              key: 'secret',
              id: props.id + '-secret',
              type: 'password',
              autoComplete: 'new-password',
              value: ui.draft,
              'aria-label': props.label + '：密钥',
              placeholder: '粘贴密钥',
              onChange: function (event) {
                update({ draft: event.target.value })
              },
              onKeyDown: function (event) {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveSecret()
                }
              },
            }),
            h(
              Button,
              {
                key: 'save',
                variant: 'primary',
                size: 'sm',
                disabled: ui.draft === '' || ui.busy === true,
                'aria-label': '保存到凭据',
                onClick: saveSecret,
              },
              ui.busy === true ? '保存中…' : '保存到凭据',
            ),
            h(
              Button,
              {
                key: 'cancel',
                variant: 'outline',
                size: 'sm',
                'aria-label': '取消设置密钥',
                onClick: function () {
                  update({ open: false, draft: '', message: undefined })
                },
              },
              '取消',
            ),
          ]),
        )
      }
      if (available !== true) {
        children.push(
          h(
            'span',
            { className: 'piai-hint', key: 'unsupported' },
            '当前宿主不支持凭据管理，密钥需在凭据存储中配置。',
          ),
        )
      }
      if (props.credentialsError !== undefined && props.credentialsError !== null) {
        children.push(
          h('span', { className: 'piai-hint', key: 'error', role: 'alert' }, String(props.credentialsError)),
        )
      }
      if (ui.message !== undefined) {
        children.push(
          h('span', { className: 'piai-hint', key: 'message', role: 'alert' }, ui.message),
        )
      }
      return h(
        'div',
        {
          className: 'piai-cred',
          'aria-describedby': props.describedBy,
          'aria-invalid': props.invalid === true ? 'true' : undefined,
        },
        children,
      )
    }

    /** The credential status text for a `describe()` entry. */
    function statusLabelOf(info) {
      if (info === undefined || info === null) return '未配置'
      if (info.configured !== true) return '未配置'
      return info.source === 'env' ? '已配置（环境变量）' : '已配置（本地凭据）'
    }

    /**
     * The visible label of one enum value (and of one enum-array checkbox).
     *
     * The presentation table may name a value in Chinese (`input`: `text` →
     * 「文本（text）」); anything it does not name keeps its raw token, which is
     * the YAML spelling and must stay recognizable.
     */
    function enumLabelOf(leaf, value, fields) {
      if (fields !== undefined && typeof fields.valueLabelFor === 'function') {
        var label = fields.valueLabelFor(leaf, value)
        if (typeof label === 'string' && label !== '') return label
      }
      return String(value)
    }

    /**
     * One tooltip bubble line per closed-set value: `「label」：hint`.
     *
     * A single-select / multi-select field is only readable when every option
     * says what it means, so the row's bubble carries the whole vocabulary, not
     * just the field's own hint. The explanation is the presentation table's
     * (`valueHintFor`); a value it does not explain is skipped rather than
     * rendered as a bare token, and a leaf with no closed value set — or with
     * nothing explained — returns `undefined`, which leaves the bubble exactly
     * as it was.
     *
     * @param leaf - a schema leaf from `leaves()`.
     * @param fields - the presentation API.
     * @returns an array of `「label」：hint` lines, or `undefined`.
     */
    function enumHintLines(leaf, fields) {
      if (leaf === null || leaf === undefined) return undefined
      var values = Array.isArray(leaf.enum) ? leaf.enum : []
      if (values.length === 0) return undefined
      if (fields === undefined || typeof fields.valueHintFor !== 'function') return undefined
      var lines = []
      for (var index = 0; index < values.length; index += 1) {
        var value = values[index]
        var hint = fields.valueHintFor(leaf, value)
        if (typeof hint !== 'string' || hint === '') continue
        lines.push('「' + enumLabelOf(leaf, value, fields) + '」：' + hint)
      }
      return lines.length > 0 ? lines : undefined
    }

    /**
     * Render one leaf's control, dispatching on `leaf.kind`.
     *
     * `onChange` writes the value; `onClear` removes it so the field falls back
     * to whatever a lower configuration layer says. Clearing is never a `null`
     * write — that is the project's central rule.
     */
    function renderControl(leaf, path, value, form, fields, options, ui) {
      var onChange = function (next) {
        form.edit(path, next)
      }
      var onClear = function () {
        form.remove(path)
      }
      var enumOptions = (leaf.enum || []).map(function (entry) {
        var optionHint =
          fields !== undefined && typeof fields.valueHintFor === 'function'
            ? fields.valueHintFor(leaf, entry)
            : undefined
        return {
          value: entry,
          label: enumLabelOf(leaf, entry, fields),
          // EnumControl writes an option's `hint` as that radio's `title`, so
          // every option explains itself even with the bubble closed.
          hint: typeof optionHint === 'string' && optionHint !== '' ? optionHint : undefined,
        }
      })
      var shared = {
        id: ui.controlId,
        label: ui.label,
        hint: ui.hint,
        describedBy: ui.describedBy,
        invalid: ui.invalid,
      }
      if (isCredentialRef(leaf)) {
        var credentialOptions = options !== null && options !== undefined ? options.credentials : undefined
        return h(
          CredentialControl,
          Object.assign(
            {
              value: value,
              credentials: credentialOptions,
              credentialsError:
                credentialOptions !== null && credentialOptions !== undefined
                  ? credentialOptions.error
                  : undefined,
              onChange: onChange,
              onClear: onClear,
            },
            shared,
          ),
        )
      }
      switch (leaf.kind) {
        case 'boolean':
          return h(
            BooleanControl,
            Object.assign({ value: value, onChange: onChange, onClear: onClear }, shared),
          )
        case 'integer':
        case 'number':
          return h(
            NumberControl,
            Object.assign(
              {
                value: value,
                integer: leaf.kind === 'integer',
                step: leaf.step,
                min: leaf.min,
                max: leaf.max,
                def: leaf.def,
                onChange: onChange,
                onClear: onClear,
              },
              shared,
            ),
          )
        case 'enum':
        case 'const':
          return h(
            EnumControl,
            Object.assign({ value: value, options: enumOptions, onChange: onChange, onClear: onClear }, shared),
          )
        case 'array':
          if (leaf.enum && leaf.enum.length > 0) {
            return h(
              components.CheckboxGroupControl,
              Object.assign({ value: value, options: enumOptions, onChange: onChange, onClear: onClear }, shared),
            )
          }
          if (leaf.itemLeaves === undefined || leaf.itemLeaves.length === 0) {
            // A list of free scalars (`retryableCodes`): removable chips with a
            // text affordance. A closed set never reaches this branch.
            return h(
              components.TagListControl,
              Object.assign({ value: value, onChange: onChange, onClear: onClear }, shared),
            )
          }
          return h(components.ArrayControl, {
            leaf: leaf,
            path: path,
            value: value,
            form: form,
            fields: fields,
            options: options,
            ui: ui,
          })
        case 'dict':
          // A closed key set with scalar values is a tiers table: every declared
          // key visible at once, one input each (docs/verification.md §14).
          // An open map whose value union also accepts `null` and a `$var`
          // object is the chat-template dict: one row offers literal / variable
          // per key. Everything else — an open map (`headers`), or a closed set
          // whose values are themselves a closed set — stays with the generic
          // editor.
          var dictOnEntry = function (key, next) {
            var base = value !== null && typeof value === 'object' ? Object.assign({}, value) : {}
            base[key] = next
            form.edit(path, base)
          }
          var dictOnAddKey = function (key) {
            var base = value !== null && typeof value === 'object' ? Object.assign({}, value) : {}
            base[key] = ''
            form.edit(path, base)
          }
          var dictOnRemoveKey = function (key) {
            var base = value !== null && typeof value === 'object' ? Object.assign({}, value) : {}
            delete base[key]
            if (Object.keys(base).length === 0) form.remove(path)
            else form.edit(path, base)
          }
          if (Array.isArray(leaf.keyEnum) && leaf.keyEnum.length > 0 && leaf.valueEnum === undefined) {
            return h(
              components.TierTableControl,
              Object.assign(
                {
                  leaf: leaf,
                  fields: fields,
                  value: value,
                  onReplace: function (next) {
                    form.edit(path, next)
                  },
                  onClear: onClear,
                },
                shared,
              ),
            )
          }
          if (
            leaf.keyEnum === undefined &&
            leaf.valueEnum === undefined &&
            leaf.valueNullable === true
          ) {
            return h(
              components.TemplateArgsControl,
              Object.assign(
                {
                  leaf: leaf,
                  fields: fields,
                  value: value,
                  onEntry: dictOnEntry,
                  onAddKey: dictOnAddKey,
                  onRemoveKey: dictOnRemoveKey,
                },
                shared,
              ),
            )
          }
          return h(
            components.DictControl,
            Object.assign(
              {
                leaf: leaf,
                fields: fields,
                value: value,
                onEntry: dictOnEntry,
                onAddKey: dictOnAddKey,
                onRemoveKey: dictOnRemoveKey,
              },
              shared,
            ),
          )
        case 'union':
          return h(components.UnionControl, {
            leaf: leaf,
            path: path,
            value: value,
            form: form,
            fields: fields,
            options: options,
            ui: ui,
          })
        case 'object':
          return h(components.ObjectControl, {
            leaf: leaf,
            path: path,
            value: value,
            form: form,
            fields: fields,
            options: options,
          })
        default:
          return h(
            TextControl,
            Object.assign({ value: value, onChange: onChange, onClear: onClear }, shared),
          )
      }
    }

    /** Inject the unit suffix where the presentation table asked for one. */
    function describeControl(leaf, path, value, props, controlOptions, ui) {
      var presentationPath =
        typeof props.fields.presentationPathOf === 'function'
          ? props.fields.presentationPathOf(leaf)
          : path.join('.')
      var described = props.fields.describeField(presentationPath)
      var control = renderControl(leaf, path, value, props.form, props.fields, controlOptions, ui)
      if (described.unit === undefined) return control
      return h('div', { className: 'piai-with-unit' }, [
        control,
        h('span', { className: 'piai-unit', key: 'unit' }, described.unit),
      ])
    }

    return {
      EnumControl: EnumControl,
      BooleanControl: BooleanControl,
      NumberControl: NumberControl,
      TextControl: TextControl,
      CredentialControl: CredentialControl,
      enumLabelOf: enumLabelOf,
      enumHintLines: enumHintLines,
      renderControl: renderControl,
      describeControl: describeControl
    }
  }

  var api = { createControls: createControls }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.panelsControls = api

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
