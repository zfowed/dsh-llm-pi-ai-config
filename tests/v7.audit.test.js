/**
 * T6 — adversarial v7 audit (independent recomputation, not a restatement).
 *
 * This file is owned by `verifier-2`. It never edits `lib/`: it re-derives the
 * v7 contract (docs/interaction-design.md §15) from the shipped bytes plus the
 * official bundle extraction in /tmp/asarx, and turns every machine-checkable
 * clause into an assertion.
 *
 * Reproduce:
 *
 *   node --test tests/v7.audit.test.js
 *
 * Sections map 1:1 to the T6 checklist:
 *   1. R4 enum single-select semantics, four call sites            (tests 1–8)
 *   2. R3 instance cards, titleRank, delete affordance             (tests 9–12)
 *   3. R2 field rows, Tooltip bubble, aria-describedby, errors     (tests 13–16)
 *   4. R1 tabs CSS/semantics/keyboard/empty-list/bar delete        (tests 17–21)
 *   5. invariants: classes, tokens, focus whitelist, writes, inject(tests 22–27)
 *   6. upstream primitive signatures                               (tests 28–29)
 *
 * Every helper here is written from scratch; the panel/page harness mirrors the
 * two behaviours the shipped code depends on (forwardRef/memo wrappers and the
 * selector-shaped page hook).
 *
 * ---------------------------------------------------------------------------
 * Known deviations / open notes handed to T7 (task-8) — recomputed by T6/T6c
 * ---------------------------------------------------------------------------
 * OBS-4. `docs/interaction-design.md` §15.3.6 says “错误节点仍走
 *   aria-describedby”, but neither the v7 code nor the v6 baseline has any
 *   per-field error node: errors are `aria-invalid` on the control plus the
 *   owner's page-level `.piai-notices > [role="alert"]` (verbatim adapter text).
 *   The spec sentence should be reworded to match the implementation.
 * OBS-5. `lib/client.styles.js` `[role="tab"]` declares `min-width: 0;
 *   max-width: 100%`, which E1 does not; `background: none` stands in for the
 *   official `background: 0 0`; and the E1 focus ring intentionally drops the
 *   official `, var(--dsw-alias-state-business-primary)` fallback because that
 *   token is outside our 23-token allowlist (§15.9 D3 / v5). All three are
 *   documented as intentional, not regressions.
 * OBS-8. R5 §15.6.4 spells the no-wrap rule as `.piai-checks label
 *   { white-space: nowrap }`; the implementation applies it to
 *   `.piai-checks > label > span` (the primitives' own `label > input > span`
 *   shape). Behaviourally equivalent, but the spec text and the selector differ.
 *   v8 起改为：the span keeps ONLY `white-space: nowrap` — the v7
 *   `min-width: 0; overflow: hidden; text-overflow: ellipsis` trio is gone,
 *   because it resolved to ZERO width once the row-control input rule stretched
 *   the checkbox (a real-browser-only defect). The box is now pinned by
 *   `.piai-checks > label > input { flex: none; 16px }` and the text-input rule
 *   carries `:not([type="checkbox"]):not([type="radio"])` (three-layer defence).
 * OBS-9 (v8). `DisclosureRow` is retired from the page: the compat sections and
 *   the instance cards share the self-written `.piai-item-head` +
 *   `.piai-disclosure-body[hidden]`. So `.piai-item-head` is a SHARED class and
 *   assertions about instance titles must be scoped to `.piai-array-row` /
 *   `.piai-dict-row`; the old `div[role=button]` disclosure shape is gone.
 * FINDING-3 (accepted, NOT fixed). Inactive tabs (`aria-controls`) reference a
 *   panel that is not in the DOM. The official plugins page keeps every visited
 *   panel with `hidden`; this page renders only the active face (the v6
 *   single-face design). Recorded as an accepted deviation with a `todo` guard
 *   below — it is a deliberate design trade-off, not a release blocker.
 * ---------------------------------------------------------------------------
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import { jsClassSources } from './helpers/class-sources.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib')
const FIXTURE = join(HERE, 'fixtures', 'llm-pi-ai.schema.json')

const read = (relative) => readFileSync(join(ROOT, relative), 'utf8')

// ---------------------------------------------------------------------------
// tree helpers (cross-realm safe: the panels run inside a vm sandbox)
// ---------------------------------------------------------------------------

function elements(tree) {
  const out = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object') return
    if (node.type === undefined) return
    out.push(node)
    walk(node.children)
  }
  walk(tree)
  return out
}

function byClass(tree, name) {
  return elements(tree).filter((node) =>
    String(node.props && node.props.className ? node.props.className : '')
      .split(/\s+/)
      .filter(Boolean)
      .includes(name),
  )
}

function byRole(tree, role) {
  return elements(tree).filter((node) => node.props && node.props.role === role)
}

function byAttr(tree, name, value) {
  return elements(tree).filter((node) => node.props && node.props[name] === value)
}

function plainText(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(plainText).join('')
  if (typeof node !== 'object') return String(node)
  if (node.type === '#text') return String(node.text === undefined ? '' : node.text)
  return plainText(node.children)
}

/** Cross-realm-safe copy for strict deep comparison. */
function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// harness: one sandbox holding react + faithful primitive stand-ins + the real
// schema/fields/panels/styles/owner chunks
// ---------------------------------------------------------------------------

