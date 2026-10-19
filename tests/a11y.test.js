/**
 * Accessibility contract tests for `lib/client.panels.js`.
 *
 * What this file is for
 * ---------------------
 * `docs/interaction-design.md` §8 is a checklist, so it should be executable.
 * This harness renders the REAL panel chunk against a hand-written React and a
 * faithful stand-in for `@deepseek-ai/dsh-client-ui-primitives` (that package is
 * not a dependency of this repo, and its shipped build is ESM + CSS modules, so
 * it cannot be imported here). The stand-ins mirror the shipped DOM contract
 * verified against `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2`:
 *
 *   - `Switch`      `<button role="switch" aria-checked aria-label>`
 *   - `SegmentedControl` `<div role="tablist" aria-label>` + `<button role="tab">`
 *   - `MenuItemButton`   `<button role="menuitem">`
 *   - `Input`       wrapper `<span>` + native `<input>` (attributes pass through)
 *   - `Checkbox`    `<label>` wrapping the native checkbox
 *
 * `DisclosureRow` is deliberately absent: since v8 the page writes its own
 * disclosure head (`instanceCardHead`), so a stub for it would only hide a
 * regression that re-introduced the primitive.
 *
 * Every primitive call is recorded, so the test can assert the panels actually
 * adopt the primitive instead of hand-rolling a control, as well as assert the
 * markup the panels themselves own.
 *
 * The page-level provider strip is `ProviderTabs` (this file's own chunk), so
 * its `tablist`/`tab`/roving-tabindex/arrow-key semantics are asserted here as
 * well; the page shell's panel wiring is asserted by `tests/render.test.js`.
 * The panel-side enum control is asserted here too.
 *
 * @module dsh-llm-pi-ai-config/tests/a11y
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

/** The frozen compat grouping from docs/interaction-design.md §6. */
const COMPAT_SECTIONS = [
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
  { title: '缓存', keys: ['cacheControlFormat', 'supportsLongCacheRetention'] },
  {
    title: '模板与路由',
    keys: ['chatTemplateKwargs', 'chatTemplateArgs', 'vllmPriority', 'supportsTemperature'],
  },
]

/**
 * Unwrap a React component type exactly like the renderer does.
 *
 * The shipped primitives may be exported as wrappers — `Button`/`Input` as
 * `forwardRef(...)`, others as `memo(...)`: rendering those is a normal React
 * case, so the stand-in renderer must accept them too — otherwise a test can
 * only ever see the local fallbacks and would miss the silent-degrade defect
 * entirely.
 */
function unwrapComponentType(type) {
  if (type === null || typeof type !== 'object') return type
  const tag = type.$$typeof
  if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return type
  if (tag === Symbol.for('react.memo')) return unwrapComponentType(type.type)
  if (tag === Symbol.for('react.forward_ref')) return type.render
  return type
}
const COMPAT_KEYS = COMPAT_SECTIONS.flatMap((section) => section.keys)

/** The kind each compat key renders as, for a realistic leaf set. */
const COMPAT_KINDS = {
  maxTokensField: 'enum',
  thinkingFormat: 'enum',
  cacheControlFormat: 'enum',
  thinkingTokenBudgetField: 'enum',
  chatTemplateKwargs: 'dict',
  chatTemplateArgs: 'dict',
}

/**
 * Build the sandbox: mini React, recording primitive stand-ins, the real
 * `lib/client.fields.js`, and the real `lib/client.panels.js`.
 */
