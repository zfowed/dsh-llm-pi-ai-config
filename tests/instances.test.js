/**
 * Instance-container tests for `lib/client.panels.js`.
 *
 * Why this file exists
 * --------------------
 * `models[]` and `modelOverrides` are instance containers: the schema walker
 * keeps them path-transparent and tags their member leaves with
 * `leaf.container = {kind, path}` (`lib/client.schema.js`). The panels must turn
 * that into a REAL instance path — `providers.alpha.models.0.id` — because the
 * host's `applyPathOp` rejects a member path with no index
 * (`Config array index "id" is out of range`, reproduced against the shipped
 * `@deepseek-ai/dsh-settings` bytes by `tests/verify.integration.mjs`).
 *
 * So this harness renders the REAL panels chunk over the AUTHORITATIVE schema
 * fixture and asserts the exact path of every write a card emits: per-model
 * cards, per-override cards, add/remove on both. A regression here is invisible
 * to unit tests that only look at grouping.
 *
 * Run: node --test tests/instances.test.js
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, '..', 'lib')
const FIXTURE = join(HERE, 'fixtures', 'llm-pi-ai.schema.json')

/**
 * Build the sandbox: mini React, pass-through primitive stand-ins (so tab and
 * disclosure props survive into the tree), the real fields/panels chunks.
 */