function createHarness() {
  const registrations = []
  const primitiveCalls = []
  const portalBubbles = []
  const cellsByType = new Map()
  const counters = new Map()
  const pendingEffects = []
  let current = null
  let bubbleSeq = 0

  function cellFor(type, key) {
    let byKey = cellsByType.get(type)
    if (byKey === undefined) {
      byKey = new Map()
      cellsByType.set(type, byKey)
    }
    let cell = byKey.get(key)
    if (cell === undefined) {
      cell = { hooks: [], cursor: 0 }
      byKey.set(key, cell)
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
    lazy: () => function LazyStub() {
      return null
    },
    Suspense: (props) => props.children,
    memo: (type) => type,
    forwardRef: (render) => ({ $$typeof: Symbol.for('react.forward_ref'), render }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
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

  const record = (name, props) => primitiveCalls.push({ name, props })

  // -------------------------------------------------------------------------
  // Primitive stand-ins. Their prop lists mirror the SHIPPED signatures exactly
  // (/tmp/asarx/primitives.index.js): Button/Input spread `...rest`, Checkbox /
  // Switch / Tag / icons destructure a closed set and DROP everything else.
  // -------------------------------------------------------------------------
  const primitives = {
    Button(props) {
      record('Button', props)
      return react.createElement(
        'button',
        {
          type: 'button',
          className: props.className,
          id: props.id,
          role: props.role,
          'aria-label': props['aria-label'],
          'aria-describedby': props['aria-describedby'],
          disabled: props.disabled === true,
          onClick: props.onClick,
          onKeyDown: props.onKeyDown,
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
          key: 'i',
          id: props.id,
          type: props.type,
          value: props.value,
          placeholder: props.placeholder,
          'aria-label': props['aria-label'],
          'aria-describedby': props['aria-describedby'],
          disabled: props.disabled === true,
          onChange: props.onChange,
          onKeyDown: props.onKeyDown,
        }),
      )
    },
    Checkbox(props) {
      record('Checkbox', props)
      return react.createElement('label', { className: props.className, title: props.title }, [
        react.createElement('input', {
          key: 'i',
          type: 'checkbox',
          checked: props.checked === true,
          disabled: props.disabled === true,
          onChange: (event) => props.onChange(event && event.target ? event.target.checked : !props.checked),
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
        title: props.title,
        disabled: props.disabled === true,
        onClick: () => props.onChange(!props.checked),
      })
    },
    Pill(props) {
      record('Pill', props)
      if (typeof props.onClick !== 'function') {
        return react.createElement('span', { className: props.className }, props.children)
      }
      return react.createElement(
        'button',
        {
          type: 'button',
          className: props.className,
          'aria-label': props['aria-label'],
          onClick: props.onClick,
        },
        props.children,
      )
    },
    Tag(props) {
      record('Tag', props)
      return react.createElement('span', { className: props.className }, props.children)
    },
    StateDot(props) {
      record('StateDot', props)
      return react.createElement('span', { 'aria-hidden': 'true', 'data-state': props.state })
    },
    Tooltip(props) {
      record('Tooltip', props)
      const child = Array.isArray(props.children) ? props.children[0] : props.children
      // The shipped Tooltip requires exactly one element child and clones it.
      if (props.openOnClick) {
        bubbleSeq += 1
        portalBubbles.push({ id: 'tooltip-' + String(bubbleSeq), role: 'tooltip', props })
        if (child !== null && child !== undefined && typeof child === 'object') {
          return react.cloneElement(child, { 'aria-describedby': 'tooltip-' + String(bubbleSeq) })
        }
      }
      return child
    },
    DisclosureRow(props) {
      record('DisclosureRow', props)
      return react.createElement('div', { className: props.className }, [
        react.createElement(
          'div',
          { key: 'row', role: 'button', 'aria-expanded': props.open === true, onClick: props.onToggle },
          props.title,
        ),
        props.open === true ? react.createElement('div', { key: 'body' }, props.children) : null,
      ])
    },
    SegmentedControl(props) {
      record('SegmentedControl', props)
      return react.createElement('div', { 'data-retired': 'SegmentedControl' }, props.children)
    },
    Menu(props) {
      record('Menu', props)
      return react.createElement('div', { 'data-retired': 'Menu' }, props.children)
    },
    MenuItemButton(props) {
      record('MenuItemButton', props)
      return react.createElement('div', { 'data-retired': 'MenuItemButton' }, props.children)
    },
  }

  // Icons destructure {size, className, strokeWidth} only.
  for (const name of [
    'IconInfoOutlineRegular',
    'IconChevronRightOutlineRegular',
    'IconChevronDownOutlineRegular',
    'IconTrashOutlineRegular',
  ]) {
    primitives[name] = (props) => {
      record(name, props)
      return react.createElement('span', {
        'data-icon': name,
        'data-size': props.size,
        className: props.className,
      })
    }
  }

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
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  createContext(sandbox)

  const seeds = {
    react,
    '@deepseek-ai/dsh-client-ui-primitives': primitives,
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let snapshot = initial
        return { getSnapshot: () => snapshot, subscribe: () => () => {}, set: (next) => { snapshot = next } }
      },
    },
  }

  const chunks = {}
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error('v7 audit: unexpected seed require(' + JSON.stringify(specifier) + ')')
  }
  requireStub.async = async (specifier) => {
    const fileName = specifier.startsWith('./') ? specifier.slice(2) : undefined
    if (fileName !== undefined && chunks[fileName] !== undefined) return chunks[fileName]
    if (fileName === undefined) throw new Error('v7 audit: no chunk stub for ' + specifier)
    // v10: the owner also requests the shared base, the fields data chunks, the
    // form chunk and the page face; an unstubbed one comes from the shipped file.
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, {
      filename: join(LIB, fileName),
    })
    const record = registrations[before]
    if (record === undefined) throw new Error('v7 audit: ' + fileName + ' registered nothing')
    return record.factory(requireStub)
  }

  const load = (fileName) => {
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, { filename: join(LIB, fileName) })
    assert.equal(registrations.length, before + 1, fileName + ' must register exactly once')
    return registrations[registrations.length - 1]
  }

  const core = load('client.core.js').factory(requireStub)
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
  // v10: the sheet is composed from two area fragments, so they load first.
  load('client.styles.chrome.js').factory(requireStub)
  load('client.styles.controls.js').factory(requireStub)
  const styles = load('client.styles.js').factory(requireStub)
  const owner = load('client.js').factory(requireStub)
  chunks['client.core.js'] = core
  chunks['client.schema.js'] = schema
  chunks['client.fields.js'] = fields
  chunks['client.panels.js'] = panels
  chunks['client.styles.js'] = styles

  function renderNode(node) {
    if (node === null || node === undefined || node === false || node === true) return null
    if (Array.isArray(node)) return node.map(renderNode).filter((entry) => entry !== null)
    if (typeof node !== 'object') return { type: '#text', props: {}, children: [], text: String(node) }
    const type = unwrapComponentType(node.type)
    if (typeof type === 'function') {
      if (type.prototype && type.prototype.isReactComponent) return renderNode(node.children)
      const ordinal = counters.get(type) || 0
      counters.set(type, ordinal + 1)
      const key = node.props && node.props.key !== undefined ? String(node.props.key) : '#' + String(ordinal)
      const cell = cellFor(type, key + '::' + (type.name || 'anonymous'))
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

  function flush() {
    while (pendingEffects.length > 0) {
      const callback = pendingEffects.shift()
      callback()
    }
  }

  function render(node) {
    counters.clear()
    pendingEffects.length = 0
    const tree = renderNode(node)
    flush()
    return tree
  }

  return {
    react,
    render,
    core,
    schema,
    fields,
    panels,
    styles,
    owner,
    primitiveCalls,
    portalBubbles,
    envelope: JSON.parse(readFileSync(FIXTURE, 'utf8')),
  }
}

function unwrapComponentType(type) {
  if (type === null || typeof type !== 'object') return type
  if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return type
  const tag = type.$$typeof
  if (tag === Symbol.for('react.memo')) return unwrapComponentType(type.type)
  if (tag === Symbol.for('react.forward_ref')) return unwrapComponentType(type.render)
  return type
}

/** A staged-form stand-in that records every write request. */
function recordingForm() {
  const writes = []
  return {
    writes,
    ops: [],
    invalid: false,
    edit(path, value) {
      writes.push({ op: 'edit', path: path, value: value })
    },
    remove(path) {
      writes.push({ op: 'remove', path: path })
    },
    reset(path) {
      writes.push({ op: 'reset', path: path })
    },
  }
}

/** The provider profile the panel tests edit. */
function providerValues() {
  return {
    providers: {
      alpha: {
        displayName: 'Deepseek 月卡',
        api: 'openai-completions',
        models: [
          { id: 'm1' },
          { id: 'm2', name: 'Pro' },
          { id: 'm3', name: '' },
        ],
        modelOverrides: { 'gpt-x': { contextWindow: 200000 } },
      },
    },
  }
}

function renderPanel(harness, form, values, groupOverride) {
  const root = harness.schema.node(harness.envelope, harness.envelope.uid)
  const providers = harness.schema.node(harness.envelope, root.dict.providers)
  const providerRef = providers.inner
  const leaves = harness.schema.leaves(harness.envelope, providerRef, ['providers', 'alpha'])
  const groups = groupOverride !== undefined ? groupOverride : harness.fields.groupLeaves(leaves)
  const props = {
    form,
    schema: harness.schema,
    fields: harness.fields,
    envelope: harness.envelope,
    values,
    provider: 'alpha',
    providerNames: ['alpha'],
    groups,
    options: { schema: harness.schema, fields: harness.fields, envelope: harness.envelope, values },
    locale: 'dsh-llm-pi-ai-config',
    onSelect() {},
    onAdd() {},
    onRemove() {},
  }
  const element = harness.react.createElement(harness.panels.ProviderPanel, props)
  const handle = {
    tree: null,
    again() {
      handle.tree = harness.render(element)
      return handle.tree
    },
  }
  handle.tree = harness.render(element)
  return handle
}

/** Find the radio group whose container id is `id`. */
function groupById(tree, id) {
  return byClass(tree, 'piai-select').filter((node) => node.props.id === id)
}

/**
 * The compat section toggles inside `.piai-disclosure`, in DOM order.
 *
 * v8 R3: the head is self-written, so the toggle is a NATIVE `<button>` (the
 * `div[role=button]` shape was the old DisclosureRow stub). Accept both so the
 * helper documents the contract rather than one implementation.
 */
function disclosureToggles(tree) {
  return byClass(tree, 'piai-disclosure').flatMap((block) =>
    elements(block).filter(
      (node) =>
        node.props['aria-expanded'] !== undefined &&
        (node.type === 'button' || node.props.role === 'button'),
    ),
  )
}

/** Open compat disclosure #index and return the re-rendered tree. */
function openCompatSection(rendered, index) {
  const toggles = disclosureToggles(rendered.tree)
  assert.ok(toggles.length > index, 'compat section ' + index + ' must exist')
  toggles[index].props.onClick()
  return rendered.again()
}

function radiosOf(group) {
  return elements(group).filter((node) => node.type === 'input' && node.props.type === 'radio')
}

/** The single `.piai-select` container for a leaf path prefix + suffix. */
function hasClass(node, name) {
  return String(node.props.className || '')
    .split(/\s+/)
    .filter(Boolean)
    .includes(name)
}

// ---------------------------------------------------------------------------
// CSS parsing (comments stripped: comments must not satisfy a rule check)
// ---------------------------------------------------------------------------

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

function parseRules(css) {
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let match
  const source = stripComments(css)
  while ((match = re.exec(source)) !== null) {
    const selectors = match[1]
      .split(',')
      .map((entry) => entry.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (selectors.length > 0) out.push({ selectors, body: match[2] })
  }
  return out
}

const norm = (value) => value.replace(/\s+/g, ' ').trim().replace(/;$/, '')

function declarations(body) {
  return norm(body)
    .split(';')
    .map((entry) => norm(entry))
    .filter(Boolean)
}

function ruleFor(rules, selector) {
  const found = rules.filter((rule) => rule.selectors.includes(selector))
  assert.ok(found.length >= 1, 'no rule for selector ' + selector)
  return found.map((rule) => declarations(rule.body)).flat()
}

function claim(rules, selector, declaration, label) {
  const decls = ruleFor(rules, selector)
  const wanted = norm(declaration)
  assert.ok(
    decls.some((entry) => entry === wanted),
    label + ': ' + selector + ' must declare ' + JSON.stringify(declaration) + '; got ' + JSON.stringify(decls),
  )
}

// ---------------------------------------------------------------------------
// 1. R4 enum: single-select semantics and the four call sites
// ---------------------------------------------------------------------------

test('R4 §15.5 — the enum leaf is a radiogroup of same-name native radios', () => {
  const harness = createHarness()
  const form = recordingForm()
  const { tree } = renderPanel(harness, form, providerValues())

  const groups = groupById(tree, 'piai-field-providers-alpha-api')
  assert.equal(groups.length, 1, 'exactly one radiogroup for the api enum leaf')
  const group = groups[0]
  assert.equal(group.props.role, 'radiogroup', 'the container is role=radiogroup')
  assert.equal(typeof group.props['aria-label'], 'string', 'the radiogroup has an accessible name')
  assert.ok(group.props['aria-label'] !== '')

  const radios = radiosOf(group)
  assert.equal(radios.length, 4, '3 protocol options + the inherit radio')
  const names = new Set(radios.map((radio) => radio.props.name))
  assert.equal(names.size, 1, 'every radio in the group shares one name (mutual exclusion)')
  assert.equal([...names][0], group.props.id, 'the shared name is the control id')
  assert.equal(radios.filter((radio) => radio.props.checked === true).length, 1, 'exactly one is checked')

  // OBS-7 (fixed by task-11): every option label keeps its full text in `title`,
  // because the visible text may be ellipsized inside a narrow column.
  const optionLabels = elements(group).filter((node) => node.type === 'label')
  assert.equal(optionLabels.length, radios.length, 'one label per radio')
  for (const label of optionLabels) {
    assert.equal(typeof label.props.title, 'string', 'every enum option label carries a title')
    assert.ok(label.props.title !== '', 'the title is the full option text')
  }

  // Single-value write-back: one edit for the leaf, never an array / object.
  radios.filter((radio) => radio.props.value === 'openai-responses')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'api'], value: 'openai-responses' },
  ])
})

test('R4 §15.5.5 — the default radio clears through onClear (unset), never a null write', () => {
  const harness = createHarness()
  const form = recordingForm()
  const { tree } = renderPanel(harness, form, providerValues())

  const group = groupById(tree, 'piai-field-providers-alpha-api')[0]
  const radios = radiosOf(group)
  const unset = radios.filter((radio) => radio.props.value === '__unset__')[0]
  assert.ok(unset !== undefined, 'the default radio is the string sentinel __unset__')
  assert.equal(unset.props.checked, false, 'a set field does not select the default')
  // T7 renames the visible label; the title keeps 「未设置」 so the long wording
  // stays reachable when the option text is ellipsized in the column.
  const unsetLabel = elements(group).filter(
    (node) => node.type === 'label' && plainText(node).indexOf('默认（未设置）') !== -1,
  )[0]
  assert.ok(unsetLabel !== undefined, 'the default option has its own label element')
  assert.equal(plainText(unsetLabel).trim(), '默认（未设置）', 'the visible label names the default')
  assert.ok(
    String(unsetLabel.props.title).includes('未设置'),
    'the full wording stays on the option title',
  )
  unset.props.onChange()

  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'api'] }])
  assert.equal(
    form.writes.some((write) => write.op === 'edit' && write.value === null),
    false,
    'clearing must never emit {op:edit, value:null}',
  )
})

test('R4 §15.5.5 — an out-of-enum hand-written value stays selectable (未识别)', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = providerValues()
  values.providers.alpha.api = 'hand-written-protocol'
  const { tree } = renderPanel(harness, form, values)

  const group = groupById(tree, 'piai-field-providers-alpha-api')[0]
  const radios = radiosOf(group)
  const odd = radios.filter((radio) => radio.props.value === 'hand-written-protocol')
  assert.equal(odd.length, 1, 'the unknown value is appended as an option')
  assert.equal(odd[0].props.checked, true, 'and it is the selected one')
  assert.ok(plainText(group).indexOf('未识别') !== -1, 'the appended option says 未识别')
  assert.equal(radios.filter((radio) => radio.props.checked === true).length, 1)
})