function createHarness(options = {}) {
  const registrations = []
  const primitiveCalls = []
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
    TypeError,
    Symbol,
    Set,
    Map,
    Date,
    RegExp,
    Math,
  }
  sandbox.globalThis = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  sandbox.window = sandbox
  createContext(sandbox)

  // ---- mini React: real hook cells, one render pass at a time ------------
  const cells = new Map()
  const counters = new Map()
  const pendingEffects = []
  let current = null

  function cellFor(id) {
    let cell = cells.get(id)
    if (cell === undefined) {
      cell = { hooks: [], cursor: 0 }
      cells.set(id, cell)
    }
    return cell
  }

  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    cloneElement: (element, extra) =>
      Object.assign({}, element, { props: Object.assign({}, element.props, extra) }),
    Component: class {
      constructor(props) {
        this.props = props
        this.state = {}
      }
      setState() {}
    },
    useState(initial) {
      const cell = current
      const index = cell.cursor
      cell.cursor += 1
      if (!(index in cell.hooks)) {
        cell.hooks[index] = typeof initial === 'function' ? initial() : initial
      }
      return [
        cell.hooks[index],
        (next) => {
          cell.hooks[index] = typeof next === 'function' ? next(cell.hooks[index]) : next
        },
      ]
    },
    useMemo(factory) {
      return factory()
    },
    useEffect(callback) {
      pendingEffects.push(callback)
    },
  }
  react.Component.prototype.isReactComponent = {}

  // ---- recording primitive stand-ins ------------------------------------
  function record(name, props) {
    primitiveCalls.push({ name, props })
  }
  const primitives = {
    Button(props) {
      record('Button', props)
      return react.createElement(
        'button',
        {
          type: 'button',
          className: props.className,
          id: props.id,
          'aria-label': props['aria-label'],
          'aria-haspopup': props['aria-haspopup'],
          'aria-expanded': props['aria-expanded'],
          'aria-pressed': props['aria-pressed'],
          disabled: props.disabled === true,
          title: props.title,
          onClick: props.onClick,
        },
        props.children,
      )
    },
    Input(props) {
      record('Input', props)
      return react.createElement(
        'span',
        { className: props.className },
        react.createElement('input', {
          id: props.id,
          type: props.type,
          value: props.value,
          placeholder: props.placeholder,
          'aria-label': props['aria-label'],
          'aria-describedby': props['aria-describedby'],
          'aria-invalid': props['aria-invalid'],
          onChange: props.onChange,
        }),
      )
    },
    Checkbox(props) {
      record('Checkbox', props)
      return react.createElement('label', { className: props.className }, [
        react.createElement('input', {
          key: 'i',
          id: props.id,
          type: 'checkbox',
          checked: props.checked === true,
          onChange: (event) => props.onChange(event.target.checked),
        }),
        react.createElement('span', { key: 'l' }, props.label),
      ])
    },
    Switch(props) {
      record('Switch', props)
      return react.createElement('button', {
        type: 'button',
        role: 'switch',
        className: props.className,
        'aria-checked': props.checked === true,
        'aria-label': props.label,
        title: props.title,
        disabled: props.disabled === true,
        onClick: () => props.onChange(!props.checked),
      })
    },
    SegmentedControl(props) {
      record('SegmentedControl', props)
      return react.createElement(
        'div',
        { role: 'tablist', 'aria-label': props.label, className: props.className },
        (props.options || []).map((option) =>
          react.createElement(
            'button',
            {
              key: String(option.value),
              id: props.id + '-' + String(option.value),
              type: 'button',
              role: 'tab',
              'aria-selected': option.value === props.value,
              'aria-controls': props.id + '-' + String(option.value) + '-panel',
              tabIndex: option.value === props.value ? 0 : -1,
              disabled: props.disabled === true || option.disabled === true,
              onClick: () => props.onChange(option.value),
            },
            option.label,
          ),
        ),
      )
    },
    Menu(props) {
      record('Menu', props)
      return react.createElement('span', { className: props.className }, [
        props.anchor,
        props.open === true
          ? react.createElement('span', { key: 'list', role: 'menu' }, props.children)
          : null,
      ])
    },
    MenuItemButton(props) {
      record('MenuItemButton', props)
      return react.createElement(
        'button',
        { type: 'button', role: 'menuitem', onClick: props.onSelect },
        props.children,
      )
    },
    Tooltip(props) {
      record('Tooltip', props)
      return props.children
    },
    Tag(props) {
      record('Tag', props)
      return react.createElement('span', { className: props.className, 'data-tone': props.tone }, props.children)
    },
    Pill(props) {
      record('Pill', props)
      if (typeof props.onClick !== 'function') {
        return react.createElement('span', { className: props.className }, props.children)
      }
      // The shipped `Pill` spreads its remaining props onto the button, which is
      // how the provider strip attaches role=tab / id / aria-* / handlers.
      return react.createElement(
        'button',
        {
          type: 'button',
          id: props.id,
          role: props.role,
          className: props.className,
          'aria-label': props['aria-label'],
          'aria-selected': props['aria-selected'],
          'aria-controls': props['aria-controls'],
          'aria-pressed': props['aria-pressed'],
          tabIndex: props.tabIndex,
          title: props.title,
          onClick: props.onClick,
          onKeyDown: props.onKeyDown,
        },
        props.children,
      )
    },
    StateDot(props) {
      record('StateDot', props)
      return react.createElement('span', { 'aria-hidden': 'true', 'data-state': props.state })
    },
  }

  // Optionally present a primitive the way the shipped bundle does — `Button`
  // and `Input` as `forwardRef(...)`, a memo-wrapped primitive for the synthetic
  // memo half. A harness that only ever supplies plain functions cannot see a
  // resolver that rejects those wrappers (the defect recorded in
  // docs/verification.md §11).
  for (const [name, kind] of Object.entries(options.wrapPrimitives ?? {})) {
    const render = primitives[name]
    if (typeof render !== 'function') continue
    primitives[name] =
      kind === 'forwardRef'
        ? { $$typeof: Symbol.for('react.forward_ref'), render }
        : { $$typeof: Symbol.for('react.memo'), type: render }
  }

  const seeds = { react, '@deepseek-ai/dsh-client-ui-primitives': primitives }
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`a11y test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    throw new Error(`a11y test: no chunk may be fetched on this path (${specifier})`)
  }

  const load = (fileName) => {
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    assert.equal(registrations.length, before + 1, `${fileName} must register exactly once`)
    return registrations[registrations.length - 1]
  }

  // v10: the shared base chunk is what the panels build against (one
  // primitives resolution layer, one `isComponent`). Its factory publishes the
  // built core API to the sandbox registry, which `createPanels` reads.
  load('client.core.js').factory(requireStub)
  load('client.fields.groups.js').factory(requireStub)
  load('client.fields.hints.js').factory(requireStub)
  const fieldsRegistration = load('client.fields.js')
  const fields = fieldsRegistration.factory(requireStub)
  // v10: the panels facade composes the six panels modules out of the
  // registry, so they are materialised first (the owner's phase order).
  load('client.panels.kit.js').factory(requireStub)
  load('client.panels.controls.js').factory(requireStub)
  load('client.panels.collections.js').factory(requireStub)
  load('client.panels.render.js').factory(requireStub)
  load('client.panels.instances.js').factory(requireStub)
  load('client.panels.catalog.js').factory(requireStub)
  const panelsRegistration = load('client.panels.js')
  const panels = panelsRegistration.factory(requireStub)

  /** Render one element tree, resolving function components. */
  function render(node) {
    counters.clear()
    const tree = renderNode(node)
    while (pendingEffects.length > 0) {
      const callback = pendingEffects.shift()
      callback()
    }
    return tree
  }

  function renderNode(node) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (Array.isArray(node)) {
      return node.map(renderNode).filter((entry) => entry !== null)
    }
    if (typeof node !== 'object') {
      return { type: '#text', props: {}, children: [], text: String(node) }
    }
    const type = unwrapComponentType(node.type)
    if (typeof type === 'function') {
      if (type.prototype && type.prototype.isReactComponent) {
        return renderNode(node.children)
      }
      const ordinal = counters.get(type) || 0
      counters.set(type, ordinal + 1)
      const key = node.props && node.props.key !== undefined ? String(node.props.key) : '#' + ordinal
      const cell = cellFor(key + '::' + (type.name || 'anonymous'))
      const previous = current
      current = cell
      cell.cursor = 0
      let output
      try {
        // A forwardRef render function takes (props, ref); memo takes props.
        const props = Object.assign({}, node.props, { children: node.children })
        output = type(props, null)
      } finally {
        current = previous
      }
      return renderNode(output)
    }
    return {
      type: node.type,
      props: node.props || {},
      children: (node.children || []).map(renderNode).filter((entry) => entry !== null),
    }
  }

  return { react, render, panels, fields, primitiveCalls, registration: panelsRegistration, sandbox }
}

/** Every element in a tree, depth first. */
function elements(tree) {
  const out = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    out.push(node)
    node.children.forEach(walk)
  }
  walk(tree)
  return out
}

/** The classes on one element, as a list. */
function classesOf(node) {
  return String(node.props.className || '')
    .split(/\s+/)
    .filter(Boolean)
}

/** Every element carrying `name` as one of its classes. */
function byClass(tree, name) {
  return elements(tree).filter((node) => classesOf(node).indexOf(name) !== -1)
}

/** Every element with the given role. */
function byRole(tree, role) {
  return elements(tree).filter((node) => node.props.role === role)
}

/** Every native radio of a rendered tree. */
function radiosOf(tree) {
  return elements(tree).filter(
    (node) => node.type === 'input' && node.props.type === 'radio',
  )
}

/** The option label wrapping one radio (the `label[htmlFor]` next to it). */
function optionLabelOf(tree, radio) {
  return elements(tree).find(
    (node) => node.type === 'label' && node.props.htmlFor === radio.props.id,
  )
}

/** The radio whose option text contains `needle`. */
function radioByText(tree, needle) {
  return radiosOf(tree).find((radio) => {
    const label = optionLabelOf(tree, radio)
    return label !== undefined && textOf(label).includes(needle)
  })
}

/** The single checked radio of a rendered control (v7 keeps exactly one). */
function selectedRadioOf(tree) {
  return radiosOf(tree).filter((radio) => radio.props.checked === true)
}

/** The concatenated text of a subtree (a bare string counts as its own text). */
function textOf(tree) {
  if (typeof tree === 'string') return tree
  if (typeof tree === 'number') return String(tree)
  return elements(tree)
    .filter((node) => node.type === '#text')
    .map((node) => node.text)
    .join('')
}

/**
 * The text of an element tree that has not been rendered yet.
 *
 * Primitive props (`title`, `children`) hold raw `createElement` output, where
 * string children are still bare strings rather than `#text` nodes.
 */
function plainText(node) {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (typeof node !== 'object') return String(node)
  return plainText(node.children)
}

/** Every element with a DOM id, indexed. */
function byId(tree) {
  const map = new Map()
  for (const node of elements(tree)) {
    if (typeof node.props.id === 'string') map.set(node.props.id, node)
  }
  return map
}

/** The leaf list a panel receives for one route, in profile-relative paths. */
function requestLeaves() {
  return [
    { path: ['reasoning'], kind: 'enum', enum: ['off', 'low', 'medium', 'high'], required: false },
    {
      path: ['api'],
      kind: 'enum',
      enum: [
        'openai-completions',
        'openai-responses',
        'anthropic-messages',
        'bedrock-converse-stream',
        'mistral-conversations',
      ],
      required: false,
    },
    { path: ['headers'], kind: 'dict', required: false },
    {
      path: ['retryPolicy'],
      kind: 'union',
      required: false,
      branches: [
        { value: 'normal', label: 'normal' },
        { value: 'always', label: 'always' },
      ],
    },
  ]
}

/** The compat group's leaves, in the frozen 26-key set. */
function compatLeaves() {
  return COMPAT_KEYS.map((key) => ({
    path: ['compat', key],
    kind: COMPAT_KINDS[key] || 'boolean',
    required: false,
  }))
}

/** A provider profile whose protocol is `openai-completions`. */
function providerValues() {
  return {
    api: 'openai-completions',
    reasoning: 'low',
    headers: {},
    retryPolicy: { mode: 'normal' },
    compat: { supportsStore: true },
    defaultContextWindow: 128000,
    models: ['gpt-4o'],
  }
}

/** The groups the Advanced tab renders, including the frozen compat group. */
function advancedGroups() {
  return [
    {
      id: 'defaults',
      title: '默认值',
      leaves: [{ path: ['defaultContextWindow'], kind: 'integer', required: false }],
    },
    { id: 'request', title: '请求构造', leaves: requestLeaves() },
    { id: 'compat', title: '协议兼容（提供商级）', leaves: compatLeaves() },
  ]
}

/** A staged-form stand-in that records every write request. */
function makeForm(options = {}) {
  const writes = []
  return {
    writes,
    ops: options.ops || [],
    invalid: options.invalid === true,
    edit: (path, value) => writes.push({ op: 'edit', path, value }),
    remove: (path) => writes.push({ op: 'remove', path }),
    reset: (path) => writes.push({ op: 'reset', path }),
  }
}

/** Props shared by every panel under test. */
function makeProps(overrides = {}) {
  const values = overrides.values || providerValues()
  const form = overrides.form || makeForm()
  const fields = overrides.fields
  return Object.assign(
    {
      form,
      schema: undefined,
      fields,
      envelope: { uid: 1, refs: {} },
      values,
      groups: overrides.groups || advancedGroups(),
      provider: 'openai',
      providerNames: ['openai', 'anthropic'],
      locale: OWNER_ID,
      onSelect: () => {},
      onAdd: () => {},
      onRemove: () => {},
      options: { schema: undefined, fields, envelope: { uid: 1, refs: {} }, values },
    },
    overrides.extra || {},
  )
}

