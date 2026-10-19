/**
 * Contract tests for `lib/client.styles.js` (docs/interaction-design.md §2–§7).
 *
 * The stylesheet is a deliverable with three failure modes worth pinning down:
 *
 *   1. **Ownership** — an untagged `<style>` is claimed by whichever plugin
 *      materialises next, so hot reload can delete the wrong node. The chunk
 *      must tag its element explicitly and remove only its own node.
 *   2. **Leakage** — Settings is a shared surface, so every selector must be
 *      scoped under `.piai-root`, and colours must come only from the 14
 *      platform tokens (no literals, so light/dark follow automatically).
 *   3. **Coverage** — the CSS class set, the exported `CLASSES` list and the
 *      `piai-*` literals actually emitted by `lib/client.js` +
 *      `lib/client.panels.js` must be the same 67 names. A class that is dead
 *      in CSS or missing from CSS fails here, exactly like field coverage does.
 *
 * The DOM is a hand-written fake (no DOM library, no new dependency), and the
 * chunk is loaded in a `vm` sandbox so the `document`-absent path can be
 * exercised for real.
 *
 * @module dsh-llm-pi-ai-config/tests/styles
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'
import assert from 'node:assert/strict'
import test from 'node:test'
import { jsClassSources } from './helpers/class-sources.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LIB = join(HERE, '..', 'lib')
const OWNER_ID = 'dsh-llm-pi-ai-config'
const CHUNK_NAME = 'client.styles.js'
/** The sheet fragments the facade composes, in load order (v10). */
const STYLE_PARTS = ['client.styles.chrome.js', 'client.styles.controls.js']

/** The 14-token colour allowlist (docs/interaction-design.md §2). */
const TOKEN_ALLOWLIST = [
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
]

/**
 * §10.5 adds the official primitives' own tokens so our controls can match the
 * shipped look instead of approximating it.
 */
const V2_TOKENS = [
  '--dsw-radius-md',
  '--dsw-alias-border-l4',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-label-dimmed',
]

/**
 * The v6 additions (interaction-design §14): tokens the shipped Models page
 * itself uses for its card and grid (`_editor` background + radius-lg). They are
 * official, theme-provided and dark/light-aware, so reusing them is what makes
 * our cards match the shipped page instead of approximating it.
 */
const V6_TOKENS = ['--dsw-alias-bg-module-platform', '--dsw-radius-lg']

/**
 * The v7 additions (interaction-design §15.8 no.2 / §15.9 D3): the two official
 * focus-ring tokens the shipped tab / help-button rings use, plus the one
 * foreground token R4's self-drawn enum box needs for its check mark.
 */
const V7_TOKENS = [
  '--dsw-focus-ring-width',
  '--dsw-focus-ring-color',
  '--dsw-alias-label-primary-foreground',
]

/** The allowlist: 23 tokens (§2's 14 + §10.5's 4 + §14's 2 + §15.8's 3). */
const TOKEN_ALLOWLIST_V2 = TOKEN_ALLOWLIST.concat(V2_TOKENS, V6_TOKENS, V7_TOKENS)

/** Literal colour keywords that must never appear (tokens only). */
const COLOR_KEYWORDS = [
  'red',
  'white',
  'black',
  'blue',
  'green',
  'gray',
  'grey',
  'yellow',
  'orange',
  'purple',
  'pink',
  'brown',
  'cyan',
  'magenta',
  'lime',
  'navy',
  'teal',
  'silver',
  'maroon',
  'olive',
  'aqua',
  'fuchsia',
  'transparent',
  'currentcolor',
]

/** A minimal fake DOM: one `head`, element nodes with attributes. */
function makeDocument() {
  const nodes = []
  const head = {
    children: nodes,
    appendChild(node) {
      nodes.push(node)
      node.parentNode = head
      return node
    },
    removeChild(node) {
      const index = nodes.indexOf(node)
      if (index !== -1) nodes.splice(index, 1)
      node.parentNode = null
      return node
    },
  }
  function matches(node, selector) {
    if (selector === 'style') return node.tagName === 'STYLE'
    const attribute = selector.match(/^style\[([a-z-]+)="([^"]+)"\]$/)
    if (attribute !== null) {
      return node.tagName === 'STYLE' && node.attributes[attribute[1]] === attribute[2]
    }
    return false
  }
  const document = {
    head,
    createElement(tagName) {
      return {
        tagName: String(tagName).toUpperCase(),
        attributes: {},
        textContent: '',
        parentNode: null,
        setAttribute(name, value) {
          this.attributes[name] = value
        },
        getAttribute(name) {
          return this.attributes[name]
        },
      }
    },
    querySelectorAll(selector) {
      return nodes.filter((node) => matches(node, selector))
    },
  }
  return document
}

/**
 * Load the styles chunk in a fresh sandbox.
 *
 * @param options - `{document}` to install a fake DOM (omit for the Node path).
 * @returns `{api, registration, sandbox, document}`.
 */
