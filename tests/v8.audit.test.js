/**
 * T6 (v8) — adversarial audit: checkbox label visibility / branch-parameter
 * block / compat disclosure head, plus the v8 invariants.
 *
 * Owned by `verifier-2`. It never edits `lib/`: it recomputes the v8 contract
 * (docs/interaction-design.md §16) from the shipped bytes and turns every
 * machine-checkable clause into an assertion.
 *
 * Reproduce:
 *
 *   node --test tests/v8.audit.test.js
 *
 * The layout half of R1 (and the body/title alignment of R3) can only be seen
 * by a real browser, so it is measured OUTSIDE this file, with an independently
 * built Chromium fixture under /tmp/piai-audit (NOT T5's tests/layout fixture):
 *
 *   node /tmp/piai-audit/build.mjs --out /tmp/piai-audit/f-real2.html       # real sheet
 *   node /tmp/piai-audit/build.mjs --out /tmp/piai-audit/f-v7state.html \
 *        --strip-not --no-pin --old-span                                    # v7 state
 *   node /tmp/piai-audit/render-fixture.mjs                                 # real chunk render
 *   ego-browser nodejs < /tmp/piai-audit/measure.mjs                        # writes measurements.json
 *   ego-browser nodejs < /tmp/piai-audit/measure-real.mjs                   # writes measurements-real.json
 *
 * When those artifacts exist, the browser layer is asserted here too (the
 * `R1/R3 browser layout` tests); otherwise those two tests are skipped so the
 * file stays runnable anywhere.
 *
 * Sections:
 *   1. R1 narrowed text-input rule + pinned checkbox + span   (tests 1–5)
 *   2. R2 .piai-nested rail removal + dynamic branch title    (tests 6–8)
 *   3. R3 compat self-written head / permanent bodies         (tests 9–13)
 *   4. invariants: classes, tokens, focus, writes, inject      (tests 14–19)
 *   5. upstream primitive signatures + actions no-op           (tests 20–22)
 *   6. browser layout bridge (real Chromium artifact)          (tests 23–24)
 *
 * Notes handed to T5 / T7:
 *   - T5 W8/W9 own `tests/verify.polish.mjs` `FROZEN_CLASSES` (still lists
 *     `piai-count`, still misses `piai-disclosure-body`) and the `piai-count`
 *     badge assertion; test 15 marks itself `todo` while that migration is in
 *     flight and flips green automatically once T5 lands it.
 *   - FINDING-V8-1 (no assertion, reported): the `:not([type=…])` exclusion
 *     makes the narrowed rule (0,4,1) OUTRANK the pin (0,2,2) for an `<input>`
 *     with no `type` attribute. The shipped Checkbox always emits
 *     `type="checkbox"`, so this is only reachable through the degraded
 *     `primitive('Checkbox', 'input')` fallback; measured 216px wide vs 16px
 *     in /tmp/piai-audit/f-real2.html (see the report).
 */

import { readFileSync, existsSync } from 'node:fs'
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
const BROWSER_FIXTURES = '/tmp/piai-audit/measurements.json'
const BROWSER_RENDER = '/tmp/piai-audit/measurements-real.json'

const read = (relative) => readFileSync(join(ROOT, relative), 'utf8')

// ---------------------------------------------------------------------------
// tree helpers (cross-realm safe: the chunks run inside a vm sandbox)
// ---------------------------------------------------------------------------

function elements(tree) {
  const out = []
  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node !== 'object' || node.type === undefined) return
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

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// harness: real schema/fields/panels chunks over faithful primitive stand-ins
// ---------------------------------------------------------------------------