test('every leaf row has a visible label and every control an accessible name', () => {
  const harness = createHarness()
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields }),
    ),
  )

  const rows = byClass(tree, 'piai-row')
  assert.ok(rows.length >= 5, `expected the rendered rows, got ${rows.length}`)
  for (const row of rows) {
    const labels = byClass(row, 'piai-row-label')
    assert.equal(labels.length, 1, 'a row must carry exactly one label')
    assert.ok(textOf(labels[0]).trim().length > 0, 'the row label must not be empty')
  }

  // Every htmlFor must resolve to a real control id in the same tree.
  const ids = byId(tree)
  const labels = elements(tree).filter(
    (node) => node.type === 'label' && typeof node.props.htmlFor === 'string',
  )
  assert.ok(labels.length > 0, 'text and number controls must be associated with a label element')
  for (const label of labels) {
    assert.ok(ids.has(label.props.htmlFor), `htmlFor ${label.props.htmlFor} must resolve`)
  }

  // Native inputs: stable id plus either a label association or aria-label.
  const inputs = elements(tree).filter((node) => node.type === 'input')
  assert.ok(inputs.length > 0)
  for (const input of inputs) {
    assert.equal(typeof input.props.id, 'string', 'every input needs a stable id')
    assert.ok(input.props.id.length > 0)
    const associated =
      labels.some((label) => label.props.htmlFor === input.props.id) ||
      typeof input.props['aria-label'] === 'string'
    assert.ok(associated, `input ${input.props.id} must have an accessible name`)
  }

  // T7: the boolean leaf is no longer a `Switch` — it is the shared enum control
  // as a three-way `role="radiogroup"` (开启 / 关闭 / 默认（未设置）). The
  // primitive is therefore retired and must not be resolved at all; the
  // accessible name travels on the radiogroup, the same way the other enums
  // carry theirs. (Both halves are asserted so this cannot silently narrow.)
  assert.equal(
    harness.primitiveCalls.some((call) => call.name === 'Switch'),
    false,
    'T7: Switch is retired; a boolean leaf must not resolve the primitive',
  )
  for (const call of harness.primitiveCalls.filter(
    (entry) => entry.name === 'SegmentedControl',
  )) {
    assert.equal(typeof call.props.id, 'string')
    assert.equal(typeof call.props.label, 'string')
    assert.ok(call.props.label.length > 0, 'the tablist must be named')
  }
})

test('an enum is one self-drawn radio group at any option count, never a native select', () => {
  const harness = createHarness()
  const form = makeForm()
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields, form }),
    ),
  )

  assert.equal(elements(tree).filter((node) => node.type === 'select').length, 0, 'no native select')

  // §15.5.3: the >4 option `Menu` is gone and so is the `SegmentedControl`
  // track — the primitives are no longer even imported by the panels chunk.
  for (const name of ['SegmentedControl', 'Menu', 'MenuItemButton']) {
    assert.equal(
      harness.primitiveCalls.filter((entry) => entry.name === name).length,
      0,
      `${name} left the page in v7 (§15.5)`,
    )
  }

  const groups = byRole(tree, 'radiogroup')
  assert.ok(groups.length >= 2, `every enum is a radiogroup, got ${groups.length}`)
  const ids = byId(tree)
  for (const group of groups) {
    assert.ok(
      typeof group.props['aria-label'] === 'string' && group.props['aria-label'].length > 0,
      'the radiogroup carries the field label as its accessible name',
    )
    const radios = elements(group).filter(
      (node) => node.type === 'input' && node.props.type === 'radio',
    )
    assert.ok(radios.length >= 2, 'a radio group needs its options')
    const name = radios[0].props.name
    assert.equal(typeof name, 'string')
    assert.ok(name.length > 0, 'the shared name is what makes the group single-select')
    assert.ok(
      radios.every((radio) => radio.props.name === name),
      'one name per enum: native radio semantics',
    )
    assert.equal(
      radios.filter((radio) => radio.props.checked === true).length,
      1,
      'exactly one option is selected',
    )
    // Every option is wrapped by a label[htmlFor] pointing at its own radio.
    const labels = elements(group).filter((node) => node.type === 'label')
    assert.equal(labels.length, radios.length, 'each option is one label')
    for (const label of labels) {
      assert.ok(ids.has(label.props.htmlFor), `htmlFor ${label.props.htmlFor} must resolve`)
      assert.ok(textOf(label).trim().length > 0, 'no option is icon-only')
    }
    // Cheap residual-risk guard: the group must not swallow a text input (the
    // row-control width rule would then stretch it and break the row).
    assert.equal(
      elements(group).filter((node) => node.type === 'input').length,
      radios.length,
      'every input inside a radiogroup is a radio',
    )
  }

  // The 4-option enum keeps its values, gains the inherit radio last, and the
  // inherit write path is `onClear` (form.remove), never a null edit.
  const reasoningLabel = harness.fields.labelFor({ path: ['reasoning'] })
  const four = groups.find((group) => group.props['aria-label'] === reasoningLabel)
  assert.ok(four !== undefined, 'the 4-option enum must render as a group')
  assert.deepEqual(
    elements(four)
      .filter((node) => node.type === 'input')
      .map((radio) => radio.props.value),
    ['off', 'low', 'medium', 'high', '__unset__'],
    'the real options keep their order and the default sentinel is last',
  )
  const fourRadios = elements(four).filter((node) => node.type === 'input')
  assert.equal(fourRadios[1].props.checked, true, 'the current value is the selected one')
  const optionLabels = elements(four).filter((node) => node.type === 'label')
  const inheritOption = optionLabels[optionLabels.length - 1]
  // T7: the last option reads 「默认（未设置）」; the title keeps the long wording
  // (still containing 「未设置」) for the ellipsized case.
  assert.equal(textOf(inheritOption), '默认（未设置）', 'the default choice shares the group')
  assert.ok(
    String(inheritOption.props.title).includes('未设置'),
    'the full wording stays on the option title',
  )
  fourRadios[4].props.onChange()
  assert.deepEqual(form.writes, [{ op: 'remove', path: ['reasoning'] }], 'default = unset')

  // A 5-option enum is the same flat group — not a Menu, not a truncated track.
  const apiLabel = harness.fields.labelFor({ path: ['api'] })
  const five = groups.find((group) => group.props['aria-label'] === apiLabel)
  assert.ok(five !== undefined, 'the 5-option enum must render as a group too')
  assert.deepEqual(
    elements(five)
      .filter((node) => node.type === 'input')
      .map((radio) => radio.props.value),
    [
      'openai-completions',
      'openai-responses',
      'anthropic-messages',
      'bedrock-converse-stream',
      'mistral-conversations',
      '__unset__',
    ],
  )
  assert.ok(byClass(tree, 'piai-select').length >= 2, 'every enum sits in a piai-select wrapper')
  // §15.5.7: an enum row never uses `label htmlFor` on the row label — the
  // group owns the name, and the radiogroup is not a single focusable target.
  const reasoningRow = byClass(tree, 'piai-row').find(
    (row) => textOf(byClass(row, 'piai-row-label')[0]) === reasoningLabel,
  )
  assert.ok(reasoningRow !== undefined)
  const rowLabel = byClass(reasoningRow, 'piai-row-label')[0]
  assert.equal(rowLabel.type, 'span', 'the enum row label is a span')
  assert.equal(rowLabel.props.htmlFor, undefined)

  // T7: a boolean leaf is a three-way radio group inside `div.piai-bool` —
  // 开启 (true) / 关闭 (false) / 默认（未设置） (__unset__) — never a Switch and
  // never a checkbox. Open the first compat group to render the booleans.
  const disclosureRows = byRole(tree, 'button').filter(
    (node) => node.props['aria-expanded'] !== undefined,
  )
  disclosureRows[0].props.onClick()
  const withBooleans = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields }),
    ),
  )
  const bools = byClass(withBooleans, 'piai-bool')
  assert.ok(bools.length > 0, 'the compat booleans must render')
  assert.equal(byRole(withBooleans, 'switch').length, 0, 'no boolean renders a switch any more')
  for (const bool of bools) {
    const group = byRole(bool, 'radiogroup')[0]
    assert.ok(group !== undefined, 'each boolean row is a radiogroup (§8.6)')
    assert.ok(
      typeof group.props['aria-label'] === 'string' && group.props['aria-label'].length > 0,
      'the boolean radiogroup carries the field label as its accessible name',
    )
    assert.deepEqual(
      elements(group)
        .filter((node) => node.type === 'input')
        .map((radio) => radio.props.value),
      ['true', 'false', '__unset__'],
      'the three states are 开启 / 关闭 / 默认（未设置）',
    )
    assert.deepEqual(
      elements(group)
        .filter((node) => node.type === 'label')
        .map((label) => textOf(label)),
      ['开启', '关闭', '默认（未设置）'],
    )
  }
})