test('R4 §15.5 — DictControl valueEnum is a single-value write-back (synthetic closed-value dict)', () => {
  const harness = createHarness()
  const form = recordingForm()
  const leaf = {
    kind: 'dict',
    path: ['providers', 'alpha', 'synthMap'],
    presentationPath: ['providers', 'alpha', 'synthMap'],
    node: { meta: {} },
    required: false,
    valueEnum: ['a', 'b'],
  }
  const groups = [{ id: 'misc', title: '其他', leaves: [leaf] }]
  const values = { providers: { alpha: { synthMap: { k1: 'a' } } } }
  const { tree } = renderPanel(harness, form, values, groups)

  const group = groupById(tree, 'piai-field-providers-alpha-synthMap-k1')[0]
  assert.ok(group !== undefined, 'the valueEnum row renders an EnumControl')
  const radios = radiosOf(group)
  assert.equal(radios.length, 3, 'two values + inherit')
  assert.equal(new Set(radios.map((r) => r.props.name)).size, 1)

  radios.filter((radio) => radio.props.value === 'b')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'synthMap'], value: { k1: 'b' } },
  ])

  // Inherit here means "delete this key", and an empty map means "clear field".
  form.writes.length = 0
  radios.filter((radio) => radio.props.value === '__unset__')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'synthMap'] }])
})

test('R4 §15.5 — DictControl $var is a single-value write-back, never null', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = {
    providers: { alpha: { compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled' } } } } },
  }
  const rendered = renderPanel(harness, form, values)
  // chatTemplateArgs lives in the last compat disclosure group (模板与路由).
  const tree = openCompatSection(rendered, 5)

  const group = groupById(tree, 'piai-field-providers-alpha-compat-chatTemplateArgs-var-sys')[0]
  assert.ok(group !== undefined, 'a $var entry renders an EnumControl')
  const radios = radiosOf(group)
  assert.equal(radios.filter((radio) => radio.props.checked === true).length, 1)

  radios.filter((radio) => radio.props.value === 'thinking.effort')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    {
      op: 'edit',
      path: ['providers', 'alpha', 'compat', 'chatTemplateArgs'],
      value: { sys: { $var: 'thinking.effort', omitWhenOff: false } },
    },
  ])
  assert.equal(
    form.writes.some((write) => write.value === null),
    false,
    '$var selection must never write null',
  )
})

test('R4 §15.5 — union selector: const literal / discriminator seed / structural branch stays pending', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = providerValues()
  values.providers.alpha.retryPolicy = { mode: 'always' }
  let { tree } = renderPanel(harness, form, values)

  // retryPolicy is a discriminated union (mode): the selector writes a minimal seed.
  const policy = groupById(tree, 'piai-field-providers-alpha-retryPolicy')[0]
  assert.ok(policy !== undefined)
  const policyRadios = radiosOf(policy)
  assert.equal(
    policyRadios.filter((radio) => radio.props.checked === true)[0].props.value,
    'value:always',
    'the stored discriminator selects its branch',
  )
  policyRadios.filter((radio) => radio.props.value === 'value:normal')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'retryPolicy'], value: { mode: 'normal' } },
  ])

  form.writes.length = 0
  policyRadios.filter((radio) => radio.props.value === '__unset__')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'retryPolicy'] }])
})

test('R4 §15.5 — a structural union branch (reasoningEfforts dict) reveals without writing', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = providerValues()
  // The field is UNSET: its selector has no real branch, so the structural pick
  // is the pending branch that reveals the tiers table without persisting.
  values.providers.alpha.models = [{ id: 'm1' }]
  const rendered = renderPanel(harness, form, values)
  let tree = rendered.tree

  const toggle = elements(tree).filter(
    (node) => node.type === 'button' && node.props['aria-controls'] !== undefined && node.props['aria-expanded'] === false,
  )[0]
  assert.ok(toggle !== undefined, 'the model card renders a collapsed disclosure button')
  toggle.props.onClick()
  tree = rendered.again()

  const group = groupById(tree, 'piai-field-providers-alpha-models-0-reasoningEfforts')[0]
  assert.ok(group !== undefined)
  const radios = radiosOf(group)
  assert.ok(byClass(tree, 'piai-tiers').length === 0, 'an unset field starts on the inherit option')

  // The const branch writes its own literal and nothing else.
  radios.filter((radio) => radio.props.value === 'value:false')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    { op: 'edit', path: ['providers', 'alpha', 'models', 0, 'reasoningEfforts'], value: false },
  ])

  form.writes.length = 0
  radios.filter((radio) => radio.props.value === 'kind:dict')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [], 'selecting a structural branch writes NOTHING (pending only)')

  tree = rendered.again()
  const group2 = groupById(tree, 'piai-field-providers-alpha-models-0-reasoningEfforts')[0]
  assert.equal(
    radiosOf(group2).filter((radio) => radio.props.checked === true)[0].props.value,
    'kind:dict',
    'the pending selection is shown but not persisted',
  )
  assert.ok(byClass(tree, 'piai-tiers').length >= 1, 'the structural branch body is revealed')
})

// FINDING-2 regression guard (fixed by T3b / task-11): the pending structural
// branch must win over the stored one, so a stored `false` no longer blocks the
// tiers table. `UnionControl` now does `pendingId !== undefined ? pendingId :
// realId` (lib/client.panels.js:1771).
test('R4 §15.5/§15.9 — a structural branch replaces a stored branch, then the first tier writes [FINDING-2]', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = providerValues()
  values.providers.alpha.models = [{ id: 'm1', reasoningEfforts: false }]
  const rendered = renderPanel(harness, form, values)
  let tree = rendered.tree
  const toggle = elements(tree).filter(
    (node) => node.type === 'button' && node.props['aria-controls'] !== undefined && node.props['aria-expanded'] === false,
  )[0]
  toggle.props.onClick()
  tree = rendered.again()

  const first = groupById(tree, 'piai-field-providers-alpha-models-0-reasoningEfforts')[0]
  assert.equal(
    radiosOf(first).filter((radio) => radio.props.checked === true)[0].props.value,
    'value:false',
    'the stored const branch is selected first',
  )
  assert.equal(byClass(tree, 'piai-tiers').length, 0, 'the const branch renders no tiers table')

  // Pending now outranks the stored branch: the body is revealed with ZERO writes.
  radiosOf(first).filter((radio) => radio.props.value === 'kind:dict')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [], 'selecting a structural branch still writes NOTHING')

  tree = rendered.again()
  const pendingGroup = groupById(tree, 'piai-field-providers-alpha-models-0-reasoningEfforts')[0]
  assert.equal(
    radiosOf(pendingGroup).filter((radio) => radio.props.checked === true)[0].props.value,
    'kind:dict',
    'the pending selection wins over the stored one',
  )
  const tiers = byClass(tree, 'piai-tiers')
  assert.equal(tiers.length, 1, 'the tiers body is revealed while the branch is pending')

  // Contract C: each tier is an ordinary Row now — one `.piai-info` trigger in
  // the row head, the tier input described by it, and no bare key chip.
  const tierRows = byClass(tiers[0], 'piai-tier')
  assert.equal(tierRows.length, 7, 'every declared tier renders as its own row')
  const tierIds = new Set(
    elements(tiers[0])
      .filter((node) => typeof node.props.id === 'string')
      .map((node) => node.props.id),
  )
  for (const row of tierRows) {
    assert.equal(byClass(row, 'piai-info').length, 1, 'each tier row carries exactly one info trigger')
    assert.equal(byClass(row, 'piai-tier-key').length, 0, 'no bare key chip survives in a tier row')
    const rowInput = elements(row).filter((node) => node.type === 'input')[0]
    const described = rowInput.props['aria-describedby']
    assert.equal(
      described,
      rowInput.props.id + '-info',
      'the tier input is described by its own info trigger',
    )
    assert.ok(tierIds.has(described), 'the tier hint id resolves to a rendered node: ' + described)
  }

  // Only filling a tier persists — and it writes the whole tiers object.
  const input = elements(tiers[0]).filter((node) => node.type === 'input')[0]
  const tierKey = String(input.props.id).split('-').pop()
  assert.equal(tierKey, 'off', 'the first tier key is the first keyEnum entry')
  input.props.onChange({ target: { value: '4' } })
  assert.deepEqual(plain(form.writes), [
    {
      op: 'edit',
      path: ['providers', 'alpha', 'models', 0, 'reasoningEfforts'],
      value: { off: '4' },
    },
  ])

  // Inherit clears the pending branch and unset the field's own path.
  form.writes.length = 0
  radiosOf(pendingGroup).filter((radio) => radio.props.value === '__unset__')[0].props.onChange()
  assert.deepEqual(plain(form.writes), [
    { op: 'remove', path: ['providers', 'alpha', 'models', 0, 'reasoningEfforts'] },
  ])
  tree = rendered.again()
  assert.equal(byClass(tree, 'piai-tiers').length, 0, 'clearing pending collapses the tiers body again')
  assert.equal(
    radiosOf(groupById(tree, 'piai-field-providers-alpha-models-0-reasoningEfforts')[0]).filter(
      (radio) => radio.props.checked === true,
    )[0].props.value,
    'value:false',
    'after the clear the stored branch is the active one again (no pending left over)',
  )
})

test('R4 §15.5.7 — renderRow never emits htmlFor for enum/const rows', () => {
  const harness = createHarness()
  const form = recordingForm()
  const { tree } = renderPanel(harness, form, providerValues())

  const rows = byClass(tree, 'piai-row')
  const apiRow = rows.filter((row) =>
    elements(row).some((node) => node.props.id === 'piai-field-providers-alpha-api'),
  )[0]
  assert.ok(apiRow !== undefined)
  const apiLabel = elements(apiRow).filter((node) => node.props.className === 'piai-row-label')[0]
  assert.equal(apiLabel.type, 'span', 'the enum row label is a span, not label[htmlFor]')
  assert.equal(
    elements(apiRow).some((node) => node.type === 'label' && node.props.htmlFor === 'piai-field-providers-alpha-api'),
    false,
    'no htmlFor may point at the multi-input radiogroup container id',
  )

  // Control: a single-input row must still pair label[htmlFor] with its control.
  const nameRow = rows.filter((row) =>
    elements(row).some((node) => node.props.id === 'piai-field-providers-alpha-displayName'),
  )[0]
  assert.ok(nameRow !== undefined)
  assert.equal(
    elements(nameRow).some(
      (node) => node.type === 'label' && node.props.htmlFor === 'piai-field-providers-alpha-displayName',
    ),
    true,
    'a single-control row keeps the htmlFor pairing',
  )
})