function loadStyles(options = {}) {
  const registrations = []
  const sandbox = {
    console,
    Object,
    Array,
    JSON,
    String,
    Number,
    Boolean,
    Error,
    Symbol,
    Set,
    Map,
    Math,
    Date,
    RegExp,
  }
  sandbox.globalThis = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  sandbox.window = sandbox
  if (options.document !== undefined) sandbox.document = options.document
  createContext(sandbox)

  // v10: the sheet is composed from two area fragments, read out of the shared
  // registry at eval time, so they load first — the owner's phase order.
  for (const part of STYLE_PARTS) {
    const partFile = join(LIB, part)
    runInContext(readFileSync(partFile, 'utf8'), sandbox, { filename: partFile })
    registrations[registrations.length - 1].factory()
  }
  const file = join(LIB, CHUNK_NAME)
  runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  const registration = registrations[registrations.length - 1]
  return {
    api: registration.factory(),
    registration,
    sandbox,
    document: options.document,
  }
}

/**
 * Extract the selector text of every style rule, skipping at-rule preludes and
 * the contents of `@keyframes`.
 */
function selectorsOf(css) {
  const out = []
  let depth = 0
  let keyframesDepth = -1
  let buffer = ''
  for (const character of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (character === '{') {
      const prelude = buffer.trim()
      if (prelude.startsWith('@keyframes')) keyframesDepth = depth + 1
      else if (!prelude.startsWith('@') && keyframesDepth === -1) out.push(prelude)
      depth += 1
      buffer = ''
    } else if (character === '}') {
      if (depth === keyframesDepth) keyframesDepth = -1
      depth -= 1
      buffer = ''
    } else {
      buffer += character
    }
  }
  return out
}

/** The class names referenced by the CSS selectors. */
function selectorClasses(css) {
  const found = new Set()
  for (const selector of selectorsOf(css)) {
    for (const name of selector.match(/\.piai-[a-z0-9-]+/g) || []) {
      found.add(name.slice(1))
    }
  }
  return found
}

/** Every `piai-*` literal in a source file. */
function sourceClasses(file) {
  return new Set(readFileSync(join(LIB, file), 'utf8').match(/piai-[a-z0-9-]+/g) || [])
}

/** The same scan over an in-memory source (v10: the emitter list is derived). */
function sourceClassesOf(source) {
  return source.match(/piai-[a-z0-9-]+/g) || []
}

test('install() injects exactly one tagged node and its disposer removes only that node', () => {
  const document = makeDocument()
  const harness = loadStyles({ document })
  const api = harness.api

  const dispose = api.install()
  assert.equal(typeof dispose, 'function')
  assert.equal(document.head.children.length, 1, 'exactly one style node after install')

  const node = document.head.children[0]
  assert.equal(node.tagName, 'STYLE')
  assert.equal(node.textContent, api.STYLESHEET, 'the node carries the full stylesheet')

  // Explicit ownership tags: without them the host claims the node.
  assert.equal(node.attributes['data-plugin'], OWNER_ID)
  assert.equal(node.attributes['data-plugin-css'], 'llm-pi-ai-config')
  assert.equal(document.querySelectorAll(`style[data-plugin="${OWNER_ID}"]`).length, 1)

  // Idempotent: a second install adds nothing and still returns a disposer.
  const second = api.install()
  assert.equal(document.head.children.length, 1, 'a second install must reuse the node')
  assert.equal(document.head.children[0], node)
  assert.equal(document.querySelectorAll('style').length, 1)

  // The disposer from the FIRST install still removes the node.
  dispose()
  assert.equal(document.head.children.length, 0)
  assert.equal(document.querySelectorAll('style').length, 0)

  // Reinstall reuses the same element rather than creating a second one.
  api.install()
  assert.equal(document.head.children.length, 1)
  assert.equal(document.head.children[0], node)

  // uninstall() is safe to call twice, and so is a stale disposer.
  api.uninstall()
  api.uninstall()
  second()
  assert.equal(document.head.children.length, 0)
})

test('install() without a document is a silent no-op', () => {
  const harness = loadStyles()
  assert.equal(harness.sandbox.document, undefined, 'this sandbox has no document')
  let dispose
  assert.doesNotThrow(() => {
    dispose = harness.api.install()
  })
  assert.equal(typeof dispose, 'function', 'a no-op disposer must still be returned')
  assert.doesNotThrow(() => dispose())
  assert.doesNotThrow(() => harness.api.uninstall())
})

test('the chunk is a browser classic script that registers under its own name', () => {
  const raw = readFileSync(join(LIB, CHUNK_NAME), 'utf8')
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.equal(/^\s*import\s/m.test(source), false, 'no import statements')
  assert.equal(/^\s*export\s/m.test(source), false, 'no export statements')
  assert.equal(source.includes('module.exports'), false, 'no module.exports')

  const harness = loadStyles()
  assert.equal(harness.registration.id, OWNER_ID)
  assert.equal(harness.registration.chunk, CHUNK_NAME)
  assert.equal(harness.sandbox.__dshLlmPiAiConfig.styles, harness.api, 'published on the registry')

  const api = harness.api
  assert.equal(typeof api.STYLESHEET, 'string')
  assert.equal(Array.isArray(api.CLASSES), true)
  assert.equal(api.STYLESHEET.includes('</style>'), false, 'no closing style tag may appear')
  assert.equal(typeof api.install, 'function')
  assert.equal(typeof api.uninstall, 'function')
})