test('every field hint is one piai-info trigger, described by its control and shown in a Tooltip', () => {
  const harness = createHarness()
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields }),
    ),
  )
  const ids = byId(tree)
  const rows = byClass(tree, 'piai-row')
  assert.ok(rows.length >= 5, `expected the rendered rows, got ${rows.length}`)

  // §15.3: the trigger is always in the label row, never in the control row,
  // and the row itself carries neither a field-level hint nor the key chip.
  for (const row of rows) {
    const head = byClass(row, 'piai-row-head')[0]
    const control = byClass(row, 'piai-row-control')[0]
    assert.ok(head !== undefined && control !== undefined)
    const inHead = byClass(head, 'piai-info')
    assert.equal(inHead.length, 1, 'each field row carries exactly one info trigger')
    assert.ok(
      inHead[0].props.className.split(' ').includes('piai-info'),
      'the trigger is the piai-info button',
    )
    assert.equal(
      byClass(control, 'piai-info').length,
      0,
      'the v6 control-column trigger must be gone',
    )
    assert.equal(byClass(row, 'piai-hint').length, 0, 'no inline field-level hint may remain')
    assert.equal(byClass(row, 'piai-key').length, 0, 'the raw key moved into the bubble')
  }

  // A short hint is no longer special-cased: it is disclosed the same way.
  const reasoningLabel = harness.fields.labelFor({ path: ['reasoning'] })
  const reasoningHint = harness.fields.hintFor({ path: ['reasoning'] })
  assert.ok(reasoningHint.length > 0)
  const reasoningRow = rows.find(
    (row) => textOf(byClass(row, 'piai-row-label')[0]) === reasoningLabel,
  )
  assert.ok(reasoningRow !== undefined, 'the reasoning row must render')
  const reasoningControl = byClass(reasoningRow, 'piai-row-control')[0]
  const described = reasoningControl.props['aria-describedby']
  assert.equal(typeof described, 'string', 'the control is described by the trigger')
  const info = ids.get(described)
  assert.ok(info !== undefined, 'aria-describedby must resolve to a rendered node')
  assert.ok(
    info.props.className.split(' ').includes('piai-info'),
    'the described node is the piai-info trigger',
  )
  assert.ok(
    info.props['aria-label'].includes(reasoningLabel) &&
      info.props['aria-label'].includes(reasoningHint),
    'the trigger name carries the label and the hint',
  )

  // The bubble is the official Tooltip: pinned on click, portalled, right side,
  // and its content is the raw key chip plus the Chinese hint.
  const tooltips = harness.primitiveCalls.filter((entry) => entry.name === 'Tooltip')
  const mine = tooltips.find((entry) => {
    const child = Array.isArray(entry.props.children)
      ? entry.props.children[0]
      : entry.props.children
    return (
      child !== undefined &&
      child !== null &&
      child.props !== undefined &&
      child.props.id === described
    )
  })
  assert.ok(mine !== undefined, 'the trigger must be wrapped in a Tooltip')
  assert.equal(mine.props.side, 'right')
  assert.equal(mine.props.openOnClick, true)
  assert.equal(mine.props.portal, true)
  assert.equal(mine.props.maxWidth, 360)
  assert.equal(
    Array.isArray(mine.props.children) ? mine.props.children.length : 1,
    1,
    'Tooltip takes exactly one element child',
  )

  // T20 contract: the bubble is ONE top-level node — a scoped wrapper span —
  //   [ span.piai-root > (code.piai-key?, span(hint)?, span(extraLine)*) ]
  // There are no <br> separators any more: the nested root is a flex column and
  // the line spacing comes from CSS (`.piai-root .piai-root { gap: 4px }`), so
  // every part is found by DEPTH and by TEXT, never by array position.
  const CJK = /[\u4e00-\u9fff]/
  const bubble = mine.props.label
  assert.ok(Array.isArray(bubble), 'the bubble content is an array')
  assert.equal(bubble.length, 1, 'the bubble is exactly one top-level node')
  const wrapper = bubble[0]
  assert.equal(wrapper.type, 'span', 'the top-level node is the scoped wrapper span')
  assert.ok(
    wrapper.props.className.split(' ').includes('piai-root'),
    'the wrapper re-enters the .piai-root scope so the portalled bubble is styled',
  )

  const inside = elements(wrapper).filter((node) => node !== wrapper)
  assert.equal(
    inside.filter((node) => node.type === 'br').length,
    0,
    'T20: the bubble carries no <br> separator any more',
  )
  const chip = inside.find((node) => node.type === 'code' && node.props.className === 'piai-key')
  assert.ok(chip !== undefined, 'the raw YAML key chip lives in the bubble')
  assert.equal(chip.type, 'code')
  assert.equal(chip.props.className, 'piai-key', 'the chip class is exactly piai-key')
  assert.equal(plainText(chip), harness.fields.keyLabelFor({ path: ['reasoning'] }))

  // The field hint is the span whose text IS the hint — not "the first span".
  const hintSpan = inside.find((node) => node.type === 'span' && plainText(node) === reasoningHint)
  assert.ok(hintSpan !== undefined, 'the bubble carries the field hint as its own span')

  const extraLines = inside.filter(
    (node) => node.type === 'span' && plainText(node) !== reasoningHint,
  )
  for (const line of extraLines) {
    const text = plainText(line)
    assert.ok(text.trim() !== '', 'an extra bubble line must not be empty')
    assert.ok(CJK.test(text), 'an extra bubble line must be Chinese: ' + JSON.stringify(text))
  }
})

test('a dirty field of an invalid draft carries aria-invalid, a valid draft does not', () => {
  const harness = createHarness()

  const validTree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields }),
    ),
  )
  assert.equal(
    elements(validTree).filter((node) => node.props['aria-invalid'] === 'true').length,
    0,
    'a valid draft must not mark anything invalid',
  )

  const form = makeForm({ invalid: true, ops: [{ path: ['defaultContextWindow'] }] })
  const invalidTree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({ fields: harness.fields, form }),
    ),
  )
  const invalidRows = byClass(invalidTree, 'piai-row').filter((row) =>
    elements(row).some((node) => node.props['aria-invalid'] === 'true'),
  )
  assert.equal(invalidRows.length, 1, 'only the dirty field of an invalid draft is marked')
  const input = elements(invalidRows[0]).find((node) => node.type === 'input')
  assert.equal(input.props['aria-invalid'], 'true', 'the control itself must carry aria-invalid')
  assert.equal(typeof input.props['aria-describedby'] === 'string', true)
})

test('the destructive delete left the strip; the bar owns the second step (render.test.js)', () => {
  const harness = createHarness()
  let removed = 0
  const props = makeProps({
    fields: harness.fields,
    groups: [{ id: 'identity', title: '基础信息', leaves: [] }],
    extra: {
      onRemove: () => {
        removed += 1
      },
    },
  })
  const tree = harness.render(harness.react.createElement(harness.panels.ProviderTabs, props))

  // §15.2 item 9: ProviderTabs renders no destructive control at all — no
  // delete affordance, no armed alert, no confirmation group. The two-step +
  // Escape behaviour now lives in the owner's `.piai-bar` and is exercised
  // against the real page in tests/render.test.js.
  const labels = elements(tree)
    .filter((node) => node.type === 'button')
    .map((node) => node.props['aria-label'])
  assert.equal(labels.includes('删除当前提供商'), false, 'the strip must not arm a delete')
  assert.equal(labels.includes('确认删除'), false, 'the strip must not confirm a delete')
  assert.equal(byRole(tree, 'alert').length, 0, 'no armed announcement may remain in the strip')
  assert.equal(byRole(tree, 'group').length, 0, 'no armed confirmation group may remain in the strip')
  assert.equal(removed, 0)
})