test('R4 §15.5.3 — SegmentedControl / Menu / MenuItemButton are gone (runtime + source)', () => {
  const panelsSource = read('lib/client.panels.js')
  assert.equal(/h\(\s*SegmentedControl/.test(panelsSource), false, 'no h(SegmentedControl, …)')
  assert.equal(/h\(\s*Menu\b/.test(panelsSource), false, 'no h(Menu, …)')
  assert.equal(/h\(\s*MenuItemButton/.test(panelsSource), false, 'no h(MenuItemButton, …)')
  assert.equal(/primitive\(\s*'SegmentedControl'/.test(panelsSource), false, 'no SegmentedControl binding')
  assert.equal(/primitive\(\s*'Menu'/.test(panelsSource), false, 'no Menu binding')
  assert.equal(/primitive\(\s*'MenuItemButton'/.test(panelsSource), false, 'no MenuItemButton binding')

  const harness = createHarness()
  renderPanel(harness, recordingForm(), providerValues())
  const retired = harness.primitiveCalls
    .filter((call) => ['SegmentedControl', 'Menu', 'MenuItemButton'].includes(call.name))
    .map((call) => call.name)
  assert.deepEqual(retired, [], 'no retired primitive may be rendered, even through a fallback')
})

// ---------------------------------------------------------------------------
// 2. R3 instance cards
// ---------------------------------------------------------------------------

test('R3 §15.4 — card titles come from presentation metadata (name → required string → #n)', () => {
  const harness = createHarness()
  const { tree } = renderPanel(harness, recordingForm(), providerValues())

  // v8: `.piai-item-head` is now SHARED with the six compat section heads, so
  // the instance titles must be scoped to the instance containers.
  const cards = byClass(tree, 'piai-array-row').concat(byClass(tree, 'piai-dict-row'))
  const heads = cards.map((card) => byClass(card, 'piai-item-head')[0])
  assert.ok(heads.every((head) => head !== undefined), 'every instance card carries one head')
  const titles = heads.map((head) => {
    const button = elements(head).filter((node) => node.type === 'button')[0]
    return plainText(button).replace(/\s+/g, ' ').trim()
  })
  assert.deepEqual(titles, ['#1 m1', '#2 Pro', '#3 m3', 'gpt-x'])
  // rank 1 (`name`) wins; empty name falls through to the required string (`id`).
  assert.equal(titles[1], '#2 Pro')
  assert.equal(titles[2], '#3 m3')
})

test('R3 §15.4 — the panel hardcodes no provider/model field name', () => {
  // v10: the whole panels layer is scanned, module by module.
  for (const { name, source } of panelsLayerSources()) {
    assert.equal(/'id'/.test(source), false, `no quoted 'id' field literal may exist in ${name}`)

    const nameHits = [...source.matchAll(/'name'/g)]
    for (const hit of nameHits) {
      const before = source.slice(Math.max(0, hit.index - 24), hit.index)
      assert.ok(
        /key:\s*$/.test(before),
        `'name' at index ${hit.index} in ${name} is not a React key: ` + JSON.stringify(before),
      )
    }

    assert.equal(/===\s*'name'/.test(source), false, `no === 'name' comparison in ${name}`)
    assert.equal(/===\s*'id'/.test(source), false, `no === 'id' comparison in ${name}`)
  }

  // The card-title priority lives in the instances module (v10).
  const instancesSource = read('lib/client.panels.instances.js')
  assert.ok(
    instancesSource.includes('titleRank'),
    'the title priority is read from fields.describeField().titleRank',
  )
  assert.ok(
    /leaf\.required === true && leaf\.kind === 'string'/.test(instancesSource),
    'the fallback is the schema-derived required string leaf',
  )

  // v10: the presentation data (the `titleRank: 1` mark on the name field) lives
  // in `client.fields.groups.js`; the projection lives in the logic chunk.
  const groupsSource = read('lib/client.fields.groups.js')
  assert.ok(
    /titleRank: 1/.test(groupsSource),
    'the fields data chunk marks the ranked leaf with titleRank',
  )
  const fieldsSource = read('lib/client.fields.js')
  assert.ok(/result\.titleRank = entry\.titleRank/.test(fieldsSource), 'describeField exposes titleRank')
})

test('R3 §15.4 — delete is always in the DOM, a sibling of the toggle, two-step + Esc, instance path', () => {
  const harness = createHarness()
  const form = recordingForm()
  const rendered = renderPanel(harness, form, providerValues())

  // No card is expanded: the delete control must already be there.
  assert.equal(byClass(rendered.tree, 'piai-array-row').length, 3)
  const removeButtons = byClass(rendered.tree, 'piai-item-remove')
  assert.equal(removeButtons.length, 4, '2 model cards + 1 override card + … (one per card head)')
  for (const button of removeButtons) {
    assert.equal(button.type, 'button')
    assert.equal(typeof button.props['aria-label'], 'string')
    assert.ok(button.props['aria-label'] !== '', 'the icon button has a localized accessible name')
    assert.equal(typeof button.props.title, 'string', 'and a title')
  }

  const head = byClass(rendered.tree, 'piai-item-head')[0]
  const toggle = elements(head).filter((node) => node.type === 'button' && node.props['aria-expanded'] !== undefined)[0]
  assert.equal(toggle.props.role, 'button')
  assert.equal(toggle.props['aria-expanded'], false)
  const bodyId = toggle.props['aria-controls']
  assert.ok(
    elements(rendered.tree).some((node) => node.props.id === bodyId),
    'aria-controls resolves to the card body',
  )
  assert.equal(
    elements(toggle).some((node) => hasClass(node, 'piai-item-remove')),
    false,
    'the delete button is NOT nested inside the disclosure button',
  )
  const actions = byClass(head, 'piai-item-actions')[0]
  assert.ok(actions !== undefined, 'the action slot is a sibling of the disclosure button')
  assert.ok(byClass(actions, 'piai-item-remove').length === 1)

  // Two-step: arm, Escape cancels, second click confirms with the instance path.
  const first = byClass(rendered.tree, 'piai-item-remove')[0]
  first.props.onClick()
  let tree = rendered.again()
  let armed = byRole(tree, 'group').filter((node) => node.props.onKeyDown !== undefined)[0]
  assert.ok(armed !== undefined, 'the first click only arms the confirmation')
  assert.ok(plainText(armed).indexOf('确认删除模型') !== -1)
  assert.equal(byClass(tree, 'piai-item-remove').length, 3, 'the armed icon is replaced while armed')

  armed.props.onKeyDown({ key: 'Escape' })
  tree = rendered.again()
  assert.equal(byClass(tree, 'piai-item-remove').length, 4, 'Escape disarms and restores the icon')

  byClass(tree, 'piai-item-remove')[0].props.onClick()
  tree = rendered.again()
  armed = byRole(tree, 'group').filter((node) => node.props.onKeyDown !== undefined)[0]
  const confirm = elements(armed).filter(
    (node) => node.type === 'button' && node.props['aria-label'] === '确认删除',
  )
  assert.equal(confirm.length, 1, 'the armed group offers an explicit confirm')
  confirm[0].props.onClick()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'models', 0] }])
})

test('R3 §15.4 — modelOverrides keeps the dictionary-key title', () => {
  const harness = createHarness()
  const { tree } = renderPanel(harness, recordingForm(), providerValues())
  const overrideRow = byClass(tree, 'piai-dict-row')[0]
  const head = byClass(overrideRow, 'piai-item-head')[0]
  const button = elements(head).filter((node) => node.type === 'button')[0]
  assert.equal(plainText(button).trim(), 'gpt-x', 'the override card is titled by its map key')
  assert.equal(byClass(overrideRow, 'piai-dict-key').length, 1)
})

// ---------------------------------------------------------------------------
// 3. R2 field rows
// ---------------------------------------------------------------------------

const CJK = /[\u4e00-\u9fff]/

/** Leaves the page renders, including union branches (presentation.test.js口径). */
function renderLeaves(schema, envelope, leaves, depth = 0) {
  if (depth > 3) return leaves
  const out = []
  for (const leaf of leaves) {
    out.push(leaf)
    if (leaf.kind !== 'union') continue
    for (const branch of leaf.branches || []) {
      if (branch.ref === undefined) continue
      const base = leaf.presentationPath !== undefined ? leaf.presentationPath : leaf.path
      out.push(...renderLeaves(schema, envelope, schema.leaves(envelope, branch.ref, leaf.path, base), depth + 1))
    }
  }
  return out
}

test('R2 §15.3.6 + R2 §3 — every rendered leaf still resolves a Chinese label, hint and raw key', () => {
  const harness = createHarness()
  const root = harness.schema.node(harness.envelope, harness.envelope.uid)
  const providerRef = harness.schema.node(harness.envelope, root.dict.providers).inner
  const leaves = renderLeaves(
    harness.schema,
    harness.envelope,
    harness.schema.leaves(harness.envelope, providerRef, ['providers', 'alpha']),
  )
  assert.equal(leaves.length, 125, 'the rendered-leaf inventory is still 125 (recomputed, not copied)')

  for (const leaf of leaves) {
    const path = harness.fields.presentationPathOf(leaf)
    const described = harness.fields.describeField(path)
    assert.ok(described.label !== undefined && described.label !== '', path + ' lost its label')
    assert.ok(CJK.test(described.label), path + ' label is not Chinese: ' + JSON.stringify(described.label))
    const hint = described.hint !== undefined ? described.hint : leaf.description
    assert.ok(hint !== undefined && hint !== '', path + ' lost its hint')
    assert.ok(CJK.test(hint), path + ' hint is not Chinese: ' + JSON.stringify(hint))
    const key = harness.fields.keyLabelFor(leaf)
    assert.ok(typeof key === 'string' && key !== '', path + ' lost its raw YAML key')
    assert.equal(key.indexOf('providers.'), -1, path + ' key label must drop the provider prefix')
  }
})

test('R2 §15.3.3/4 — the raw key chip and the hint text live in the Tooltip bubble, not in the row', () => {
  const harness = createHarness()
  const { tree } = renderPanel(harness, recordingForm(), providerValues())

  const tooltips = harness.primitiveCalls.filter((call) => call.name === 'Tooltip')
  assert.ok(tooltips.length > 0, 'field rows must disclose their hint through a Tooltip')
  for (const call of tooltips) {
    const props = call.props
    assert.equal(props.side, 'right', 'E4 default plus the design decision')
    assert.equal(props.openOnClick, true, 'the bubble can be pinned for reading (E4)')
    assert.equal(props.portal, true, 'the bubble escapes card/bar clipping (E4)')
    assert.equal(props.maxWidth, 360, 'E4: the bubble keeps the frozen 360px width')
    assert.equal(Array.isArray(props.children) ? props.children.length : 1, 1, 'Tooltip takes ONE child')
    // T20 contract: the bubble is ONE top-level scoped wrapper span —
    //   [ span.piai-root > (code.piai-key?, span(hint)?, span(extraLine)*) ]
    // with no <br> separators (the nested root is a flex column, spacing comes
    // from CSS). The parts are therefore found by DEPTH, never by array index.
    const labelNodes = Array.isArray(props.label) ? props.label : [props.label]
    assert.equal(labelNodes.length, 1, 'the bubble is exactly one top-level node')
    const wrapper = labelNodes[0]
    assert.equal(wrapper && wrapper.type, 'span', 'the top-level bubble node is a span')
    assert.ok(hasClass(wrapper, 'piai-root'), 'the wrapper re-enters the .piai-root scope')
    const parts = elements(wrapper).filter((node) => node !== wrapper)

    const chips = parts.filter((node) => node.type === 'code' && hasClass(node, 'piai-key'))
    assert.equal(chips.length, 1, 'the bubble carries exactly one .piai-key chip')
    assert.ok(plainText(chips[0]).trim() !== '', 'the key chip is not empty')
    assert.equal(
      parts.filter((node) => node.type === 'br').length,
      0,
      'T20: the bubble carries no <br> separators',
    )
    const textLines = parts.filter((node) => node.type === 'span')
    assert.ok(textLines.length >= 1, 'the bubble carries at least the Chinese hint text')
    for (const line of textLines) {
      assert.ok(plainText(line).trim() !== '', 'a bubble text line must not be empty')
      assert.ok(CJK.test(plainText(line)), 'a bubble text line must be Chinese')
    }
  }

  // The key chip moved INTO the bubble: it must not be inline any more.
  assert.equal(byClass(tree, 'piai-key').length, 0, 'no inline .piai-key in the rendered row tree')

  // No field-level inline .piai-hint in the label head either.
  for (const head of byClass(tree, 'piai-row-head')) {
    assert.equal(byClass(head, 'piai-hint').length, 0, 'the label head must not render an inline hint')
  }
})

test('R2 §15.3.6 — aria-describedby targets the permanent piai-info anchor, never the portal bubble', () => {
  const harness = createHarness()
  const { tree } = renderPanel(harness, recordingForm(), providerValues())

  const controls = byClass(tree, 'piai-row-control')
  assert.ok(controls.length > 0)
  let described = 0
  for (const control of controls) {
    const target = control.props['aria-describedby']
    if (target === undefined) continue
    described += 1
    const found = elements(tree).filter((node) => node.props.id === target)
    assert.equal(found.length, 1, 'aria-describedby target ' + target + ' must exist exactly once')
    assert.ok(hasClass(found[0], 'piai-info'), 'the target is our own info trigger, not a hint node')
    assert.ok(/^piai-field-.*-info$/.test(target), 'the target is the info id, never the removed -hint node')
    assert.equal(found[0].type, 'button')
    assert.ok(
      String(found[0].props['aria-label'] || '').indexOf('：') !== -1,
      'the trigger accessible name carries label + hint even while the bubble is closed',
    )
  }
  assert.ok(described > 0, 'hinted fields must be described')

  const infoButtons = byClass(tree, 'piai-info')
  assert.equal(infoButtons.length, described, 'one permanent info trigger per described control')
  assert.equal(infoButtons.length, harness.portalBubbles.length, 'one Tooltip bubble per trigger')

  // The portal bubbles are deliberately NOT part of the rendered tree; an
  // aria-describedby pointing at one would have failed the lookup above.
  assert.ok(
    harness.portalBubbles.every((bubble) => bubble.role === 'tooltip'),
    'the portal bubble is role=tooltip (E4)',
  )
})

test('R2 §15.3.6 — validation errors stay inline (aria-invalid) and are still surfaced to the page', async () => {
  const harness = createHarness()
  const form = recordingForm()
  form.invalid = true
  form.ops = [{ op: 'edit', path: ['providers', 'alpha', 'api'] }]
  const { tree } = renderPanel(harness, form, providerValues())

  const group = groupById(tree, 'piai-field-providers-alpha-api')[0]
  const row = byClass(tree, 'piai-row-control').filter((node) => elements(node).some((n) => n === group))[0]
  const control = row !== undefined ? row : byClass(tree, 'piai-row-control').filter((node) => byClass(node, 'piai-select').length > 0)[0]
  assert.equal(control.props['aria-invalid'], 'true', 'the invalid dirty control is marked inline')

  // The owner must keep showing the pipeline's own error text, not swallow it.
  const values = { providers: { alpha: { api: 'x' } } }
  const snapshot = { values, dirty: true, saving: false, invalid: true, error: undefined }
  const pageApi = await harness.owner.__internals.loadPage()
  const page = pageApi.makePage(
    {
      core: harness.core,
      schema: harness.schema,
      fields: harness.fields,
      panels: harness.panels,
      form: {
        createStagedForm: () => ({
          subscribe: () => () => {},
          getSnapshot: () => snapshot,
          edit: () => {},
          remove: () => {},
          discard: () => {},
          save: () => {},
        }),
      },
    },
    { boundary: harness.owner.__internals.pageBoundary },
  )
  const element = harness.react.createElement(page, {
    usePage: (selector) => selector({ envelope: harness.envelope }),
    controller: {
      getSnapshot: () => ({ value: values, revision: 1, writable: true }),
      subscribe: () => () => {},
      mutate: async () => true,
    },
    validate: () => '模型配置有误：api 不合法',
    t: (key) => key,
  })
  harness.render(element)
  const pageTree = harness.render(element)
  const alerts = byRole(byClass(pageTree, 'piai-notices')[0], 'alert')
  assert.ok(alerts.length >= 1, 'the validation message is rendered as a role=alert notice')
  assert.ok(
    alerts.some((node) => String(plainText(node)).indexOf('模型配置有误') !== -1),
    'the pipeline error text is shown verbatim',
  )
})

test('R4 §15.5.4 / R5 §15.6 / R6 §15.7 — enum box, check-group spacing and the five 32px buttons', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)

  for (const declaration of [
    'display: flex',
    'flex-wrap: wrap',
    'align-items: center',
    'gap: var(--piai-space-2) var(--piai-space-4)',
    'min-width: 0',
    'max-width: 100%',
  ]) {
    claim(rules, '.piai-root .piai-select', declaration, 'R4.4 enum group')
  }
  for (const declaration of ['white-space: nowrap', 'overflow: hidden', 'text-overflow: ellipsis']) {
    claim(rules, '.piai-root .piai-select > label > span', declaration, 'R4.4 long-option ellipsis')
  }
  for (const declaration of [
    'appearance: none',
    'width: 16px',
    'height: 16px',
    'border: 0.5px solid var(--dsw-alias-border-l4)',
    'border-radius: var(--piai-radius-sm)',
  ]) {
    claim(rules, '.piai-root .piai-select input', declaration, 'R4.2 square box')
  }
  claim(rules, '.piai-root .piai-select input:checked', 'background: var(--dsw-alias-brand-primary)', 'R4.2')
  claim(
    rules,
    '.piai-root .piai-select input:checked::after',
    'content: ""',
    'R4.2 check is drawn by CSS',
  )
  for (const declaration of [
    'border-bottom: 1.5px solid var(--dsw-alias-label-primary-foreground)',
    'border-right: 1.5px solid var(--dsw-alias-label-primary-foreground)',
  ]) {
    claim(rules, '.piai-root .piai-select input:checked::after', declaration, 'R4.2 check colour')
  }
  assert.equal(/url\(/.test(harness.styles.STYLESHEET), false, 'E13: no image-based check/arrow')

  for (const declaration of [
    'display: flex',
    'flex-wrap: wrap',
    'gap: var(--piai-space-2) var(--piai-space-4)',
  ]) {
    claim(rules, '.piai-root .piai-checks', declaration, 'R5.1 check group')
  }
  claim(rules, '.piai-root .piai-checks > label', 'gap: var(--piai-space-1)', 'R5.3 4px box↔label')
  claim(rules, '.piai-root .piai-checks > label > span', 'white-space: nowrap', 'R5.4 no-wrap label')

  claim(rules, '.piai-root .piai-provider-add button', 'height: 32px', 'R6 provider-add')
  for (const selector of [
    '.piai-root .piai-dict-add button',
    '.piai-root .piai-tag-add button',
    '.piai-root .piai-cred button',
    '.piai-root .piai-cred-editor button',
  ]) {
    claim(rules, selector, 'height: 32px', 'R6 ' + selector)
  }
})

// ---------------------------------------------------------------------------
// 4. R1 tabs
// ---------------------------------------------------------------------------

function officialTabDeck(rules) {
  const tabRow = '.piai-root .piai-provider-list'
  const tab = '.piai-root .piai-provider-list [role="tab"]'
  claim(rules, tabRow, 'display: flex', 'E1 .tabs')
  claim(rules, tabRow, 'align-items: flex-end', 'E1 .tabs')
  claim(rules, tabRow, 'gap: 22px', 'E1 .tabs')
  claim(rules, tabRow, 'margin-top: 2px', 'E1 .tabs')
  claim(rules, tabRow, 'border-bottom: 0.5px solid var(--dsw-alias-border-l2)', 'E1 .tabs')
  claim(rules, tabRow, 'flex-wrap: wrap', 'intentional deviation 1 (§15.2.4)')

  claim(rules, tab, 'position: relative', 'E1 .tab')
  claim(rules, tab, 'padding: 7px 1px 9px', 'E1 .tab')
  claim(rules, tab, 'font: inherit', 'E1 .tab')
  claim(rules, tab, 'font-size: 13px', 'E1 .tab')
  claim(rules, tab, 'line-height: 20px', 'E1 .tab')
  claim(rules, tab, 'cursor: pointer', 'E1 .tab')
  claim(rules, tab, 'color: var(--dsw-alias-label-tertiary)', 'E1 .tab')
  claim(rules, tab, 'border: 0', 'E1 .tab')
  const backgrounds = ruleFor(rules, tab)
  assert.ok(
    backgrounds.some((entry) => entry === 'background: none' || entry === 'background: 0 0'),
    'E1 .tab must declare a transparent background; got ' + JSON.stringify(backgrounds),
  )

  const active = matters =>
    matters.some((entry) => entry === 'color: var(--dsw-alias-label-primary)')
  const hoverRule = rules.filter(
    (rule) =>
      rule.selectors.includes('.piai-root .piai-provider-list [role="tab"]:hover') &&
      rule.selectors.includes('.piai-root .piai-provider-list [role="tab"][data-active="true"]'),
  )
  assert.ok(hoverRule.length >= 1, 'E1 hover + active share the label-primary colour')
  assert.ok(active(declarations(hoverRule[0].body)))

  const afterRule = rules.filter(
    (rule) =>
      rule.selectors.includes('.piai-root .piai-provider-list [role="tab"][data-active="true"]::after') &&
      rule.selectors.includes('.piai-root .piai-provider-list [role="tab"]:focus-visible::after'),
  )
  assert.equal(afterRule.length, 1, 'E1 draws the underline for active AND focus-visible')
  for (const declaration of [
    'content: ""',
    'position: absolute',
    'bottom: -1px',
    'left: 0',
    'right: 0',
    'height: 2px',
    'background: var(--dsw-alias-label-primary)',
    'border-radius: 2px 2px 0 0',
  ]) {
    assert.ok(
      declarations(afterRule[0].body).some((entry) => entry === declaration),
      'E1 underline must declare ' + declaration + '; got ' + JSON.stringify(declarations(afterRule[0].body)),
    )
  }

  claim(
    rules,
    '.piai-root .piai-provider-list [role="tab"]:focus-visible',
    'outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color)',
    'E1 focus ring',
  )
  claim(rules, '.piai-root .piai-provider-list [role="tab"]:focus-visible', 'outline-offset: 2px', 'E1')
  claim(rules, '.piai-root .piai-provider-list [role="tab"]:focus-visible', 'border-radius: 2px', 'E1')
  claim(rules, '.piai-root .piai-provider-list [role="tab"]:focus-visible', 'color: var(--dsw-alias-label-primary)', 'E1')

  // E1 panel side: min-width: 0; padding-top: 2px lands on piai-body (§15.2.3).
  claim(rules, '.piai-root .piai-body', 'padding-top: 2px', 'E1 .panel')

  // Intentional deviation 2 (§15.2.5).
  claim(rules, '.piai-root .piai-tabs', 'margin-bottom: var(--piai-space-4)', 'deviation 2')
}

test('R1 §15.2.3 + §15.1 E1 — the tab CSS copies the official rules with the two declared deviations', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  officialTabDeck(rules)
})