test('every selector is scoped under .piai-root', () => {
  const api = loadStyles().api
  const selectors = selectorsOf(api.STYLESHEET)
  assert.ok(selectors.length > 40, `expected many rules, got ${selectors.length}`)
  for (const selector of selectors) {
    assert.ok(
      selector.startsWith('.piai-root'),
      `every selector must start with .piai-root, got ${JSON.stringify(selector)}`,
    )
  }
})

test('selectors stay scoped under the relaxed v2 rule, with no width breakpoints', () => {
  const api = loadStyles().api
  const css = api.STYLESHEET
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

  for (const selector of selectorsOf(code)) {
    assert.ok(
      selector.startsWith('.piai-root'),
      `every selector must start with .piai-root, got ${JSON.stringify(selector)}`,
    )
    // §10.6 forbids a bare/descendant universal that would leak. A CHILD
    // universal (`> *`) is the scoped construct §10.3 prescribes for the
    // control column, so it is the one allowed form.
    assert.equal(
      selector.replace(/>\s*\*/g, '').includes('*'),
      false,
      `unscoped universal selector in ${JSON.stringify(selector)}`,
    )
  }
  assert.equal(code.includes('.piai-root *'), false, 'no descendant universal may exist')

  // §10.6 relaxes the rule: descendant element/attribute selectors are allowed
  // and are what makes the primitives' inner nodes fluid.
  //
  // v8 R1: the text-input rule must carry BOTH `:not(...)` guards. A bare
  // `.piai-root .piai-row-control input` — or any selector that merely starts
  // with that prefix — stretched the primitive Checkbox to its label's whole
  // width, which collapsed the label span to zero width in a real browser. The
  // old `code.includes('.piai-root .piai-row-control input')` form could not
  // tell the guarded rule from the bare one, so this asserts the shape instead.
  const rowControlInputSelectors = selectorsOf(code).filter((selector) =>
    /\.piai-root \.piai-row-control input/.test(selector),
  )
  assert.ok(rowControlInputSelectors.length > 0, 'a scoped element descendant selector must exist')
  assert.ok(
    rowControlInputSelectors.some((selector) =>
      /:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/.test(selector),
    ),
    `the text-input rule must exclude checkbox/radio: ${JSON.stringify(rowControlInputSelectors)}`,
  )
  assert.ok(
    rowControlInputSelectors.every(
      (selector) =>
        selector.includes(':not([type="checkbox"]):not([type="radio"])') ||
        selector.includes('::placeholder'),
    ),
    `no bare .piai-row-control input rule may survive: ${JSON.stringify(rowControlInputSelectors)}`,
  )

  assert.equal(code.includes('!important'), false, 'no !important')
  assert.equal(code.includes('@import'), false, 'no @import')
  assert.equal(code.includes('url('), false, 'no external url(')

  // §10.2/§10.7.1: no width-based breakpoint may exist. A Settings modal is
  // narrower than the viewport, so a viewport @media would never fire.
  const media = code.match(/@media[^{]*/g) || []
  assert.ok(media.length > 0, 'the reduced-motion preference must be kept')
  for (const query of media) {
    assert.equal(
      /\b(width|min-width|max-width)\b/.test(query),
      false,
      `a width breakpoint is forbidden: ${JSON.stringify(query)}`,
    )
    assert.ok(
      /prefers-[a-z-]+/.test(query),
      `only non-width preferences may appear, got ${JSON.stringify(query)}`,
    )
  }
})

test('colours come only from the 23-token v2 allowlist', () => {
  const api = loadStyles().api
  const css = api.STYLESHEET

  assert.equal(
    TOKEN_ALLOWLIST_V2.length,
    23,
    'the allowlist has 23 tokens (§2 + §10.5 + §14 + §15.8)',
  )

  const tokens = new Set(css.match(/--dsw-[a-z0-9-]+/g) || [])
  assert.ok(tokens.size > 0, 'the stylesheet must use platform tokens')
  for (const token of tokens) {
    assert.ok(
      TOKEN_ALLOWLIST_V2.includes(token),
      `${token} is not one of the 23 allowlisted tokens (docs/interaction-design.md §15.8)`,
    )
  }
  // The point of the extensions is to align with the official controls and the
  // shipped Models page, so every addition must actually be reused.
  // (`--dsw-alias-state-business-primary` left the list in the v5 pass: the only
  // rules that used it were the focus rings the primitives already draw —
  // docs/verification.md §14.)
  for (const token of V2_TOKENS.concat(V6_TOKENS, V7_TOKENS)) {
    assert.ok(tokens.has(token), `${token} must be reused for the official look (§10.4, §14, §15.8)`)
  }

  assert.equal(/(#[0-9a-fA-F]{3,8})\b/.test(css), false, 'no hex colours')
  assert.equal(/\b(?:rgb|rgba|hsl|hsla)\(/.test(css), false, 'no rgb()/hsl() colours')
  for (const keyword of COLOR_KEYWORDS) {
    const pattern = new RegExp(`(^|[\\s:,;(])${keyword}(?![\\w-])`, 'i')
    assert.equal(pattern.test(css), false, `colour keyword "${keyword}" is forbidden`)
  }

  // Spacing / radius / font sizes are local variables, declared on the root.
  for (const local of [
    '--piai-space-1',
    '--piai-space-2',
    '--piai-space-3',
    '--piai-space-4',
    '--piai-space-5',
    '--piai-space-6',
    '--piai-radius-sm',
    '--piai-radius-md',
    '--piai-radius-lg',
    '--piai-font-sm',
    '--piai-font-md',
    '--piai-font-lg',
    '--piai-line',
  ]) {
    assert.ok(css.includes(local + ':'), `${local} must be declared`)
  }
})

test('the v2 layout wraps intrinsically and makes controls fluid (§10.2–§10.4)', () => {
  const api = loadStyles().api
  const css = api.STYLESHEET
  const rule = (selector) => {
    const start = css.indexOf(selector + ' {')
    assert.notEqual(start, -1, `${selector} must exist`)
    return css.slice(start, css.indexOf('}', start))
  }

  const row = rule('.piai-root .piai-row')
  assert.ok(row.includes('display: flex'), 'the row is a flex container')
  assert.ok(row.includes('flex-direction: column'), 'the row stacks vertically (§12)')
  assert.equal(row.includes('grid-template-columns'), false, 'the fixed 240px/1fr grid is gone')

  // §12 + v6 (§14): the row is a vertical stack, so label/control/hint cannot
  // drift when a control is wider than a column. v6 drops the per-row hairline
  // and moves spacing into the fields container, matching the shipped Models
  // page (`_field { gap:6px }` inside a gap-spaced body, separators only at
  // section boundaries).
  assert.match(row, /flex-direction:\s*column/, 'the row stacks label, control and hint')
  assert.equal(row.includes('flex-wrap: wrap'), false, 'the row no longer wraps two columns')
  assert.equal(row.includes('border-top'), false, 'v6: no per-row separator line')
  const fields = rule('.piai-root .piai-fields')
  assert.match(fields, /gap:\s*var\(--piai-space-3\)/, 'field spacing comes from the container gap')
  const label = rule('.piai-root .piai-row-label')
  assert.match(label, /color:\s*var\(--dsw-alias-label-secondary\)/, 'the field label is secondary')
  assert.match(label, /font-size:\s*var\(--piai-font-sm\)/, 'and 12px, like the shipped field label')
  assert.match(label, /font-weight:\s*500/)
  // v6: two short fields that belong together share a two-column grid.
  const pair = rule('.piai-root .piai-row-pair')
  assert.match(pair, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(pair, /gap:\s*var\(--piai-space-2\) var\(--piai-space-3\)/)

  const head = rule('.piai-root .piai-row-head')
  assert.equal(head.includes('flex: 0 1 200px'), false, 'the label column is gone')
  assert.match(head, /align-items:\s*center/, 'the label row aligns its chips')

  const control = rule('.piai-root .piai-row-control')
  assert.equal(control.includes('flex: 1 1 320px'), false, 'the control is full width, not a column')
  assert.match(control, /min-width:\s*0/, 'the control row may shrink')
  assert.match(control, /max-width:\s*100%/, 'the control row never exceeds the card')

  const hint = rule('.piai-root .piai-hint')
  assert.equal(hint.includes('flex: 1 1 100%'), false, 'the hint is a normal stacked child now')
  assert.equal(hint.includes('grid-column'), false, 'no grid placement remains')
  assert.match(hint, /color:\s*var\(--dsw-alias-label-tertiary\)/, 'the help text is tertiary (v6)')

  // Fluid controls: the primitives' Input is an inline-flex box, so without
  // this every input in a card sizes to its own content. §10.3 prescribes the
  // scoped child universal here.
  const fluid = rule('.piai-root .piai-row-control > *')
  assert.match(fluid, /width:\s*100%/)
  assert.match(fluid, /min-width:\s*0/)
  assert.match(fluid, /max-width:\s*100%/)
  assert.match(fluid, /box-sizing:\s*border-box/)
  const fluidInput = rule(
    '.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"])',
  )
  assert.match(fluidInput, /width:\s*100%/)
  assert.match(fluidInput, /min-width:\s*0/)
  assert.match(fluidInput, /box-sizing:\s*border-box/)
  assert.equal(
    css.includes('\n.piai-root .piai-row-control input {'),
    false,
    'v8 R1: the unguarded text-input rule must not come back',
  )
  assert.match(
    rule('.piai-root .piai-row-control input::placeholder'),
    /color:\s*var\(--dsw-alias-label-dimmed\)/,
    'the placeholder reuses the official token',
  )
  // §15.8 no.3 (v7): focus presentation is an explicit WHITELIST, not a blanket
  // ban. The platform controls keep owning their own focus look — no rule may
  // reach a primitive's internal node (input / label / span / .wrap) — but the
  // official rings we copy must exist on OUR OWN classes/attributes: the tab
  // (`E1`), the field help button (`E3`), the card head / icon button (`E5`),
  // and (when present) R4's self-drawn radio box.
  const FOCUS_ALLOWED = [
    /^\.piai-root \.piai-provider-list \[role="tab"\]\[data-active="true"\]::after$/,
    /^\.piai-root \.piai-provider-list \[role="tab"\]:focus-visible::after$/,
    /^\.piai-root \.piai-provider-list \[role="tab"\]:focus-visible$/,
    /^\.piai-root \.piai-info:focus-visible$/,
    /^\.piai-root \.piai-item-head:has\(:focus-visible\) \.piai-item-remove$/,
    /^\.piai-root \.piai-select input:focus-visible$/,
    /^\.piai-root \.piai-select label:focus-visible$/,
  ]
  const primitiveInterior = /\b(?:input|label|span)\b|\.wrap\b/
  const focusParts = selectorsOf(api.STYLESHEET)
    .filter((selector) => /:focus-(?:within|visible)/.test(selector))
    .flatMap((selector) => selector.split(','))
    .map((part) => part.trim())
  for (const part of focusParts) {
    assert.ok(
      FOCUS_ALLOWED.some((allowed) => allowed.test(part)),
      `focus selector outside the §15.8 no.3 whitelist: ${JSON.stringify(part)}`,
    )
    if (primitiveInterior.test(part)) {
      assert.ok(
        /^\.piai-root \.piai-select (?:input|label):focus-visible$/.test(part),
        `a focus rule may not reach a primitive's interior node: ${JSON.stringify(part)}`,
      )
    }
    assert.equal(
      /:focus-within/.test(part),
      false,
      `:focus-within is forbidden by §15.8 no.3: ${JSON.stringify(part)}`,
    )
  }
  // The whitelist must not be vacuous: v7 requires the tab ring, the info ring
  // and the keyboard-reveal of the card remove button to actually exist.
  assert.ok(
    focusParts.some((part) => part === '.piai-root .piai-provider-list [role="tab"]:focus-visible'),
    'the single tab focus ring (E1) must exist',
  )
  assert.ok(
    focusParts.some((part) => part === '.piai-root .piai-info:focus-visible'),
    'the help-button focus ring (E3) must exist',
  )
  assert.ok(
    focusParts.some(
      (part) => part === '.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove',
    ),
    'the keyboard reveal of the card remove button must exist (§15.4)',
  )

  // Multi-option controls wrap rather than clip the card.
  for (const selector of [
    '.piai-root .piai-select',
    '.piai-root .piai-tags',
    '.piai-root .piai-bool',
  ]) {
    const body = rule(selector)
    assert.match(body, /flex-wrap:\s*wrap/, `${selector} must wrap`)
    assert.match(body, /max-width:\s*100%/, `${selector} must stay inside the column`)
  }

  // The shipped Input primitive wraps the native input, so the flex item that
  // must compress is the wrapper; the inner input only fills it.
  assert.match(
    rule('.piai-root .piai-provider-add > *'),
    /flex:\s*1 1 160px/,
    'the add-provider control wrapper compresses instead of clipping',
  )
  assert.match(rule('.piai-root .piai-provider-add input'), /width:\s*100%/)
  assert.match(rule('.piai-root .piai-provider-add input'), /min-width:\s*0/)

  // §15.2 (v7): the tab strip is a wrapping text-tab row (not a Pill row), so
  // an arbitrary number of providers stays readable and never clips the card.
  const tabs = rule('.piai-root .piai-tabs')
  assert.match(tabs, /display:\s*flex/, 'the strip is a flex container')
  assert.match(tabs, /flex-direction:\s*column/, 'tabs sit above the page body')
  assert.match(tabs, /min-width:\s*0/, 'the strip may shrink with the card')
  assert.match(
    tabs,
    /margin-bottom:\s*var\(--piai-space-4\)/,
    'intentional deviation 2: the strip spaces itself from the body',
  )
  const list = rule('.piai-root .piai-provider-list')
  assert.match(list, /flex-wrap:\s*wrap/, 'provider tabs wrap instead of overflowing')
  assert.match(list, /max-width:\s*100%/, 'the tab row stays inside the card')
  const chip = rule('.piai-root .piai-provider-list [role="tab"]')
  assert.match(chip, /max-width:\s*100%/, 'a long provider name cannot clip the row')
  assert.match(chip, /min-width:\s*0/)
  assert.match(
    rule('.piai-root .piai-dict-add > *'),
    /flex:\s*1 1 160px/,
    'the add-key control wrapper compresses the same way',
  )
  assert.match(rule('.piai-root .piai-dict-add input'), /width:\s*100%/)

  assert.ok(css.includes('max-width: 880px'), 'the content column is 880px')
  assert.ok(css.includes('margin: 0 auto'), 'the content column is centred')
  assert.ok(css.includes('position: sticky'), 'the action bar is sticky')
  assert.ok(css.includes('bottom: 0'), 'the action bar sticks to the bottom')
  assert.ok(
    css.includes('background: var(--dsw-alias-bg-layer-1)'),
    'cards use the layer-1 surface token',
  )

  const keyframes = css.match(/@keyframes\s+([A-Za-z0-9_-]+)/g) || []
  assert.ok(keyframes.length > 0, 'a subtle animation is part of the design')
  for (const entry of keyframes) {
    const name = entry.replace(/@keyframes\s+/, '')
    assert.ok(name.startsWith('piai-'), `keyframe ${name} must be piai-prefixed`)
  }
})

test('the v7 controls carry the E1/E5/E9/E10 shapes (§15.2, §15.4–§15.7)', () => {
  const api = loadStyles().api
  const css = api.STYLESHEET
  const rule = (selector) => {
    const start = css.indexOf(selector + ' {')
    assert.notEqual(start, -1, `${selector} must exist`)
    return css.slice(start, css.indexOf('}', start))
  }
  /** Declarations of a rule whose prelude may be a comma-joined group. */
  const block = (selector) => {
    const at = css.indexOf(selector)
    assert.notEqual(at, -1, `${selector} must exist`)
    const open = css.indexOf('{', at)
    return css.slice(open + 1, css.indexOf('}', open))
  }

  // --- R1 tab row, copied from the shipped PluginsSettingsSection (E1) -------
  const list = rule('.piai-root .piai-provider-list')
  assert.match(list, /align-items:\s*flex-end/, 'tabs baseline-align at the hairline')
  assert.match(list, /gap:\s*22px/, 'the official 22px tab gap')
  assert.match(list, /margin-top:\s*2px/)
  assert.match(list, /border-bottom:\s*0\.5px solid var\(--dsw-alias-border-l2\)/)
  assert.match(rule('.piai-root .piai-body'), /padding-top:\s*2px/)

  const tab = rule('.piai-root .piai-provider-list [role="tab"]')
  assert.match(tab, /position:\s*relative/)
  assert.match(tab, /padding:\s*7px 1px 9px/)
  assert.match(tab, /font:\s*inherit/)
  assert.match(tab, /background:\s*none/)
  assert.match(tab, /border:\s*0/)
  assert.match(tab, /font-size:\s*13px/)
  assert.match(tab, /line-height:\s*20px/)
  assert.match(tab, /cursor:\s*pointer/)
  assert.match(tab, /color:\s*var\(--dsw-alias-label-tertiary\)/, 'the resting tab is tertiary')
  assert.match(
    block('.piai-root .piai-provider-list [role="tab"]:hover'),
    /color:\s*var\(--dsw-alias-label-primary\)/,
    'hover brightens to label-primary',
  )
  const underline = block(
    '.piai-root .piai-provider-list [role="tab"][data-active="true"]::after',
  )
  assert.match(underline, /content:\s*""/)
  assert.match(underline, /position:\s*absolute/)
  assert.match(underline, /bottom:\s*-1px/)
  assert.match(underline, /left:\s*0/)
  assert.match(underline, /right:\s*0/)
  assert.match(underline, /height:\s*2px/)
  assert.match(underline, /background:\s*var\(--dsw-alias-label-primary\)/)
  assert.match(underline, /border-radius:\s*2px 2px 0 0/)
  const ring = rule('.piai-root .piai-provider-list [role="tab"]:focus-visible')
  assert.match(ring, /outline:\s*var\(--dsw-focus-ring-width\) solid var\(--dsw-focus-ring-color\)/)
  assert.match(ring, /outline-offset:\s*2px/)
  assert.match(ring, /border-radius:\s*2px/)
  assert.match(ring, /color:\s*var\(--dsw-alias-label-primary\)/)
  // The v7 tab is a bare button: no Pill background/radius survives.
  assert.equal(/border-radius/.test(tab), false, 'no Pill radius may remain on the tab')
  assert.equal(
    tab.includes('--dsw-alias-brand-primary'),
    false,
    'no Pill fill may remain on the tab',
  )

  // --- R2 help trigger (E3) -------------------------------------------------
  const info = rule('.piai-root .piai-info')
  assert.match(info, /display:\s*inline-flex/)
  assert.match(info, /width:\s*24px/)
  assert.match(info, /min-width:\s*24px/)
  assert.match(info, /height:\s*24px/)
  assert.match(info, /border-radius:\s*var\(--piai-radius-sm\)/)
  assert.match(info, /color:\s*var\(--dsw-alias-label-tertiary\)/)
  assert.match(info, /background:\s*none/)
  assert.match(info, /border:\s*0/)
  assert.match(block('.piai-root .piai-info:hover'), /background:\s*var\(--dsw-alias-bg-layer-2\)/)
  const infoRing = rule('.piai-root .piai-info:focus-visible')
  assert.match(
    infoRing,
    /outline:\s*var\(--dsw-focus-ring-width\) solid var\(--dsw-focus-ring-color\)/,
  )
  assert.match(infoRing, /outline-offset:\s*1px/)
  assert.equal(
    infoRing.includes('--dsw-alias-state-business-primary'),
    false,
    'no business-primary fallback on the v7 focus ring (§15.9 D3)',
  )
  // The trigger lives in the head now; the old control-column rule is gone.
  assert.match(rule('.piai-root .piai-row-head > .piai-info'), /flex:\s*none/)
  assert.match(rule('.piai-root .piai-row-head > .piai-info'), /width:\s*auto/)
  assert.equal(
    css.includes('.piai-row-control > .piai-info'),
    false,
    'the v6 control-column info rule must be deleted',
  )

  // --- R4 enum: a self-drawn radio box group (E9/§15.5) ---------------------
  const select = rule('.piai-root .piai-select')
  assert.match(select, /flex-wrap:\s*wrap/, 'any number of enum options wraps')
  assert.match(select, /gap:\s*var\(--piai-space-2\) var\(--piai-space-4\)/)
  assert.match(rule('.piai-root .piai-select > label'), /display:\s*inline-flex/)
  assert.match(rule('.piai-root .piai-select > label'), /gap:\s*var\(--piai-space-1\)/)
  const box = rule('.piai-root .piai-select input')
  assert.match(box, /appearance:\s*none/)
  assert.match(box, /width:\s*16px/)
  assert.match(box, /height:\s*16px/)
  assert.match(box, /border:\s*0\.5px solid var\(--dsw-alias-border-l4\)/)
  assert.match(box, /border-radius:\s*var\(--piai-radius-sm\)/)
  const checked = rule('.piai-root .piai-select input:checked')
  assert.match(checked, /background:\s*var\(--dsw-alias-brand-primary\)/)
  const check = rule('.piai-root .piai-select input:checked::after')
  assert.match(check, /content:\s*""/)
  assert.match(check, /border-bottom:\s*1\.5px solid var\(--dsw-alias-label-primary-foreground\)/)
  assert.match(check, /border-right:\s*1\.5px solid var\(--dsw-alias-label-primary-foreground\)/)
  assert.match(check, /rotate\(45deg\)/)
  assert.equal(
    check.includes('url('),
    false,
    'the check mark must be drawn with borders, never a background image (§5)',
  )

  // --- R5 checkbox group gaps (§15.6, v8 R1) --------------------------------
  const checks = rule('.piai-root .piai-checks')
  assert.match(checks, /flex-wrap:\s*wrap/)
  assert.match(checks, /gap:\s*var\(--piai-space-2\) var\(--piai-space-4\)/, '8px rows / 16px columns')
  const checkLabel = rule('.piai-root .piai-checks > label')
  assert.match(checkLabel, /display:\s*inline-flex/)
  assert.match(checkLabel, /flex:\s*none/)
  assert.match(checkLabel, /gap:\s*var\(--piai-space-1\)/, 'box ↔ label gap tightens to 4px')
  // v8 R1: the box is pinned so no ancestor stretch can reach it...
  const checkBox = rule('.piai-root .piai-checks > label > input')
  assert.match(checkBox, /flex:\s*none/)
  assert.match(checkBox, /width:\s*16px/)
  assert.match(checkBox, /min-width:\s*16px/)
  assert.match(checkBox, /height:\s*16px/)
  // ...and the text must never be allowed to vanish: nowrap stays, but the
  // min-width/overflow/ellipsis trio that resolved to zero width is gone.
  const checkText = rule('.piai-root .piai-checks > label > span')
  assert.match(checkText, /white-space:\s*nowrap/, 'a checkbox label never wraps')
  for (const forbidden of ['min-width', 'overflow', 'text-overflow']) {
    assert.equal(
      checkText.includes(forbidden),
      false,
      `v8 R1: ${forbidden} on the checkbox label span collapses it to zero width`,
    )
  }

  // --- v8 R2/R3: the branch block loses its rail; the disclosure body indents
  // by exactly the header chrome (14px chevron + 4px gap).
  const nested = rule('.piai-root .piai-nested')
  assert.equal(nested.includes('border-left'), false, 'v8 R2: the branch rail must be gone')
  assert.equal(nested.includes('padding-left'), false, 'v8 R2: the branch indent must be gone')
  const disclosureBody = rule('.piai-root .piai-disclosure-body')
  assert.match(disclosureBody, /padding-left:\s*18px/)
  assert.match(disclosureBody, /min-width:\s*0/)

  // --- R6 the five rows that pair a Button with an input (§15.7) ------------
  for (const scope of ['piai-provider-add']) {
    const declarations = rule(`.piai-root .${scope} button`)
    assert.match(declarations, /height:\s*32px/, `${scope} button matches the 32px input`)
    assert.match(declarations, /padding:\s*0 var\(--piai-space-3\)/)
    assert.match(declarations, /border-radius:\s*var\(--dsw-radius-md\)/)
  }
  const grouped = block('.piai-root .piai-dict-add button')
  for (const scope of ['piai-dict-add', 'piai-tag-add', 'piai-cred', 'piai-cred-editor']) {
    assert.ok(
      css.includes(`.piai-root .${scope} button`),
      `.piai-root .${scope} button must be part of the 32px group`,
    )
  }
  assert.match(grouped, /height:\s*32px/)
  assert.match(grouped, /padding:\s*0 var\(--piai-space-3\)/)
  assert.match(grouped, /border-radius:\s*var\(--dsw-radius-md\)/)

  // --- R3 card head: the right-hand action slot carries a permanent remove --
  const head = rule('.piai-root .piai-item-head')
  assert.match(head, /display:\s*flex/)
  assert.match(head, /align-items:\s*center/)
  assert.match(head, /gap:\s*6px/)
  const actions = rule('.piai-root .piai-item-actions')
  assert.match(actions, /display:\s*inline-flex/)
  assert.match(actions, /margin-left:\s*auto/)
  assert.match(actions, /gap:\s*var\(--piai-space-1\)/)
  const remove = rule('.piai-root .piai-item-remove')
  assert.match(remove, /width:\s*28px/)
  assert.match(remove, /height:\s*28px/)
  assert.match(remove, /border-radius:\s*var\(--piai-radius-sm\)/)
  assert.match(remove, /color:\s*var\(--dsw-alias-label-tertiary\)/)
  assert.match(remove, /background:\s*none/)
  const removeHover = [...css.matchAll(/\.piai-root \.piai-item-remove:hover\s*\{([^}]*)\}/g)].map(
    (match) => match[1],
  )
  assert.ok(
    removeHover.some((declarations) => /--dsw-alias-state-error-primary/.test(declarations)),
    'hovering the remove button signals the destructive action',
  )
  const reveal = rule('.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove')
  assert.match(reveal, /opacity:\s*1/, 'keyboard focus reveals the remove button')
})

test('CSS classes, exported CLASSES and the JS literals are the same 67 names', () => {
  const api = loadStyles().api
  const exported = [...api.CLASSES]
  assert.equal(exported.length, 67, `the frozen class list has 67 names, got ${exported.length}`)
  assert.deepEqual(exported, [...exported].sort(), 'CLASSES must be sorted')
  // v7 §15.8 no.1: the card head / action slot / icon button; piai-key stays
  // (moved into the hint tooltip). v8: piai-count is gone and the compat
  // disclosure body gets its own class. T7 (+2 / −1, still sorted): the tab
  // strip grows its two-slot bar and the provider pick list its own class,
  // while `piai-tier-key` retires — a tier row is an ordinary Row now, so the
  // bare key chip it used to draw is gone.
  for (const name of ['piai-item-head', 'piai-item-actions', 'piai-item-remove', 'piai-key']) {
    assert.ok(exported.includes(name), `${name} must stay in the frozen list`)
  }
  assert.ok(exported.includes('piai-disclosure-body'), 'v8: the disclosure body class must exist')
  assert.equal(exported.includes('piai-count'), false, 'v8: the piai-count badge class must be gone')
  assert.ok(exported.includes('piai-tabs-bar'), 'T7: the tab strip needs its two-slot bar class')
  assert.ok(exported.includes('piai-catalog'), 'T7: the provider pick list needs its own class')
  assert.equal(
    exported.includes('piai-tier-key'),
    false,
    'T7: the tier row renders through Row now; the bare key chip class must be gone',
  )

  const inCss = selectorClasses(api.STYLESHEET)
  const inJs = new Set([
    // v10: every class-emitting chunk, derived from the directory.
    ...jsClassSources().flatMap((entry) => sourceClassesOf(entry.source)),
  ])

  const deadInCss = exported.filter((name) => !inCss.has(name))
  const undocumentedCss = [...inCss].filter((name) => !exported.includes(name))
  const missingFromCss = exported.filter((name) => !inCss.has(name))
  const deadInJs = exported.filter((name) => !inJs.has(name))
  const undocumentedJs = [...inJs].filter((name) => !exported.includes(name))

  assert.deepEqual(undocumentedCss, [], 'CSS must not define a class outside CLASSES')
  assert.deepEqual(missingFromCss, [], 'every CLASSES name must be styled')
  assert.deepEqual(deadInJs, [], 'every CLASSES name must be emitted by the page or panels')
  assert.deepEqual(undocumentedJs, [], 'the JS must not emit a class outside CLASSES')
  assert.deepEqual(deadInCss, [])
  assert.deepEqual([...inCss].sort(), [...inJs].sort(), 'CSS and JS class sets must be equal')
  assert.deepEqual([...inJs].sort(), [...exported].sort())
})

test('a nested/portalled root inherits the surface colour instead of a theme alias', () => {
  // T31/§18.6.1: the primitives portal the Tooltip bubble and the Modal out of
  // every `.piai-root` ancestor. Their surface is NOT the page background — the
  // bubble paints its own static light foreground — so a nested root must
  // inherit the colour it is portalled into. Pointing it back at the theme alias
  // painted dark-on-dark in the light theme (the third GUI report).
  //
  // The browser fixture (tests/layout `r7-bubble.html`) measures the computed
  // colours; this is the CSS-text half, so a refactor that drops the declaration
  // fails here even before the browser runs.
  const css = loadStyles().api.STYLESHEET
  const block = (selector) => {
    const at = css.indexOf(selector)
    assert.notEqual(at, -1, `${selector} must exist`)
    const open = css.indexOf('{', at)
    return css.slice(open + 1, css.indexOf('}', open))
  }

  const nested = block('.piai-root .piai-root,')
  assert.match(
    nested,
    /color:\s*inherit/,
    'the nested root must inherit the surface colour, not resolve a theme alias',
  )
  assert.match(nested, /background:\s*none/, 'and keep neutralising the page background')
  assert.equal(
    /color:\s*var\(/.test(nested),
    false,
    'a nested root must never point its colour at a theme alias',
  )

  const chip = block('.piai-root .piai-root > .piai-key,')
  assert.match(chip, /align-self:\s*flex-start/, 'the chip still keeps its own width')
  // T35/T36 adjudication: only the BODY inherits the surface. The chip keeps its
  // own theme colour pair — base `.piai-key` sets `--dsw-alias-label-secondary`,
  // which is readable on its own light `--dsw-alias-bg-layer-2` box (6.51:1).
  // Inheriting the bubble's light foreground onto that box gave 1.09:1 (measured
  // in `tests/layout/r7-bubble.html`), so this rule must NOT declare a colour.
  assert.equal(
    /(^|[;{\s])color\s*:/.test(chip),
    false,
    'the nested chip rule must not declare a colour: the chip uses its own theme token pair',
  )

  const baseChip = block('.piai-root .piai-key {')
  assert.match(
    baseChip,
    /color:\s*var\(--dsw-alias-label-secondary\)/,
    'the base chip keeps its theme secondary, which is readable on its own box',
  )
})