test('the provider strip is a tablist: one roving tab per provider plus the add tab', () => {
  const harness = createHarness()
  const selected = []
  const adds = []
  const items = [
    {
      value: 'alpha',
      label: 'Deepseek 月卡',
      id: 'model-extended-tab-0-alpha',
      panelId: 'model-extended-panel-0-alpha',
    },
    {
      value: 'beta',
      label: 'beta',
      id: 'model-extended-tab-1-beta',
      panelId: 'model-extended-panel-1-beta',
    },
  ]
  const props = makeProps({
    fields: harness.fields,
    groups: [{ id: 'identity', title: '基础信息', leaves: [] }],
    extra: {
      provider: 'beta',
      providerNames: ['alpha', 'beta'],
      items: items,
      label: '提供商',
      onSelect: (name) => selected.push(name),
      onSelectAdd: () => adds.push(true),
    },
  })
  const tree = harness.render(harness.react.createElement(harness.panels.ProviderTabs, props))

  const tablists = byRole(tree, 'tablist')
  assert.equal(tablists.length, 1, 'the strip is one tablist')
  assert.equal(tablists[0].props['aria-label'], '提供商')
  assert.equal(tablists[0].props.id, undefined, 'the v7 tablist needs no id')
  assert.ok(
    classesOf(tablists[0]).includes('piai-provider-list'),
    'the tablist carries the underlined tab-row class',
  )

  // §15.2 item 8: the trailing 「添加」 entry is a REAL tab, not a Pill button.
  const tabs = byRole(tree, 'tab')
  assert.equal(tabs.length, 3, 'one tab per provider plus the add tab')
  assert.deepEqual(
    tabs.map((tab) => tab.props.id),
    [...items.map((item) => item.id), 'model-extended-tab-add'],
  )
  assert.deepEqual(
    tabs.map((tab) => tab.props['aria-controls']),
    [...items.map((item) => item.panelId), 'model-extended-panel-add'],
  )
  assert.deepEqual(
    tabs.map((tab) => tab.props['aria-selected']),
    [false, true, false],
    'exactly the selected provider is marked',
  )
  assert.deepEqual(
    tabs.map((tab) => tab.props.tabIndex),
    [-1, 0, -1],
    'only the selected tab is a tab stop (roving tabindex)',
  )
  assert.deepEqual(
    tabs.map((tab) => tab.props['data-active']),
    [undefined, 'true', undefined],
    'the underline hook is data-active on the selected tab only',
  )
  for (const tab of tabs) {
    assert.equal(tab.type, 'button', 'a tab is a bare native button in v7')
    assert.equal(tab.props.type, 'button')
    assert.ok(
      typeof tab.props['aria-label'] === 'string' && tab.props['aria-label'].length > 0,
      'every tab has an accessible name',
    )
  }
  assert.equal(tabs[2].props['aria-label'], '添加')
  assert.equal(textOf(tabs[2]), '添加')

  tabs[0].props.onClick()
  tabs[2].props.onClick()
  assert.deepEqual(selected, ['alpha'])
  assert.equal(adds.length, 1, 'the add tab requests the add panel')

  // Pill must no longer be the tab primitive.
  assert.equal(
    harness.primitiveCalls.filter((entry) => entry.name === 'Pill' && entry.props.role === 'tab').length,
    0,
    'no Pill may carry role=tab',
  )
})

test('the add tab owns the strip’s only tabpanel, and zero providers render none', () => {
  const harness = createHarness()
  const items = [
    { value: 'alpha', label: 'alpha', id: 't-0', panelId: 'p-0' },
  ]
  const shared = {
    fields: harness.fields,
    groups: [{ id: 'identity', title: '基础信息', leaves: [] }],
  }

  // Adding: the add tab's panel is the page's tabpanel and the strip does not
  // render the provider face.
  const addingTree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderTabs,
      makeProps(
        Object.assign({}, shared, {
          extra: {
            provider: 'alpha',
            providerNames: ['alpha'],
            items,
            adding: true,
            label: '提供商',
            onAdd: () => {},
          },
        }),
      ),
    ),
  )
  const panels = byRole(addingTree, 'tabpanel')
  assert.equal(panels.length, 1, 'the add tab owns exactly one tabpanel')
  assert.equal(panels[0].props.id, 'model-extended-panel-add')
  assert.equal(panels[0].props['aria-labelledby'], 'model-extended-tab-add')
  const ids = byId(addingTree)
  const tabsWithPanels = byRole(addingTree, 'tab')
  for (const tab of tabsWithPanels) {
    assert.equal(typeof tab.props['aria-controls'], 'string', 'every tab must point at a panel')
  }
  // Only the add tab's panel lives inside the strip; the provider tab points at
  // the owner's panel, so within this component the add tab is the one that
  // must resolve locally and never dangle.
  assert.ok(
    ids.has(byRole(addingTree, 'tab').find((tab) => tab.props.id === 'model-extended-tab-add').props['aria-controls']),
    'the add tab aria-controls must resolve to its own tabpanel',
  )
  const addTab = byRole(addingTree, 'tab').find(
    (tab) => tab.props.id === 'model-extended-tab-add',
  )
  assert.equal(addTab.props['aria-selected'], true)
  assert.equal(addTab.props['data-active'], 'true')
  assert.equal(addTab.props.tabIndex, 0, 'the add tab takes the tab stop while active')

  // §15.9 D2: with zero providers there is no tablist, no tab, no tabpanel —
  // the add form renders in place instead.
  const emptyTree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderTabs,
      makeProps(
        Object.assign({}, shared, {
          extra: {
            provider: undefined,
            providerNames: [],
            items: [],
            label: '提供商',
            onAdd: () => {},
          },
        }),
      ),
    ),
  )
  assert.equal(byRole(emptyTree, 'tablist').length, 0, 'no tablist without providers')
  assert.equal(byRole(emptyTree, 'tab').length, 0, 'no tab without providers')
  assert.equal(byRole(emptyTree, 'tabpanel').length, 0, 'no tabpanel without providers')
  assert.equal(byClass(emptyTree, 'piai-provider-add').length, 1, 'the add form still renders')
  assert.equal(byClass(emptyTree, 'piai-empty').length, 1)
})

test('the strip keyboard model selects and skips per Arrow/Home/End, add tab included', () => {
  const harness = createHarness()
  const selected = []
  const adds = []
  const items = [
    { value: 'alpha', label: 'alpha', id: 't-0', panelId: 'p-0' },
    { value: 'beta', label: 'beta', id: 't-1', panelId: 'p-1' },
    { value: 'gamma', label: 'gamma', id: 't-2', panelId: 'p-2' },
  ]
  const props = makeProps({
    fields: harness.fields,
    groups: [{ id: 'identity', title: '基础信息', leaves: [] }],
    extra: {
      provider: 'alpha',
      providerNames: ['alpha', 'beta', 'gamma'],
      items,
      label: '提供商',
      onSelect: (name) => selected.push(name),
      onSelectAdd: () => adds.push(true),
    },
  })
  const tree = harness.render(harness.react.createElement(harness.panels.ProviderTabs, props))
  const tabs = byRole(tree, 'tab')
  // §15.2 item 8: the roving range is providers + the trailing add tab.
  assert.equal(tabs.length, 4, 'three providers plus the add tab')

  const press = (tab, key) => {
    let prevented = false
    let stopped = false
    const target = {
      parentElement: { querySelectorAll: () => ({ item: () => null }) },
    }
    tab.props.onKeyDown({
      key,
      preventDefault: () => {
        prevented = true
      },
      stopPropagation: () => {
        stopped = true
      },
      currentTarget: target,
    })
    return { prevented, stopped }
  }

  assert.deepEqual(press(tabs[0], 'ArrowRight'), { prevented: true, stopped: true })
  assert.deepEqual(press(tabs[0], 'ArrowLeft'), { prevented: true, stopped: true })
  assert.deepEqual(press(tabs[2], 'End'), { prevented: true, stopped: true })
  assert.deepEqual(press(tabs[2], 'Home'), { prevented: true, stopped: true })
  assert.deepEqual(press(tabs[3], 'ArrowRight'), { prevented: true, stopped: true })
  assert.deepEqual(press(tabs[1], 'Tab'), { prevented: false, stopped: false }, 'Tab must pass through')
  assert.deepEqual(
    selected,
    ['beta', 'alpha', 'alpha'],
    'Arrow/Home/End request the wrapped neighbour; the add tab wraps back to the first provider',
  )
  assert.equal(adds.length, 2, 'landing on the add tab requests the add panel')
})