function tabsProps(harness, names, options = {}) {
  const items = names.map((name, index) => ({
    value: name,
    label: name === 'alpha' ? 'DeepSeek 月卡' : name,
    id: 'model-extended-tab-' + String(index) + '-' + name,
    panelId: 'model-extended-panel-' + String(index) + '-' + name,
  }))
  return {
    providerNames: names,
    items,
    provider: options.provider !== undefined ? options.provider : names[0],
    label: '提供商',
    adding: options.adding === true,
    onSelect: options.onSelect || (() => {}),
    onSelectAdd: options.onSelectAdd || (() => {}),
    onAdd: () => {},
  }
}

test('R1 §15.2.2/8 — the strip is one tablist, each provider a tab, plus a real add tab', () => {
  const harness = createHarness()
  const tree = harness.render(
    harness.react.createElement(harness.panels.ProviderTabs, tabsProps(harness, ['alpha', 'beta'], { adding: true })),
  )

  const tablists = byRole(tree, 'tablist')
  assert.equal(tablists.length, 1)
  assert.equal(tablists[0].props['aria-label'], '提供商')
  assert.equal(hasClass(tablists[0], 'piai-provider-list'), true)

  const tabs = byRole(tree, 'tab')
  assert.equal(tabs.length, 3, '2 providers + 1 add tab')
  assert.deepEqual(
    tabs.map((tab) => tab.props.id),
    [
      'model-extended-tab-0-alpha',
      'model-extended-tab-1-beta',
      'model-extended-tab-add',
    ],
  )

  const add = tabs[2]
  assert.equal(add.props['aria-controls'], 'model-extended-panel-add')
  const addPanel = byAttr(tree, 'id', 'model-extended-panel-add')[0]
  assert.ok(addPanel !== undefined, 'the add tab aria-controls has a real target')
  assert.equal(addPanel.props.role, 'tabpanel')
  assert.equal(addPanel.props['aria-labelledby'], 'model-extended-tab-add')
  assert.equal(hasClass(addPanel, 'piai-provider-add'), true)

  // Exactly one tab stop, and it is the add tab while "adding" is active.
  const stops = tabs.filter((tab) => tab.props.tabIndex === 0)
  assert.equal(stops.length, 1)
  assert.equal(stops[0].props.id, 'model-extended-tab-add')
  assert.equal(add.props['aria-selected'], true)
  assert.equal(add.props['data-active'], 'true')
  assert.deepEqual(
    tabs.slice(0, 2).map((tab) => tab.props['aria-selected']),
    [false, false],
  )
})