function createHarness() {
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
          onClick: props.onClick,
        },
        props.children,
      )
    },
    Input(props) {
      record('Input', props)
      // The shipped `Input` is a wrapper `<span>` around a native `<input>`, and
      // its attributes pass through (see the a11y harness header). The
      // `aria-describedby` / `aria-invalid` pair is how the Row wires a field to
      // its `piai-info` trigger, so the stand-in must forward it too — otherwise
      // the audit can only ever see the attribute on the wrapper.
      return react.createElement(
        'span',
        { className: props.className },
        react.createElement('input', {
          id: props.id,
          type: props.type,
          value: props.value,
          placeholder: props.placeholder,
          title: props.title,
          'aria-label': props['aria-label'],
          'aria-describedby': props['aria-describedby'],
          'aria-invalid': props['aria-invalid'],
          disabled: props.disabled,
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
        'aria-checked': props.checked === true,
        'aria-label': props.label,
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
              tabIndex: option.value === props.value ? 0 : -1,
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
        props.open === true ? react.createElement('span', { key: 'list', role: 'menu' }, props.children) : null,
      ])
    },
    MenuItemButton(props) {
      record('MenuItemButton', props)
      return react.createElement('button', { type: 'button', role: 'menuitem', onClick: props.onSelect }, props.children)
    },
    Tooltip(props) {
      record('Tooltip', props)
      return props.children
    },
    Tag(props) {
      record('Tag', props)
      return react.createElement('span', { className: props.className }, props.children)
    },
    Pill(props) {
      record('Pill', props)
      return react.createElement(
        'button',
        {
          type: 'button',
          id: props.id,
          role: props.role,
          className: props.className,
          'aria-selected': props['aria-selected'],
          tabIndex: props.tabIndex,
          'aria-label': props['aria-label'],
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

  // Present the two primitives the shipped bundle exports as wrappers:
  // `Button`/`Input` are `forwardRef(...)`. `DisclosureRow` is not stubbed at
  // all any more (v8): the page writes its own disclosure head, so a stub could
  // only hide a regression that re-introduced the primitive.
  for (const [name, kind] of [
    ['Button', 'forwardRef'],
    ['Input', 'forwardRef'],
  ]) {
    const render = primitives[name]
    primitives[name] =
      kind === 'forwardRef'
        ? { $$typeof: Symbol.for('react.forward_ref'), render }
        : { $$typeof: Symbol.for('react.memo'), type: render }
  }

  const seeds = { react, '@deepseek-ai/dsh-client-ui-primitives': primitives }
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`instances test: unexpected seed-word require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    throw new Error(`instances test: no chunk may be fetched on this path (${specifier})`)
  }

  const load = (fileName) => {
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, { filename: join(LIB, fileName) })
    assert.equal(registrations.length, before + 1, `${fileName} must register exactly once`)
    return registrations[registrations.length - 1]
  }

  load('client.core.js').factory(requireStub)
  const schema = load('client.schema.js').factory(requireStub)
  load('client.fields.groups.js').factory(requireStub)
  load('client.fields.hints.js').factory(requireStub)
  const fields = load('client.fields.js').factory(requireStub)
  // v10: the panels facade composes the six panels modules out of the
  // registry, so they are materialised first (the owner's phase order).
  load('client.panels.kit.js').factory(requireStub)
  load('client.panels.controls.js').factory(requireStub)
  load('client.panels.collections.js').factory(requireStub)
  load('client.panels.render.js').factory(requireStub)
  load('client.panels.instances.js').factory(requireStub)
  load('client.panels.catalog.js').factory(requireStub)
  const panels = load('client.panels.js').factory(requireStub)

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
    if (Array.isArray(node)) return node.map(renderNode).filter((entry) => entry !== null)
    if (typeof node !== 'object') return { type: '#text', props: {}, children: [], text: String(node) }
    const type = unwrapComponentType(node.type)
    if (typeof type === 'function') {
      if (type.prototype && type.prototype.isReactComponent) return renderNode(node.children)
      const ordinal = counters.get(type) || 0
      counters.set(type, ordinal + 1)
      const key = node.props && node.props.key !== undefined ? String(node.props.key) : '#' + ordinal
      const cell = cellFor(key + '::' + (type.name || 'anonymous'))
      const previous = current
      current = cell
      cell.cursor = 0
      let output
      try {
        output = type(Object.assign({}, node.props, { children: node.children }), null)
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

  return {
    react,
    render,
    schema,
    fields,
    panels,
    primitiveCalls,
    envelope: JSON.parse(readFileSync(FIXTURE, 'utf8')),
  }
}

/**
 * Unwrap a React component type like the renderer does: the shipped primitives
 * may be exported as wrappers (`Button`/`Input` as `forwardRef(...)`, others as
 * `memo(...)`), so the stand-in renderer must accept those wrappers as well.
 */
function unwrapComponentType(type) {
  if (type === null || typeof type !== 'object') return type
  if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return type
  const tag = type.$$typeof
  if (tag === Symbol.for('react.memo')) return unwrapComponentType(type.type)
  if (tag === Symbol.for('react.forward_ref')) return type.render
  return type
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

/** Every element carrying `name` as one of its classes. */
function byClass(tree, name) {
  return elements(tree).filter((node) =>
    String(node.props.className || '')
      .split(/\s+/)
      .filter(Boolean)
      .includes(name),
  )
}

/**
 * The self-written head of an instance card (v7 §15.4) with its two actions.
 *
 * @returns `{head, toggle, remove}`; `toggle` is the native disclosure button
 *   (`aria-expanded` / `aria-controls`) and `remove` the permanent icon button.
 */
function cardHeadOf(node) {
  const head = byClass(node, 'piai-item-head')[0]
  assert.ok(head !== undefined, 'an instance card must carry a self-written head')
  const toggle = elements(head).find(
    (element) => element.type === 'button' && element.props['aria-expanded'] !== undefined,
  )
  const remove = elements(head).find(
    (element) =>
      element.type === 'button' &&
      String(element.props.className || '').split(/\s+/).includes('piai-item-remove'),
  )
  assert.ok(toggle !== undefined, 'the head must carry a disclosure button')
  assert.ok(remove !== undefined, 'the head must carry a permanent remove button')
  return { head, toggle, remove }
}

/** The card whose head text matches `title`. */
function cardByTitle(tree, title) {
  return byClass(tree, 'piai-array-row')
    .concat(byClass(tree, 'piai-dict-row'))
    .find((card) => plainText(cardHeadOf(card).head) === title)
}

/** The body block a card head controls, by its `aria-controls` id. */
function bodyOf(tree, toggle) {
  return elements(tree).find((node) => node.props.id === toggle.props['aria-controls'])
}

/** The concatenated text of a subtree, including not-yet-rendered children. */
function plainText(node) {
  if (node === null || node === undefined) return ''
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (typeof node !== 'object') return String(node)
  if (node.type === '#text') return String(node.text === undefined ? '' : node.text)
  return plainText(node.children)
}

/**
 * A cross-realm-safe copy of a recorded call.
 *
 * The panels run inside a `node:vm` sandbox, so their arrays and objects carry
 * the sandbox prototype and fail a strict deep comparison against host-realm
 * literals even when the structure is identical.
 */
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

/** A staged-form stand-in that records every write request. */
function makeForm() {
  const writes = []
  return {
    writes,
    ops: [],
    invalid: false,
    edit: (path, value) => writes.push({ op: 'edit', path, value }),
    remove: (path) => writes.push({ op: 'remove', path }),
    reset: (path) => writes.push({ op: 'reset', path }),
  }
}

/** The provider profile the test page edits. */
function providerValues() {
  return {
    providers: {
      alpha: {
        displayName: 'Deepseek 月卡',
        api: 'openai-completions',
        models: [
          { id: 'deepseek-v4-flash', name: 'Deepseek 快闪', input: ['text'] },
          { id: 'deepseek-v4-pro', input: ['text', 'image'] },
        ],
        modelOverrides: {
          'gpt-x': { contextWindow: 200000 },
        },
      },
    },
  }
}

/** Render the real `ProviderPanel` for one provider over the real fixture. */
function renderPanel(harness, form, values) {
  const envelope = harness.envelope
  const root = harness.schema.node(envelope, envelope.uid)
  const providers = harness.schema.node(envelope, root.dict.providers)
  const providerRef = providers.inner
  const leaves = harness.schema.leaves(envelope, providerRef, ['providers', 'alpha'])
  const groups = harness.fields.groupLeaves(leaves)
  const props = {
    form,
    schema: harness.schema,
    fields: harness.fields,
    envelope,
    values,
    provider: 'alpha',
    providerNames: ['alpha'],
    groups,
    options: { schema: harness.schema, fields: harness.fields, envelope, values },
    locale: 'dsh-llm-pi-ai-config',
    onSelect() {},
    onAdd() {},
    onRemove() {},
  }
  const tree = harness.render(harness.react.createElement(harness.panels.ProviderPanel, props))
  return { tree, render: () => harness.render(harness.react.createElement(harness.panels.ProviderPanel, props)) }
}

test('models[] renders one collapsible card per model, collapsed, titled by name → id → #n', () => {
  const harness = createHarness()
  const form = makeForm()
  const { tree } = renderPanel(harness, form, providerValues())

  const cards = byClass(tree, 'piai-array-row')
  assert.equal(cards.length, 2, 'one card per configured model')
  // §15.4: the card head is the self-written `.piai-item-head` — exactly one per
  // card, and nothing else in the card carries disclosure semantics. (Whether
  // DisclosureRow is resolved at all is asserted in a11y/polish; it is no longer
  // stubbed in this harness, so a per-card call check here would be vacuous.)
  assert.equal(
    cards.reduce((total, card) => total + byClass(card, 'piai-item-head').length, 0),
    cards.length,
    'each card carries exactly one self-written head',
  )

  const heads = cards.map((card) => cardHeadOf(card).head)
  assert.equal(heads.length, 2, 'each card carries exactly one head')
  // The first model has a `name`, so the ranked candidate wins; the second has
  // none, so the title falls back to the schema-derived required string leaf.
  assert.deepEqual(
    heads.map(plainText),
    ['#1 Deepseek 快闪', '#2 deepseek-v4-pro'],
    'the display name outranks the id; the id is the fallback (never a hardcoded field name)',
  )

  for (const card of cards) {
    const { head, toggle, remove } = cardHeadOf(card)
    assert.equal(toggle.type, 'button')
    assert.equal(toggle.props['aria-expanded'], false, 'cards start collapsed')
    assert.equal(typeof toggle.props['aria-controls'], 'string')
    const body = bodyOf(tree, toggle)
    assert.ok(body !== undefined, 'aria-controls must resolve to the body block')
    assert.equal(body.props.hidden, true, 'a collapsed body is hidden')
    assert.equal(
      byClass(body, 'piai-row').length,
      0,
      'a collapsed body renders no field rows',
    )
    assert.ok(
      String(remove.props['aria-label']).startsWith('删除模型 '),
      'the remove button is localized by name',
    )
    assert.equal(typeof remove.props.title, 'string', 'the icon button keeps a title too')
    assert.equal(
      elements(head).filter((node) => node.props.className === 'piai-item-actions').length,
      1,
      'the remove button lives in the action slot',
    )
  }
  assert.equal(byClass(tree, 'piai-expr').length, 0)
})

test('a model card keeps its curated Chinese labels and hints after instance rebasing', () => {
  // Re-basing a model leaf onto `providers.p.models.0.<field>` must not lose the
  // presentation entry: the FIELDS table is keyed without the instance segment,
  // so the leaf carries the pre-rebase path for label/hint/unit lookups. Without
  // it every model field degrades to a humanized English title and loses its
  // hint (docs/verification.md §12).
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  const card = cardByTitle(panel.tree, '#1 Deepseek 快闪')
  assert.ok(card, 'the first model card must exist')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  const labels = byClass(tree, 'piai-row-label').map(plainText)
  for (const expected of ['模型 ID', '显示名称', '输入模态', '推理强度']) {
    assert.ok(
      labels.some((label) => label.startsWith(expected)),
      `the card must show the curated label ${expected}; got ${JSON.stringify(labels)}`,
    )
  }
  assert.equal(
    labels.some((label) => label.startsWith('Input')),
    false,
    'the humanized fallback label must not appear inside a model card',
  )

  // v7 §15.3: the field hint moved from an inline `.piai-hint` into the info
  // trigger's accessible name (and its Tooltip bubble).
  const infos = byClass(tree, 'piai-info').map((node) => String(node.props['aria-label'] || ''))
  assert.ok(
    infos.some((label) => label.includes('勾选该模型能接受的输入类型')),
    `the curated hint must stay reachable; got ${JSON.stringify(infos)}`,
  )
  assert.equal(
    byClass(tree, 'piai-hint').some((node) =>
      plainText(node).includes('勾选该模型能接受的输入类型'),
    ),
    false,
    'the field hint is disclosed by the trigger, never inlined in the row',
  )
})

test('modelOverrides renders one collapsible card per key, titled by the key', () => {
  const harness = createHarness()
  const form = makeForm()
  const { tree } = renderPanel(harness, form, providerValues())

  const cards = byClass(tree, 'piai-dict-row')
  assert.equal(cards.length, 1)
  assert.equal(
    byClass(cards[0], 'piai-item-head').length,
    1,
    'the override card writes its own single head too',
  )
  const { head, toggle, remove } = cardHeadOf(cards[0])
  // §15.4: the dict key titles the card; the titleRank candidates are not used.
  assert.equal(plainText(head), 'gpt-x')
  assert.equal(toggle.props['aria-expanded'], false)
  assert.equal(bodyOf(tree, toggle).props.hidden, true)
  assert.equal(remove.props['aria-label'], '删除模型 gpt-x')
})

test('editing a model field emits an index-bearing host path', () => {
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  // Open the second model card.
  const card = cardByTitle(panel.tree, '#2 deepseek-v4-pro')
  assert.ok(card, 'the second model card must exist')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  const input = elements(tree).find(
    (node) => node.type === 'input' && node.props.id === 'piai-field-providers-alpha-models-1-id',
  )
  assert.ok(input, 'the opened card exposes its model id control at the instance path')
  assert.equal(input.props.value, 'deepseek-v4-pro', 'the card reads the real instance value')

  input.props.onChange({ target: { value: 'deepseek-v4-pro-2' } })
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'models', 1, 'id'], value: 'deepseek-v4-pro-2' },
  ])
})

test('a model card renders the checkbox group and the tiers table at the instance path', () => {
  const harness = createHarness()
  const form = makeForm()
  const values = providerValues()
  values.providers.alpha.models[0].reasoningEfforts = { low: 'low' }
  const panel = renderPanel(harness, form, values)

  const card = cardByTitle(panel.tree, '#1 Deepseek 快闪')
  assert.ok(card, 'the first model card must exist')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  // `input` is a closed set: one checkbox per allowed value, curated labels kept.
  // Scope to THIS card's group — the provider-level `defaultInput` renders the
  // same two values.
  const group = byClass(tree, 'piai-checks').find((node) =>
    String(node.props.id).endsWith('models-0-input'),
  )
  assert.ok(group !== undefined, 'the model card owns its own checkbox group')
  const boxes = elements(group).filter((node) => node.type === 'input' && node.props.type === 'checkbox')
  assert.equal(boxes.length, 2, 'text and image render as checkboxes inside the model card')
  assert.deepEqual(
    elements(group)
      .filter((node) => node.type === 'label')
      .map(plainText),
    ['文本（text）', '图片（image）'],
  )
  assert.deepEqual(boxes.map((node) => node.props.checked), [true, false])
  boxes[1].props.onChange({ target: { checked: true } })
  assert.deepEqual(plain(form.writes), [
    {
      op: 'edit',
      path: ['providers', 'alpha', 'models', 0, 'input'],
      value: ['text', 'image'],
    },
  ])

  // `reasoningEfforts` is a tiers table at the same instance path: every declared
  // tier renders with its own input, and the stored value is read from the instance.
  form.writes.length = 0
  const tiers = byClass(tree, 'piai-tier')
  assert.equal(tiers.length, 7, 'all seven adapter tiers render')
  // T7 (contract C): each tier is an ordinary Row — its hint is disclosed by one
  // `.piai-info` trigger, the tier input points at that trigger, the input id
  // still ends with the tier key, and the old bare key chip is gone.
  const ids = new Map(
    elements(tree)
      .filter((node) => typeof node.props.id === 'string')
      .map((node) => [node.props.id, node]),
  )
  for (const row of tiers) {
    assert.equal(byClass(row, 'piai-info').length, 1, 'each tier row carries exactly one info trigger')
    assert.equal(byClass(row, 'piai-tier-key').length, 0, 'no bare key chip in a tier row')
    const input = elements(row).find((node) => node.type === 'input')
    const key = String(input.props.id).split('-').pop()
    assert.ok(
      ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'].indexOf(key) !== -1,
      'the tier input id ends with the tier key: ' + input.props.id,
    )
    const described = input.props['aria-describedby']
    assert.equal(described, input.props.id + '-info', 'the tier input points at its own hint trigger')
    assert.ok(ids.has(described), 'the tier hint id resolves to a rendered node')
    assert.ok(
      ids.get(described).props.className.split(' ').includes('piai-info'),
      'the described node is the tier info trigger',
    )
  }
  const inputs = elements(tree).filter(
    (node) => node.type === 'input' && typeof node.props.id === 'string' && node.props.id.endsWith('-reasoningEfforts-high'),
  )
  assert.equal(inputs.length, 1, 'each tier input is addressed by its instance path and tier')
  inputs[0].props.onChange({ target: { value: 'high' } })
  assert.deepEqual(plain(form.writes), [
    {
      op: 'edit',
      path: ['providers', 'alpha', 'models', 0, 'reasoningEfforts'],
      value: { low: 'low', high: 'high' },
    },
  ])
})

test('paired short fields share one two-column grid; everything else stays full width', () => {
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  const card = cardByTitle(panel.tree, '#1 Deepseek 快闪')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  // The shipped Models page puts a model's id beside its name, and 上下文窗口
  // beside 最大输出 token 数, in a two-column grid (`_modelAdvanced`). Which
  // fields belong together is presentation, so it comes from `fields.pair`.
  const grids = byClass(tree, 'piai-row-pair')
  assert.ok(grids.length >= 2, `the model card pairs its short fields; got ${grids.length}`)
  const rowsIn = (grid) =>
    byClass(grid, 'piai-row').map((row) => plainText(byClass(row, 'piai-row-label')[0]))
  assert.ok(
    grids.some((grid) => {
      const labels = rowsIn(grid)
      return labels.length === 2 && labels[0].startsWith('模型 ID') && labels[1].startsWith('显示名称')
    }),
    'id and name share one grid',
  )
  assert.ok(
    grids.some((grid) => {
      const labels = rowsIn(grid)
      return (
        labels.length === 2 &&
        labels[0].startsWith('上下文窗口') &&
        labels[1].startsWith('最大输出 Token')
      )
    }),
    'the two token limits share one grid',
  )
  assert.ok(
    grids.every((grid) => byClass(grid, 'piai-row').length >= 2),
    'a pair id present on only one field renders an ordinary row, never a one-cell grid',
  )
  assert.equal(
    grids.some((grid) => byClass(grid, 'piai-checks').length > 0 || byClass(grid, 'piai-tier').length > 0),
    false,
    'the checkbox group and the tiers table span the full row, not half a grid',
  )
})

test('editing an override field emits an instance-keyed host path', () => {
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  const card = cardByTitle(panel.tree, 'gpt-x')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  const input = elements(tree).find(
    (node) => node.type === 'input' && node.props.id === 'piai-field-providers-alpha-modelOverrides-gpt-x-name',
  )
  assert.ok(input, 'the opened override card exposes its name control')
  input.props.onChange({ target: { value: 'GPT X' } })
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'modelOverrides', 'gpt-x', 'name'], value: 'GPT X' },
  ])
})

test('adding and removing a model address the array by index', () => {
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  const add = elements(panel.tree).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '添加一项',
  )
  assert.ok(add, 'an append affordance exists')
  add.props.onClick()
  assert.deepEqual(plain(form.writes), [{ op: 'edit', path: ['providers', 'alpha', 'models', 2], value: {} }])

  // §15.4: the remove control is permanent in the card head, so a COLLAPSED
  // card can be deleted without opening it first.
  form.writes.length = 0
  const card = cardByTitle(panel.tree, '#2 deepseek-v4-pro')
  assert.ok(card, 'the second model card must exist')
  const { toggle, remove } = cardHeadOf(card)
  assert.equal(toggle.props['aria-expanded'], false, 'the card stays collapsed')
  assert.equal(bodyOf(panel.tree, toggle).props.hidden, true)
  assert.equal(remove.props['aria-label'], '删除模型 deepseek-v4-pro')

  remove.props.onClick()
  let armed = panel.render()
  assert.deepEqual(form.writes, [], 'the first click only arms the delete')
  const group = elements(armed).find((node) => node.props.role === 'group')
  assert.ok(group !== undefined, 'the armed delete is a confirmation group')
  assert.ok(
    plainText(elements(armed).find((node) => node.props.role === 'alert')).includes('deepseek-v4-pro'),
    'the armed state names the model it would delete',
  )

  // Escape cancels the confirmation.
  group.props.onKeyDown({ key: 'Escape' })
  const cancelled = panel.render()
  assert.deepEqual(form.writes, [], 'Escape must not delete')
  assert.ok(
    elements(cancelled).some(
      (node) => node.type === 'button' && String(node.props['aria-label'] || '').startsWith('删除模型 '),
    ),
    'Escape restores the unarmed remove button',
  )

  // Arm again, then confirm: the write still splices by the same index.
  const rearmedCard = cardByTitle(cancelled, '#2 deepseek-v4-pro')
  assert.ok(rearmedCard, 'the card survives the cancelled confirmation')
  cardHeadOf(rearmedCard).remove.props.onClick()
  armed = panel.render()
  const confirm = elements(armed).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '确认删除',
  )
  assert.ok(confirm, 'the second step is a confirm button')
  confirm.props.onClick()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'models', 1] }])
})

test('adding and removing an override key address the map by key', () => {
  const harness = createHarness()
  const form = makeForm()
  const panel = renderPanel(harness, form, providerValues())

  const card = cardByTitle(panel.tree, 'gpt-x')
  cardHeadOf(card).toggle.props.onClick()
  const tree = panel.render()

  // §15.4: the delete is permanent in the head and keeps its two-step
  // confirmation, even though the card is open here.
  const remove = cardHeadOf(cardByTitle(tree, 'gpt-x')).remove
  assert.ok(remove, 'the override card has a delete control (two-step confirmation)')
  assert.equal(remove.props['aria-label'], '删除模型 gpt-x')
  remove.props.onClick()
  const armed = panel.render()
  const confirm = elements(armed).find(
    (node) => node.type === 'button' && node.props['aria-label'] === '确认删除',
  )
  assert.ok(confirm, 'the delete is armed, not performed')
  confirm.props.onClick()
  assert.deepEqual(plain(form.writes), [
    { op: 'remove', path: ['providers', 'alpha', 'modelOverrides', 'gpt-x'] },
  ])

  form.writes.length = 0
  const addInput = elements(armed).find(
    (node) => node.type === 'input' && node.props.id === 'piai-field-providers-alpha-modelOverrides-add',
  )
  assert.ok(addInput, 'the add-key input exists')
  addInput.props.onChange({ target: { value: 'pro' } })
  const afterTyping = panel.render()
  const add = elements(afterTyping).find(
    (node) => node.type === 'button' && node.props.id === 'piai-field-providers-alpha-modelOverrides-add-go',
  )
  assert.ok(add, 'the add-key control belongs to this container')
  add.props.onClick()
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'modelOverrides', 'pro'], value: {} },
  ])
})

test('an empty models array still offers the append affordance and no cards', () => {
  const harness = createHarness()
  const form = makeForm()
  const values = providerValues()
  values.providers.alpha.models = []
  delete values.providers.alpha.modelOverrides

  const { tree } = renderPanel(harness, form, values)

  assert.equal(byClass(tree, 'piai-array-row').length, 0)
  assert.equal(byClass(tree, 'piai-dict-row').length, 0)
  const add = elements(tree).find((node) => node.type === 'button' && node.props['aria-label'] === '添加一项')
  assert.ok(add, 'the empty list is still appendable')
  add.props.onClick()
  assert.deepEqual(plain(form.writes), [{ op: 'edit', path: ['providers', 'alpha', 'models', 0], value: {} }])
})

test('an expression value in a container stays read-only and writes nothing', () => {
  const harness = createHarness()
  const form = makeForm()
  const values = providerValues()
  values.providers.alpha.models = { __jsExpr: 'jsArray("MODELS")' }

  const { tree } = renderPanel(harness, form, values)

  assert.equal(byClass(tree, 'piai-array-row').length, 0)
  const rendered = byClass(tree, 'piai-expr')
  assert.equal(rendered.length, 1, 'the expression is shown read-only')
  assert.match(plainText(rendered[0]), /jsArray\("MODELS"\)/)
  assert.deepEqual(plain(form.writes), [], 'no write may be offered for an unevaluated expression')
})