test('the compat wall is the frozen 6 groups, 26 keys, collapsed by default', () => {
  const harness = createHarness()
  const renderPanel = () =>
    harness.render(
      harness.react.createElement(
        harness.panels.ProviderPanel,
        makeProps({ fields: harness.fields }),
      ),
    )
  const tree = renderPanel()

  // v8 R3: the compat groups use the same self-written head as the cards, so
  // DisclosureRow is no longer resolved anywhere on the page and the count
  // badge is gone.
  assert.equal(
    harness.primitiveCalls.filter((entry) => entry.name === 'DisclosureRow').length,
    0,
    'v8: the compat wall must not resolve DisclosureRow any more',
  )
  assert.equal(byClass(tree, 'piai-count').length, 0, 'v8: the head carries no count badge')

  const disclosures = byClass(tree, 'piai-disclosure')
  assert.equal(disclosures.length, 1, 'one piai-disclosure container')
  const heads = byClass(disclosures[0], 'piai-item-head')
  assert.equal(heads.length, 6, 'exactly the 6 frozen compat groups')
  assert.deepEqual(
    heads.map((head) => textOf(head)),
    COMPAT_SECTIONS.map((section) => section.title),
    'the head shows the section title and no count',
  )
  assert.equal(
    COMPAT_SECTIONS.reduce((total, section) => total + section.keys.length, 0),
    26,
  )

  // One NATIVE disclosure button per section, each pointing at its own body.
  const ids = byId(tree)
  const buttons = byRole(disclosures[0], 'button').filter(
    (node) => node.props['aria-expanded'] !== undefined,
  )
  assert.equal(buttons.length, 6, 'one disclosure button per frozen group')
  assert.equal(
    new Set(buttons.map((button) => button.props['aria-controls'])).size,
    6,
    'every section must point at a distinct body id',
  )
  for (const button of buttons) {
    assert.equal(button.type, 'button', 'v8: a native button, not a role=button div')
    assert.equal(button.props['aria-expanded'], false, 'collapsed by default')
    const body = ids.get(button.props['aria-controls'])
    assert.ok(
      body !== undefined,
      `aria-controls ${button.props['aria-controls']} must resolve to a permanent body`,
    )
    assert.ok(
      classesOf(body).includes('piai-disclosure-body'),
      'the controlled node is the disclosure body',
    )
    assert.equal(body.props.hidden, true, 'a collapsed body is hidden but stays in the DOM')
  }

  // Collapsed by default: no compat control is in the DOM until a group opens.
  assert.equal(byClass(tree, 'piai-fields').length, 2, 'only the two non-compat groups render fields')

  // The whole title is clickable (native button) and opens its own body.
  buttons[0].props.onClick()
  const expandedTree = renderPanel()
  const expandedButtons = byRole(expandedTree, 'button').filter(
    (node) => node.props['aria-expanded'] !== undefined,
  )
  assert.equal(expandedButtons[0].props['aria-expanded'], true, 'clicking opens the focused group')
  const expandedBody = byId(expandedTree).get(expandedButtons[0].props['aria-controls'])
  assert.equal(expandedBody.props.hidden, false, 'the opened body is no longer hidden')
  assert.equal(
    byClass(expandedTree, 'piai-fields').length,
    3,
    'the opened group mounts its own field block',
  )
})

test('a protocol-withheld compat key is marked but stays editable', () => {
  const harness = createHarness()
  const form = makeForm()
  const props = makeProps({ fields: harness.fields, form })
  const tree = harness.render(
    harness.react.createElement(harness.panels.ProviderPanel, props),
  )

  // Open the 工具调用 group (index 3), which holds supportsEagerToolInputStreaming.
  const rows = byRole(tree, 'button').filter((node) => node.props['aria-expanded'] !== undefined)
  rows[3].props.onClick()
  const opened = harness.render(
    harness.react.createElement(harness.panels.ProviderPanel, props),
  )

  const disposition = harness.fields.compatDisposition('openai-completions', 'supportsEagerToolInputStreaming')
  assert.notEqual(disposition, 'offer', 'the fixture protocol must not offer this key')
  const marked = byClass(opened, 'piai-row').filter(
    (row) => row.props['data-withheld'] === 'true',
  )
  assert.ok(marked.length > 0, 'a withheld key must be marked')
  assert.ok(
    byClass(opened, 'piai-row-label').some((label) => textOf(label).includes('该协议不支持')),
    'the mark must be a Tag with the frozen copy',
  )
  assert.ok(
    harness.primitiveCalls.some(
      (entry) => entry.name === 'Tag' && plainText(entry.props.children) === '该协议不支持',
    ),
  )

  // Marked, never disabled: the row's own control still accepts writes.
  for (const row of marked) {
    const controls = elements(row).filter(
      (node) => node.type === 'button' || node.type === 'input',
    )
    assert.ok(controls.length > 0)
    assert.ok(
      controls.every((control) => control.props.disabled !== true),
      'a withheld key must stay editable (the gate is advisory)',
    )
  }
  // T7: the withheld boolean is the shared three-way radiogroup, not a Switch.
  const boolRow = marked.find((row) => byRole(row, 'radiogroup').length > 0)
  assert.ok(boolRow !== undefined, 'the withheld boolean renders a radiogroup')
  const boolGroup = byRole(boolRow, 'radiogroup')[0]
  const on = elements(boolGroup).find(
    (node) => node.type === 'input' && node.props.value === 'true',
  )
  assert.ok(on !== undefined, 'the withheld boolean still offers 开启')
  assert.notEqual(on.props.disabled, true, 'a withheld key must stay editable')
  on.props.onChange()
  assert.ok(
    form.writes.some((entry) => entry.op === 'edit'),
    'the withheld boolean radiogroup must still write through the form',
  )
})

test('folding never changes writability and writes always go through the form', () => {
  const harness = createHarness()
  const form = makeForm()
  const props = makeProps({ fields: harness.fields, form })
  const renderPanel = () =>
    harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))

  renderPanel()

  // Open every compat group, re-rendering between state updates as React does.
  for (let index = 0; index < 6; index += 1) {
    const rows = byRole(renderPanel(), 'button').filter(
      (node) => node.props['aria-expanded'] !== undefined,
    )
    rows[index].props.onClick()
  }
  const opened = renderPanel()
  // T7: the compat booleans are radiogroups inside `.piai-bool`, not switches.
  const boolGroups = byClass(opened, 'piai-bool')
    .map((row) => byRole(row, 'radiogroup')[0])
    .filter((group) => group !== undefined)
  assert.ok(
    boolGroups.length >= 10,
    `expected the compat boolean radiogroups, got ${boolGroups.length}`,
  )
  for (const group of boolGroups) {
    const inputs = elements(group).filter((node) => node.type === 'input')
    assert.deepEqual(
      inputs.map((radio) => radio.props.value),
      ['true', 'false', '__unset__'],
      'every boolean row offers exactly 开启 / 关闭 / 默认（未设置）',
    )
    for (const radio of inputs) {
      assert.notEqual(radio.props.disabled, true, 'folding must not disable a control')
    }
  }

  // A write is `form.edit` for a set and `form.remove` for a clear — never null.
  // The radiogroup's id is the page-wide field id, so the expected host path is
  // derived from it instead of being pinned per key.
  const first = boolGroups[0]
  const expectedPath = String(first.props.id).replace(/^piai-field-/, '').split('-')
  const on = elements(first).find((node) => node.type === 'input' && node.props.value === 'true')
  on.props.onChange()
  const edited = form.writes.filter((entry) => entry.op === 'edit')
  assert.ok(edited.length > 0, 'the 开启 radio must write through form.edit')
  assert.deepEqual(
    edited[edited.length - 1],
    { op: 'edit', path: expectedPath, value: true },
    '开启 writes the literal true',
  )
  assert.ok(edited.every((entry) => entry.value !== null), 'a write is never null')

  form.writes.length = 0
  const unset = elements(first).find(
    (node) => node.type === 'input' && node.props.value === '__unset__',
  )
  unset.props.onChange()
  assert.deepEqual(
    form.writes,
    [{ op: 'remove', path: expectedPath }],
    '默认（未设置） clears the field with unset, never a null write',
  )
})

test('a forwardRef/memo primitive is adopted instead of the local stand-in', () => {
  // The shipped bundle exports Button/Input as forwardRef(...) and memo-wrapped
  // primitives — objects, not functions. A resolver that only accepts
  // `typeof === 'function'` silently renders the local stand-ins, which is the
  // "inputs and buttons have no style" defect (docs/verification.md §11).
  //
  // v8: DisclosureRow left the page, so the memo half is now a SYNTHETIC
  // resolver-shape test (memo around Tooltip) — it no longer claims the shipped
  // bundle wraps any primitive we use in memo; it proves the resolver still
  // accepts a memo object at all.
  const wrapped = createHarness({
    wrapPrimitives: { Button: 'forwardRef', Input: 'forwardRef', Tooltip: 'memo' },
  })
  const tree = wrapped.render(
    wrapped.react.createElement(
      wrapped.panels.ProviderPanel,
      makeProps({ fields: wrapped.fields }),
    ),
  )

  const names = new Set(wrapped.primitiveCalls.map((call) => call.name))
  for (const name of ['Input', 'Button', 'Tooltip']) {
    assert.ok(
      names.has(name),
      `${name} must be rendered through the wrapped (memo/forwardRef) primitive, not the stand-in`,
    )
  }
  // Every native TEXT input in the tree comes from the wrapped Input stub, so
  // the count must match: a bare fallback input would raise the total. Enum
  // radios (§15.5) are emitted by the panel itself, not by Input, so they are
  // excluded — otherwise this assertion would count them as fallback inputs.
  const inputCalls = wrapped.primitiveCalls.filter((call) => call.name === 'Input').length
  const nativeInputs = elements(tree).filter(
    (node) => node.type === 'input' && node.props.type !== 'radio',
  ).length
  assert.equal(inputCalls, nativeInputs, 'each rendered non-radio input must come from the primitive')
  assert.ok(nativeInputs > 0, 'the panel rendered no input at all')

  // Control: the same harness with plain function stubs renders them too, so the
  // assertion above fails only for a wrapper-rejecting resolver.
  const plain = createHarness()
  plain.render(
    plain.react.createElement(plain.panels.ProviderPanel, makeProps({ fields: plain.fields })),
  )
  const plainNames = new Set(plain.primitiveCalls.map((call) => call.name))
  for (const name of ['Input', 'Button', 'Tooltip']) {
    assert.ok(plainNames.has(name), `control: ${name} must be used with plain function stubs`)
  }
})