test('R1 §15.2.6 — roving tabindex keyboard model wraps through the add tab', () => {
  const harness = createHarness()
  const selected = []
  let addRequests = 0
  const tree = harness.render(
    harness.react.createElement(
      harness.panels.ProviderTabs,
      tabsProps(harness, ['alpha', 'beta'], {
        provider: 'alpha',
        onSelect: (name) => selected.push(name),
        onSelectAdd: () => {
          addRequests += 1
        },
      }),
    ),
  )
  const tabs = byRole(tree, 'tab')

  const focused = []
  const host = {
    parentElement: {
      querySelectorAll: () => ({ item: (index) => ({ focus: () => focused.push(index) }) }),
    },
  }
  const press = (tab, key) => {
    let prevented = false
    let stopped = false
    tab.props.onKeyDown({
      key: key,
      currentTarget: host,
      preventDefault: () => {
        prevented = true
      },
      stopPropagation: () => {
        stopped = true
      },
    })
    return { prevented, stopped }
  }

  // alpha → beta → add → wrap to alpha.
  let result = press(tabs[0], 'ArrowRight')
  assert.deepEqual(focused, [1])
  assert.deepEqual(selected, ['beta'])
  assert.equal(result.prevented, true)
  assert.equal(result.stopped, true, 'the project keeps stopPropagation() (§15.2.6)')

  focused.length = 0
  press(tabs[1], 'ArrowRight')
  assert.deepEqual(focused, [2], 'ArrowRight from the last provider lands on the add tab')
  assert.equal(addRequests, 1)

  focused.length = 0
  selected.length = 0
  press(tabs[2], 'ArrowRight')
  assert.deepEqual(focused, [0], 'ArrowRight from the add tab wraps to the first provider')
  assert.deepEqual(selected, ['alpha'])

  focused.length = 0
  press(tabs[0], 'ArrowLeft')
  assert.deepEqual(focused, [2], 'ArrowLeft wraps back onto the add tab')

  focused.length = 0
  press(tabs[1], 'Home')
  assert.deepEqual(focused, [0])
  focused.length = 0
  selected.length = 0
  press(tabs[0], 'End')
  assert.deepEqual(focused, [2])
  assert.equal(addRequests, 3)
})

test('R1 §15.2.10 (D2) — zero providers render no tablist/tab/tabpanel; the add form is direct', () => {
  const harness = createHarness()
  const tree = harness.render(
    harness.react.createElement(harness.panels.ProviderTabs, tabsProps(harness, [], {})),
  )
  assert.equal(byRole(tree, 'tablist').length, 0, 'no tablist without providers')
  assert.equal(byRole(tree, 'tab').length, 0, 'no tab without providers')
  assert.equal(byRole(tree, 'tabpanel').length, 0, 'no tabpanel without providers')

  const add = byClass(tree, 'piai-provider-add')
  assert.equal(add.length, 1, 'the add form is rendered directly')
  assert.equal(byAttr(tree, 'id', 'llm-pi-ai-config-provider-add-name').length, 1)
  assert.equal(
    elements(tree).some((node) => node.type === 'button' && node.props['aria-label'] === '添加提供商'),
    true,
  )
})

test('R1 §15.2.9 — the provider delete lives in .piai-bar (owner page, end to end)', async () => {
  const harness = createHarness()
  const values = { providers: { alpha: { displayName: 'Deepseek 月卡' } } }
  const writes = []
  const snapshot = { values: values, dirty: false, saving: false, invalid: false, error: undefined }
  const chunks = {
    // v10: the page reads its primitives off the shared base chunk.
    core: harness.core,
    schema: harness.schema,
    fields: harness.fields,
    panels: harness.panels,
    form: {
      createStagedForm: () => ({
        subscribe: () => () => {},
        getSnapshot: () => snapshot,
        edit: (path, value) => writes.push({ op: 'edit', path: path, value: value }),
        remove: (path) => writes.push({ op: 'remove', path: path }),
        discard: () => {},
        save: () => {},
      }),
    },
  }
  const pageApi = await harness.owner.__internals.loadPage()
  const page = pageApi.makePage(chunks, { boundary: harness.owner.__internals.pageBoundary })
  const element = harness.react.createElement(page, {
    usePage: (selector) => selector({ envelope: harness.envelope }),
    controller: {
      getSnapshot: () => ({ value: values, revision: 1, writable: true }),
      subscribe: () => () => {},
      mutate: async () => true,
    },
    validate: () => undefined,
    t: (key) => key,
  })
  harness.render(element)
  let tree = harness.render(element)

  const bars = byClass(tree, 'piai-bar')
  assert.equal(bars.length, 1)
  const barDelete = byAttr(bars[0], 'aria-label', '删除当前提供商')[0]
  assert.ok(barDelete !== undefined, 'the destructive action is rendered inside .piai-bar')
  assert.notEqual(barDelete.props.disabled, true, 'writable + selected provider enables it')

  const strip = byClass(tree, 'piai-provider-list')[0]
  assert.ok(strip !== undefined)
  assert.equal(
    elements(strip).some((node) => /删除/.test(String(node.props['aria-label'] || ''))),
    false,
    'the tab strip renders no destructive control any more',
  )

  barDelete.props.onClick()
  tree = harness.render(element)
  const armed = byRole(byClass(tree, 'piai-bar')[0], 'group')[0]
  assert.ok(armed !== undefined, 'the bar delete keeps its two-step confirmation')
  const confirm = elements(armed).filter(
    (node) => node.type === 'button' && node.props['aria-label'] === '确认删除',
  )[0]
  assert.ok(confirm !== undefined)
  confirm.props.onClick()
  assert.deepEqual(plain(writes), [{ op: 'remove', path: ['providers', 'alpha'] }])
})

test('R1 §15.2.8 — the add tab panel is the only tabpanel while adding (owner page)', async () => {
  const harness = createHarness()
  const values = { providers: { alpha: { displayName: 'A' } } }
  const snapshot = { values: values, dirty: false, saving: false, invalid: false, error: undefined }
  const chunks = {
    // v10: the page reads its primitives off the shared base chunk.
    core: harness.core,
    schema: harness.schema,
    fields: harness.fields,
    panels: harness.panels,
    form: {
      createStagedForm: () => ({
        subscribe: () => () => {},
        getSnapshot: () => snapshot,
        edit: () => {},
        remove: () => {},
        discard: () => {},
        save: () => {},
      }),
    },
  }
  const pageApi = await harness.owner.__internals.loadPage()
  const page = pageApi.makePage(chunks, { boundary: harness.owner.__internals.pageBoundary })
  const element = harness.react.createElement(page, {
    usePage: (selector) => selector({ envelope: harness.envelope }),
    controller: {
      getSnapshot: () => ({ value: values, revision: 1, writable: true }),
      subscribe: () => () => {},
      mutate: async () => true,
    },
    validate: () => undefined,
    t: (key) => key,
  })
  harness.render(element)
  let tree = harness.render(element)
  assert.equal(byAttr(tree, 'id', 'model-extended-panel-0-alpha').length, 1, 'the provider tabpanel is real')

  const addTab = byAttr(tree, 'id', 'model-extended-tab-add')[0]
  assert.ok(addTab !== undefined)
  addTab.props.onClick()
  tree = harness.render(element)

  const panels = byRole(tree, 'tabpanel')
  assert.equal(panels.length, 1, 'exactly one tabpanel while the add tab is active')
  assert.equal(panels[0].props.id, 'model-extended-panel-add')
  const addTab2 = byAttr(tree, 'id', 'model-extended-tab-add')[0]
  assert.equal(addTab2.props['aria-selected'], true)
  assert.equal(addTab2.props.tabIndex, 0)
  // Provider tab panels are removed while adding; their aria-controls therefore
  // has no element in the DOM. Reported as an informational boundary note.
  assert.equal(byAttr(tree, 'id', 'model-extended-panel-0-alpha').length, 0)
})