function createHarness() {
  const registrations = []
  const primitiveCalls = []
  const disclosureRowRequests = { count: 0 }
  const cellsByType = new Map()
  const counters = new Map()
  const pendingEffects = []
  let current = null

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
          title: props.title,
          'aria-label': props['aria-label'],
          'aria-describedby': props['aria-describedby'],
          disabled: props.disabled === true,
          onChange: props.onChange,
        }),
      )
    },
    Checkbox(props) {
      record('Checkbox', props)
      return react.createElement('label', { className: 'checkbox', title: props.title }, [
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
      })
    },
    Pill(props) {
      record('Pill', props)
      if (typeof props.onClick !== 'function') {
        return react.createElement('span', { className: props.className }, props.children)
      }
      return react.createElement(
        'button',
        { type: 'button', className: props.className, 'aria-label': props['aria-label'], onClick: props.onClick },
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
      return child
    },
    // Present but must never be requested: v8 removed the binding (§16.5 W2).
    DisclosureRow(props) {
      disclosureRowRequests.count += 1
      record('DisclosureRow', props)
      return react.createElement('div', { className: props.className }, props.children)
    },
  }

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

  // W7 shape coverage: keep the memo/forwardRef resolution path exercised now
  // that DisclosureRow (the old memo carrier) is gone.
  for (const [name, kind] of [
    ['Button', 'forwardRef'],
    ['Input', 'forwardRef'],
    ['Tooltip', 'memo'],
    ['StateDot', 'memo'],
  ]) {
    const render = primitives[name]
    primitives[name] =
      kind === 'forwardRef'
        ? { $$typeof: Symbol.for('react.forward_ref'), render }
        : { $$typeof: Symbol.for('react.memo'), type: render }
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

  const seeds = { react, '@deepseek-ai/dsh-client-ui-primitives': primitives }
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error('v8 audit: unexpected seed require(' + JSON.stringify(specifier) + ')')
  }

  const load = (fileName) => {
    const before = registrations.length
    runInContext(readFileSync(join(LIB, fileName), 'utf8'), sandbox, { filename: join(LIB, fileName) })
    assert.equal(registrations.length, before + 1, fileName + ' must register exactly once')
    return registrations[registrations.length - 1].factory(requireStub)
  }

  const core = load('client.core.js')
  const schema = load('client.schema.js')
  load('client.fields.groups.js')
  load('client.fields.hints.js')
  const fields = load('client.fields.js')
  // v10: the panels facade composes the six panels modules out of the
  // registry, so they are materialised first (the owner's phase order).
  load('client.panels.kit.js')
  load('client.panels.controls.js')
  load('client.panels.collections.js')
  load('client.panels.render.js')
  load('client.panels.instances.js')
  load('client.panels.catalog.js')
  const panels = load('client.panels.js')
  // v10: the sheet is composed from two area fragments, so they load first.
  load('client.styles.chrome.js')
  load('client.styles.controls.js')
  const styles = load('client.styles.js')

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

  function render(node) {
    counters.clear()
    pendingEffects.length = 0
    const tree = renderNode(node)
    while (pendingEffects.length > 0) {
      const callback = pendingEffects.shift()
      callback()
    }
    return tree
  }

  return {
    react,
    render,
    schema,
    fields,
    panels,
    styles,
    primitiveCalls,
    disclosureRowRequests,
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

function providerValues() {
  return {
    providers: {
      alpha: {
        displayName: 'Deepseek 月卡',
        api: 'openai-completions',
        models: [{ id: 'm1' }, { id: 'm2', name: 'Pro' }],
        modelOverrides: { 'gpt-x': { contextWindow: 200000 } },
      },
    },
  }
}

function renderPanel(harness, form, values, groupOverride, fieldsOverride) {
  const root = harness.schema.node(harness.envelope, harness.envelope.uid)
  const providers = harness.schema.node(harness.envelope, root.dict.providers)
  const providerRef = providers.inner
  const leaves = harness.schema.leaves(harness.envelope, providerRef, ['providers', 'alpha'])
  const fields = fieldsOverride !== undefined ? fieldsOverride : harness.fields
  const groups = groupOverride !== undefined ? groupOverride : harness.fields.groupLeaves(leaves)
  const props = {
    form,
    schema: harness.schema,
    fields,
    envelope: harness.envelope,
    values,
    provider: 'alpha',
    providerNames: ['alpha'],
    groups,
    options: { schema: harness.schema, fields, envelope: harness.envelope, values },
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

/** The compat disclosure section toggles, in DOM order. */
function disclosureToggles(tree) {
  return elements(tree).filter(
    (node) =>
      node.type === 'button' &&
      node.props['aria-controls'] !== undefined &&
      node.props['aria-expanded'] !== undefined &&
      byClass(tree, 'piai-disclosure').some((block) => elements(block).indexOf(node) !== -1),
  )
}

function hasClass(node, name) {
  return String(node.props.className || '')
    .split(/\s+/)
    .filter(Boolean)
    .includes(name)
}

// ---------------------------------------------------------------------------
// CSS helpers
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

function rulesFor(rules, selector) {
  return rules.filter((rule) => rule.selectors.includes(selector))
}

function ruleDeclarations(rules, selector) {
  const found = rulesFor(rules, selector)
  assert.ok(found.length >= 1, 'no rule for selector ' + selector)
  return found.map((rule) => declarations(rule.body)).flat()
}

function claim(rules, selector, declaration, label) {
  const decls = ruleDeclarations(rules, selector)
  assert.ok(
    decls.some((entry) => entry === norm(declaration)),
    label + ': ' + selector + ' must declare ' + JSON.stringify(declaration) + '; got ' + JSON.stringify(decls),
  )
}

/**
 * CSS specificity as [a=id, b=class/attr/pseudo-class, c=type/pseudo-element].
 *
 * `:not()` itself adds nothing but its argument does (CSS Selectors 4), which is
 * exactly the arithmetic behind §16.2's `(0,4,1)` vs `(0,2,2)` argument.
 */
function specificity(selector) {
  let rest = selector
  let a = 0
  let b = 0
  let c = 0
  rest = rest.replace(/:not\(([^()]*)\)/g, (_match, inner) => {
    const innerSpec = specificity(inner)
    a += innerSpec[0]
    b += innerSpec[1]
    c += innerSpec[2]
    return ' '
  })
  const pseudoElements = rest.match(/::[\w-]+/g) || []
  c += pseudoElements.length
  rest = rest.replace(/::[\w-]+/g, ' ')
  const pseudoClasses = rest.match(/(?<!:):[\w-]+(\([^)]*\))?/g) || []
  b += pseudoClasses.length
  rest = rest.replace(/(?<!:):[\w-]+(\([^)]*\))?/g, ' ')
  const attrs = rest.match(/\[[^\]]*\]/g) || []
  b += attrs.length
  rest = rest.replace(/\[[^\]]*\]/g, ' ')
  const classes = rest.match(/\.[\w-]+/g) || []
  b += classes.length
  rest = rest.replace(/\.[\w-]+/g, ' ')
  const ids = rest.match(/#[\w-]+/g) || []
  a += ids.length
  rest = rest.replace(/#[\w-]+/g, ' ')
  const types = rest.match(/\b[a-zA-Z][\w-]*\b/g) || []
  c += types.length
  return [a, b, c]
}

const WIDE_SELECTOR = '.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"])'
const PIN_SELECTOR = '.piai-root .piai-checks > label > input'
const SELECT_SPAN = '.piai-root .piai-select > label > span'
const CHECKS_SPAN = '.piai-root .piai-checks > label > span'

// ---------------------------------------------------------------------------
// 1. R1 — checkbox label visibility
// ---------------------------------------------------------------------------

test('R1 §16.2.1 — the v2 stretch rule is narrowed to non-checkbox/radio inputs', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  const found = rulesFor(rules, WIDE_SELECTOR)
  assert.equal(found.length, 1, 'exactly one narrowed stretch rule')
  for (const declaration of ['width: 100%', 'min-width: 0', 'box-sizing: border-box']) {
    claim(rules, WIDE_SELECTOR, declaration, 'R1.1 stretch')
  }
  // The old open-ended selector must be gone entirely.
  const openEnded = rules.filter((rule) =>
    rule.selectors.some((selector) => selector === '.piai-root .piai-row-control input'),
  )
  assert.deepEqual(openEnded, [], 'no rule may still match every input in the control row')

  assert.deepEqual(specificity(WIDE_SELECTOR), [0, 4, 1], 'the narrowed rule is (0,4,1)')
  assert.deepEqual(specificity(PIN_SELECTOR), [0, 2, 2], 'the pin is (0,2,2)')
})

test('R1 §16.2.2 — the primitives checkbox is pinned to 16px inside .piai-checks', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  for (const declaration of ['flex: none', 'width: 16px', 'min-width: 16px', 'height: 16px']) {
    claim(rules, PIN_SELECTOR, declaration, 'R1.2 pin (E9 size)')
  }
  // §16.2 "not in this change": the enum radio keeps its own 16px rule.
  for (const declaration of ['width: 16px', 'height: 16px']) {
    claim(rules, '.piai-root .piai-select input', declaration, 'R4 radio box')
  }
  // The pin outranks the primitives own `.checkbox input` (0,1,1).
  assert.deepEqual(specificity('.checkbox input'), [0, 1, 1])
  assert.ok(
    specificity(PIN_SELECTOR)[1] > specificity('.checkbox input')[1],
    'the pin must outrank the primitives own input rule',
  )
})

test('R1 §16.2.3 — the checks span can no longer collapse silently', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  const checksDecls = ruleDeclarations(rules, CHECKS_SPAN)
  assert.ok(checksDecls.includes('white-space: nowrap'), 'the checks span keeps nowrap')
  for (const decl of checksDecls) {
    assert.equal(/^min-width/.test(decl), false, 'the checks span must not set min-width: ' + decl)
    assert.equal(/^overflow/.test(decl), false, 'the checks span must not set overflow: ' + decl)
    assert.equal(/^text-overflow/.test(decl), false, 'the checks span must not set text-overflow: ' + decl)
  }
  assert.equal(
    /\b(?:min-width|overflow|text-overflow)\s*:/.test(norm(rulesFor(rules, CHECKS_SPAN)[0].body)),
    false,
    'the whole rule body must be just nowrap',
  )

  // §16.2 explicitly leaves the enum option span alone (its input is not stretched).
  const selectDecls = ruleDeclarations(rules, SELECT_SPAN)
  assert.ok(selectDecls.includes('min-width: 0'), 'the enum option span keeps its ellipsis machinery')
  assert.ok(selectDecls.includes('overflow: hidden'))
  assert.ok(selectDecls.includes('text-overflow: ellipsis'))
})