test('the credential row shows the reference read-only and stores the secret via the API', () => {
  const harness = createHarness()
  const calls = []
  const values = providerValues()
  values.apiKeyEnv = 'MY_PROVIDER_API_KEY'
  // The harness uses profile-relative leaf paths with a flat value object.
  const credentialLeaf = {
    path: ['apiKeyEnv'],
    kind: 'string',
    required: false,
    node: { meta: { role: 'credential-ref' } },
  }
  const props = makeProps({
    fields: harness.fields,
    values,
    groups: [{ id: 'identity', title: '基础信息', leaves: [credentialLeaf] }],
    extra: {
      options: {
        schema: undefined,
        fields: harness.fields,
        envelope: { uid: 1, refs: {} },
        values,
        credentials: {
          available: true,
          state: { MY_PROVIDER_API_KEY: { configured: true, source: 'file', writable: true } },
          error: undefined,
          set: (ref, secret) => {
            calls.push({ op: 'set', ref, secret })
            return Promise.resolve({ ok: true })
          },
          unset: (ref) => {
            calls.push({ op: 'unset', ref })
            return Promise.resolve({ ok: true })
          },
        },
      },
    },
  })
  let tree = harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))

  const readOnly = byClass(tree, 'piai-readonly')
  assert.equal(readOnly.length, 1, 'the reference must be rendered read-only')
  assert.equal(textOf(readOnly[0]), 'MY_PROVIDER_API_KEY')
  assert.ok(
    textOf(tree).includes('已配置（本地凭据）'),
    'the host-reported credential state must be shown',
  )
  const editableRef = elements(tree).find(
    (node) => node.type === 'input' && node.props.value === 'MY_PROVIDER_API_KEY',
  )
  assert.equal(editableRef, undefined, 'the reference must not be editable in place')

  const openButton = elements(tree).find(
    (node) => node.type === 'button' && node.props['aria-label'] === 'API Key 环境变量：更新密钥',
  )
  assert.ok(openButton !== undefined, 'a 更新密钥 affordance must exist')
  openButton.props.onClick()
  tree = harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))

  const secret = elements(tree).find((node) => node.type === 'input' && node.props.type === 'password')
  assert.ok(secret !== undefined, 'the secret editor must be a password input')
  assert.equal(typeof secret.props['aria-label'], 'string')
  secret.props.onChange({ target: { value: 'sk-secret' } })
  tree = harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))
  const save = elements(tree).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '保存到凭据',
  )
  assert.ok(save !== undefined)
  save.props.onClick()

  assert.deepEqual(calls, [{ op: 'set', ref: 'MY_PROVIDER_API_KEY', secret: 'sk-secret' }])
})

test('the credential row degrades to a hint when the host exposes no credential API', () => {
  const harness = createHarness()
  const values = providerValues()
  values.apiKeyEnv = 'MY_PROVIDER_API_KEY'
  // The harness uses profile-relative leaf paths with a flat value object.
  const credentialLeaf = {
    path: ['apiKeyEnv'],
    kind: 'string',
    required: false,
    node: { meta: { role: 'credential-ref' } },
  }
  const props = makeProps({
    fields: harness.fields,
    values,
    groups: [{ id: 'identity', title: '基础信息', leaves: [credentialLeaf] }],
  })
  const tree = harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))
  assert.equal(byClass(tree, 'piai-readonly').length, 1)
  assert.ok(
    textOf(tree).includes('当前宿主不支持凭据管理'),
    'a deployment without the credential remote must say so instead of throwing',
  )
})

test('a closed multi-select renders one checkbox per allowed value and clears with unset', () => {
  const harness = createHarness()
  const form = makeForm()
  const leaf = {
    path: ['providers', 'openai', 'defaultInput'],
    kind: 'array',
    enum: ['text', 'image'],
    required: false,
  }
  const values = { providers: { openai: { defaultInput: ['text'] } } }
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({
        fields: harness.fields,
        form,
        groups: [{ id: 'defaults', title: '默认值', leaves: [leaf] }],
        values,
        extra: {
          options: {
            schema: undefined,
            fields: harness.fields,
            envelope: { uid: 1, refs: {} },
            values,
          },
        },
      }),
    ),
  )

  const group = byClass(tree, 'piai-checks')
  assert.equal(group.length, 1, 'the closed set renders one checkbox group')
  assert.equal(group[0].props.role, 'group', 'the group carries an accessible name')
  assert.equal(typeof group[0].props['aria-label'], 'string')
  // Cheap residual-risk guard: every input inside `.piai-checks` really is a
  // checkbox — a text input caught by the group would be restyled (and
  // stretched) by the checkbox rules.
  const groupInputs = elements(group[0]).filter((node) => node.type === 'input')
  assert.ok(groupInputs.length > 0, 'the group renders its inputs')
  assert.ok(
    groupInputs.every((node) => node.props.type === 'checkbox'),
    `every .piai-checks input must be a checkbox: ${JSON.stringify(groupInputs.map((n) => n.props.type))}`,
  )

  const boxes = harness.primitiveCalls.filter((entry) => entry.name === 'Checkbox')
  assert.equal(boxes.length, 2, 'one checkbox per allowed value: the row shows what the model accepts')
  assert.deepEqual(
    boxes.map((entry) => entry.props.label),
    ['文本（text）', '图片（image）'],
    'each value is named in Chinese and keeps its YAML token',
  )
  assert.deepEqual(boxes.map((entry) => entry.props.checked), [true, false])

  boxes[1].props.onChange(true)
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'edit', path: ['providers', 'openai', 'defaultInput'], value: ['text', 'image'] }],
    'checking a value appends it',
  )

  form.writes.length = 0
  boxes[0].props.onChange(false)
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'remove', path: ['providers', 'openai', 'defaultInput'] }],
    'unchecking the last value clears the field with unset, never null',
  )
})

test('a free-scalar list still renders removable chips', () => {
  const harness = createHarness()
  const form = makeForm()
  const leaf = {
    path: ['providers', 'openai', 'retryPolicy', 'retryableCodes'],
    kind: 'array',
    required: false,
  }
  const values = {
    providers: { openai: { retryPolicy: { retryableCodes: [429, 503] } } },
  }
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({
        fields: harness.fields,
        form,
        groups: [{ id: 'retry', title: '重试', leaves: [leaf] }],
        values,
        extra: {
          options: {
            schema: undefined,
            fields: harness.fields,
            envelope: { uid: 1, refs: {} },
            values,
          },
        },
      }),
    ),
  )

  const chips = byClass(tree, 'piai-tag')
  assert.equal(chips.length, 2, 'one chip per entry')
  const remove = elements(tree).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '移除 429',
  )
  assert.ok(remove !== undefined, 'every chip needs a named remove control')
  remove.props.onClick()
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'edit', path: ['providers', 'openai', 'retryPolicy', 'retryableCodes'], value: [503] }],
    'removing one chip rewrites the remaining list',
  )
})

test('the inherit choice is the last radio of the enum group and clears with unset', () => {
  const harness = createHarness()
  const form = makeForm()
  const leaf = { path: ['providers', 'openai', 'api'], kind: 'enum', enum: ['a', 'b'], required: false }
  const values = { providers: { openai: { api: 'a' } } }
  const render = (current) =>
    harness.render(
      harness.react.createElement(
        harness.panels.ProviderPanel,
        makeProps({
          fields: harness.fields,
          form,
          groups: [{ id: 'identity', title: '基础信息', leaves: [leaf] }],
          values: current,
          extra: {
            options: {
              schema: undefined,
              fields: harness.fields,
              envelope: { uid: 1, refs: {} },
              values: current,
            },
          },
        }),
      ),
    )

  const tree = render(values)
  assert.equal(
    harness.primitiveCalls.filter((entry) => entry.name === 'SegmentedControl').length,
    0,
    'the enum track left the page in v7',
  )
  const group = byRole(tree, 'radiogroup')[0]
  assert.ok(group !== undefined, 'the enum is a radiogroup now')
  const radios = radiosOf(tree)
  assert.deepEqual(
    radios.map((radio) => radio.props.value),
    ['a', 'b', '__unset__'],
    'two values plus the default sentinel share one group',
  )
  const inherit = optionLabelOf(tree, radios[2])
  assert.equal(
    textOf(inherit),
    '默认（未设置）',
    'the default choice reads as the group’s last option',
  )
  assert.ok(
    String(inherit.props.title).includes('未设置'),
    'the full wording lives on the option title',
  )
  assert.deepEqual(selectedRadioOf(tree).map((radio) => radio.props.value), ['a'])
  radios[2].props.onChange()
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'remove', path: ['providers', 'openai', 'api'] }],
    'the default option clears the field with unset, never null',
  )

  // A value a hand-written config left outside the enum keeps its own option
  // instead of silently snapping the selection to the default.
  form.writes.length = 0
  const unusual = render({ providers: { openai: { api: 'zzz' } } })
  const unusualRadios = radiosOf(unusual)
  assert.equal(unusualRadios.length, 4)
  const unusualOption = radioByText(unusual, 'zzz')
  assert.ok(unusualOption !== undefined, 'the unrecognised value stays visible')
  assert.ok(textOf(optionLabelOf(unusual, unusualOption)).includes('未识别'), 'and is labelled')
  assert.deepEqual(selectedRadioOf(unusual).map((radio) => radio.props.value), ['zzz'])
})