// FINDING-3 — KNOWN DEVIATION, ACCEPTED / WON'T FIX (记录，不作为失败断言).
// Inactive tabs' `aria-controls` name a panel that is not in the DOM: this page
// renders only the active face, while the official plugins page keeps every
// visited panel mounted with `hidden` (/tmp/asarx/plugins.client.js:104-113).
// Changing to the official model would mount every visited provider panel, which
// conflicts with the deliberate single-face/remount-on-switch design, so it is
// recorded as accepted instead of a release blocker. The assertion below pins
// the accepted behaviour (active tab resolves; inactive tabs do not) so a future
// change of mind is visible.
test('[FINDING-3 — 已知偏离/不修] inactive tabs’ aria-controls reference an unrendered panel', { todo: 'accepted deviation: single-face rendering (official keeps visited panels hidden); see file header OBS-4/5/8 notes for T7' }, async () => {
  const harness = createHarness()
  const values = { providers: { alpha: { displayName: 'A' }, beta: { displayName: 'B' } } }
  const snapshot = { values: values, dirty: false, saving: false, invalid: false, error: undefined }
  const pageApi = await harness.owner.__internals.loadPage()
  const page = pageApi.makePage(
    {
      core: harness.core,
      schema: harness.schema,
      fields: harness.fields,
      panels: harness.panels,
      form: {
        createStagedForm: () => ({
          subscribe: () => () => {},
          getSnapshot: () => snapshot,
          edit: () => {},
          remove: () => {},
          discard: () => {},
          save: () => {},
        }),
      },
    },
    { boundary: harness.owner.__internals.pageBoundary },
  )
  const element = harness.react.createElement(page, {
    usePage: (selector) => selector({ envelope: harness.envelope }),
    controller: {
      getSnapshot: () => ({ value: values, revision: 1, writable: true }),
      subscribe: () => () => {},
      mutate: async () => true,
    },
    validate: () => undefined,
    t: (key) => key,
  })
  harness.render(element)
  const tree = harness.render(element)

  const ids = new Set(elements(tree).filter((node) => node.props.id !== undefined).map((node) => node.props.id))
  const tabs = byRole(tree, 'tab')
  const active = tabs.filter((tab) => tab.props['aria-selected'] === true)
  assert.equal(active.length, 1)
  assert.equal(active[0].props.id, 'model-extended-tab-0-alpha')
  assert.ok(ids.has(active[0].props['aria-controls']), 'the active tab panel resolves')
  for (const tab of tabs.filter((entry) => entry.props['aria-selected'] !== true)) {
    assert.equal(
      ids.has(tab.props['aria-controls']),
      false,
      'inactive tab ' + tab.props.id + ' points at ' + tab.props['aria-controls'] + ' which is absent',
    )
  }
})

// ---------------------------------------------------------------------------
// 5. invariants
// ---------------------------------------------------------------------------

const TOKEN_ALLOWLIST_23 = [
  // §2: the 14 platform colour tokens.
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
  // §10.5: the v2 additions.
  '--dsw-radius-md',
  '--dsw-alias-border-l4',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-dimmed',
  // §14: the v6 additions.
  '--dsw-alias-bg-module-platform',
  '--dsw-radius-lg',
  // §15.8: the three v7 additions.
  '--dsw-focus-ring-width',
  '--dsw-focus-ring-color',
  '--dsw-alias-label-primary-foreground',
]

function classSetFromCss(css) {
  const set = new Set()
  const source = stripComments(css)
  const re = /\.(piai-[A-Za-z0-9_-]+)/g
  let match
  while ((match = re.exec(source)) !== null) set.add(match[1])
  return set
}

function classSetFromJs(sources) {
  const set = new Set()
  for (const source of sources) {
    const re = /\bpiai-[A-Za-z0-9_-]+\b/g
    let match
    while ((match = re.exec(source)) !== null) set.add(match[0])
  }
  return set
}

function sortedSet(set) {
  return [...set].sort()
}

test('§15.8.1 — CLASSES ⇔ CSS selectors ⇔ JS literals are the same 67-name set', () => {
  const harness = createHarness()
  const exported = new Set(harness.styles.CLASSES)
  const css = classSetFromCss(harness.styles.STYLESHEET)
  // v10: the JS emitters are the whole chunk set, not two named files.
  const js = classSetFromJs(jsClassSources().map((entry) => entry.source))

  assert.equal(exported.size, 67, 'CLASSES must be 67')
  assert.deepEqual(sortedSet(css), sortedSet(exported), 'CSS selector classes must equal CLASSES')
  assert.deepEqual(sortedSet(js), sortedSet(exported), 'JS piai-* literals must equal CLASSES')
  for (const name of ['piai-item-head', 'piai-item-actions', 'piai-item-remove', 'piai-key']) {
    assert.ok(exported.has(name), 'the v7 class set must contain ' + name)
  }
  // T7: the tab strip's two-slot bar and the provider pick list are new; the
  // tier row's bare key chip retires with the Row-based tier rendering.
  for (const name of ['piai-tabs-bar', 'piai-catalog']) {
    assert.ok(exported.has(name), 'the T7 class set must contain ' + name)
  }
  assert.equal(exported.has('piai-tier-key'), false, 'T7 retires piai-tier-key')
})

test('§15.8.1 — polish FROZEN_CLASSES is the same 67-name set', () => {
  const harness = createHarness()
  const polish = read('tests/verify.polish.mjs')
  const match = polish.match(/const FROZEN_CLASSES = \[([\s\S]*?)\]/)
  assert.ok(match !== null, 'verify.polish.mjs must declare FROZEN_CLASSES')
  const frozen = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'"))
    .map((line) => line.replace(/[',]/g, ''))
  assert.deepEqual(
    sortedSet(new Set(frozen)),
    sortedSet(new Set(harness.styles.CLASSES)),
    'FROZEN_CLASSES must track the live CLASSES export (T8: +piai-tabs-bar +piai-catalog -piai-tier-key)',
  )
})

test('§15.8.2 — every --dsw-* token (comments included) is inside the 23-token allowlist', () => {
  // v10: the sheet is split into area fragments; every fragment is scanned, so
  // a token cannot hide in one of them.
  const source = ['client.styles.js', 'client.styles.chrome.js', 'client.styles.controls.js']
    .map((file) => read('lib/' + file))
    .join('\n')
  assert.equal(TOKEN_ALLOWLIST_23.length, 23)

  const used = new Set(source.match(/--dsw-[a-z0-9-]+/g) || [])
  assert.ok(used.size > 0)
  for (const token of used) {
    assert.ok(
      TOKEN_ALLOWLIST_23.includes(token),
      token + ' is outside the 23-token v7 allowlist (docs/interaction-design.md §15.8.2)',
    )
  }

  // The v7 additions must be genuinely used (§15.11).
  for (const token of [
    '--dsw-focus-ring-width',
    '--dsw-focus-ring-color',
    '--dsw-alias-label-primary-foreground',
  ]) {
    assert.ok(used.has(token), token + ' must be used')
  }

  // The four official tokens D3 refuses to import must not appear even in prose.
  for (const forbidden of [
    '--dsw-alias-bg-layer-4',
    '--dsw-alias-interactive-bg-hover',
    '--dsw-radius-sm',
    '--dsw-alias-interactive-bg-hover-danger',
    '--dsw-alias-state-business-primary',
  ]) {
    assert.equal(source.indexOf(forbidden), -1, forbidden + ' must not appear anywhere in the chunk')
  }
})

test('§15.8.3 — focus rules are exactly the four whitelisted forms, none reaching a primitive', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  const focusSelectors = []
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (/:focus-(?:within|visible)/.test(selector)) focusSelectors.push(selector)
    }
  }
  assert.deepEqual(sortedSet(new Set(focusSelectors)), [
    '.piai-root .piai-info:focus-visible',
    '.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove',
    '.piai-root .piai-provider-list [role="tab"]:focus-visible',
    '.piai-root .piai-provider-list [role="tab"]:focus-visible::after',
  ])
  for (const selector of focusSelectors) {
    assert.equal(/:focus-within/.test(selector), false, ':focus-within is forbidden: ' + selector)
    assert.ok(selector.startsWith('.piai-root .piai-'), 'only our own classes may carry focus: ' + selector)
    for (const interior of ['.piai-row-control input', '.piai-checks input', '.piai-checks label', '.piai-provider-add input', '.wrap']) {
      assert.equal(selector.indexOf(interior), -1, 'focus may not touch a primitives interior node: ' + selector)
    }
  }
  assert.ok(
    focusSelectors.some((selector) => selector === '.piai-root .piai-provider-list [role="tab"]:focus-visible'),
    'the E1 tab ring must exist',
  )
  assert.ok(
    focusSelectors.some((selector) => selector === '.piai-root .piai-info:focus-visible'),
    'the E3 help-button ring must exist',
  )
})

/** `true` when `index` falls inside a `//` or block comment line. */
function isCommentIndex(source, index) {
  const lineStart = source.lastIndexOf('\n', index) + 1
  const line = source.slice(lineStart, index).trim()
  return line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')
}

/**
 * The `function <name>(` regions of a chunk, keyed by the file's own 4-space
 * indentation, so a write can be attributed to the editor that performs it.
 *
 * The panels chunk declares every top-level component at four spaces, while the
 * callbacks nested inside them are anonymous functions — a plain
 * "innermost named function" walk would therefore attribute a write to the last
 * named *inner* helper. The indentation-anchored scan gives the enclosing
 * component instead, which is what a "may this editor write null?" question
 * needs.
 *
 * @param source - the chunk source.
 * @returns the regions, in source order, each `{name, start, end}`.
 */
/**
 * The panels layer as shipped (v10): the facade plus its modules.
 *
 * The panel guards below scan the whole layer, because a field-name literal or
 * a value-typed `null` must not be able to hide in a module the old
 * single-file scan never looked at.
 *
 * @returns `{name, source}[]`.
 */
function panelsLayerSources() {
  return [
    'client.panels.js',
    'client.panels.kit.js',
    'client.panels.controls.js',
    'client.panels.collections.js',
    'client.panels.render.js',
    'client.panels.instances.js',
    'client.panels.catalog.js',
  ].map((name) => ({ name, source: read('lib/' + name) }))
}