test('R1 §16.2 影响面 — defaultInput and the dict omitWhenOff checkbox share the fixed shape', () => {
  const harness = createHarness()
  const form = recordingForm()

  // Provider-level defaultInput: a CheckboxGroupControl rendered without any card.
  const values = { providers: { alpha: { defaultInput: ['text'] } } }
  const rendered = renderPanel(harness, form, values)
  const group = byAttr(rendered.tree, 'id', 'piai-field-providers-alpha-defaultInput')[0]
  assert.ok(group !== undefined, 'defaultInput renders a .piai-checks group')
  // Root-cause impact area: the group must sit inside .piai-row-control (panels:466).
  assert.equal(
    byClass(rendered.tree, 'piai-row-control').filter(
      (control) => byAttr(control, 'id', 'piai-field-providers-alpha-defaultInput').length === 1,
    ).length,
    1,
    'defaultInput lives inside .piai-row-control',
  )
  assert.equal(hasClass(group, 'piai-checks'), true)
  const labels = elements(group).filter((node) => node.type === 'label')
  assert.equal(labels.length, 2, 'one label per closed option')
  for (const label of labels) {
    const input = elements(label).filter((node) => node.type === 'input')[0]
    const span = elements(label).filter((node) => node.type === 'span')[0]
    assert.equal(input.props.type, 'checkbox', 'the control is a native checkbox (E9)')
    assert.ok(span !== undefined && plainText(span) !== '', 'the label text is rendered')
  }

  // Dict omitWhenOff: same Checkbox primitive, v8-fixed by the same rule.
  const withVar = { providers: { alpha: { compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled' } } } } } }
  const varRendered = renderPanel(harness, recordingForm(), withVar)
  const toggles = disclosureToggles(varRendered.tree)
  assert.equal(toggles.length, 6, 'the compat group has six disclosures')
  toggles[5].props.onClick()
  const varTree = varRendered.again()
  const omit = harness.primitiveCalls.filter((call) => call.name === 'Checkbox' && call.props.label === '关闭时省略')
  assert.equal(omit.length, 1, 'the omitWhenOff checkbox renders')
  assert.equal(
    byAttr(varTree, 'id', 'piai-field-providers-alpha-compat-chatTemplateArgs-var-sys').length,
    1,
    'the $var enum row is the one carrying the omit checkbox',
  )
  assert.equal(
    byClass(varTree, 'piai-row-control').filter(
      (control) => byAttr(control, 'id', 'piai-field-providers-alpha-compat-chatTemplateArgs-var-sys').length === 1,
    ).length,
    1,
    'the omitWhenOff row also lives inside .piai-row-control (same root cause)',
  )
  assert.equal(
    elements(varTree).some((node) => node.type === 'label' && byClass(node, 'checkbox').length === 1),
    true,
    'the omit checkbox uses the primitives label.checkbox shape',
  )
})

// ---------------------------------------------------------------------------
// 1b. E — the chat-template dict row: one key, one mode, literal/null/$var
// ---------------------------------------------------------------------------

test('E — a template dict row names its key once, switches literal/$var, and writes null vs unset', () => {
  const harness = createHarness()
  const form = recordingForm()
  const FIELD = 'piai-field-providers-alpha-compat-chatTemplateArgs'
  const PATH = ['providers', 'alpha', 'compat', 'chatTemplateArgs']
  // Two keys: with two, "remove one key" and "clear the whole field" are
  // different observations, so the write semantics cannot be confused.
  const values = {
    providers: { alpha: { compat: { chatTemplateArgs: { sys: 'literal-a', user: 'keep' } } } },
  }

  // The harness keeps component state across renders, so every re-render goes
  // through `rendered.again()` (which reuses the element whose props carry
  // `values`). Opening the 模板与路由 section is done exactly once.
  const rendered = renderPanel(harness, form, values)
  disclosureToggles(rendered.tree)[5].props.onClick()
  const rowOf = (tree, key) =>
    byClass(tree, 'piai-dict-row').filter((row) =>
      byClass(row, 'piai-dict-key').some((chip) => plainText(chip) === key),
    )[0]

  const tree = rendered.again()
  const rows = byClass(tree, 'piai-dict-row')
  assert.equal(rows.length, 2, 'one row per key')
  const sys = rowOf(tree, 'sys')
  assert.ok(sys !== undefined, 'the sys row renders')

  // (1) The key is named exactly once inside its row (no chip + label echo).
  // Counted on each node's OWN text, not its subtree: a wrapping label would
  // otherwise report the chip's text a second time. The harness encodes text as
  // `#text` nodes (see `plainText`), so those are what "own text" collects.
  const ownText = (node) =>
    (Array.isArray(node.children) ? node.children : [])
      .filter((child) => child !== null && typeof child === 'object' && child.type === '#text')
      .map((child) => String(child.text === undefined ? '' : child.text))
      .join('')
      .trim()
  assert.equal(
    elements(sys).filter((node) => ownText(node) === 'sys').length,
    1,
    'the key name appears exactly once in its row',
  )
  assert.equal(byClass(sys, 'piai-dict-key').length, 1, 'exactly one raw-key chip per row')

  // (2) The mode control is a two-option radiogroup: 字面值 / $var 变量.
  const modeGroup = byAttr(sys, 'id', FIELD + '-mode-sys')[0]
  assert.ok(modeGroup !== undefined, 'the row carries a mode radiogroup')
  assert.equal(modeGroup.props.role, 'radiogroup')
  assert.deepEqual(
    elements(modeGroup)
      .filter((node) => node.type === 'input')
      .map((radio) => radio.props.value),
    ['literal', 'var'],
    'the mode group offers exactly literal and var',
  )
  assert.deepEqual(
    elements(modeGroup)
      .filter((node) => node.type === 'label')
      .map((label) => plainText(label)),
    ['字面值', '$var 变量'],
  )
  assert.equal(
    elements(modeGroup)
      .filter((node) => node.type === 'input' && node.props.checked === true)[0].props.value,
    'literal',
    'a string value selects the literal mode',
  )

  // (3) The mode ⓘ trigger is described by its own id and its bubble explains
  //     the two modes: the field hint first, then one line per mode.
  const modeInfo = byAttr(sys, 'id', FIELD + '-mode-sys-info')[0]
  assert.ok(modeInfo !== undefined, 'the mode group carries an ⓘ trigger')
  assert.ok(hasClass(modeInfo, 'piai-info'), 'the trigger is the shared piai-info button')
  const modeTooltip = harness.primitiveCalls
    .filter((call) => call.name === 'Tooltip')
    .find((call) => {
      const child = Array.isArray(call.props.children) ? call.props.children[0] : call.props.children
      return child !== undefined && child !== null && child.props?.id === FIELD + '-mode-sys-info'
    })
  assert.ok(modeTooltip !== undefined, 'the mode trigger is wrapped in a Tooltip')
  // T20 contract: the bubble is one top-level scoped wrapper span —
  //   [ span.piai-root > (span(hint), span(line)*, code.piai-key?) ]
  // — with no <br> separators, so the lines are collected by walking the
  // wrapper (its children are a single array argument), not from the flat label.
  const modeLabel = Array.isArray(modeTooltip.props.label) ? modeTooltip.props.label : []
  assert.equal(modeLabel.length, 1, 'the mode bubble is exactly one top-level node')
  const modeWrapper = modeLabel[0]
  assert.equal(modeWrapper && modeWrapper.type, 'span', 'the mode wrapper is a span')
  assert.ok(hasClass(modeWrapper, 'piai-root'), 'the mode wrapper re-enters the .piai-root scope')
  const modeParts = elements(modeWrapper).filter((node) => node !== modeWrapper)
  assert.equal(
    modeParts.filter((node) => node.type === 'br').length,
    0,
    'T20: the mode bubble carries no <br> separators',
  )
  const modeSpans = modeParts.filter((node) => node.type === 'span')
  assert.ok(modeSpans.length >= 2, 'the mode bubble explains both modes, not just the field hint')
  for (const line of modeSpans) {
    assert.ok(plainText(line).trim() !== '', 'a mode bubble line must not be empty')
    assert.ok(/[\u4e00-\u9fff]/.test(plainText(line)), 'a mode bubble line must be Chinese')
  }

  // (4) Literal mode: a text input plus the explicit null button.
  const literalInput = byAttr(sys, 'id', FIELD + '-literal-sys')[0]
  assert.ok(literalInput !== undefined, 'literal mode renders a text input')
  assert.equal(literalInput.props.type, 'text')
  const nullButton = elements(sys).filter(
    (node) => node.type === 'button' && node.props.className === 'piai-clear',
  )[0]
  assert.ok(nullButton !== undefined, 'the literal row carries a piai-clear null button')
  assert.equal(nullButton.props['aria-pressed'], false, 'a literal value is not the literal null')
  assert.equal(plainText(nullButton), 'null')

  // (5) Write semantics.
  // An emptied literal removes its key — with a sibling left, that is a key
  // deletion, not a whole-field unset.
  literalInput.props.onChange({ target: { value: '' } })
  assert.deepEqual(
    plain(form.writes),
    [{ op: 'edit', path: PATH, value: { user: 'keep' } }],
    'clearing the input deletes just that key',
  )

  form.writes.length = 0
  const nullRow = rowOf(rendered.again(), 'sys')
  elements(nullRow)
    .filter((node) => node.type === 'button' && node.props.className === 'piai-clear')[0]
    .props.onClick()
  assert.deepEqual(
    plain(form.writes),
    [{ op: 'edit', path: PATH, value: { sys: null, user: 'keep' } }],
    'the null button writes a literal null (pi-ai keeps it)',
  )

  form.writes.length = 0
  const varMode = byAttr(rowOf(rendered.again(), 'sys'), 'id', FIELD + '-mode-sys')[0]
  elements(varMode)
    .filter((node) => node.type === 'input' && node.props.value === 'var')[0]
    .props.onChange()
  assert.deepEqual(
    plain(form.writes),
    [{ op: 'edit', path: PATH, value: { sys: { $var: 'thinking.enabled', omitWhenOff: true }, user: 'keep' } }],
    'switching to var seeds the first placeholder with omitWhenOff',
  )

  // (6) Var mode renders the placeholder radios and the 关闭时省略 checkbox.
  // A separate harness, because the stored value differs from `values`.
  const varValues = {
    providers: {
      alpha: { compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled', omitWhenOff: true }, user: 'keep' } } },
    },
  }
  const varHarness = createHarness()
  const varRendered = renderPanel(varHarness, recordingForm(), varValues)
  disclosureToggles(varRendered.tree)[5].props.onClick()
  const storedTree = varRendered.again()
  const storedRow = rowOf(storedTree, 'sys')
  const varGroup = byAttr(storedRow, 'id', FIELD + '-var-sys')[0]
  assert.ok(varGroup !== undefined, 'var mode renders the placeholder radiogroup')
  assert.deepEqual(
    elements(varGroup)
      .filter((node) => node.type === 'input')
      .map((radio) => radio.props.value),
    ['thinking.enabled', 'thinking.effort', 'thinking.budget'],
    'the three documented placeholders are offered',
  )
  assert.equal(
    elements(storedRow).some(
      (node) => node.type === 'label' && plainText(node).indexOf('关闭时省略') !== -1,
    ),
    true,
    'the omitWhenOff checkbox label is unchanged',
  )
  assert.equal(
    byAttr(storedRow, 'id', FIELD + '-literal-sys').length,
    0,
    'var mode does not also render the literal editor',
  )
})

// ---------------------------------------------------------------------------
// 2. R2 — branch parameter block
// ---------------------------------------------------------------------------

test('R2 §16.3.1 — .piai-nested drops the left rail', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  const decls = ruleDeclarations(rules, '.piai-root .piai-nested')
  for (const decl of decls) {
    assert.equal(/^border-left/.test(decl), false, '.piai-nested must not draw a left border: ' + decl)
    assert.equal(/^padding-left/.test(decl), false, '.piai-nested must not add left padding: ' + decl)
    assert.equal(/^border\b/.test(decl), false, '.piai-nested must not draw any border: ' + decl)
  }
  assert.ok(decls.includes('gap: var(--piai-space-2)'), 'spacing alone separates the block')
  claim(rules, '.piai-root .piai-nested-title', 'font-size: var(--piai-font-sm)', 'nested title style')
})

test('R2 §16.3.2 — the nested title names the branch the selector picked', () => {
  const harness = createHarness()

  // Real retryPolicy branches, real presentation table.
  const normal = renderPanel(harness, recordingForm(), {
    providers: { alpha: { retryPolicy: { mode: 'normal', maxRetries: 2 } } },
  })
  assert.equal(
    plainText(byClass(normal.tree, 'piai-nested-title')[0]).trim(),
    'normal（按次数重试）的参数',
    'the normal branch is named by its Chinese branch label',
  )

  const always = renderPanel(harness, recordingForm(), {
    providers: { alpha: { retryPolicy: { mode: 'always' } } },
  })
  assert.equal(plainText(byClass(always.tree, 'piai-nested-title')[0]).trim(), 'always（总是重试）的参数')
})

test('R2 §16.3.2 — the fallback wording and the structural pending branch', () => {
  const harness = createHarness()

  // (a) branchLabelFor missing / returning empty -> generic wording.
  const noLabelFields = Object.assign({}, harness.fields, { branchLabelFor: () => '' })
  const noLabel = renderPanel(
    harness,
    recordingForm(),
    { providers: { alpha: { retryPolicy: { mode: 'normal', maxRetries: 2 } } } },
    undefined,
    noLabelFields,
  )
  assert.equal(
    plainText(byClass(noLabel.tree, 'piai-nested-title')[0]).trim(),
    '分支参数',
    'an unlabelled branch falls back to 分支参数',
  )

  // (b) a structural branch (value === undefined) with deeper leaves: pending
  // must both reveal the body and name itself in the title.
  const synthUnion = {
    kind: 'union',
    path: ['providers', 'alpha', 'synthUnion'],
    node: { meta: {} },
    required: false,
    discriminator: undefined,
    branches: [
      { kind: 'const', value: false, label: '不使用' },
      { kind: 'object', value: undefined, ref: 999, label: '结构分支' },
    ],
  }
  const deeper = [
    {
      kind: 'integer',
      path: ['providers', 'alpha', 'synthUnion', 'deep'],
      node: { meta: {} },
      required: false,
    },
  ]
  const synthSchema = Object.assign({}, harness.schema, {
    leaves: (envelope, ref) => (ref === 999 ? deeper : harness.schema.leaves(envelope, ref)),
  })
  const synthFields = Object.assign({}, harness.fields, {
    branchLabelFor: (leaf, branch) => (branch.value === undefined ? '结构分支' : '不使用'),
  })
  const writes = recordingForm()
  const values = { providers: { alpha: { synthUnion: false } } }
  const props = {
    form: writes,
    schema: synthSchema,
    fields: synthFields,
    envelope: harness.envelope,
    values,
    provider: 'alpha',
    providerNames: ['alpha'],
    groups: [{ id: 'misc', title: '其他', leaves: [synthUnion] }],
    options: { schema: synthSchema, fields: synthFields, envelope: harness.envelope, values },
    locale: 'dsh-llm-pi-ai-config',
    onSelect() {},
    onAdd() {},
    onRemove() {},
  }
  const element = harness.react.createElement(harness.panels.ProviderPanel, props)
  let tree = harness.render(element)
  const group = byAttr(tree, 'id', 'piai-field-providers-alpha-synthUnion')[0]
  assert.ok(group !== undefined, 'the synthetic union renders a selector')
  assert.equal(byClass(tree, 'piai-nested').length, 0, 'the const branch has no nested block')

  const radios = elements(group).filter((node) => node.type === 'input' && node.props.type === 'radio')
  radios.filter((radio) => radio.props.value === 'kind:object')[0].props.onChange()
  assert.deepEqual(plain(writes.writes), [], 'selecting a structural branch persists nothing')
  tree = harness.render(element)
  assert.equal(plainText(byClass(tree, 'piai-nested-title')[0]).trim(), '结构分支的参数', 'the pending branch titles the block')
  assert.ok(byClass(tree, 'piai-nested').length === 1, 'the pending branch reveals its body')
})

// ---------------------------------------------------------------------------
// 3. R3 — compat disclosure head
// ---------------------------------------------------------------------------

/**
 * The panels layer as shipped (v10): the facade plus its modules, concatenated.
 *
 * @returns the layer's source text.
 */
function panelsLayerSource() {
  return [
    'client.panels.js',
    'client.panels.kit.js',
    'client.panels.controls.js',
    'client.panels.collections.js',
    'client.panels.render.js',
    'client.panels.instances.js',
    'client.panels.catalog.js',
  ]
    .map((name) => read('lib/' + name))
    .join('\n')
}

test('R3 §16.4.1/4 — compat uses the self-written head, never DisclosureRow, with no count badge', () => {
  // v10: the whole panels layer, so a regression cannot hide in a module.
  const source = panelsLayerSource()
  assert.equal(/h\(\s*DisclosureRow/.test(source), false, 'no h(DisclosureRow, …)')
  assert.equal(/primitive\(\s*'DisclosureRow'/.test(source), false, 'no DisclosureRow binding')
  assert.equal(/FallbackDisclosureRow/.test(source), false, 'the fallback is deleted')

  const harness = createHarness()
  const rendered = renderPanel(harness, recordingForm(), providerValues())
  assert.equal(harness.disclosureRowRequests.count, 0, 'the compat render must never request DisclosureRow')
  assert.equal(byClass(rendered.tree, 'piai-count').length, 0, 'the count badge is gone from the DOM')

  const head = byClass(byClass(rendered.tree, 'piai-disclosure')[0], 'piai-item-head')
  assert.equal(head.length, 6, 'one self-written head per compat section')
  for (const node of head) {
    const button = elements(node).filter((entry) => entry.type === 'button')[0]
    assert.equal(button.props.type, 'button', 'the row is a native button')
    assert.equal(button.props['aria-expanded'], false, 'sections start collapsed')
    assert.equal(typeof button.props['aria-controls'], 'string')
    assert.equal(plainText(button).indexOf('('), -1, 'the title carries no (n) count')
    assert.equal(/\d/.test(plainText(button)), false, 'and no bare number either')
  }
})

test('R3 §16.4.5/7 — bodies are permanent and hidden; fields mount only when open; ids are index-derived', () => {
  const harness = createHarness()
  const form = recordingForm()
  const rendered = renderPanel(harness, form, providerValues())
  let tree = rendered.tree

  const bodies = byClass(tree, 'piai-disclosure-body')
  assert.equal(bodies.length, 6, 'all six bodies stay in the DOM')
  for (const body of bodies) {
    assert.equal(body.props.hidden, true, 'collapsed bodies are hidden, not removed')
    assert.equal(typeof body.props.id, 'string')
    assert.equal(byClass(body, 'piai-row').length, 0, 'a collapsed body mounts no field row')
  }
  const ids = bodies.map((body) => body.props.id)
  assert.deepEqual(ids, [
    'piai-field-compat-section-0-body',
    'piai-field-compat-section-1-body',
    'piai-field-compat-section-2-body',
    'piai-field-compat-section-3-body',
    'piai-field-compat-section-4-body',
    'piai-field-compat-section-5-body',
  ], 'ids come from the index, so Chinese titles cannot collide')
  assert.equal(new Set(ids).size, 6, 'ids are unique')

  // Every aria-controls resolves to one of those bodies.
  for (const button of disclosureToggles(tree)) {
    assert.equal(ids.includes(button.props['aria-controls']), true, 'aria-controls has a real target')
  }

  const fieldsBefore = byClass(tree, 'piai-fields').length
  disclosureToggles(tree)[0].props.onClick()
  tree = rendered.again()
  const expandedBody = byAttr(tree, 'id', ids[0])[0]
  assert.equal(expandedBody.props.hidden, false, 'expanding clears the hidden flag (React omits the attribute)')
  assert.ok(byClass(expandedBody, 'piai-row').length >= 1, 'the open body renders its rows')
  assert.equal(byClass(tree, 'piai-fields').length, fieldsBefore + 1, 'exactly one field block mounts')
  assert.equal(byClass(tree, 'piai-count').length, 0, 'still no badge')
})

test('R3 §16.4 — .piai-item-head is shared: instance cards keep their delete, compat has no actions', () => {
  const harness = createHarness()
  const rendered = renderPanel(harness, recordingForm(), providerValues())

  const disclosure = byClass(rendered.tree, 'piai-disclosure')[0]
  const compatHeads = byClass(disclosure, 'piai-item-head')
  assert.equal(compatHeads.length, 6, 'compat heads, scoped to the disclosure container')
  for (const head of compatHeads) {
    assert.equal(byClass(head, 'piai-item-actions').length, 0, 'actions: [] renders no action slot')
    assert.equal(byClass(head, 'piai-item-remove').length, 0, 'compat has no destructive control')
  }

  const allHeads = byClass(rendered.tree, 'piai-item-head')
  const cardHeads = allHeads.filter((head) => compatHeads.indexOf(head) === -1)
  assert.equal(cardHeads.length, 3, '2 model cards + 1 modelOverrides card')
  assert.equal(allHeads.length, 9, 'aggregate count is 3 instance + 6 compat')
  for (const head of cardHeads) {
    assert.equal(byClass(head, 'piai-item-actions').length, 1, 'instance heads keep the action slot')
    assert.equal(byClass(head, 'piai-item-remove').length, 1, 'and the delete icon')
  }
})

test('R3 §16.4.2 — the chevron is constantly visible, right collapsed / down expanded, size 14', () => {
  const harness = createHarness()
  const rendered = renderPanel(harness, recordingForm(), providerValues())
  let tree = rendered.tree

  const iconCalls = (name) => harness.primitiveCalls.filter((call) => call.name === name).length
  assert.equal(iconCalls('IconChevronRightOutlineRegular'), 9, '3 instance + 6 compat all start collapsed')
  assert.equal(iconCalls('IconChevronDownOutlineRegular'), 0)
  for (const call of harness.primitiveCalls.filter((entry) => entry.name.indexOf('IconChevron') === 0)) {
    assert.equal(call.props.size, 14, 'E14 chevron size')
  }

  disclosureToggles(tree)[0].props.onClick()
  tree = rendered.again()
  assert.equal(
    harness.primitiveCalls.filter((call) => call.name === 'IconChevronDownOutlineRegular').length,
    1,
    'the expanded section switches to the down chevron',
  )
  assert.equal(byClass(tree, 'piai-count').length, 0)
})

test('R3 §16.4.6 — the body indents by the head chrome (18px) and aligns with the title', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  claim(rules, '.piai-root .piai-disclosure-body', 'padding-left: 18px', 'R3.6 18px alignment')
  claim(rules, '.piai-root .piai-disclosure-body', 'min-width: 0', 'R3.6 no overflow pressure')
})

// ---------------------------------------------------------------------------
// 4. invariants
// ---------------------------------------------------------------------------

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

const sorted = (set) => [...set].sort()

test('§16.5 W1 — CLASSES ⇔ CSS ⇔ JS are still set-equal (T7: 67 names, +tabs-bar +catalog −tier-key)', () => {
  const harness = createHarness()
  const exported = new Set(harness.styles.CLASSES)
  const css = classSetFromCss(harness.styles.STYLESHEET)
  // v10: the JS emitters are the whole chunk set, not two named files.
  const js = classSetFromJs(jsClassSources().map((entry) => entry.source))

  assert.equal(exported.size, 67, 'CLASSES must be 67 after T7')
  assert.deepEqual(sorted(css), sorted(exported), 'CSS classes must equal CLASSES')
  assert.deepEqual(sorted(js), sorted(exported), 'JS piai-* literals must equal CLASSES')
  assert.equal(exported.has('piai-count'), false, 'piai-count left the class list')
  assert.equal(exported.has('piai-disclosure-body'), true, 'piai-disclosure-body joined the class list')
  assert.equal(exported.has('piai-item-head'), true, 'the shared head class stays')
  // T7: the tab strip's two-slot bar and the provider pick list are new; the
  // tier row is an ordinary Row now, so its bare key chip class retires.
  assert.equal(exported.has('piai-tabs-bar'), true, 'the tab strip bar class joined the class list')
  assert.equal(exported.has('piai-catalog'), true, 'the provider pick list class joined the class list')
  assert.equal(exported.has('piai-tier-key'), false, 'T7: piai-tier-key left the class list')
})

test('§16.5 W1/W8 — polish FROZEN_CLASSES tracks the live class set', (t) => {
  const harness = createHarness()
  const polish = read('tests/verify.polish.mjs')
  const match = polish.match(/const FROZEN_CLASSES = \[([\s\S]*?)\]/)
  assert.ok(match !== null, 'verify.polish.mjs declares FROZEN_CLASSES')
  const frozen = match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'"))
    .map((line) => line.replace(/[',]/g, ''))
  const migrated = sorted(new Set(frozen)).join(',') === sorted(new Set(harness.styles.CLASSES)).join(',')
  if (!migrated) {
    t.todo('T8 owns this migration (verify.polish.mjs FROZEN_CLASSES)')
  }
  assert.deepEqual(sorted(new Set(frozen)), sorted(new Set(harness.styles.CLASSES)))
})

test('§16.6 — the 23-token allowlist is unchanged and only 19 tokens are really used', () => {
  // v10: the sheet is split into area fragments; every fragment is scanned, so
  // a token cannot hide in one of them.
  const source = ['client.styles.js', 'client.styles.chrome.js', 'client.styles.controls.js']
    .map((file) => read('lib/' + file))
    .join('\n')
  const allowlist = [
    '--dsw-alias-bg-base', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2', '--dsw-alias-bg-overlay',
    '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-brand-primary',
    '--dsw-alias-label-primary', '--dsw-alias-label-secondary', '--dsw-alias-state-error-primary',
    '--dsw-alias-state-idle-primary', '--dsw-alias-state-success-primary', '--dsw-alias-state-warn-primary',
    '--dsw-specific-sidebar-fill', '--dsw-radius-md', '--dsw-alias-border-l4',
    '--dsw-alias-label-tertiary', '--dsw-alias-label-dimmed', '--dsw-alias-bg-module-platform',
    '--dsw-radius-lg', '--dsw-focus-ring-width', '--dsw-focus-ring-color',
    '--dsw-alias-label-primary-foreground',
  ]
  assert.equal(allowlist.length, 23)
  const used = new Set(source.match(/--dsw-[a-z0-9-]+/g) || [])
  assert.equal(used.size, 19, 'v8 did not add or drop a token')
  for (const token of used) assert.ok(allowlist.includes(token), token + ' is outside the allowlist')
  for (const forbidden of [
    '--dsw-alias-bg-layer-4', '--dsw-alias-interactive-bg-hover', '--dsw-radius-sm',
    '--dsw-alias-interactive-bg-hover-danger', '--dsw-alias-state-business-primary',
  ]) {
    assert.equal(source.indexOf(forbidden), -1, forbidden + ' must not appear')
  }
})

test('§16.6 — focus rules are still exactly the four whitelisted forms', () => {
  const harness = createHarness()
  const rules = parseRules(harness.styles.STYLESHEET)
  const focus = []
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      if (/:focus-(?:within|visible)/.test(selector)) focus.push(selector)
    }
  }
  assert.deepEqual(sorted(new Set(focus)), [
    '.piai-root .piai-info:focus-visible',
    '.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove',
    '.piai-root .piai-provider-list [role="tab"]:focus-visible',
    '.piai-root .piai-provider-list [role="tab"]:focus-visible::after',
  ])
  for (const selector of focus) {
    assert.equal(/:focus-within/.test(selector), false)
    assert.ok(selector.startsWith('.piai-root .piai-'), 'only our own classes: ' + selector)
  }
})

test('§16.6 — clearing still emits unset, never a value-typed null', () => {
  const harness = createHarness()
  const form = recordingForm()
  const values = providerValues()
  const rendered = renderPanel(harness, form, values)
  const group = byAttr(rendered.tree, 'id', 'piai-field-providers-alpha-api')[0]
  const unset = elements(group).filter((node) => node.type === 'input' && node.props.value === '__unset__')[0]
  unset.props.onChange()
  assert.deepEqual(plain(form.writes), [{ op: 'remove', path: ['providers', 'alpha', 'api'] }])
  assert.equal(form.writes.some((write) => write.value === null), false)

  const panelsSource = panelsLayerSource()
  const editNulls = [...panelsSource.matchAll(/form\.edit\([^)]*,\s*null\s*\)/g)].filter((match) => {
    const lineStart = panelsSource.lastIndexOf('\n', match.index) + 1
    const line = panelsSource.slice(lineStart, match.index).trim()
    return !(line.startsWith('//') || line.startsWith('*') || line.startsWith('/*'))
  })
  assert.deepEqual(editNulls.map((match) => match[0]), [], 'no form.edit(path, null) in code')
})

test('§16.6 — inject/activation and dependencies are unchanged', () => {
  const inject = read('lib/client.js').match(/var inject = \[([\s\S]*?)\]/)[1]
    .split('\n')
    .map((line) => line.trim().replace(/[',]/g, ''))
    .filter(Boolean)
  // T7 adds `remote.llm` (model discovery) after `remote.credentials`.
  assert.deepEqual(inject, [
    'slots', 'locale', 'remote', 'remote.settings', 'remote.credentials', 'remote.llm',
    'configForms', 'settingsSchema',
  ])
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.devDependencies, undefined)
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-settings',
  ])
})

// ---------------------------------------------------------------------------
// 5. upstream primitive signatures + actions no-op
// ---------------------------------------------------------------------------

const SIGNATURES = {
  Button: new Set([
    'variant', 'size', 'icon', 'className', 'onClick', 'id', 'aria-label', 'aria-describedby',
    'disabled', 'onMouseEnter', 'onMouseLeave', 'onFocus', 'onBlur', 'role',
  ]),
  Input: new Set([
    'icon', 'className', 'id', 'type', 'value', 'placeholder', 'title', 'aria-label',
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

test('E9/E14 — Checkbox/Input/Tag/Tooltip/icons are used strictly by signature', () => {
  const harness = createHarness()
  const withVar = { providers: { alpha: { compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled' } } } } } }
  const rendered = renderPanel(harness, recordingForm(), withVar)
  disclosureToggles(rendered.tree)[5].props.onClick()
  rendered.again()

  for (const call of harness.primitiveCalls) {
    if (call.name === 'Tooltip') {
      assert.deepEqual(
        extraProps(call, new Set(['label', 'shortcutKeys', 'side', 'align', 'delayMs', 'focusDelayMs', 'gap', 'disabled', 'portal', 'maxWidth', 'openOnClick'])),
        [],
        'Tooltip props',
      )
      assert.equal(Array.isArray(call.props.children) ? call.props.children.length : 1, 1, 'Tooltip takes one child')
      continue
    }
    if (call.name.indexOf('Icon') === 0) {
      assert.deepEqual(
        Object.keys(call.props).filter((key) => !['key', 'children', 'size', 'className'].includes(key)),
        [],
        call.name + ' only accepts size/className',
      )
      continue
    }
    const allowed = SIGNATURES[call.name]
    if (allowed === undefined) continue
    assert.deepEqual(extraProps(call, allowed), [], call.name + ' props outside its signature')
  }
})

test('§16.5 W4 — instanceCardHead keeps the delete path byte-identical when actions is omitted', () => {
  const harness = createHarness()
  const rendered = renderPanel(harness, recordingForm(), providerValues())

  // Four instance cards, each with its default action slot and one remove icon.
  const heads = byClass(rendered.tree, 'piai-item-head')
  const removeLabels = byClass(rendered.tree, 'piai-item-remove').map((node) => node.props['aria-label'])
  assert.deepEqual(removeLabels, ['删除模型 m1', '删除模型 Pro', '删除模型 gpt-x'])
  assert.equal(byClass(rendered.tree, 'piai-item-actions').length, 3)
  assert.equal(heads.length, 9)
  for (const call of harness.primitiveCalls.filter((entry) => entry.name === 'IconTrashOutlineRegular')) {
    assert.equal(call.props.size, 14)
  }
})

test('§16.5 W2/W7 — the compat head replaces the DisclosureRow memo path without losing shape coverage', () => {
  const harness = createHarness()
  const values = {
    providers: {
      alpha: {
        displayName: 'A',
        // anthropic-messages makes every 通用能力 compat key advisory-withheld,
        // which is what renders the Tag primitive (W7 shape coverage).
        api: 'anthropic-messages',
        defaultInput: ['text'],
        retryPolicy: { mode: 'normal', maxRetries: 2 },
        compat: { chatTemplateArgs: { sys: { $var: 'thinking.enabled' } } },
      },
    },
  }
  const rendered = renderPanel(harness, recordingForm(), values)
  // Open compat section 0 (通用能力: five booleans) and section 5 ($var).
  const toggles = disclosureToggles(rendered.tree)
  toggles[0].props.onClick()
  rendered.again()
  const toggles2 = disclosureToggles(rendered.tree)
  toggles2[5].props.onClick()
  rendered.again()

  assert.equal(harness.disclosureRowRequests.count, 0, 'DisclosureRow is never requested')
  // Button/Input/Tooltip/StateDot are wrapped as forwardRef/memo in the harness,
  // so these names prove the shape-based resolution still works without it.
  for (const name of ['Button', 'Input', 'Checkbox', 'Tag', 'Tooltip']) {
    assert.ok(
      harness.primitiveCalls.some((call) => call.name === name),
      name + ' must still be rendered (and therefore still resolved) after W2',
    )
  }
  // T7 retires Switch: a boolean leaf is a three-way radio group now
  // (开启 / 关闭 / 默认（未设置）), so the primitive is no longer resolved at all.
  // Asserting the retirement explicitly keeps this from becoming a silently
  // narrowed list.
  assert.equal(
    harness.primitiveCalls.some((call) => call.name === 'Switch'),
    false,
    'T7: Switch is retired — booleans render as a native radiogroup',
  )
})

// ---------------------------------------------------------------------------
// 6. browser layout bridge (real Chromium artifacts under /tmp/piai-audit)
// ---------------------------------------------------------------------------

test('R1/R3 browser layout — real Chromium fixture 与 v7 证伪（/tmp/piai-audit）', { skip: !existsSync(BROWSER_FIXTURES) && 'browser fixture artifact not built' }, () => {
  const artifact = JSON.parse(readFileSync(BROWSER_FIXTURES, 'utf8'))
  const real = artifact.files['f-real2.html']
  assert.ok(real !== undefined, 'the real-sheet fixture must exist')

  // R1 fixed: 16x16 box, wide visible span, 16px column gap.
  assert.deepEqual([real.inputRow.input.w, real.inputRow.input.h], [16, 16])
  assert.ok(real.inputRow.span.w > 40, 'the label text keeps its width: ' + real.inputRow.span.w)
  assert.ok(String(real.inputRow.text).indexOf('文本') === 0)
  assert.equal(real.inputRow.gap, 16, 'E10 column gap')
  assert.deepEqual([real.omitRow.input.w, real.omitRow.input.h], [16, 16])
  assert.ok(real.omitRow.span.w > 40, 'the omitWhenOff label is visible too')
  assert.deepEqual([real.radios[0].w, real.radios[0].h], [16, 16], 'the enum radio keeps its 16px box')

  // R2 computed style.
  assert.equal(real.nested.borderLeftWidth, '0px')
  assert.equal(real.nested.paddingLeft, '0px')
  assert.equal(real.nested.gap, '8px')
  assert.equal(real.nested.title, 'normal（按次数重试）的参数')

  // R3: bodies permanent, alignment exact, no count.
  assert.equal(real.compat.piaiCount, 0)
  for (const section of real.compat.sections) {
    assert.equal(section.targetExists, true)
    assert.equal(section.paddingLeft, '18px')
    assert.equal(section.chevronSize, 14)
    if (section.ariaExpanded === 'true') {
      assert.equal(section.targetHidden, false)
      assert.ok(section.targetFieldRows > 0)
      assert.equal(section.bodyContentLeft, section.titleLeft, 'content left == title left (±1px)')
    } else {
      assert.equal(section.targetHidden, true)
      assert.equal(section.targetFieldRows, 0)
    }
  }

  // Falsification: the v7 state (open-ended rule + old span rule + no pin)
  // reproduces the reported defect exactly — input == label width, span 0.
  const v7 = artifact.files['f-v7state.html']
  assert.ok(v7 !== undefined, 'the v7-state fixture must exist')
  assert.equal(v7.inputRow.input.w, v7.inputRow.label.w, 'the v7 input stretches to the whole label')
  assert.ok(v7.inputRow.input.w > 40, 'and that width is the bug: ' + v7.inputRow.input.w)
  assert.equal(v7.inputRow.span.w, 0, 'the v7 span collapses to zero width (the text disappears)')
  assert.equal(v7.omitRow.span.w, 0, 'the omitWhenOff label disappears the same way')

  // Order independence: v8 keeps the radio 16px even with the radio rule moved
  // before the stretch rule; the v7 state stretches it.
  const radioFirstReal = artifact.files['f-radiofirst-real.html']
  const radioFirstV7 = artifact.files['f-radiofirst-v7.html']
  assert.deepEqual([radioFirstReal.radios[0].w, radioFirstReal.radios[0].h], [16, 16])
  assert.ok(radioFirstV7.radios[0].w > 40, 'without the :not() exclusion, source order decides')
})

test('R1/R3 browser layout — 真实 chunk 渲染夹具（/tmp/piai-audit/fixture-render.html）', { skip: !existsSync(BROWSER_RENDER) && 'real-render fixture artifact not built' }, () => {
  const artifact = JSON.parse(readFileSync(BROWSER_RENDER, 'utf8'))
  const data = artifact.data

  // The fixture is serialized from the real ProviderPanel, so these numbers are
  // the shipped components' own DOM.
  const groups = data.checks
  assert.ok(groups.length >= 2, 'model input + provider defaultInput both render')
  for (const group of groups) {
    assert.equal(group.items.length, 2)
    for (const item of group.items) {
      assert.deepEqual([item.input.w, item.input.h], [16, 16], group.id + ' / ' + item.text)
      assert.equal(item.inputType, 'checkbox')
      assert.ok(item.span.w > 40, 'the label text is visible: ' + item.text + ' -> ' + item.span.w)
      assert.ok(hasVisibleText(item.text), 'the visible label is non-empty')
    }
  }
  const radioDims = new Set(data.radios.map((radio) => radio.w + 'x' + radio.h))
  assert.deepEqual([...radioDims], ['16x16'], 'every enum radio is 16x16')

  assert.equal(data.nested.length, 1)
  assert.equal(data.nested[0].title, 'normal（按次数重试）的参数')
  assert.equal(data.nested[0].borderLeftWidth, '0px')
  assert.equal(data.nested[0].paddingLeft, '0px')

  assert.equal(data.compat.length, 6)
  assert.equal(data.counts.piaiCount, 0)
  assert.equal(data.counts.itemHeads, 7, '1 instance card + 6 compat heads')
  assert.equal(data.counts.itemRemoves, 1)
  assert.equal(data.counts.itemActions, 1)
  for (const section of data.compat) {
    assert.equal(section.targetExists, true)
    assert.equal(section.paddingLeft, '18px')
    assert.equal(section.chevronWidth, 14)
    assert.equal(section.hasCount, false)
    if (section.ariaExpanded === 'true') {
      assert.equal(section.targetHidden, false)
      assert.ok(section.fieldRows > 0, 'the open section renders rows')
      assert.equal(section.bodyContentLeft, section.titleLeft, 'body content aligns with the title')
    } else {
      assert.equal(section.targetHidden, true)
      assert.equal(section.fieldRows, 0, 'a collapsed section mounts no field row')
    }
  }
})

function hasVisibleText(value) {
  return typeof value === 'string' && value.trim() !== ''
}