test('picking a union branch writes what the branch is, never an empty object', () => {
  const harness = createHarness()
  const form = makeForm()
  const path = ['providers', 'openai', 'retryPolicy']
  const leaf = {
    path,
    kind: 'union',
    discriminator: 'mode',
    required: false,
    branches: [
      { value: 'normal', label: 'normal', kind: 'object', ref: 21 },
      { value: 'always', label: 'always', kind: 'object', ref: 22 },
    ],
  }
  const values = { providers: { openai: { retryPolicy: { mode: 'normal' } } } }
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({
        fields: harness.fields,
        form,
        groups: [{ id: 'retry', title: '重试', leaves: [leaf] }],
        values,
        extra: {
          options: {
            schema: { leaves: () => [] },
            fields: harness.fields,
            envelope: { uid: 1, refs: {} },
            values,
          },
        },
      }),
    ),
  )

  const selected = selectedRadioOf(tree)
  assert.equal(selected.length, 1, 'exactly one branch option is selected')
  assert.ok(
    textOf(optionLabelOf(tree, selected[0])).includes('normal'),
    'the stored discriminator picks the branch',
  )

  const always = radioByText(tree, 'always')
  assert.ok(always !== undefined, 'the other branch has an option')
  always.props.onChange()
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'edit', path, value: { mode: 'always' } }],
    'a discriminated branch writes { <key>: <value> }, never {}',
  )
})

test('an unset union and the tiers branch: false writes the literal, the table writes itself', () => {
  const harness = createHarness()
  const form = makeForm()
  const path = ['providers', 'openai', 'reasoningEfforts']
  const dictLeaf = { path, kind: 'dict', keyEnum: ['off', 'low', 'high'], required: false }
  const leaf = {
    path,
    kind: 'union',
    required: false,
    branches: [
      { value: false, label: 'false', kind: 'const', ref: 31 },
      { kind: 'dict', ref: 32 },
    ],
  }
  const values = { providers: { openai: {} } }
  const element = (current) =>
    harness.react.createElement(
      harness.panels.ProviderPanel,
      makeProps({
        fields: harness.fields,
        form,
        groups: [{ id: 'request', title: '请求构造', leaves: [leaf] }],
        values: current,
        extra: {
          options: {
            schema: { leaves: (envelope, ref) => (ref === 32 ? [dictLeaf] : []) },
            fields: harness.fields,
            envelope: { uid: 1, refs: {} },
            values: current,
          },
        },
      }),
    )

  const tree = harness.render(element(values))
  const selected = selectedRadioOf(tree)
  assert.equal(selected.length, 1)
  assert.ok(
    textOf(optionLabelOf(tree, selected[0])).includes('默认（未设置）'),
    'an unset union selects the default, not a branch',
  )
  assert.equal(byClass(tree, 'piai-tier').length, 0, 'no branch body renders before a branch is chosen')

  const falseOption = radioByText(tree, 'false')
  falseOption.props.onChange()
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'edit', path, value: false }],
    'the const branch writes its own literal',
  )

  form.writes.length = 0
  const tiersOption = () =>
    radioByText(harness.render(element(values)), '按档位表设置')
  tiersOption().props.onChange()
  assert.deepEqual(form.writes, [], 'selecting the tiers branch persists nothing yet')

  const table = harness.render(element(values))
  const rows = byClass(table, 'piai-tier')
  assert.equal(rows.length, 3, 'every declared tier renders, always')
  const inputs = elements(table).filter(
    (node) => node.type === 'input' && node.props.type !== 'radio',
  )
  assert.equal(inputs.length, 3, 'one input per tier')
  assert.equal(byClass(table, 'piai-dict-add').length, 0, 'no add/remove tier chrome')
  const buttons = elements(table).filter((node) => node.type === 'button')
  assert.equal(
    buttons.some((node) => /删除|null/.test(textOf(node))),
    false,
    'no per-tier delete or null toggle',
  )

  // Contract C: a tier row is an ordinary `Row` now — its label is the tier's
  // Chinese label, its hint is disclosed by exactly one `.piai-info` trigger in
  // the row head, the tier input is described by that trigger, and the bare key
  // chip the old table drew is gone.
  const ids = byId(table)
  for (const row of rows) {
    assert.equal(byClass(row, 'piai-info').length, 1, 'each tier row carries exactly one info trigger')
    assert.equal(byClass(row, 'piai-tier-key').length, 0, 'no bare key chip survives in a tier row')
    const input = elements(row).find((node) => node.type === 'input')
    const key = String(input.props.id).split('-').pop()
    assert.ok(
      ['off', 'low', 'high'].indexOf(key) !== -1,
      'the tier input id still ends with the tier key: ' + input.props.id,
    )
    const described = byClass(row, 'piai-row-control')[0].props['aria-describedby']
    assert.equal(described, input.props.id + '-info', 'the tier input points at its own hint trigger')
    assert.ok(ids.has(described), 'the tier hint id resolves to a rendered node')
    assert.ok(
      ids.get(described).props.className.split(' ').includes('piai-info'),
      'the described node is the tier info trigger',
    )
    assert.ok(
      String(ids.get(described).props['aria-label']).length > 0,
      'the tier trigger carries an accessible name',
    )
  }

  const low = inputs.find((node) => String(node.props.id).endsWith('-low'))
  assert.ok(low !== undefined, 'each tier input carries its own id')
  low.props.onChange({ target: { value: 'low' } })
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'edit', path, value: { low: 'low' } }],
    'typing a tier value writes the table',
  )

  form.writes.length = 0
  const filled = harness.render(element({ providers: { openai: { reasoningEfforts: { low: 'low' } } } }))
  const filledInputs = elements(filled).filter((node) => node.type === 'input')
  filledInputs
    .find((node) => String(node.props.id).endsWith('-low'))
    .props.onChange({ target: { value: '' } })
  assert.deepEqual(
    JSON.parse(JSON.stringify(form.writes)),
    [{ op: 'remove', path }],
    'clearing the last declared tier clears the field with unset, never null',
  )
})

test('the panels layer stays a pure browser script with the frozen component names', () => {
  // v10: the panels layer is the facade plus six modules; the purity rules must
  // hold for every one of them, or a module could quietly grow a `ctx` call.
  const PANELS_FILES = [
    'client.panels.js',
    'client.panels.kit.js',
    'client.panels.controls.js',
    'client.panels.collections.js',
    'client.panels.render.js',
    'client.panels.instances.js',
    'client.panels.catalog.js',
  ]
  const classes = new Set()
  for (const fileName of PANELS_FILES) {
    const raw = readFileSync(join(LIB, fileName), 'utf8')
    // Comments name the forbidden APIs too; only executable code is checked.
    const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.equal(/^\s*import\s/m.test(source), false, `no import statements in ${fileName}`)
    assert.equal(/^\s*export\s/m.test(source), false, `no export statements in ${fileName}`)
    assert.equal(source.includes('module.exports'), false, `no module.exports in ${fileName}`)
    assert.equal(source.includes('ctx.'), false, `${fileName} must not touch a cordis context`)
    assert.equal(source.includes('remote.'), false, `${fileName} must not call remote services`)
    for (const token of raw.match(/piai-[a-z0-9-]+/g) ?? []) classes.add(token)
  }
  assert.equal(classes.has('piai-tab'), false, 'piai-tab stays removed; piai-tabs is the strip container')
  assert.equal(
    [...classes].some((entry) => entry.startsWith('piai-tab-')),
    false,
    'no piai-tab-* variant may return',
  )

  const harness = createHarness()
  assert.deepEqual([...harness.sandbox.__dshLlmPiAiConfig.panels.componentNames], [
    'ProviderPanel',
    'ProviderTabs',
  ])
  for (const name of harness.sandbox.__dshLlmPiAiConfig.panels.componentNames) {
    assert.equal(typeof harness.panels[name], 'function', `${name} must be built`)
  }
  assert.equal(harness.registration.id, OWNER_ID)
  assert.equal(harness.registration.chunk, 'client.panels.js')
})