function functionRegions(source) {
  const re = /^ {4}function ([A-Za-z0-9_$]+)\s*\(/gm
  const marks = []
  let match
  while ((match = re.exec(source)) !== null) marks.push({ name: match[1], start: match.index })
  return marks.map((mark, index) => ({
    name: mark.name,
    start: mark.start,
    end: index + 1 < marks.length ? marks[index + 1].start : source.length,
  }))
}

/**
 * The name of the 4-space-indented function enclosing one source index.
 *
 * @param source - the chunk source.
 * @param index - an index into `source`.
 * @returns the enclosing component name, or `''` when none is found.
 */
function enclosingFunctionName(source, index) {
  const found = functionRegions(source).filter(
    (region) => region.start <= index && index < region.end,
  )
  return found.length > 0 ? found[found.length - 1].name : ''
}

test('§15.8.5 — clearing still emits unset, never a value-typed null', () => {
  const layer = panelsLayerSources()
  const panelsSource = layer.map((entry) => entry.source).join('\n')
  const collectionsSource = read('lib/client.panels.collections.js')
  const formSource = read('lib/client.form.js')

  // A value-typed `null` is legal only where the schema (or the adapter's own
  // chat-template value domain) says the value may BE null. It is therefore no
  // longer counted — the count moves whenever a nullable editor gains a call
  // site — but attributed: every `onEntry(key, null)` must sit either behind the
  // schema guard `leaf.valueNullable === true` (the dict's explicit null
  // toggle) or inside TemplateArgsControl, whose literals are nullable by
  // design (pi-ai KEEPS a null and drops an absent key).
  // v10: both nullable editors live in the collections module, so the guard is
  // resolved against that file's own function regions.
  const nullWrites = [...collectionsSource.matchAll(/onEntry\([^)]*,\s*null\)/g)]
  assert.ok(nullWrites.length > 0, 'the explicit nullable writes must still exist')
  for (const match of nullWrites) {
    const fn = enclosingFunctionName(collectionsSource, match.index)
    if (fn === 'DictControl') {
      const start = collectionsSource.lastIndexOf('function valueControls(', match.index)
      assert.ok(
        /if \(leaf\.valueNullable === true\) \{/.test(collectionsSource.slice(start, match.index)),
        'the nullable-dict write must sit behind the schema-declared nullable guard',
      )
      continue
    }
    assert.equal(
      fn,
      'TemplateArgsControl',
      'a value-typed null may only come from the nullable-dict toggle or the chat-template literal mode, not from ' +
        (fn === '' ? 'top-level code' : fn),
    )
  }
  assert.ok(
    /if \(leaf\.valueNullable === true\) \{/.test(collectionsSource),
    'the nullable write must sit behind the schema-declared nullable guard',
  )
  const editNulls = [...panelsSource.matchAll(/form\.edit\([^)]*,\s*null\s*\)/g)].filter(
    (match) => !isCommentIndex(panelsSource, match.index),
  )
  assert.deepEqual(editNulls.map((match) => match[0]), [], 'no form.edit(path, null) in code')
  assert.ok(/op: 'unset'/.test(formSource), 'the delta builder still emits unset ops')

  const harness = createHarness()
  const form = recordingForm()
  const { tree } = renderPanel(harness, form, providerValues())
  const unsetRadio = radiosOf(groupById(tree, 'piai-field-providers-alpha-api')[0]).filter(
    (radio) => radio.props.value === '__unset__',
  )[0]
  unsetRadio.props.onChange()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'api'] }])
})

test('§15.8.5 — inject/activation path is unchanged (8 services, no new dependency)', () => {
  const ownerSource = read('lib/client.js')
  const injectMatch = ownerSource.match(/var inject = \[([\s\S]*?)\]/)
  assert.ok(injectMatch !== null)
  const inject = injectMatch[1]
    .split('\n')
    .map((line) => line.trim().replace(/[',]/g, ''))
    .filter(Boolean)
  // T7 adds `remote.llm` (model discovery) after `remote.credentials`.
  assert.deepEqual(inject, [
    'slots',
    'locale',
    'remote',
    'remote.settings',
    'remote.credentials',
    'remote.llm',
    'configForms',
    'settingsSchema',
  ])

  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies, undefined, 'no runtime dependency may be added')
  assert.equal(pkg.devDependencies, undefined, 'no build-time dependency may be added')
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-settings',
  ])
})

// ---------------------------------------------------------------------------
// 6. upstream primitive signatures
// ---------------------------------------------------------------------------

const SIGNATURES = {
  // Button spreads `...rest`, so Tooltip-injected handlers/aria attributes and
  // the caller's id/aria-label are all legal.
  Button: new Set([
    'variant', 'size', 'icon', 'className', 'onClick', 'id', 'aria-label',
    'aria-describedby', 'disabled', 'onMouseEnter', 'onMouseLeave', 'onFocus', 'onBlur', 'role',
  ]),
  Input: new Set([
    'icon', 'className', 'id', 'type', 'value', 'placeholder', 'aria-label',
    'aria-describedby', 'aria-invalid', 'disabled', 'onChange', 'onKeyDown', 'step', 'min', 'max',
  ]),
  Switch: new Set(['checked', 'onChange', 'label', 'disabled', 'title', 'className']),
  Tag: new Set(['tone', 'className', 'children']),
  Pill: new Set(['active', 'className', 'children', 'onClick', 'title', 'aria-label', 'role']),
  Checkbox: new Set(['checked', 'onChange', 'label', 'disabled', 'title', 'className']),
  StateDot: new Set(['state', 'size', 'className', 'appearance']),
}

function extraProps(call, allowed) {
  return Object.keys(call.props).filter(
    (key) => key !== 'key' && key !== 'children' && !allowed.has(key),
  )
}

test('E4/E5/E9 — Tooltip, Switch, Tag, Pill, StateDot and the icons are used by signature', () => {
  const harness = createHarness()
  renderPanel(harness, recordingForm(), providerValues())
  for (const call of harness.primitiveCalls) {
    if (call.name === 'Tooltip') continue
    const allowed = SIGNATURES[call.name]
    if (allowed === undefined) continue
    assert.deepEqual(extraProps(call, allowed), [], call.name + ' received props outside its signature')
  }

  const tooltips = harness.primitiveCalls.filter((call) => call.name === 'Tooltip')
  assert.ok(tooltips.length > 0)
  for (const call of tooltips) {
    assert.deepEqual(
      extraProps(call, new Set(['label', 'shortcutKeys', 'side', 'align', 'delayMs', 'focusDelayMs', 'gap', 'disabled', 'portal', 'maxWidth', 'openOnClick'])),
      [],
      'Tooltip received props outside its signature',
    )
    assert.equal(Array.isArray(call.props.children) ? call.props.children.length : 1, 1, 'Tooltip takes one element child')
  }

  const icons = harness.primitiveCalls.filter((call) => call.name.indexOf('Icon') === 0)
  assert.ok(icons.length > 0)
  for (const call of icons) {
    assert.deepEqual(
      Object.keys(call.props).filter(
        (key) => key !== 'key' && key !== 'children' && key !== 'size' && key !== 'className',
      ),
      [],
      call.name + ' only accepts size/className',
    )
  }
})

// FINDING-1 regression guard (fixed by task-11): `Checkbox` accepts only
// {checked,onChange,label,disabled,title,className}; the old omit call passed an
// `id` the primitive silently dropped. Both live Checkbox call sites are checked.
test('E9 — every Checkbox call is strictly by signature (no dropped `id`) [FINDING-1 fixed]', () => {
  const harness = createHarness()

  // (a) the $var "关闭时省略" checkbox (inside the compat disclosures).
  const withVar = {
    providers: { alpha: { compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled' } } } } },
  }
  const variableRendered = renderPanel(harness, recordingForm(), withVar)
  const variableTree = openCompatSection(variableRendered, 5)

  // (b) the closed multi-select `input` group (CheckboxGroupControl).
  const withInput = providerValues()
  withInput.providers.alpha.models = [{ id: 'm1', input: ['text'] }]
  const inputRendered = renderPanel(harness, recordingForm(), withInput)
  const toggle = elements(inputRendered.tree).filter(
    (node) => node.type === 'button' && node.props['aria-controls'] !== undefined && node.props['aria-expanded'] === false,
  )[0]
  toggle.props.onClick()
  const inputTree = inputRendered.again()

  const checkboxCalls = harness.primitiveCalls.filter((call) => call.name === 'Checkbox')
  const omit = checkboxCalls.filter((call) => call.props.label === '关闭时省略')
  assert.equal(omit.length, 1, 'the $var omit checkbox renders')
  assert.ok(
    checkboxCalls.some((call) => String(call.props.label).indexOf('text') !== -1),
    'the closed multi-select checkboxes render too',
  )
  for (const call of checkboxCalls) {
    assert.deepEqual(
      extraProps(call, SIGNATURES.Checkbox),
      [],
      'Checkbox({checked,onChange,label,disabled,title,className}) drops extra props',
    )
  }
  assert.equal(omit[0].props.id, undefined, 'the dropped id prop is gone from the call')

  // Equivalent recomputation at the DOM and source level: the old id pattern is
  // nowhere to be found any more.
  assert.equal(
    elements(variableTree).concat(elements(inputTree)).some((node) => String(node.props.id || '').indexOf('-omit-') !== -1),
    false,
    'no DOM node carries the old -omit- id',
  )
  assert.equal(read('lib/client.panels.js').indexOf("'-omit-'"), -1, 'the -omit- id construction is gone from panels.js')
})

// ---------------------------------------------------------------------------
// 7. requirement cross-check: v8 retired DisclosureRow entirely
// ---------------------------------------------------------------------------

test('§15.4/E7 — v8: DisclosureRow is no longer resolved; the compat groups write their own head', () => {
  const harness = createHarness()
  const { tree } = renderPanel(harness, recordingForm(), providerValues())
  const calls = harness.primitiveCalls.filter((call) => call.name === 'DisclosureRow')
  assert.deepEqual(calls, [], 'v8: no DisclosureRow call may survive anywhere on the page')

  // The compat sections now reuse the instance-card head, so a section is one
  // `.piai-item-head` with a NATIVE disclosure button and no action slot.
  const disclosure = byClass(tree, 'piai-disclosure')
  assert.equal(disclosure.length, 1, 'one compat disclosure container')
  const compatHeads = byClass(disclosure[0], 'piai-item-head')
  assert.equal(compatHeads.length, 6, 'one self-written head per frozen compat section')
  const toggles = elements(disclosure[0]).filter(
    (node) => node.type === 'button' && node.props['aria-expanded'] !== undefined,
  )
  assert.equal(toggles.length, 6, 'one native disclosure button per section')
  for (const toggle of toggles) {
    assert.equal(typeof toggle.props['aria-controls'], 'string')
    assert.equal(toggle.props['aria-expanded'], false, 'sections start collapsed')
  }
  assert.equal(
    byClass(disclosure[0], 'piai-item-remove').length,
    0,
    'a compat section has no destructive action (actions: [])',
  )
  // Instance cards still use the same head, and they do carry the delete.
  const instanceRemove = byClass(tree, 'piai-array-row').concat(byClass(tree, 'piai-dict-row'))
  assert.ok(
    instanceRemove.every((card) => byClass(card, 'piai-item-remove').length === 1),
    'each instance card keeps its permanent remove button',
  )
})
