/**
 * Independent polish verification for the "模型扩展配置" page.
 *
 * Owner: verifier4 (task-13). Plain `node tests/verify.polish.mjs`; not a
 * `node:test` file (like tests/verify.integration.mjs and tests/verify.render.mjs).
 *
 * It attacks the implementation against the FROZEN contract
 * `docs/interaction-design.md` and nothing else:
 *
 *   P1 STYLE CONTRACT (§7)   one <style>, explicit data-plugin tagging, idempotent
 *                            install, own-node-only + double-call-safe disposer,
 *                            safe no-op without `document`, no `</style>`.
 *   P2 LEAK CHECK (§5)       every selector starts with `.piai-root`; no element or
 *                            `*` compounds, no `@import`, no external `url(`, no
 *                            `!important`.
 *   P3 TOKEN POLICY (§2)     only the allowlisted `--dsw-*` tokens; no hex/rgb/hsl/keywords;
 *                            the local `--piai-*` scale is defined on `.piai-root`.
 *   P4 CLASS COVERAGE (§4)   set(CSS classes) == set(JS `piai-*` literals) == the
 *                            frozen 67-name list (T7: +tabs-bar/+catalog,
 *                            −tier-key; §15.8 added item-head/item-actions/
 *                            item-remove).
 *   P5 A11Y (§8,§11)         rendered with an independent mini-renderer: the provider
 *                            tab strip (role=tablist/tab, roving tabindex) + role=tabpanel,
 *                            alert/live regions, stable ids, named radiogroups, compat
 *                            6 groups / 26 keys / withheld-but-editable.
 *   P6 RESILIENCE (§1.3,§7)  a REJECTED styles chunk must still render (unstyled, not
 *                            blank) and must not throw; the selector-hook hardening
 *                            from the abdication incident must be intact.
 *   P7 NEGATIVE CONTROL      env overrides point the same checks at /tmp mutants; the
 *                            matching check must FAIL (see the runbook at the bottom).
 *
 * Env overrides (used only for the negative control; defaults are the project files):
 *   VERIFY_POLISH_STYLES_LIB, VERIFY_POLISH_OWNER_LIB, VERIFY_POLISH_PANELS_LIB
 *   VERIFY_POLISH_ONLY=styles|render  (development convenience, not for records)
 *
 * @module dsh-llm-pi-ai-config/tests/verify.polish
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { createContext, runInContext } from 'node:vm'
import { jsClassSources } from './helpers/class-sources.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const LIB = join(ROOT, 'lib')

const STYLES_LIB = process.env.VERIFY_POLISH_STYLES_LIB ?? join(LIB, 'client.styles.js')
/** The stylesheet fragments `client.styles.js` composes (v10), in load order. */
const STYLE_PART_FILES = ['client.styles.chrome.js', 'client.styles.controls.js']
const OWNER_LIB = process.env.VERIFY_POLISH_OWNER_LIB ?? join(LIB, 'client.js')
const PANELS_LIB = process.env.VERIFY_POLISH_PANELS_LIB ?? join(LIB, 'client.panels.js')
const FIXTURE_ENVELOPE = join(ROOT, 'tests', 'fixtures', 'llm-pi-ai.schema.json')
const OWNER_ID = 'dsh-llm-pi-ai-config'

/** §15.2 item 7: the fixed ids of the trailing 「添加」 tab and its panel. */
const ADD_TAB_ID = 'model-extended-tab-add'
const ADD_PANEL_ID = 'model-extended-panel-add'

const ASAR = process.env.DSH_ASAR_OUT ?? '/tmp/asarx/out/dsh/node_modules/@deepseek-ai'
const RENDERER_LIB = join(ASAR, 'dsh-client-ui-renderer/lib/client.js')
const SLOTS_LIB = join(ASAR, 'dsh-client-ui-slots/lib/index.js')

/* ==================================================================== *
 * frozen contract, transcribed verbatim from docs/interaction-design.md
 * ==================================================================== */

/**
 * Platform tokens that may appear as `var(--dsw-…)`.
 *
 * v1 = the 14 of interaction-design.md §2; v2 (§10.5) ADDS four official
 * primitives tokens so our controls can match the shipped skin:
 * `--dsw-radius-md`, `--dsw-alias-border-l4`, `--dsw-alias-label-dimmed`,
 * `--dsw-alias-label-tertiary`; v6 (§14) adds the two tokens the shipped Models
 * page draws its cards and grids with: `--dsw-alias-bg-module-platform` and
 * `--dsw-radius-lg`. (`--dsw-alias-state-business-primary` left the list in the
 * v5 pass: its only rules were the focus rings the primitives already draw, and
 * stacking them tripled the border on a focused input — docs/verification.md §14.)
 * Anything else is still forbidden, as are all hardcoded colours.
 */
const TOKEN_ALLOWLIST = [
  // §2 (14)
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
  // §10.5 (5)
  '--dsw-radius-md',
  '--dsw-alias-border-l4',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-tertiary',
  // §14 v6 (2)
  '--dsw-alias-bg-module-platform',
  '--dsw-radius-lg',
  // §15.8 / §15.9 D3 v7 (3): the official focus-ring pair the shipped tab /
  // help-button rings use, plus the one foreground token R4's self-drawn enum
  // box needs for its check mark.
  '--dsw-focus-ring-width',
  '--dsw-focus-ring-color',
  '--dsw-alias-label-primary-foreground',
]

/** §2 — local scale. §10.4 lets radius be served by `--dsw-radius-md` instead. */
const LOCAL_SCALE = [
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
]

/** §2/§10.2 — local scale entries the v2 layout itself depends on. */
const REQUIRED_LOCAL_SCALE = LOCAL_SCALE.filter((name) => !name.startsWith('--piai-radius-'))

/** §4/§15.8 — the frozen 67 class names: CSS set == JS set == this set. */
const FROZEN_CLASSES = [
  'piai-array',
  'piai-array-index',
  'piai-array-row',
  'piai-bar',
  'piai-body',
  'piai-bool',
  'piai-boundary',
  'piai-btn',
  'piai-btn-primary',
  'piai-catalog',
  'piai-checks',
  'piai-clear',
  'piai-cred',
  'piai-cred-editor',
  'piai-dict',
  'piai-dict-add',
  'piai-dict-key',
  'piai-dict-row',
  'piai-dirty',
  'piai-disclosure',
  'piai-disclosure-body',
  'piai-empty',
  'piai-error',
  'piai-expr',
  'piai-expr-body',
  'piai-fields',
  'piai-group',
  'piai-group-title',
  'piai-header',
  'piai-hint',
  'piai-info',
  'piai-item-actions',
  'piai-item-head',
  'piai-item-remove',
  'piai-key',
  'piai-loading',
  'piai-nested',
  'piai-nested-title',
  'piai-notices',
  'piai-page',
  'piai-panel',
  'piai-provider-add',
  'piai-provider-list',
  'piai-providers',
  'piai-readonly',
  'piai-required',
  'piai-reset',
  'piai-root',
  'piai-row',
  'piai-row-control',
  'piai-row-head',
  'piai-row-label',
  'piai-row-pair',
  'piai-select',
  'piai-subtitle',
  'piai-tabs',
  'piai-tabs-bar',
  'piai-tag',
  'piai-tag-add',
  'piai-tags',
  'piai-tier',
  'piai-tiers',
  'piai-title',
  'piai-union',
  'piai-unit',
  'piai-warn',
  'piai-with-unit',
]

/**
 * §4 — REMOVED across passes; must not survive anywhere.
 *
 * `piai-tab` retired in v7; `piai-tier-key` retires in T7 (the tiers table now
 * renders ordinary rows, so the bare key chip it drew is gone).
 */
const REMOVED_CLASSES = ['piai-tab', 'piai-tier-key']

/** §6 — the frozen compat disclosure groups (6 groups, 26 keys). */
const COMPAT_GROUPS = [
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
const FROZEN_COMPAT_KEYS = COMPAT_GROUPS.flatMap((group) => group.keys)

/** CSS named colors (compact) + the two special keywords. */
const COLOR_KEYWORDS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
  'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
  'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
  'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
  'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
  'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
  'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
  'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
  'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
  'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
  'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
  'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
  'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
  'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
  'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent currentcolor'
)
  .split(/\s+/)
  .filter(Boolean)

/** §8/§6 — primitive names whose props this harness inspects. */
/**
 * Primitives that carry a field's own `id`, used to collect the page's stable
 * control ids. T7 retires `Switch`: a boolean leaf is a self-drawn
 * `role="radiogroup"` now, so the primitive is in none of our trees.
 */
const FIELD_PRIMITIVES = ['SettingsValueField', 'SettingsSecretField', 'Input']

/* ==================================================================== *
 * check runner
 * ==================================================================== */

const results = []
let currentSection = '(none)'

function section(title) {
  currentSection = title
  process.stdout.write(`\n=== ${title}\n`)
}

async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail: detail ?? '' })
    process.stdout.write(`[PASS] ${name}${detail ? ` — ${detail}` : ''}\n`)
  } catch (error) {
    results.push({ name, ok: false, detail: error?.message ?? String(error) })
    process.stdout.write(`[FAIL] ${name}\n       ${(error?.stack ?? String(error)).split('\n').join('\n       ')}\n`)
  }
}

/** Print an observation that informs the report but does not fail the harness. */
async function observe(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, observed: true, detail: detail ?? '' })
    process.stdout.write(`[OBS ] ${name}${detail ? ` — ${detail}` : ''}\n`)
  } catch (error) {
    results.push({ name, ok: false, observed: true, detail: error?.message ?? String(error) })
    process.stdout.write(`[OBS!] ${name} — ${error?.message ?? error}\n`)
  }
}

/* ==================================================================== *
 * text helpers
 * ==================================================================== */

function readSource(file, what) {
  if (!existsSync(file)) {
    throw new Error(`${what ?? 'source'} not found: ${file}`)
  }
  return readFileSync(file, 'utf8')
}

function md5(buffer) {
  return createHash('md5').update(buffer).digest('hex')
}

/**
 * Remove `//` and block comments (string literals preserved) so structural
 * checks cannot be fooled by prose. Regex literals containing `//` would be
 * misread; the project's sources have none, and a misparse shows up as a loud
 * missing-token failure rather than a silent pass.
 */
function stripJsComments(source) {
  let out = ''
  let quote = null
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      out += ch
      if (ch === '\\') {
        out += source[i + 1] ?? ''
        i += 1
      } else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      out += '\n'
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      out += ' '
      continue
    }
    out += ch
  }
  return out
}

/** Every `piai-*` token in executable code (comments stripped). */
function piaiTokensInJs(source) {
  return new Set(stripJsComments(source).match(/piai-[A-Za-z0-9_-]+/g) ?? [])
}

/** Split a selector list on top-level commas only (parens respected). */
function splitSelectorList(list) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth += 1
    if (ch === ')' || ch === ']') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf)
  return out.map((part) => part.trim()).filter(Boolean)
}

/* ==================================================================== *
 * minimal CSS parser (selectors / at-rules / declarations)
 * ==================================================================== */

function parseStylesheet(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  const selectors = []
  const atRules = []
  const keyframes = []
  const declarations = []
  const rules = []
  const atBlocks = []
  const stack = []
  let buf = ''
  let i = 0

  const pushDecls = (text, rule) => {
    for (const piece of text.split(';')) {
      const decl = piece.trim()
      if (!decl) continue
      const colon = decl.indexOf(':')
      if (colon === -1) continue
      const entry = { prop: decl.slice(0, colon).trim(), value: decl.slice(colon + 1).trim() }
      declarations.push(entry)
      if (rule !== undefined) rule.declarations.push(entry)
    }
  }

  while (i < clean.length) {
    const ch = clean[i]
    if (ch === '{') {
      const prelude = buf.trim()
      buf = ''
      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s({]/)[0]
        atRules.push(prelude)
        if (/keyframes$/i.test(name)) {
          keyframes.push(prelude.replace(/^@[-\w]*keyframes\s*/i, '').trim())
          stack.push({ kind: 'keyframes' })
        } else {
          const block = { prelude, name, rules: [] }
          atBlocks.push(block)
          stack.push({ kind: 'at', name, block })
        }
      } else {
        const enclosing = stack[stack.length - 1]
        if (enclosing === undefined || enclosing.kind !== 'keyframes') {
          const at = stack.filter((frame) => frame.kind === 'at').map((frame) => frame.block.prelude)
          const list = []
          for (const selector of splitSelectorList(prelude)) {
            selectors.push(selector)
            const rule = { selector, declarations: [], at }
            rules.push(rule)
            list.push(rule)
            if (enclosing !== undefined && enclosing.kind === 'at') enclosing.block.rules.push(rule)
          }
          stack.push({ kind: 'rule', rules: list })
        } else {
          stack.push({ kind: 'rule', rules: [] })
        }
      }
      i += 1
      continue
    }
    if (ch === '}') {
      const text = buf.trim()
      buf = ''
      const top = stack[stack.length - 1]
      if (text && top !== undefined && top.kind === 'rule') {
        for (const rule of top.rules) pushDecls(text, rule)
      }
      stack.pop()
      i += 1
      continue
    }
    if (ch === ';') {
      const text = buf.trim()
      buf = ''
      if (text.startsWith('@')) atRules.push(text)
      else {
        const top = stack[stack.length - 1]
        if (text && top !== undefined && top.kind === 'rule') {
          for (const rule of top.rules) pushDecls(text + ';', rule)
        }
      }
      i += 1
      continue
    }
    buf += ch
    i += 1
  }
  return { clean, selectors, atRules, keyframes, declarations, rules, atBlocks }
}

/** Collapse whitespace (and combinator spacing) so equivalent selectors compare equal. */
function normalizeSelector(selector) {
  return String(selector)
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .trim()
}

/**
 * Every rule whose selector matches `selector` exactly (whitespace-normalised).
 *
 * @param parsed - a `parseStylesheet()` result.
 * @param selector - the selector text the frozen contract names.
 * @returns declarations of the matching rules, flattened.
 */
function declarationsFor(parsed, selector) {
  const wanted = normalizeSelector(selector)
  const out = []
  for (const rule of parsed.rules) {
    if (normalizeSelector(rule.selector) === wanted) out.push(...rule.declarations)
  }
  return out
}

/** `{prop: value}` of the last declaration for each property of a selector. */
function declarationMap(parsed, selector) {
  const map = {}
  for (const { prop, value } of declarationsFor(parsed, selector)) map[prop] = value
  return map
}

/** `@media` preludes that use a WIDTH condition (forbidden by §10.2). */
function widthMediaPreludes(parsed) {
  const widthish = /\b(width|min-width|max-width|orientation)\b/i
  return parsed.atBlocks
    .filter((block) => /^@media/i.test(block.prelude))
    .map((block) => block.prelude)
    .filter((prelude) => widthish.test(prelude))
}

/** A compound selector that begins with a bare element name, `*`, or `[`. */
function bareCompound(selector) {
  const compounds = selector.split(/(?=[\s>+~])|(?<=[\s>+~])/).map((part) => part.trim()).filter(Boolean)
  for (const part of compounds) {
    if (part === '>' || part === '+' || part === '~' || part === ',') continue
    if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(part) && !/^(from|to)$/.test(part)) return part
    if (part.startsWith('*')) return '*'
    if (part.startsWith('[')) return part
  }
  // Also catch a bare element/`*` after a combinator inside one compound chunk.
  const m = selector.match(/(?:^|[\s>+~])(\*|[a-zA-Z][a-zA-Z0-9-]*)(?=[\s>+~.:#[]|$)/)
  if (m !== null) {
    const name = m[1]
    if (!/^(from|to)$/.test(name)) return name
  }
  return null
}

/* ==================================================================== *
 * fake document + mini loader
 * ==================================================================== */

function makeElement(tagName) {
  const el = {
    nodeType: 1,
    tagName: String(tagName).toUpperCase(),
    attributes: {},
    childNodes: [],
    parentNode: null,
    _text: '',
    setAttribute(key, value) {
      el.attributes[String(key)] = String(value)
    },
    getAttribute(key) {
      return Object.prototype.hasOwnProperty.call(el.attributes, String(key))
        ? el.attributes[String(key)]
        : null
    },
    hasAttribute(key) {
      return Object.prototype.hasOwnProperty.call(el.attributes, String(key))
    },
    removeAttribute(key) {
      delete el.attributes[String(key)]
    },
    appendChild(child) {
      child.parentNode = el
      el.childNodes.push(child)
      return child
    },
    insertBefore(child, reference) {
      const index = el.childNodes.indexOf(reference)
      child.parentNode = el
      if (index === -1) el.childNodes.push(child)
      else el.childNodes.splice(index, 0, child)
      return child
    },
    removeChild(child) {
      const index = el.childNodes.indexOf(child)
      if (index !== -1) el.childNodes.splice(index, 1)
      child.parentNode = null
      return child
    },
    remove() {
      if (el.parentNode !== null) el.parentNode.removeChild(el)
    },
    get textContent() {
      const own = el._text
      const kids = el.childNodes.map((child) => child.textContent ?? '').join('')
      return own + kids
    },
    set textContent(value) {
      el._text = value === undefined || value === null ? '' : String(value)
      el.childNodes = []
    },
    get ownerDocument() {
      return el._document ?? null
    },
  }
  return el
}

/** Matches `style`, `#id`, `[attr]`, `[attr="v"]`, `[attr=v]`, optionally tag-qualified. */
function makeSelectorMatcher(selector) {
  const trimmed = selector.trim()
  const m = trimmed.match(/^([A-Za-z][A-Za-z0-9-]*)?(?:#([\w-]+))?(?:\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\])?$/)
  if (m === null) return () => false
  const [, tag, id, attr, q1, q2, bare] = m
  const want = q1 ?? q2 ?? bare
  return (node) => {
    if (node === null || typeof node !== 'object' || node.nodeType !== 1) return false
    if (tag !== undefined && tag !== '' && node.tagName !== tag.toUpperCase()) return false
    if (id !== undefined && node.getAttribute('id') !== id) return false
    if (attr !== undefined) {
      if (!node.hasAttribute(attr)) return false
      if (want !== undefined && node.getAttribute(attr) !== want) return false
    }
    return true
  }
}

function createFakeDocument() {
  const head = makeElement('head')
  const body = makeElement('body')
  const doc = {
    head,
    body,
    documentElement: makeElement('html'),
    createElement: (tag) => makeElement(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), parentNode: null }),
    getElementsByTagName: (tag) => (String(tag).toLowerCase() === 'head' ? [head] : []),
    querySelector(selector) {
      return doc.querySelectorAll(selector)[0] ?? null
    },
    querySelectorAll(selector) {
      const match = makeSelectorMatcher(selector)
      const out = []
      const walk = (node) => {
        for (const child of node.childNodes ?? []) {
          if (match(child)) out.push(child)
          walk(child)
        }
      }
      walk(head)
      walk(body)
      return out
    },
  }
  head._document = doc
  body._document = doc
  return doc
}

function baseSandbox() {
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
    WeakMap,
    Date,
    RegExp,
    Math,
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  return sandbox
}

/**
 * Load the styles chunk as a browser classic script and return its API.
 *
 * @param options - `{ withDocument }` (default true).
 * @returns `{ api, registration, doc, sandbox }`.
 */
function loadStylesChunk(options = {}) {
  const sandbox = baseSandbox()
  const registrations = []
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  let doc
  if (options.withDocument !== false) {
    doc = createFakeDocument()
    sandbox.document = doc
  }
  createContext(sandbox)
  // v10: the sheet is composed from two area fragments, read out of the registry
  // at eval time, so they load first (the owner's phase order).
  for (const part of STYLE_PART_FILES) {
    runInContext(readSource(join(LIB, part), part), sandbox, { filename: join(LIB, part) })
    registrations[registrations.length - 1].factory()
  }
  const before = registrations.length
  runInContext(readSource(STYLES_LIB, 'styles chunk'), sandbox, { filename: STYLES_LIB })
  assert.equal(
    registrations.length - before,
    1,
    'the styles chunk must call __ModuleLoader__.load exactly once',
  )
  const registration = registrations[registrations.length - 1]
  assert.equal(registration.id, OWNER_ID)
  assert.equal(registration.chunk, 'client.styles.js', 'the styles chunk must carry its own chunk field')
  const api = registration.factory((specifier) => {
    throw new Error(`styles chunk required unexpected seed word ${specifier}`)
  })
  assert.ok(api !== null && typeof api === 'object', 'the styles factory must return an API object')
  return { api, registration, doc, sandbox }
}

/* ==================================================================== *
 * PHASE P1 — style contract (§7)
 * ==================================================================== */

async function phaseStyleContract() {
  section('P1 — style contract (interaction-design §7)')

  await check('P1a exactly one <style> after install, carrying the full STYLESHEET', () => {
    const { api, doc } = loadStylesChunk()
    assert.equal(typeof api.STYLESHEET, 'string', 'STYLESHEET must be a string')
    assert.equal(typeof api.install, 'function', 'install() must be a function')
    const off = api.install()
    assert.equal(typeof off, 'function', 'install() must return a disposer function')
    const styles = doc.head.childNodes.filter((node) => node.tagName === 'STYLE')
    assert.equal(styles.length, 1, `expected exactly one <style>, got ${styles.length}`)
    assert.equal(styles[0].textContent, api.STYLESHEET, 'the injected CSS must equal STYLESHEET')
    off()
    return `${api.STYLESHEET.length} bytes of CSS, one <style> node`
  })

  await check('P1b the element carries the explicit data-plugin / data-plugin-css tags', () => {
    const { api, doc } = loadStylesChunk()
    const off = api.install()
    const style = doc.head.childNodes.find((node) => node.tagName === 'STYLE')
    assert.ok(style, 'no <style> was injected')
    assert.equal(
      style.getAttribute('data-plugin'),
      OWNER_ID,
      'data-plugin must be the explicit owner id (an untagged <style> is claimed by the next plugin)',
    )
    assert.equal(
      style.getAttribute('data-plugin-css'),
      'llm-pi-ai-config',
      'data-plugin-css must be the explicit css id',
    )
    off()
  })

  await check('P1c install() is idempotent: repeat calls reuse one node', () => {
    const { api, doc } = loadStylesChunk()
    const off1 = api.install()
    const first = doc.head.childNodes.filter((node) => node.tagName === 'STYLE')
    assert.equal(first.length, 1)
    const off2 = api.install()
    const second = doc.head.childNodes.filter((node) => node.tagName === 'STYLE')
    assert.equal(second.length, 1, `a second install() added another <style> (now ${second.length})`)
    assert.equal(second[0], first[0], 'reinstall must reuse the SAME <style> node')
    off1()
    assert.equal(doc.head.childNodes.filter((n) => n.tagName === 'STYLE').length, 0, 'disposer 1 must remove the node')
    off1() // double call
    assert.equal(doc.head.childNodes.filter((n) => n.tagName === 'STYLE').length, 0)
    off2() // second disposer after the node is already gone
    return 'off1() + off1() + off2() all safe, single node throughout'
  })

  await check('P1d the disposer removes only its own node; foreign styles survive', () => {
    const { api, doc } = loadStylesChunk()
    const foreign = makeElement('style')
    foreign.setAttribute('data-plugin', 'some-other-plugin')
    foreign.textContent = '.other { color: var(--dsw-alias-label-primary); }'
    foreign.parentNode = doc.head
    doc.head.childNodes.push(foreign)
    const off = api.install()
    assert.equal(doc.head.childNodes.filter((n) => n.tagName === 'STYLE').length, 2)
    off()
    const remaining = doc.head.childNodes.filter((n) => n.tagName === 'STYLE')
    assert.equal(remaining.length, 1, `expected only the foreign <style> to survive, got ${remaining.length}`)
    assert.equal(remaining[0], foreign, 'the disposer removed a node it did not create')
    return 'foreign <style data-plugin="some-other-plugin"> preserved'
  })

  await check('P1e install() with no document is a safe no-op', () => {
    const { api } = loadStylesChunk({ withDocument: false })
    let off
    assert.doesNotThrow(() => {
      off = api.install()
    }, 'install() without document must not throw')
    assert.equal(typeof off, 'function', 'install() without document must still return a function')
    assert.doesNotThrow(() => off(), 'the no-op disposer must be callable')
    assert.doesNotThrow(() => api.uninstall(), 'uninstall() without document must not throw')
  })

  await check('P1f STYLESHEET contains no </style> and no template placeholder', () => {
    const { api } = loadStylesChunk()
    assert.ok(!api.STYLESHEET.includes('</style>'), 'STYLESHEET must not contain </style>')
    assert.ok(!api.STYLESHEET.includes('${'), 'STYLESHEET must not contain a template placeholder')
    return 'no </style>, no ${'
  })
}

/* ==================================================================== *
 * PHASE P2 — leak check (§5 / §10.6) + container-awareness (§10.2)
 * ==================================================================== */

/**
 * A `*` universal selector that hangs directly off `.piai-root` (e.g.
 * `.piai-root *`, `.piai-root > *`). §10.6 forbids exactly this broad form;
 * `.piai-root .piai-row-control > *` (§10.3) is scoped to one scoped class and
 * is explicitly required, so it must NOT be flagged.
 */
function broadUniversal(selector) {
  return /(^|[\s>+~])\.piai-root\s*[>+~]?\s*\*/.test(String(selector))
}

async function phaseLeak() {
  section('P2 — leak check (interaction-design §5, §10.2, §10.6)')

  const css = loadStylesChunk().api.STYLESHEET
  const parsed = parseStylesheet(css)

  await check('P2a every selector starts with .piai-root (relaxed rule §10.6)', () => {
    assert.ok(parsed.selectors.length > 0, 'the stylesheet declares no selectors at all')
    const bad = parsed.selectors.filter((selector) => !selector.startsWith('.piai-root'))
    assert.deepEqual(bad, [], `unscoped selectors: ${JSON.stringify(bad.slice(0, 12))}`)
    return `${parsed.selectors.length} selectors, all scoped`
  })

  await check('P2b no broad `*` universal selector, no @import / !important / url(', () => {
    // task-15/18 adjudication: §10.6 RELAXES the old rule. Descendant element
    // and attribute selectors after `.piai-root` are now allowed on purpose
    // (`.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"])`,
    // v8 R1 guards the checkbox/radio exclusion), so the old "no bare compound
    // anywhere" assertion encoded the v1 rule and was replaced by the two v2
    // rules: no broad `.piai-root *` universal, and no unscoped selector (P2a).
    const bad = parsed.selectors.filter((selector) => broadUniversal(selector))
    assert.deepEqual(bad, [], `broad universal selectors: ${JSON.stringify(bad.slice(0, 12))}`)
    assert.doesNotMatch(css, /@import/i, '@import is forbidden')
    assert.doesNotMatch(css, /!important/i, '!important is forbidden')
    assert.doesNotMatch(css, /url\s*\(/i, 'url( is forbidden')
    // task-18 adjudication: §10.3 REQUIRES `.piai-root .piai-row-control > *`, so
    // "zero universals" is not the contract. The allowance is exactly the child
    // universal whose parent is one scoped class under `.piai-root` — a shape
    // that cannot leave our subtree. Any other universal-bearing selector fails.
    const universals = parsed.selectors.filter((selector) => selector.includes('*'))
    const ALLOWED_UNIVERSAL = /^\.piai-root\s+[^\s>+~,]+\s*>\*$/
    const badShape = universals.filter((selector) => !ALLOWED_UNIVERSAL.test(normalizeSelector(selector)))
    assert.deepEqual(
      badShape,
      [],
      `universal selectors outside the §10.3 allowance `.concat(
        `(\`.piai-root .<class> > *\`): ${JSON.stringify(badShape)}`,
      ),
    )
    return (
      `${parsed.selectors.length} selectors; broad .piai-root * =0; ` +
      `${universals.length} allowed child universals: ${JSON.stringify(universals)}`
    )
  })

  await check('P2c no width-based @media anywhere — only prefers-* (§10.2, HIGH)', () => {
    const bad = widthMediaPreludes(parsed)
    assert.deepEqual(
      bad,
      [],
      `width-based @media re-introduces viewport-aware layout and never fires inside a narrower ` +
        `Settings modal: ${JSON.stringify(bad)}`,
    )
    const media = parsed.atBlocks.filter((block) => /^@media/i.test(block.prelude)).map((b) => b.prelude)
    const nonPrefers = media.filter((prelude) => !/prefers-/i.test(prelude))
    assert.deepEqual(nonPrefers, [], `@media must only use prefers-*: ${JSON.stringify(nonPrefers)}`)
    return media.length === 0 ? 'no @media at all' : `@media allowed: ${JSON.stringify(media)}`
  })

  await check('P2d @keyframes names are piai-prefixed', () => {
    const bad = parsed.keyframes.filter((name) => !name.startsWith('piai-'))
    assert.deepEqual(bad, [], `unprefixed @keyframes: ${JSON.stringify(bad)}`)
    return parsed.keyframes.length === 0 ? 'no @keyframes' : `@keyframes: ${parsed.keyframes.join(', ')}`
  })

  await check('P2e the relaxation cannot leak into other plugins’ UI (proof)', async () => {
    // Structural half: every selector is anchored at `.piai-root`, and the only
    // combinator that can leave that anchor is a descendant/child of its own
    // subtree, so a match outside our page root is impossible.
    const unanchored = parsed.selectors.filter((selector) => !selector.startsWith('.piai-root'))
    assert.deepEqual(unanchored, [], `selectors not anchored at .piai-root: ${JSON.stringify(unanchored)}`)
    // Runtime half: exactly ONE node in the rendered tree carries `piai-root`,
    // and it is our section root, so there is no other element the anchor could
    // attach to. (`piai-root` is our private class; the host never applies it.)
    const probe = await renderCell({
      mirrorSnapshot: servedSnapshot(fixture(), { providers: { alpha: {} } }),
      value: { providers: { alpha: {} } },
    })
    const roots = []
    walkHosts(probe.outcome.tree, (node) => {
      const className = node.props?.className
      if (typeof className === 'string' && className.split(/\s+/).includes('piai-root')) {
        roots.push({ type: node.type, className, dataPiai: node.props?.['data-piai'] })
      }
    })
    assert.equal(roots.length, 1, `expected exactly one .piai-root node, got ${JSON.stringify(roots)}`)
    assert.equal(roots[0].dataPiai, '1', 'the root must carry data-piai="1" (interaction-design §3)')
    // v10: the page root is `client.page.js`; the assertion is that the class is
    // applied by OUR code (never by the host), so it scans the whole class
    // emitting chunk set rather than one file.
    const pageHits = jsClassSources()
      .map((entry) => stripJsComments(entry.source))
      .join('\n')
      .match(/piai-root/g) ?? []
    assert.ok(pageHits.length >= 1, 'our chunks must apply piai-root to the page root element')
    return (
      `all ${parsed.selectors.length} selectors anchored at .piai-root; rendered tree has exactly one ` +
      `.piai-root node (${JSON.stringify(roots[0])}); no host code applies the class`
    )
  })
}

/* ==================================================================== *
 * PHASE P3 — token policy (§2)
 * ==================================================================== */

async function phaseTokens() {
  section('P3 — token policy (interaction-design §2)')

  const css = loadStylesChunk().api.STYLESHEET
  const parsed = parseStylesheet(css)

  await check('P3a every --dsw-* occurrence is one of the 23 allowlisted tokens (§10.5, §14, §15.8)', () => {
    const used = [...new Set(css.match(/--dsw-[A-Za-z0-9-]+/g) ?? [])]
    const unknown = used.filter((token) => !TOKEN_ALLOWLIST.includes(token))
    assert.deepEqual(unknown, [], `tokens outside the allowlist: ${JSON.stringify(unknown)}`)
    return `${used.length}/${TOKEN_ALLOWLIST.length} allowlisted tokens used`
  })

  await check('P3b no hex / rgb() / rgba() / hsl() / color keyword in any declaration value', () => {
    const offenders = []
    for (const { prop, value } of parsed.declarations) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(value)) offenders.push({ prop, value, why: 'hex' })
      if (/\b(rgba?|hsla?)\s*\(/.test(value)) offenders.push({ prop, value, why: 'function' })
      const words = value.match(/[a-zA-Z][a-zA-Z0-9-]*/g) ?? []
      for (const word of words) {
        if (COLOR_KEYWORDS.includes(word.toLowerCase())) offenders.push({ prop, value, why: `keyword ${word}` })
      }
    }
    assert.deepEqual(offenders, [], `raw colors: ${JSON.stringify(offenders.slice(0, 12))}`)
    return `${parsed.declarations.length} declarations, zero raw colors`
  })

  await check('P3c every referenced --piai-* variable is defined on .piai-root', () => {
    // v2 (§10.4) lets the corner radius come from the official `--dsw-radius-md`
    // token, so the local `--piai-radius-*` entries are no longer mandatory;
    // every local variable the sheet actually REFERENCES must still be defined
    // (an undefined var() would silently drop the declaration).
    const defined = new Set()
    for (const { prop } of parsed.declarations) if (prop.startsWith('--piai-')) defined.add(prop)
    const referenced = new Set((css.match(/var\(\s*(--piai-[A-Za-z0-9-]+)/g) ?? []).map((m) => m.replace(/var\(\s*/, '')))
    const undefinedRefs = [...referenced].filter((name) => !defined.has(name))
    assert.deepEqual(undefinedRefs, [], `referenced but never defined: ${JSON.stringify(undefinedRefs)}`)
    const missingRequired = REQUIRED_LOCAL_SCALE.filter((name) => !defined.has(name))
    assert.deepEqual(
      missingRequired,
      [],
      `spacing/font/line scale required by §10.2/§10.3 is missing: ${JSON.stringify(missingRequired)}`,
    )
    const radius = LOCAL_SCALE.filter((name) => name.startsWith('--piai-radius-')).filter((n) => defined.has(n))
    const platformRadius = css.includes('var(--dsw-radius-md)')
    assert.ok(
      radius.length > 0 || platformRadius,
      'corner radius must come from either the local --piai-radius-* scale or --dsw-radius-md',
    )
    return (
      `${referenced.size} local vars referenced, all defined; required scale present; ` +
      `radius via ${radius.length > 0 ? `local (${radius.join(',')})` : '--dsw-radius-md'}`
    )
  })
}

/* ==================================================================== *
 * PHASE P4 — class coverage (§4)
 * ==================================================================== */

async function phaseClassCoverage() {
  section('P4 — class coverage (interaction-design §4)')

  const css = loadStylesChunk().api.STYLESHEET
  const parsed = parseStylesheet(css)

  await check('P4a CSS classes == CLASSES export == frozen 67-list', () => {
    const { api } = loadStylesChunk()
    assert.ok(Array.isArray(api.CLASSES), 'CLASSES must be an array')
    const cssClasses = new Set()
    for (const selector of parsed.selectors) {
      for (const token of selector.match(/\.piai-[A-Za-z0-9_-]+/g) ?? []) cssClasses.add(token.slice(1))
    }
    const exported = new Set(api.CLASSES)
    const frozen = new Set(FROZEN_CLASSES)
    const diff = (a, b) => [...a].filter((name) => !b.has(name)).sort()
    assert.deepEqual(
      diff(cssClasses, frozen),
      [],
      `styles the frozen list does not contain (dead/extra): ${JSON.stringify(diff(cssClasses, frozen))}`,
    )
    assert.deepEqual(
      diff(frozen, cssClasses),
      [],
      `frozen classes with no CSS rule (unstyled): ${JSON.stringify(diff(frozen, cssClasses))}`,
    )
    assert.deepEqual(
      diff(exported, frozen),
      [],
      `CLASSES export has extras: ${JSON.stringify(diff(exported, frozen))}`,
    )
    assert.deepEqual(
      diff(frozen, exported),
      [],
      `CLASSES export is missing: ${JSON.stringify(diff(frozen, exported))}`,
    )
    return `CSS ${cssClasses.size}, CLASSES ${exported.size}, frozen ${frozen.size}`
  })

  await check('P4b JS piai-* literals == frozen 67-list (every class-emitting chunk)', () => {
    const frozen = new Set(FROZEN_CLASSES)
    const js = new Set()
    // v10: the page and the panels are several chunks, so the emitter list is
    // derived from the directory instead of naming two files.
    for (const { source: raw } of jsClassSources()) {
      const source = stripJsComments(raw)
      for (const token of source.match(/piai-[A-Za-z0-9_-]+/g) ?? []) js.add(token)
    }
    const extras = [...js].filter((name) => !frozen.has(name)).sort()
    const missing = [...frozen].filter((name) => !js.has(name)).sort()
    assert.deepEqual(extras, [], `JS emits classes outside the frozen list: ${JSON.stringify(extras)}`)
    assert.deepEqual(missing, [], `frozen classes never emitted by JS: ${JSON.stringify(missing)}`)
    return `${js.size} JS class literals, set-equal to the frozen list`
  })

  await check('P4c the removed piai-tab class is gone from CSS and JS', () => {
    const { api } = loadStylesChunk()
    const parsedHere = parseStylesheet(api.STYLESHEET)
    const cssClasses = new Set()
    for (const selector of parsedHere.selectors) {
      for (const token of selector.match(/\.piai-[A-Za-z0-9_-]+/g) ?? []) cssClasses.add(token.slice(1))
    }
    const jsClasses = new Set()
    for (const { source } of jsClassSources()) {
      for (const token of stripJsComments(source).match(/piai-[A-Za-z0-9_-]+/g) ?? []) {
        jsClasses.add(token)
      }
    }
    const hits = []
    for (const removed of REMOVED_CLASSES) {
      if (cssClasses.has(removed)) hits.push(`css:${removed}`)
      if (jsClasses.has(removed)) hits.push(`js:${removed}`)
    }
    assert.deepEqual(hits, [], `removed classes still present: ${JSON.stringify(hits)}`)
    return 'no piai-tab token anywhere (piai-tabs is a different token)'
  })
}

/* ==================================================================== *
 * PHASE P9 — v2 container-aware layout (§10.2, §10.3)
 * ==================================================================== */

const LAYOUT_RULES = {
  row: '.piai-root .piai-row',
  rowHead: '.piai-root .piai-row-head',
  rowControl: '.piai-root .piai-row-control',
  rowPair: '.piai-root .piai-row-pair',
  fields: '.piai-root .piai-fields',
  hint: '.piai-root .piai-hint',
  controlAny: '.piai-root .piai-row-control > *',
  controlInput: '.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"])',
  select: '.piai-root .piai-select',
  tags: '.piai-root .piai-tags',
  bool: '.piai-root .piai-bool',
  providerAdd: '.piai-root .piai-provider-add',
  page: '.piai-root .piai-page',
}

function requireProps(parsed, selector, wanted) {
  const map = declarationMap(parsed, selector)
  const missing = []
  for (const [prop, test] of Object.entries(wanted)) {
    const value = map[prop]
    if (value === undefined || !test(value)) missing.push({ prop, value })
  }
  return { map, missing }
}

async function phaseLayout() {
  section('P9 — container-aware layout (interaction-design §10.2, §10.3)')

  const css = loadStylesChunk().api.STYLESHEET
  const parsed = parseStylesheet(css)

  await check('P9a intrinsic wrapping layout exists (no query involved)', () => {
    const { missing: rowMissing } = requireProps(parsed, LAYOUT_RULES.row, {
      display: (v) => /flex/.test(v),
      'flex-direction': (v) => /column/.test(v),
    })
    // v6 (§14): spacing moved out of the row into `.piai-fields`; a per-row
    // separator line is gone, so the probe follows the shipped Models page.
    const { missing: fieldsMissing } = requireProps(parsed, LAYOUT_RULES.fields, {
      'flex-direction': (v) => /column/.test(v),
      gap: (v) => /var\(--piai-space-3\)/.test(v),
    })
    const { missing: pairMissing } = requireProps(parsed, LAYOUT_RULES.rowPair, {
      display: (v) => /grid/.test(v),
      'grid-template-columns': (v) => /repeat\(2/.test(v),
    })
    const { missing: headMissing } = requireProps(parsed, LAYOUT_RULES.rowHead, {
      'align-items': (v) => /center/.test(v),
      'min-width': (v) => /^0(px)?$/.test(v),
    })
    const { missing: controlMissing } = requireProps(parsed, LAYOUT_RULES.rowControl, {
      'min-width': (v) => /^0(px)?$/.test(v),
      'max-width': (v) => /100%/.test(v),
    })
    assert.deepEqual(
      [...rowMissing, ...headMissing, ...controlMissing, ...fieldsMissing, ...pairMissing],
      [],
      `vertical row anatomy missing: ${JSON.stringify({ rowMissing, headMissing, controlMissing, fieldsMissing, pairMissing })}`,
    )
    return (
      '.piai-row is a vertical stack (flex-direction:column) spaced by the .piai-fields gap, with a ' +
      'two-column .piai-row-pair grid for paired short fields — the v6 layout of the shipped Models ' +
      'page (docs/verification.md §14, §12).'
    )
  })

  await check('P9b fluid controls fill their column (fixes ragged input widths)', () => {
    const { missing: anyMissing, map: anyMap } = requireProps(parsed, LAYOUT_RULES.controlAny, {
      width: (v) => /100%/.test(v),
      'min-width': (v) => /^0(px)?$/.test(v),
      'max-width': (v) => /100%/.test(v),
      'box-sizing': (v) => /border-box/.test(v),
    })
    const { missing: inputMissing } = requireProps(parsed, LAYOUT_RULES.controlInput, {
      width: (v) => /100%/.test(v),
      'min-width': (v) => /^0(px)?$/.test(v),
    })
    const { missing: addMissing } = requireProps(parsed, LAYOUT_RULES.providerAdd, {})
    const addChildren = parsed.rules.filter(
      (rule) => normalizeSelector(rule.selector) === normalizeSelector('.piai-root .piai-provider-add > *'),
    )
    const addInput = parsed.rules.filter(
      (rule) => normalizeSelector(rule.selector) === normalizeSelector('.piai-root .piai-provider-add input'),
    )
    assert.deepEqual(
      [...anyMissing, ...inputMissing],
      [],
      `fluid-control rules missing: ${JSON.stringify({ anyMissing, inputMissing })}`,
    )
    assert.ok(
      addChildren.length + addInput.length >= 1 || Object.keys(addMissing).length === 0,
      'the provider-add row must let its input shrink (§10.3)',
    )
    return (
      `.piai-row-control > * width:${anyMap.width}, min-width:0, box-sizing:border-box; ` +
      `.piai-row-control input:not([type=checkbox]):not([type=radio]) width/min-width:0; ` +
      `.piai-provider-add rules=${addChildren.length + addInput.length}`
    )
  })

  await check('P9c multi-option controls wrap instead of clipping (§10.3)', () => {
    const problems = []
    for (const key of ['select', 'tags', 'bool']) {
      const { missing } = requireProps(parsed, LAYOUT_RULES[key], {
        'flex-wrap': (v) => /wrap/.test(v),
        'max-width': (v) => /100%/.test(v),
      })
      if (missing.length > 0) problems.push({ selector: LAYOUT_RULES[key], missing })
    }
    assert.deepEqual(problems, [], `wrap rules missing: ${JSON.stringify(problems)}`)
    return '.piai-select / .piai-tags / .piai-bool all have flex-wrap:wrap + max-width:100%'
  })

  await check('P9e `> *` cannot stretch the hint trigger; the 32px inline-button rows (§15.3, §15.7)', () => {
    // v7 §15.3: the trigger moved into the label row, so the override is keyed on
    // `.piai-row-head`, not on the control column any more.
    const { missing } = requireProps(parsed, '.piai-root .piai-row-head > .piai-info', {
      flex: (v) => /^none$/.test(v),
      width: (v) => /^auto$/.test(v),
    })
    assert.deepEqual(
      missing,
      [],
      `the scoped .piai-info override must beat the > * stretch rule by specificity ` +
        `(3 classes vs 2 classes + universal): ${JSON.stringify(missing)}`,
    )
    const dictAdd = parsed.rules.filter(
      (rule) =>
        normalizeSelector(rule.selector) === normalizeSelector('.piai-root .piai-dict-add > *') ||
        normalizeSelector(rule.selector) === normalizeSelector('.piai-root .piai-dict-add input'),
    )
    assert.ok(dictAdd.length >= 1, 'the dict-add row must get the provider-add treatment (min-width:0 / fluid input)')

    // §15.7 (R6): the five rows that pair a Button with an Input all override the
    // Button's 28px `sm` box to the Input's 32px — CSS only, never the size prop.
    const inlineButtonRows = [
      '.piai-root .piai-provider-add button',
      '.piai-root .piai-dict-add button',
      '.piai-root .piai-tag-add button',
      '.piai-root .piai-cred button',
      '.piai-root .piai-cred-editor button',
    ]
    const heightProblems = []
    for (const selector of inlineButtonRows) {
      const map = declarationMap(parsed, selector)
      const hit = Object.keys(map).length > 0
      if (!hit || !/^32px$/.test(map.height ?? '')) {
        heightProblems.push({ selector, height: map.height ?? '(no rule)' })
      }
    }
    assert.deepEqual(
      heightProblems,
      [],
      `every same-row button must match the 32px input height (§15.7): ${JSON.stringify(heightProblems)}`,
    )
    const info = declarationMap(parsed, '.piai-root .piai-row-head > .piai-info')
    return (
      `.piai-info override flex:${info.flex}, width:${info.width}; .piai-dict-add rules=${dictAdd.length}; ` +
      `32px rows=${inlineButtonRows.length}`
    )
  })

  await check('P9d the content column is fluid (max-width 880px AND min-width 0)', () => {
    const { missing, map } = requireProps(parsed, LAYOUT_RULES.page, {
      'max-width': (v) => /880px/.test(v),
      'min-width': (v) => /^0(px)?$/.test(v),
    })
    assert.deepEqual(missing, [], `content column is not shrinkable: ${JSON.stringify(missing)}`)
    return `.piai-page max-width:${map['max-width']}, min-width:${map['min-width']}`
  })
}

/* ==================================================================== *
 * independent render harness (mini loader + mini renderer)
 * ==================================================================== */

function makeReactStub(polishState, options = {}) {
  const lazyStates = []

  class Component {
    constructor(props) {
      this.props = props
      this.state = this.state ?? {}
    }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state) : patch
      this.state = Object.assign({}, this.state, next ?? {})
    }
    forceUpdate() {}
  }

  const React = {
    createElement(type, props, ...children) {
      const next = Object.assign({}, props ?? {})
      if (children.length === 1) next.children = children[0]
      else if (children.length > 1) next.children = children
      return { __element: true, type, props: next }
    },
    useState(initial) {
      return [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    useRef(initial) {
      return { current: initial }
    },
    useMemo(factory) {
      return factory()
    },
    useCallback(fn) {
      return fn
    },
    useEffect() {},
    useLayoutEffect() {},
    useSyncExternalStore(_subscribe, getSnapshot) {
      return getSnapshot()
    },
    useContext() {
      return undefined
    },
    lazy(load) {
      const state = { load, module: undefined, error: undefined, promise: undefined }
      lazyStates.push(state)
      function LazyComponent(props) {
        if (state.error !== undefined) throw state.error
        if (state.module === undefined) {
          if (state.promise === undefined) {
            state.promise = Promise.resolve()
              .then(() => load())
              .then(
                (loaded) => {
                  state.module = loaded && loaded.default !== undefined ? loaded.default : loaded
                },
                (error) => {
                  state.error = error
                },
              )
          }
          throw state.promise
        }
        return React.createElement(state.module, props)
      }
      return LazyComponent
    },
    Suspense(props) {
      return props.children ?? null
    },
    Component,
    Fragment: Symbol('Fragment'),
    memo: (component) => component,
  }
  React.Suspense.__isSuspense = true
  React.__settle = async () => {
    await Promise.all(lazyStates.map((state) => state.promise))
  }

  /** Primitive stand-ins that RECORD their props so a11y is inspectable. */
  const primitive = (name) =>
    function PrimitiveStub(props) {
      polishState.primitiveCalls.push({ name, props: props ?? {} })
      return React.createElement('div', Object.assign({}, props ?? {}, { 'data-stub': name }))
    }
  const explicit = new Map()
  // `DisclosureRow` is deliberately NOT stubbed any more (v8): the page writes
  // its own disclosure head, and a stub would let a regression silently render
  // the primitive again.
  for (const name of [
    'Switch',
    'Tag',
    'StateDot',
    'Pill',
    'Tooltip',
    'Input',
    'Button',
    'Checkbox',
    'SettingsForm',
    'SettingsValueField',
    'SettingsSecretField',
    'Modal',
    'Toast',
  ]) {
    explicit.set(name, primitive(name))
  }
  // Non-component helpers the panels legitimately call as factories.
  explicit.set('settingsTextField', (field) => ({ kind: 'text', field }))
  explicit.set('settingsNumberField', (field) => ({ kind: 'number', field }))
  explicit.set('SettingsFormModel', function SettingsFormModelStub() {
    return { bind: () => ({ getSnapshot: () => ({}), subscribe: () => () => {} }), dispose: () => {} }
  })
  // The shipped bundle exports these as wrapper objects, not functions. v8:
  // `Button`/`Input` stay forwardRef; the memo half is now a synthetic
  // resolver-shape case (Tooltip), because the page no longer renders a
  // memo-wrapped shipped primitive.
  const WRAPPED_TYPES = { Button: 'forwardRef', Input: 'forwardRef', Tooltip: 'memo' }
  const primitives = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === 'then') return undefined
        const name = String(property)
        const found = explicit.has(name) ? explicit.get(name) : primitive(name)
        if (options.wrapPrimitives === true && WRAPPED_TYPES[name] !== undefined && typeof found === 'function') {
          return WRAPPED_TYPES[name] === 'forwardRef'
            ? { $$typeof: Symbol.for('react.forward_ref'), render: found }
            : { $$typeof: Symbol.for('react.memo'), type: found }
        }
        return found // icons and any other component-shaped export
      },
      has: () => true,
    },
  )

  return { React, primitives, lazyStates }
}

/**
 * A mini renderer with React's real control flow (class error boundaries,
 * Suspense fallbacks, host/function/array elements) PLUS per-component hook
 * slots, so a `setState`-style update (e.g. switching the selected provider)
 * can be applied and the tree re-rendered. Hook slots are keyed by the
 * depth-first invocation index of the component, which is stable while the tree
 * shape is stable — exactly the case for a provider switch in this page.
 */
/**
 * Unwrap a React component type like the renderer does.
 *
 * The shipped primitives may be exported as wrappers — `Button`/`Input` as
 * `forwardRef(...)`, others as `memo(...)`; a stand-in renderer that only
 * accepts functions can never observe them, which is how the silent-degrade
 * defect (docs/verification.md §11) escaped every harness.
 */
function unwrapComponentType(type) {
  if (type === null || typeof type !== 'object') return type
  if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return type
  const tag = type.$$typeof
  if (tag === Symbol.for('react.memo')) return unwrapComponentType(type.type)
  if (tag === Symbol.for('react.forward_ref')) return type.render
  return type
}

function createMiniRenderer(React, options = {}) {
  const diagnostics = { boundaryCatches: [], suspensions: [], effectErrors: [] }
  const hookSlots = new Map()
  let cursor = 0
  let dirty = false
  let currentSlots = null
  let currentIndex = 0
  let pendingEffects = []

  const isThenable = (value) => value !== null && typeof value === 'object' && typeof value.then === 'function'
  const isErrorLike = (value) => value !== null && typeof value === 'object' && typeof value.message === 'string'

  function beginComponent() {
    const key = `#${cursor++}`
    if (!hookSlots.has(key)) hookSlots.set(key, [])
    currentSlots = hookSlots.get(key)
    currentIndex = 0
    return key
  }

  function slot(initial) {
    const index = currentIndex++
    if (currentSlots.length <= index) {
      currentSlots[index] = typeof initial === 'function' ? initial() : initial
    }
    return index
  }

  React.useState = function useState(initial) {
    const slots = currentSlots // capture THIS component's slot array, not the mutable cursor
    const index = slot(initial)
    const update = (next) => {
      const resolved = typeof next === 'function' ? next(slots[index]) : next
      if (!Object.is(resolved, slots[index])) {
        slots[index] = resolved
        dirty = true
      }
    }
    return [slots[index], update]
  }
  React.useRef = function useRef(initial) {
    const slots = currentSlots
    const index = slot(initial === undefined ? { current: undefined } : { current: initial })
    return slots[index]
  }

  const depsEqual = (a, b) =>
    Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))

  function useEffectHook(fn, deps) {
    const slots = currentSlots
    const index = slot(undefined)
    pendingEffects.push({ slots, index, fn, deps })
  }
  React.useEffect = useEffectHook
  React.useLayoutEffect = useEffectHook

  /**
   * Run the effects queued by the last pass (React-like: after paint, deps
   * compared with Object.is, cleanup before a rerun). Without this the page's
   * "select the first route" effect never fires and panels render empty.
   */
  function runEffects() {
    const queued = pendingEffects
    pendingEffects = []
    for (const effect of queued) {
      const stored = effect.slots[effect.index]
      const first = stored === undefined || stored === null
      if (!first && effect.deps !== undefined && depsEqual(stored.deps, effect.deps)) continue
      if (!first && typeof stored.cleanup === 'function') {
        try {
          stored.cleanup()
        } catch (error) {
          diagnostics.effectErrors.push(String((error && error.message) || error))
        }
      }
      const record = { deps: effect.deps, cleanup: undefined }
      effect.slots[effect.index] = record
      try {
        record.cleanup = effect.fn()
      } catch (error) {
        diagnostics.effectErrors.push(String((error && error.message) || error))
      }
      dirty = true
    }
  }

  function renderChildren(children, ctx) {
    if (children === undefined || children === null || typeof children === 'boolean') return null
    if (Array.isArray(children)) return children.map((child) => render(child, ctx))
    return render(children, ctx)
  }

  function render(node, ctx) {
    if (node === undefined || node === null || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return node
    if (Array.isArray(node)) return node.map((child) => render(child, ctx))
    if (node.__element !== true) return node
    const type = node.type
    const props = node.props ?? {}
    if (type === React.Fragment) return renderChildren(props.children, ctx)
    if (typeof type === 'string') {
      return { __host: true, type, props, children: renderChildren(props.children, ctx) }
    }
    const resolved = unwrapComponentType(type)
    if (typeof resolved !== 'function') {
      throw new Error(`mini-renderer: unsupported element type ${String(type)}`)
    }
    if (resolved.__isSuspense === true) {
      try {
        return renderChildren(props.children, ctx)
      } catch (thrown) {
        if (isThenable(thrown)) {
          diagnostics.suspensions.push(thrown)
          return renderChildren(props.fallback, ctx)
        }
        throw thrown
      }
    }
    const isClass = typeof resolved.prototype === 'object' && typeof resolved.prototype.render === 'function'
    if (isClass) {
      const instance = new resolved(props)
      const inner = Object.assign({}, ctx, { boundary: instance })
      const isBoundary =
        typeof resolved.getDerivedStateFromError === 'function' ||
        typeof instance.componentDidCatch === 'function'
      if (isBoundary) {
        try {
          return render(instance.render(), inner)
        } catch (thrown) {
          if (isThenable(thrown)) throw thrown
          if (!isErrorLike(thrown)) throw thrown
          diagnostics.boundaryCatches.push({ boundary: resolved.name || '(anonymous)', error: thrown.message })
          const derived =
            typeof resolved.getDerivedStateFromError === 'function'
              ? type.getDerivedStateFromError(thrown)
              : undefined
          instance.state =
            derived !== undefined && derived !== null
              ? Object.assign({}, instance.state, derived)
              : Object.assign({}, instance.state, { failed: true })
          if (typeof instance.componentDidCatch === 'function') {
            instance.componentDidCatch(thrown, { componentStack: '' })
          }
          return render(instance.render(), inner)
        }
      }
      return render(instance.render(), inner)
    }
    beginComponent()
    return render(resolved(props, null), ctx)
  }

  /**
   * Render `element`, applying queued state updates until the tree settles.
   *
   * @param element - React element tree.
   * @returns the rendered tree.
   */
  function renderRoot(element) {
    let tree
    let pass = 0
    do {
      dirty = false
      cursor = 0
      pendingEffects = []
      if (typeof options.onPassStart === 'function') options.onPassStart()
      tree = render(element, {})
      runEffects()
      pass += 1
    } while (dirty && pass < 8)
    return tree
  }

  return { render: renderRoot, diagnostics }
}

function flattenText(node) {
  if (node === undefined || node === null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).filter(Boolean).join(' ')
  if (node.__host === true) return flattenText(node.children)
  return ''
}

/** Depth-first walk over rendered host nodes, including stub markers. */
function walkHosts(node, visit) {
  if (node === undefined || node === null || typeof node === 'boolean') return
  if (Array.isArray(node)) {
    for (const child of node) walkHosts(child, visit)
    return
  }
  if (typeof node !== 'object') return
  if (node.__host === true) {
    visit(node)
    walkHosts(node.children, visit)
  }
}

/** All stub-named descendant hosts inside a subtree (excluding the root itself). */
function stubDescendants(host) {
  const out = []
  walkHosts(host.children, (node) => {
    const name = node.props?.['data-stub']
    if (typeof name === 'string') out.push({ name, props: node.props })
  })
  return out
}

function findStubCalls(host, name) {
  const out = []
  walkHosts(host, (node) => {
    if (node.props?.['data-stub'] === name) out.push(node)
  })
  return out
}

/** Width of a host subtree (for grouping compat rows under their disclosure). */
/**
 * Every stable id present anywhere in one rendered row subtree.
 *
 * ADJUDICATION (task-15): a row's path-derived id does NOT always live on a
 * control-shaped primitive. Measured on the real panels/fields/fixture:
 *   div.piai-select[id]           (every enum/const row: the radiogroup div
 *                                  carries the control id, §15.5)
 *   stub:Input                    (text/number rows)
 *   stub:SettingsValueField       (the id-bearing field primitive)
 *   host input[type=radio]        (each option; the group's id is on its div)
 * The shipped `Switch` has no id prop at all (its accessible name is
 * `aria-label={label}`), so restricting collection to five primitive names
 * measured the wrong thing (20 of 26 booleans were missed) while every row did
 * carry a resolvable id. Widen the collection, keep the assertion per-row.
 */
function subtreeFieldIds(host) {
  const ids = []
  walkHosts(host, (node) => {
    if (typeof node.props?.id === 'string' && node.props.id.length > 0) ids.push(node.props.id)
  })
  return ids
}

/** The frozen compat key a rendered id belongs to (longest match wins). */
function keyOfFrozenId(id) {
  const hits = FROZEN_COMPAT_KEYS.filter((key) => String(id).includes(key))
  return hits.length === 0 ? undefined : hits.sort((a, b) => b.length - a.length)[0]
}

/**
 * The rendered compat sections, reconstructed from the v8 DOM shape.
 *
 * v8 R3: a section is a self-written disclosure (`div.piai-item-head` +
 * `div.piai-disclosure-body`), not a DisclosureRow stub. The unit is rebuilt as
 * a synthetic host node (head + body, with `props.title` = the head's text) so
 * the id/Tag attribution below keeps working unchanged.
 *
 * @param tree - a rendered host tree.
 * @returns `{containers, heads, bodies, sections, titles}`.
 */
function compatSectionsOf(tree) {
  const hasClass = (node, name) =>
    typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes(name)
  const containers = []
  walkHosts(tree, (node) => {
    if (hasClass(node, 'piai-disclosure')) containers.push(node)
  })
  const heads = []
  const bodies = new Map()
  for (const container of containers) {
    walkHosts(container, (node) => {
      if (hasClass(node, 'piai-item-head')) heads.push(node)
      if (hasClass(node, 'piai-disclosure-body') && typeof node.props.id === 'string') {
        bodies.set(node.props.id, node)
      }
    })
  }
  const titles = heads.map((head) => flattenText(head).trim())
  const sections = heads.map((head, index) => {
    const toggle = head.children.find((child) => child.type === 'button')
    const body = toggle === undefined ? undefined : bodies.get(toggle.props['aria-controls'])
    return {
      __host: true,
      type: 'div',
      props: { title: titles[index] },
      children: body === undefined ? [head] : [head, body],
      toggle,
      body,
    }
  })
  return { containers, heads, bodies, sections, titles }
}

/**
 * Compat keys whose field row carries the `该协议不支持` Tag.
 *
 * Attribution (task-15 adjudication): a row's id may sit on its hint node (the
 * shipped `Switch` has no id prop), so ids are collected from EVERY node, and
 * the Tag is attributed to the smallest tagged subtree containing exactly ONE
 * compat key — the control id and `<controlId>-hint` map to the same key.
 *
 * @param roots - rendered compat section subtrees (`compatSectionsOf`).
 * @returns the set of tagged frozen compat keys.
 */
function taggedCompatKeys(roots) {
  const marked = new Set()
  const collect = (node) => {
    if (node === undefined || node === null || typeof node === 'boolean' || typeof node !== 'object') {
      return { ids: [], hasTag: false }
    }
    if (Array.isArray(node)) {
      const ids = []
      let hasTag = false
      for (const child of node) {
        const sub = collect(child)
        ids.push(...sub.ids)
        hasTag = hasTag || sub.hasTag
      }
      return { ids, hasTag }
    }
    if (node.__host !== true) return { ids: [], hasTag: false }
    const stubName = node.props?.['data-stub']
    let ids = []
    let hasTag = false
    if (stubName === 'Tag' && flattenText(node).includes('不支持')) hasTag = true
    if (typeof node.props?.id === 'string' && node.props.id.length > 0) ids.push(node.props.id)
    for (const child of [].concat(node.children ?? [])) {
      const sub = collect(child)
      ids.push(...sub.ids)
      hasTag = hasTag || sub.hasTag
    }
    if (hasTag) {
      const keys = new Set(ids.map(keyOfFrozenId).filter(Boolean))
      if (keys.size === 1) marked.add([...keys][0])
    }
    return { ids, hasTag }
  }
  for (const root of roots) collect(root)
  return marked
}

function loadOwner(options) {
  const React = options.React
  const registrations = []
  const requested = []
  const loadedChunks = {}
  const sandbox = baseSandbox()
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  sandbox.document = createFakeDocument()
  createContext(sandbox)

  const seeds = {
    react: React,
    'react/jsx-runtime': {
      jsx: React.createElement,
      jsxs: React.createElement,
      Fragment: React.Fragment,
    },
    '@deepseek-ai/dsh-client-store': {
      createSnapshotStore: (initial) => {
        let current = initial
        const listeners = new Set()
        return {
          getSnapshot: () => current,
          set: (next) => {
            current = next
            for (const listener of [...listeners]) listener()
          },
          subscribe: (listener) => {
            listeners.add(listener)
            return () => listeners.delete(listener)
          },
        }
      },
    },
    '@deepseek-ai/dsh-client-ui-primitives': options.primitives,
  }
  const requireStub = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(seeds, specifier)) return seeds[specifier]
    throw new Error(`polish harness: unexpected require(${JSON.stringify(specifier)})`)
  }
  requireStub.async = async (specifier) => {
    requested.push(specifier)
    assert.ok(specifier.startsWith('./'), `a chunk request must be relative: ${specifier}`)
    const fileName = specifier.slice(2)
    assert.match(fileName, /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/, `chunk ${fileName}`)
    if (options.failChunks !== undefined && options.failChunks.includes(fileName)) {
      throw new Error(`polish harness: simulated chunk failure for ${fileName}`)
    }
    const before = sandbox.__ModuleLoader__.registrations.length
    // Chunk overrides exist ONLY for the negative control: point a chunk at a
    // mutated copy in /tmp and show the matching check fails. Defaults are the
    // project files.
    const overrides = {
      'client.styles.js': STYLES_LIB,
      'client.panels.js': process.env.VERIFY_POLISH_PANELS_LIB,
      'client.fields.js': process.env.VERIFY_POLISH_FIELDS_LIB,
      'client.schema.js': process.env.VERIFY_POLISH_SCHEMA_LIB,
    }
    const file = overrides[fileName] ?? join(LIB, fileName)
    runInContext(readSource(file, fileName), sandbox, { filename: file })
    const added = sandbox.__ModuleLoader__.registrations.slice(before)
    assert.equal(added.length, 1, `${fileName} must register exactly once`)
    assert.equal(added[0].chunk, fileName, `${fileName} must carry its own chunk field`)
    assert.equal(added[0].id, OWNER_ID)
    const api = added[0].factory(requireStub)
    loadedChunks[fileName] = api
    return options.transformChunk === undefined ? api : options.transformChunk(fileName, api)
  }

  const before = registrations.length
  runInContext(readSource(OWNER_LIB, OWNER_LIB), sandbox, { filename: OWNER_LIB })
  const added = registrations.slice(before)
  assert.equal(added.length, 1, 'the owner must register exactly once')
  assert.equal(added[0].id, OWNER_ID)
  assert.equal(added[0].chunk, undefined, 'the owner bundle must carry no chunk field')
  return { exports: added[0].factory(requireStub), requested, loadedChunks, sandbox }
}

function servedSnapshot(envelope, value) {
  return {
    view: {
      namespaces:
        envelope === undefined
          ? []
          : [{ ns: 'llm-pi-ai', schema: envelope, revision: 4, value: value ?? { providers: {} } }],
    },
  }
}

function makeCtx(options) {
  const captured = { registration: undefined }
  const cleanups = []
  const dictionaries = new Map()
  let mirrorSnapshot = options.mirrorSnapshot
  const mirrorListeners = new Set()
  const mirror = {
    getSnapshot: () => mirrorSnapshot,
    subscribe: (listener) => {
      mirrorListeners.add(listener)
      return () => mirrorListeners.delete(listener)
    },
    setSnapshot: (next) => {
      mirrorSnapshot = next
      for (const listener of [...mirrorListeners]) listener()
    },
    ensure: () => {},
  }
  const controller = options.controller ?? {
    getSnapshot: () => ({ value: { providers: {} }, revision: 4, writable: true }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const ctx = {
    locale: {
      bind: (namespace) => (key) => (dictionaries.get(namespace) ?? {})[key] ?? key,
      register: (namespace, table) => {
        dictionaries.set(namespace, table.en ?? table.zh ?? {})
        return () => {}
      },
    },
    settingsSchema: { rehydrate: (envelope) => envelope, validate: () => undefined },
    configForms: {
      describe: () => mirror,
      get: () => controller,
      whileServed: (namespaces, callback) => {
        if (options.served !== false) callback(new Set(namespaces))
        return () => {}
      },
    },
    slots: {
      inject: (_key, callback) => callback(),
      register: (registrationOptions, component) => {
        captured.registration = { key: 'settings.section', options: registrationOptions, component }
        return () => {}
      },
    },
    effect: (callback) => {
      const cleanup = callback()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
      return () => {}
    },
    // T18: the optional host channels the owner injects. `remote.llm` is what
    // makes the catalog face `available`; without it the 获取可用模型 button is
    // disabled and the picker (which mounts only while open, T16) can never
    // render its search box. Anonymous by default, exactly like a host that
    // does not offer model discovery.
    remote: options.remote,
  }
  return { ctx, captured, mirror, cleanups }
}

async function loadShippedSlots() {
  assert.ok(existsSync(SLOTS_LIB), `shipped slots module not found: ${SLOTS_LIB}`)
  return import(`file://${SLOTS_LIB}`)
}

/** Extract + execute the shipped `useSyncExternalStoreWithSelector`. */
function extractSelectorShim() {
  const source = readSource(RENDERER_LIB, 'shipped renderer')
  const anchor = 'exports.useSyncExternalStoreWithSelector = '
  const at = source.indexOf(anchor)
  assert.ok(at !== -1, 'selector shim anchor not found (upstream changed)')
  const open = source.indexOf('{', at)
  let depth = 0
  let quote = null
  let body
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        body = source.slice(at + anchor.length, i + 1).trim()
        break
      }
    }
  }
  assert.ok(body, 'could not extract the shipped selector shim')
  const make = new Function('q', 't', 'u', 'v', 'w', 'r', `return (${body});`)
  return make(Object.is, (initial) => ({ current: initial }), () => {}, (factory) => factory(), () => {}, (_s, g) => g())
}

function bindInjectFace(face, slots, shim, hookCalls) {
  const bound = Object.assign({}, face)
  delete bound.hooks
  delete bound.keyedHooks
  for (const [name, source] of Object.entries(face.hooks ?? {})) {
    const propName = slots.standardHookPropName(name)
    const subscribe = (listener) => source.subscribe(listener)
    const getSnapshot = () => source.getSnapshot()
    bound[propName] = function useSelector(selector, equal) {
      hookCalls.push({ name: propName, selectorType: typeof selector })
      return shim(subscribe, getSnapshot, undefined, selector, equal)
    }
  }
  return bound
}

/**
 * Drive the real page component through its slot registration with the props
 * the registration's `inject()` face supplies.
 */
async function renderCell(options = {}) {
  const slots = await loadShippedSlots()
  const shim = extractSelectorShim()
  const polishState = { primitiveCalls: [] }
  const { React, primitives } = makeReactStub(polishState, {
    wrapPrimitives: options.wrapPrimitives === true,
  })
  const owner = loadOwner({
    React,
    primitives,
    failChunks: options.failChunks,
    transformChunk: options.transformChunk,
  })
  const controller = options.controller ?? {
    getSnapshot: () => ({
      value: options.value ?? { providers: {} },
      revision: 4,
      writable: true,
    }),
    subscribe: () => () => {},
    mutate: async () => true,
  }
  const { ctx, captured, mirror } = makeCtx({
    mirrorSnapshot: options.mirrorSnapshot,
    controller,
    remote: options.remote,
  })
  owner.exports.apply(ctx)
  assert.ok(captured.registration, 'apply() must register one settings.section cell')
  const hookCalls = []
  const face = captured.registration.options.inject()
  let props = bindInjectFace(face, slots, shim, hookCalls)
  if (options.mutateProps !== undefined) props = options.mutateProps(props)

  const mini = createMiniRenderer(React, {
    onPassStart: () => {
      polishState.primitiveCalls.length = 0
    },
  })
  const element = React.createElement(captured.registration.component, props)
  const outcome = {}
  try {
    mini.render(element)
  } catch (error) {
    outcome.firstPassError = error
  }
  await React.__settle()
  try {
    polishState.primitiveCalls.length = 0
    let tree = mini.render(element)
    if (options.provider !== undefined) {
      const providerTabs = []
      walkHosts(tree, (node) => {
        if (node.props?.role === 'tab' && node.props.id !== ADD_TAB_ID) providerTabs.push(node)
      })
      const tab = providerTabs[options.provider]
      assert.ok(tab, `cannot switch providers: no provider tab at index ${options.provider}`)
      polishState.primitiveCalls.length = 0
      tab.props.onClick()
      tree = mini.render(element)
    }
    const expandCompatSections = () => {
      // v8: a collapsed compat section mounts no fields, so opening each one is
      // the only way to observe its keys. Re-render between clicks: every head
      // closes over the same fold state, so batching the clicks would let only
      // the last one win.
      for (let index = 0; index < COMPAT_GROUPS.length; index += 1) {
        const toggle = compatSectionsOf(tree).sections[index]?.toggle
        if (toggle !== undefined && typeof toggle.props.onClick === 'function') {
          toggle.props.onClick()
        }
        tree = mini.render(element)
      }
    }
    if (options.expandCompat === true) expandCompatSections()
    if (options.openCatalog === true) {
      // T18: the picker mounts ONLY while open (T16 aligned it with the shipped
      // Modal's `!open → null`), so its search box can only be audited after the
      // real 获取可用模型 button opened it. Drive that click — the owner's
      // discover() resolves against the fake `remote.llm` supplied by the
      // caller — let the promise land, then re-render so the Modal subtree is in
      // the final tree and in `primitiveCalls`.
      //
      // The click is NOT a shortcut around the assertion: it is the assertion,
      // and the sanity check below fails if the search input still is not
      // mounted, so a future "the picker silently stopped rendering" regression
      // is caught here rather than by the audit quietly finding nothing.
      let fetchButton
      walkHosts(tree, (node) => {
        if (node.props?.['aria-label'] === '获取可用模型') fetchButton = node
      })
      assert.ok(fetchButton !== undefined, 'the catalog group must expose its 获取可用模型 button')
      assert.notEqual(
        fetchButton.props.disabled,
        true,
        'the fetch button must be enabled while remote.llm offers discovery',
      )
      fetchButton.props.onClick()
      await new Promise((resolve) => setTimeout(resolve, 0))
      tree = mini.render(element)
      // This mini renderer keys a component's hook slots by its TRAVERSAL
      // POSITION (`beginComponent()` → `#cursor++`), so mounting the Modal
      // subtree shifts every later component's slots and the compat sections
      // opened above silently collapse. Re-open them now that the modal is
      // mounted: the modal lives in an earlier group, so its own state (and its
      // search box) survives this second pass.
      if (options.expandCompat === true) expandCompatSections()
      assert.ok(
        polishState.primitiveCalls.some(
          (call) => call.name === 'Input' && call.props.type === 'search',
        ),
        'opening the picker must mount its search Input (the picker did not open)',
      )
    }
    outcome.tree = tree
    outcome.text = flattenText(tree)
    outcome.ok = true
  } catch (error) {
    outcome.error = error
    outcome.ok = false
  }
  return {
    outcome,
    hookCalls,
    primitiveCalls: polishState.primitiveCalls,
    diagnostics: mini.diagnostics,
    requested: owner.requested,
    loadedChunks: owner.loadedChunks,
    mirror,
  }
}

function fixture() {
  return JSON.parse(readFileSync(FIXTURE_ENVELOPE, 'utf8'))
}

/* ==================================================================== *
 * PHASE P5 — a11y (§8)
 * ==================================================================== */

async function phaseA11y() {
  section('P5 — accessibility contract (interaction-design §8)')

  const envelope = fixture()
  const value = { providers: { alpha: { api: 'anthropic-messages', model: 'alpha-model' } } }
  const wellFormed = servedSnapshot(envelope, value)

  await check('P5a the provider strip is a tablist with roving tabs and the panel is role=tabpanel', async () => {
    // §11: the strip is ours now, so the tab semantics must be proven on the
    // rendered markup, not on a primitive's props.
    const two = {
      providers: {
        alpha: { displayName: 'Deepseek 月卡', api: 'anthropic-messages' },
        beta: { api: 'openai-completions' },
      },
    }
    const twoSnapshot = servedSnapshot(envelope, two)
    const { outcome, primitiveCalls } = await renderCell({ mirrorSnapshot: twoSnapshot, value: two })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)

    // v7 (§15.2): the strip is ours, and the tabs are bare native buttons, so
    // the tab semantics must be proven on the rendered markup — not on a
    // primitive's props (the Pill call is gone with the Pill tab).
    const allTabs = []
    walkHosts(outcome.tree, (node) => {
      if (node.props?.role === 'tab') allTabs.push(node)
    })
    const tabs = allTabs.filter((node) => node.props.id !== ADD_TAB_ID)
    assert.equal(tabs.length, 2, `one tab per provider, got ${tabs.length}`)
    const addTab = allTabs.find((node) => node.props.id === ADD_TAB_ID)
    assert.ok(addTab, 'the trailing add tab must be a real role=tab (§15.2 item 8)')
    assert.equal(
      allTabs.length,
      3,
      'the add tab is not a provider: two providers render three tabs',
    )
    assert.equal(addTab.props['aria-controls'], ADD_PANEL_ID)
    const ids = tabs.map((node) => node.props.id)
    assert.ok(
      ids.every((id) => typeof id === 'string' && id.length > 0),
      `every provider tab needs a stable DOM id: ${JSON.stringify(ids)}`,
    )
    assert.equal(new Set(ids).size, ids.length, 'provider tab ids must be unique')
    const selected = tabs.filter((node) => node.props['aria-selected'] === true)
    assert.equal(selected.length, 1, `exactly one provider tab is selected, got ${selected.length}`)
    assert.deepEqual(
      tabs.map((node) => node.props.tabIndex),
      tabs.map((node) => (node.props['aria-selected'] === true ? 0 : -1)),
      'roving tabindex: only the selected tab is a tab stop',
    )
    assert.equal(
      tabs.filter((node) => node.props['data-active'] === 'true').length,
      1,
      'the underline hook is data-active on exactly the selected tab',
    )
    assert.ok(
      tabs.every((node) => typeof node.props.onKeyDown === 'function'),
      'every tab implements the arrow/Home/End keyboard model',
    )
    assert.ok(
      tabs.every(
        (node) =>
          typeof node.props['aria-controls'] === 'string' && node.props['aria-controls'].length > 0,
      ),
      'every tab points at its panel with aria-controls',
    )

    const tablists = []
    const tabpanels = []
    walkHosts(outcome.tree, (node) => {
      if (node.props?.role === 'tablist') tablists.push(node)
      if (node.props?.role === 'tabpanel') tabpanels.push(node)
    })
    assert.equal(tablists.length, 1, `expected exactly one tablist, got ${tablists.length}`)
    assert.equal(typeof tablists[0].props['aria-label'], 'string', 'the tablist needs an accessible name')
    assert.equal(tabpanels.length, 1, 'the page renders exactly one tabpanel for the selected provider')
    assert.equal(
      tabpanels[0].props.id,
      selected[0].props['aria-controls'],
      'the tabpanel id is the selected tab aria-controls target',
    )
    assert.equal(
      tabpanels[0].props['aria-labelledby'],
      selected[0].props.id,
      'the tabpanel is labelled by the selected tab',
    )

    // Switching provider re-points the tabpanel at the other tab.
    const second = await renderCell({ mirrorSnapshot: twoSnapshot, value: two, provider: 1 })
    assert.ok(!second.outcome.error, `provider switch threw: ${second.outcome.error && second.outcome.error.message}`)
    const switched = []
    walkHosts(second.outcome.tree, (node) => {
      if (
        node.props?.role === 'tab' &&
        node.props.id !== ADD_TAB_ID &&
        node.props['aria-selected'] === true
      ) {
        switched.push(node)
      }
    })
    assert.equal(switched.length, 1, 'the switched page selects exactly one provider')
    const secondPanels = []
    walkHosts(second.outcome.tree, (node) => {
      if (node.props?.role === 'tabpanel') secondPanels.push(node)
    })
    assert.equal(secondPanels.length, 1)
    assert.equal(secondPanels[0].props['aria-labelledby'], switched[0].props.id)
    assert.equal(secondPanels[0].props.id, switched[0].props['aria-controls'])
    return (
      `tabs=${JSON.stringify(ids)}; selected="${selected[0].props.id}"; ` +
      `tabpanel="${tabpanels[0].props.id}"; after switch="${secondPanels[0].props.id}"`
    )
  })

  await check('P5i forwardRef/memo primitives are adopted, not the local stand-ins', async () => {
    // Independent复核 of docs/verification.md §11: present Button/Input as
    // forwardRef objects and Tooltip as a memo object the way a shipped bundle
    // may, and require the page to adopt them. The stand-ins would render a bare
    // native input / button / div instead of the stub's data-stub marker.
    // (v8: DisclosureRow left the page, so the memo half is Tooltip.)
    const { outcome, primitiveCalls } = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      wrapPrimitives: true,
    })
    assert.ok(!outcome.error, `wrapper render threw: ${outcome.error && outcome.error.message}`)
    const stubbed = new Map()
    walkHosts(outcome.tree, (node) => {
      const name = node.props?.['data-stub']
      if (typeof name === 'string') stubbed.set(name, (stubbed.get(name) ?? 0) + 1)
    })
    for (const name of ['Input', 'Button', 'Tooltip']) {
      assert.ok(
        primitiveCalls.some((call) => call.name === name),
        `${name} was not called as a primitive; the wrapper export was treated as missing`,
      )
      assert.ok(
        (stubbed.get(name) ?? 0) > 0,
        `${name} did not reach the rendered tree; a local stand-in rendered instead`,
      )
    }
    return `wrapped stubs in tree: ${JSON.stringify([...stubbed])}`
  })

  await check('P5b error faces are role=alert and the dirty status is aria-live=polite', async () => {
    const { outcome, primitiveCalls } = await renderCell({ mirrorSnapshot: wellFormed, value })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    let live = 0
    walkHosts(outcome.tree, (node) => {
      if (node.props?.['aria-live'] === 'polite') live += 1
    })
    assert.ok(live >= 1, 'the unsaved-status container must carry aria-live="polite"')

    // A MISSING hook (not a hook that yields undefined — that is the loading
    // state) is a data-source failure and must surface as role="alert".
    const missing = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      mutateProps: (props) => {
        const next = Object.assign({}, props)
        delete next.usePage
        return next
      },
    })
    assert.ok(
      !missing.outcome.error,
      `missing-hook render threw: ${missing.outcome.error && missing.outcome.error.message}`,
    )
    let alerts = 0
    walkHosts(missing.outcome.tree, (node) => {
      if (node.props?.role === 'alert') alerts += 1
    })
    assert.ok(alerts >= 1, 'a missing data source must surface as role="alert"')
    assert.ok(primitiveCalls.length >= 0, 'sanity')
    return `aria-live containers=${live}; missing-hook alert faces=${alerts}`
  })

  await check('P5c every field primitive receives a stable id; every radiogroup a name', async () => {
    // §11: every group of the selected provider lives on ONE page, so there is
    // one control tree to audit — no cross-tab pairing heuristic remains.
    // v8: the compat booleans live in collapsed sections, so open them to keep
    // the boolean half of this audit meaningful.
    // T18: the model picker mounts only while open (T16), so open it through its
    // real 获取可用模型 button with a fake `remote.llm` before collecting calls.
    // That keeps the "the catalog search box exists and is named" assertion
    // meaningful instead of letting it drift into a vacuous pass.
    const page = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      expandCompat: true,
      remote: { llm: { discoverModels: async () => ({ ok: true, value: [{ id: 'm', name: 'M' }] }) } },
      openCatalog: true,
    })
    assert.ok(!page.outcome.error, `page render threw: ${page.outcome.error && page.outcome.error.message}`)
    const calls = page.primitiveCalls
    // The shipped primitives split into two accessible-name shapes:
    //   - id-bearing controls (SettingsValueField / SettingsSecretField /
    //     Input) take `id`, paired with <label htmlFor>;
    //   - a self-drawn radiogroup (the enum control, and since T7 the boolean
    //     leaf) is a host node, so it carries `aria-label` itself.
    // T7 retires `Switch`: a boolean leaf is the three-way radio group now, so
    // the audit asserts the retirement AND keeps checking that every radiogroup
    // on the page has an accessible name (an empty list would otherwise pass).
    const ID_BEARING = ['SettingsValueField', 'SettingsSecretField', 'Input']
    const controls = calls.filter((call) => ID_BEARING.includes(call.name))
    const switches = calls.filter((call) => call.name === 'Switch')
    assert.ok(controls.length + switches.length > 0, 'no field controls were rendered at all')
    assert.deepEqual(
      switches.map((call) => call.name),
      [],
      'T7: Switch is retired — a boolean leaf must render a radiogroup, not the primitive',
    )

    const noId = controls.filter((call) => typeof call.props.id !== 'string' || call.props.id.length === 0)
    // T7's catalog picker renders a transient search box (`type: 'search'`) that
    // is NOT a field control: it owns no field value and therefore no field id,
    // and names itself through `aria-label`. The exemption is keyed on the
    // search type so it can never grow into a general "aria-label is enough"
    // escape hatch, and the box must actually be there.
    //
    // Rationale (Lead-adjudicated, T8): this audit's "stable id" contract exists
    // for FIELD ROWS — `<label htmlFor>` paired with the control's id. A modal
    // toolbar control such as the model search box is not a field row: it has no
    // visible label column and is named by its own `aria-label`, which for a
    // toolbar control is the correct and complete accessible name. Do NOT read
    // (or re-use) this as a general licence to drop ids from field controls.
    const searchBoxes = noId.filter((call) => call.props.type === 'search')
    assert.ok(searchBoxes.length > 0, 'the catalog search box must render')
    for (const call of searchBoxes) {
      assert.equal(
        typeof call.props['aria-label'] === 'string' && call.props['aria-label'].length > 0,
        true,
        'the catalog search box must name itself with aria-label',
      )
    }
    const fieldControls = controls.filter((call) => call.props.type !== 'search')
    assert.deepEqual(
      fieldControls
        .filter((call) => typeof call.props.id !== 'string' || call.props.id.length === 0)
        .map((call) => call.props.label),
      [],
      `id-bearing controls without a stable id: ${JSON.stringify(
        fieldControls
          .filter((call) => typeof call.props.id !== 'string' || call.props.id.length === 0)
          .map((c) => c.name),
      )}`,
    )
    const controlIds = fieldControls.map((call) => call.props.id)
    assert.equal(
      new Set(controlIds).size,
      controlIds.length,
      `duplicate control ids on the page: ${JSON.stringify(controlIds)}`,
    )

    // Every radiogroup the page draws (enum rows and T7's boolean rows) names
    // itself; the compat booleans are the ones `expandCompat` just opened.
    const radiogroups = []
    walkHosts(page.outcome.tree, (node) => {
      if (node.props?.role === 'radiogroup') radiogroups.push(node)
    })
    assert.ok(radiogroups.length > 0, 'the page must render radiogroups (enum + boolean rows)')
    const unnamed = radiogroups.filter(
      (node) => typeof node.props['aria-label'] !== 'string' || node.props['aria-label'].length === 0,
    )
    assert.deepEqual(
      unnamed.map((node) => node.props?.id),
      [],
      `${unnamed.length} of ${radiogroups.length} radiogroups have no accessible name (§8.6)`,
    )
    const boolGroups = radiogroups.filter((node) =>
      String(node.props?.id || '').indexOf('compat-') !== -1,
    )
    assert.ok(
      boolGroups.length >= 5,
      `the opened compat section must expose its boolean radiogroups, got ${boolGroups.length}`,
    )

    // Every <label htmlFor> must point at something that really carries that id
    // (an id-bearing primitive, a Menu trigger, or a host node).
    const htmlFor = new Set()
    walkHosts(page.outcome.tree, (node) => {
      if (node.type === 'label' && typeof node.props?.htmlFor === 'string') htmlFor.add(node.props.htmlFor)
    })
    const anyIds = new Set()
    for (const call of calls) {
      if (typeof call.props.id === 'string') anyIds.add(call.props.id)
    }
    walkHosts(page.outcome.tree, (node) => {
      if (typeof node.props?.id === 'string') anyIds.add(node.props.id)
    })
    const dangling = [...htmlFor].filter((id) => !anyIds.has(id))
    assert.deepEqual(dangling, [], `labels pointing at no rendered id: ${JSON.stringify(dangling)}`)

    // §8.2: every control has a stable id and an accessible name. Text controls
    // must use the real <label htmlFor> association; primitives that own their
    // own accessible name by signature, or that the
    // contract renders without a visible label
    // (add-buttons) must supply aria-label/label.
    const byHtmlFor = []
    const byAria = []
    const byLabel = []
    const nameless = []
    for (const call of fieldControls) {
      const id = call.props.id
      if (typeof id !== 'string' || id.length === 0) {
        nameless.push([call.name, 'missing id'])
        continue
      }
      if (htmlFor.has(id)) {
        byHtmlFor.push(call.name)
        continue
      }
      const aria = call.props['aria-label']
      if (typeof aria === 'string' && aria.length > 0) {
        byAria.push(call.name)
        continue
      }
      if (typeof call.props.label === 'string' && call.props.label.length > 0) {
        byLabel.push(call.name)
        continue
      }
      nameless.push([call.name, id])
    }
    assert.deepEqual(nameless, [], `id-bearing controls with no accessible name: ${JSON.stringify(nameless)}`)

    const unpairedText = fieldControls
      .filter((call) => call.name === 'SettingsValueField' || call.name === 'SettingsSecretField')
      .filter((call) => !htmlFor.has(call.props.id))
      .map((call) => call.props.id)
    assert.deepEqual(
      unpairedText,
      [],
      `text controls must be associated through <label htmlFor>: ${JSON.stringify(unpairedText)}`,
    )
    const idCarriers = new Set(calls.filter((call) => typeof call.props.id === 'string').map((call) => call.name))
    return (
      `${fieldControls.length} id-bearing field controls on the page (unique ids; ${byHtmlFor.length} htmlFor-labelled, ` +
      `${byAria.length} aria-labelled, ${byLabel.length} primitive-labelled); ${switches.length} Switch instances (retired); ` +
      `${radiogroups.length} radiogroups named (${boolGroups.length} compat booleans); ` +
      `${searchBoxes.length} id-less search box; ` +
      `dangling htmlFor=0; ${htmlFor.size} htmlFor targets; id-carrying primitives=${JSON.stringify([...idCarriers].sort())}`
    )
  })

  await observe('P5c-diag: where the three identity Inputs get their label (task-15 evidence)', async () => {
    const page = await renderCell({ mirrorSnapshot: wellFormed, value })
    const htmlForIn = (tree) => {
      const found = new Set()
      walkHosts(tree, (node) => {
        if (node.type === 'label' && typeof node.props?.htmlFor === 'string') found.add(node.props.htmlFor)
      })
      return found
    }
    const labels = htmlForIn(page.outcome.tree)
    const targets = ['apiKeyEnv', 'displayName', 'baseURL'].map((key) => `piai-field-providers-alpha-${key}`)
    const rows = targets.map((id) => {
      const call = page.primitiveCalls.find((entry) => entry.props.id === id)
      return {
        id,
        primitive: call?.name,
        ariaLabel: call?.props['aria-label'],
        labelProp: call?.props.label,
        htmlForOnPage: labels.has(id),
      }
    })
    assert.ok(rows.every((row) => row.primitive === 'Input'), `unexpected primitives: ${JSON.stringify(rows)}`)
    return JSON.stringify(rows)
  })

  await check('P5d compat: 6 disclosure groups, 26 frozen keys, withheld keys marked but editable', async () => {
    const collapsedPage = await renderCell({ mirrorSnapshot: wellFormed, value })
    const outcome = collapsedPage.outcome
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    // v8 R3: the compat groups are self-written disclosures — no DisclosureRow
    // stub, no count badge. Collect one subtree per section (head + its body) so
    // the id/Tag attribution below keeps working on the same unit.
    const elementText = (node) => {
      if (node === undefined || node === null || typeof node === 'boolean') return ''
      if (typeof node === 'string' || typeof node === 'number') return String(node)
      if (Array.isArray(node)) return node.map(elementText).join(' ')
      if (node.__host === true) return elementText(node.children)
      if (node.__element === true) return elementText(node.props?.children)
      return ''
    }
    const hasClass = (node, name) =>
      typeof node.props?.className === 'string' && node.props.className.split(/\s+/).includes(name)

    const parsedSections = compatSectionsOf(outcome.tree)
    let hosts = 0
    const tabLabels = []
    walkHosts(outcome.tree, (node) => {
      hosts += 1
      if (node.props?.role === 'tabpanel') tabLabels.push(node.props['aria-labelledby'])
    })
    assert.equal(
      parsedSections.containers.length,
      1,
      `expected one compat disclosure container, got ${parsedSections.containers.length} (walked ${hosts} hosts; ` +
        `tabpanels=${JSON.stringify(tabLabels)}; text="${String(outcome.text).slice(0, 200)}")`,
    )
    const { heads, bodies, sections, titles: sectionTitles } = parsedSections
    assert.equal(
      heads.length,
      COMPAT_GROUPS.length,
      `expected ${COMPAT_GROUPS.length} compat disclosure groups, got ${heads.length}`,
    )
    const badges = []
    walkHosts(outcome.tree, (node) => {
      if (hasClass(node, 'piai-count')) badges.push(node)
    })
    assert.equal(badges.length, 0, 'v8: the compat head carries no count badge')

    for (const [index, head] of heads.entries()) {
      const toggle = sections[index].toggle
      assert.ok(toggle !== undefined, `section ${index} must expose a native disclosure button`)
      assert.equal(toggle.props.type, 'button')
      assert.equal(toggle.props['aria-expanded'], false, 'compat groups default collapsed per §6')
      const body = bodies.get(toggle.props['aria-controls'])
      assert.ok(body !== undefined, `section ${index} aria-controls must resolve to a permanent body`)
      assert.equal(body.props.hidden, true, 'a collapsed body is hidden but stays in the DOM')
    }
    for (const group of COMPAT_GROUPS) {
      const hits = sectionTitles.filter((title) => title.includes(group.title))
      assert.equal(
        hits.length,
        1,
        `§6 group "${group.title}" must appear exactly once; titles=${JSON.stringify(sectionTitles)}`,
      )
      assert.equal(
        hits[0],
        group.title,
        `v8: the title is the section name with no count suffix, got "${hits[0]}"`,
      )
    }
    // A collapsed body must mount no compat control at all (v8 keeps the field
    // mount conditional, exactly like the instance cards). The body element
    // itself stays and carries the `-body` id, so that one is excluded.
    for (const section of sections) {
      const fieldIds = []
      walkHosts(section, (node) => {
        const id = node.props?.id
        if (typeof id === 'string' && id.startsWith('piai-field-') && !id.endsWith('-body')) {
          fieldIds.push(id)
        }
      })
      assert.deepEqual(fieldIds, [], 'a collapsed compat section must mount no field control')
    }

    // Open all six sections to observe every key; the id/Tag attribution below
    // runs on that render.
    const expandedPage = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      expandCompat: true,
    })
    assert.ok(
      !expandedPage.outcome.error,
      `expanded render threw: ${expandedPage.outcome.error && expandedPage.outcome.error.message}`,
    )
    const loadedChunks = expandedPage.loadedChunks
    const rows = compatSectionsOf(expandedPage.outcome.tree).sections
    assert.equal(rows.length, COMPAT_GROUPS.length, 'all six sections must be openable')

    // Which frozen key does a rendered control id belong to? (shared helper)
    const keyOfId = keyOfFrozenId

    // Every key must resolve to a stable id INSIDE its own frozen §6 group.
    const seen = new Set()
    const allControls = []
    const perGroup = {}
    for (const row of rows) {
      const title = elementText(row.props.title)
      const resolved = new Set()
      for (const id of subtreeFieldIds(row)) {
        const key = keyOfId(id)
        if (key !== undefined) {
          seen.add(key)
          resolved.add(key)
        }
      }
      for (const [, group] of Object.entries(COMPAT_GROUPS)) {
        if (title.includes(group.title)) perGroup[group.title] = resolved
      }
      for (const { name, props } of stubDescendants(row)) {
        if (FIELD_PRIMITIVES.includes(name) && typeof props.id === 'string') allControls.push(props)
      }
      // v7: enum/const rows are native radio groups now, so their disabled state
      // lives on host inputs, not on a primitive's props.
      walkHosts(row, (node) => {
        if (
          typeof node.props?.id === 'string' &&
          (node.props.disabled === true || node.props.readOnly === true)
        ) {
          allControls.push(node.props)
        }
      })
    }
    const missing = FROZEN_COMPAT_KEYS.filter((key) => !seen.has(key))
    assert.deepEqual(missing, [], `compat keys with no resolvable stable id in their row: ${JSON.stringify(missing)}`)
    assert.equal(seen.size, 26, `expected 26 compat keys, saw ${seen.size}`)
    for (const group of COMPAT_GROUPS) {
      const resolved = perGroup[group.title]
      assert.ok(resolved, `group "${group.title}" did not render`)
      const wanted = [...group.keys].sort()
      assert.deepEqual(
        [...resolved].sort(),
        wanted,
        `group "${group.title}" resolved ${JSON.stringify([...resolved].sort())}, expected ${JSON.stringify(wanted)}`,
      )
    }

    const fields = loadedChunks['client.fields.js']
    assert.ok(fields && typeof fields.compatDisposition === 'function', 'fields chunk exposes compatDisposition')
    const api = 'anthropic-messages'
    const withheldish = new Set(FROZEN_COMPAT_KEYS.filter((key) => fields.compatDisposition(api, key) !== 'offer'))
    assert.ok(withheldish.size > 0, 'the chosen protocol must withhold at least one frozen key')

    // Marking is structural and per field row: see taggedCompatKeys() for the
    // attribution rule and the task-15 adjudication note.
    const marked = taggedCompatKeys(rows)
    const unmarked = [...withheldish].filter((key) => !marked.has(key))
    const overmarked = [...marked].filter((key) => !withheldish.has(key))
    assert.deepEqual(
      unmarked,
      [],
      `keys the gate does not offer must be marked "该协议不支持": unmarked=${JSON.stringify(unmarked)}`,
    )
    assert.deepEqual(
      overmarked,
      [],
      `keys marked "该协议不支持" although the gate offers them: ${JSON.stringify(overmarked)}`,
    )

    const disabled = allControls.filter((props) => props.disabled === true || props.readOnly === true)
    assert.deepEqual(
      disabled.map((props) => props.id),
      [],
      `withheld keys must stay editable (adapter is authoritative): disabled controls ${JSON.stringify(disabled.map((p) => p.id))}`,
    )
    return (
      `groups=${rows.length}, keys=${seen.size}, no count badge (v8); protocol ${api}: ` +
      `not-offered=${withheldish.size} frozen keys, Tag-marked=${marked.size} (exact); ` +
      `${allControls.length} controls, none disabled`
    )
  })

  await observe('P5d-diag: where each compat row carries its stable id (task-15 evidence)', async () => {
    const probe = await renderCell({ mirrorSnapshot: wellFormed, value, expandCompat: true })
    const fieldsChunk = probe.loadedChunks['client.fields.js']
    const rows = compatSectionsOf(probe.outcome.tree).sections
    const kindOf = (node) => {
      const stub = node.props?.['data-stub']
      const className = typeof node.props?.className === 'string' ? `.${node.props.className.split(/\s+/)[0]}` : ''
      const tag = typeof node.type === 'string' ? node.type : '?'
      return `${stub ? `stub:${stub}` : tag}${className}`
    }
    /** `{ ids, idKinds, tagText }` for one compat section subtree. */
    const rowFacts = (row) => {
      const ids = []
      const idKinds = []
      let tagText = null
      walkHosts(row, (node) => {
        if (typeof node.props?.id === 'string') {
          ids.push(node.props.id)
          idKinds.push(kindOf(node))
        }
        if (node.props?.['data-stub'] === 'Tag') {
          const text = flattenText(node)
          if (text.includes('不支持')) tagText = text
        }
      })
      return { ids, idKinds, tagText }
    }
    const facts = rows.map(rowFacts)
    const factsFor = (key) => facts.filter((fact) => fact.ids.some((id) => id.includes(key)))
    const kindsFor = (key) => [...new Set(factsFor(key).flatMap((fact) => fact.idKinds.filter((_, i) => fact.ids[i].includes(key))))]
    const unresolved = FROZEN_COMPAT_KEYS.filter((key) => factsFor(key).length === 0)
    const kindHistogram = {}
    for (const key of FROZEN_COMPAT_KEYS) {
      for (const kind of kindsFor(key)) kindHistogram[kind] = (kindHistogram[kind] ?? 0) + 1
    }
    const api = 'anthropic-messages'
    const notOffered = FROZEN_COMPAT_KEYS.filter((key) => fieldsChunk.compatDisposition(api, key) !== 'offer')
    const tagged = taggedCompatKeys(rows)
    const taggedNotOffered = notOffered.filter((key) => tagged.has(key))
    const taggedOffered = FROZEN_COMPAT_KEYS.filter(
      (key) => fieldsChunk.compatDisposition(api, key) === 'offer' && tagged.has(key),
    )
    assert.deepEqual(
      unresolved,
      [],
      `compat keys with no id-bearing node anywhere in their row: ${JSON.stringify(unresolved)}`,
    )
    return (
      `keys with an id = 26/26; id-carrying node kinds = ${JSON.stringify(kindHistogram)}; ` +
      `disclosure rows carrying the Tag = ${facts.filter((fact) => fact.tagText !== null).length}/${facts.length}; ` +
      `for ${api}: not-offered=${notOffered.length}, Tagged=${taggedNotOffered.length}, ` +
      `Tagged-but-offered=${JSON.stringify(taggedOffered)}`
    )
  })

  await check('P5e the page really groups provider leaves as the contract expects', async () => {
    // Reproduce the page's own call (lib/client.js) exactly: the same envelope,
    // the same provider-profile ref, the same base path.
    const probe = await renderCell({ mirrorSnapshot: wellFormed, value })
    const schema = probe.loadedChunks['client.schema.js']
    const fields = probe.loadedChunks['client.fields.js']
    assert.ok(schema && fields, 'schema/fields chunks must be loaded by the owner')
    const root = schema.node(envelope, envelope.uid)
    const providers = schema.node(envelope, root.dict.providers)
    const pageLeaves = schema.leaves(envelope, providers.inner, ['providers', 'alpha'])
    const contractLeaves = schema.leaves(envelope, providers.inner, [])
    // Note: the chunk runs in a vm sandbox, so its arrays are cross-realm and
    // fail deepStrictEqual on prototype identity — normalise with Array.from.
    const shape = (groups) => Array.from(groups, (group) => `${group.id}:${group.leaves.length}`)
    const pageGroups = shape(fields.groupLeaves(pageLeaves))
    const contractGroups = shape(fields.groupLeaves(contractLeaves))
    const EXPECTED = [
      'identity:4',
      'models:32',
      'overrides:31',
      'defaults:3',
      'request:8',
      'timeouts:3',
      'images:3',
      'retry:1',
      'compat:26',
    ]

    // The single page must show the models groups, not an empty state.
    const modelControls = probe.primitiveCalls.filter((call) =>
      ['SettingsValueField', 'SettingsSecretField', 'Input', 'Switch'].includes(call.name),
    )

    assert.deepEqual(
      contractGroups,
      EXPECTED,
      `the basePath [] grouping drifted from the frozen shape: got ${JSON.stringify(contractGroups)} ` +
        `want ${JSON.stringify(EXPECTED)}`,
    )
    assert.deepEqual(
      pageGroups,
      contractGroups,
      `the page's own leaves/groupLeaves call yields ${JSON.stringify(pageGroups)} but the instance-relative ` +
        `basePath [] yields ${JSON.stringify(contractGroups)}; every provider field collapses into "other", so ` +
        `the frozen §6 compat disclosures and the model groups never render. Leaves look like ` +
        `${JSON.stringify(pageLeaves.slice(0, 2).map((leaf) => leaf.path.join('.')))}; ` +
        `models tab text="${String(probe.outcome.text).slice(0, 160)}"`,
    )
    assert.ok(modelControls.length > 0, 'the page rendered no model field control at all')
    return `page groups == basePath [] groups == ${JSON.stringify(pageGroups)}; models-tab controls=${modelControls.length}`
  })

  await check('P5h curated labels/hints resolve for the page\u2019s own leaf paths', async () => {
    const probe = await renderCell({ mirrorSnapshot: wellFormed, value })
    const fields = probe.loadedChunks['client.fields.js']
    assert.ok(fields && typeof fields.labelFor === 'function', 'fields chunk exposes labelFor')
    const pageStyle = fields.labelFor({ path: ['providers', 'alpha', 'api'], kind: 'enum', enum: ['a', 'b'] })
    const contractStyle = fields.labelFor({ path: ['api'], kind: 'enum', enum: ['a', 'b'] })
    const pageHint = fields.describeField('providers.alpha.api').hint
    const contractHint = fields.describeField('api').hint
    assert.equal(
      pageStyle,
      contractStyle,
      `a page-shaped leaf path does not resolve the curated label: ` +
        `providers.alpha.api -> "${pageStyle}", api -> "${contractStyle}"`,
    )
    assert.equal(pageHint, contractHint, 'a page-shaped leaf path does not resolve the curated hint')
    return `providers.alpha.api label="${pageStyle}"; hint len=${(contractHint ?? '').length}`
  })

  await check('P5f aria-describedby wiring is present and every reference resolves', async () => {
    const probe = await renderCell({ mirrorSnapshot: wellFormed, value })
    assert.ok(!probe.outcome.error, `render threw: ${probe.outcome.error && probe.outcome.error.message}`)
    const ids = new Set()
    const described = []
    let ariaHosts = 0
    const ariaSample = []
    walkHosts(probe.outcome.tree, (node) => {
      if (typeof node.props?.id === 'string') ids.add(node.props.id)
      const keys = Object.keys(node.props ?? {}).filter((key) => key.startsWith('aria-'))
      if (keys.length > 0) {
        ariaHosts += 1
        if (ariaSample.length < 6) ariaSample.push({ type: node.type, keys })
      }
      const value = node.props?.['aria-describedby']
      if (typeof value === 'string' && value.trim() !== '') described.push(value)
    })
    assert.ok(
      described.length > 0,
      `no control wires aria-describedby to its hint (aria hosts=${ariaHosts}, sample=${JSON.stringify(ariaSample)})`,
    )
    const dangling = []
    for (const value of described) {
      for (const id of value.split(/\s+/)) if (id !== '' && !ids.has(id)) dangling.push(id)
    }
    assert.deepEqual(dangling, [], `aria-describedby points at missing nodes: ${JSON.stringify([...new Set(dangling)])}`)
    return `${described.length} aria-describedby references, all resolving (${ids.size} ids in the tree)`
  })

  await observe('P5g aria-invalid on a failing field (cannot be forced without a real validation state)', async () => {
    // v10: `Row` lives in the kit module, so the layer is scanned as a whole.
    const source = stripJsComments(
      jsClassSources()
        .filter((entry) => entry.name.startsWith('client.panels'))
        .map((entry) => entry.source)
        .join('\n'),
    )
    assert.match(source, /'aria-invalid'/, 'panels never emit aria-invalid')
    return "code emits aria-invalid from Row({invalid}) and the primitive sets it on the input; NOT exercised dynamically"
  })
}

/* ==================================================================== *
 * PHASE P6 — resilience (§1.3, §7)
 * ==================================================================== */

async function phaseResilience() {
  section('P6 — resilience: rejected styles chunk + hook hardening')

  const envelope = fixture()
  const value = { providers: { alpha: { api: 'openai-completions', model: 'alpha-model' } } }
  const wellFormed = servedSnapshot(envelope, value)

  await check('P6a a REJECTED styles chunk still renders the page and does not throw', async () => {
    const { outcome, requested } = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      failChunks: ['client.styles.js'],
    })
    assert.ok(
      requested.includes('./client.styles.js'),
      `the page must actually request the styles chunk; requested=${JSON.stringify(requested)}`,
    )
    assert.ok(!outcome.error, `a style failure escaped into the render: ${outcome.error && outcome.error.message}`)
    assert.ok(outcome.tree !== undefined && outcome.tree !== null, 'the page rendered nothing')
    assert.match(
      String(outcome.text),
      /Extended model config/,
      `the page must still render its real content unstyled; text="${outcome.text}"`,
    )
    return `text starts "${String(outcome.text).slice(0, 90)}…"`
  })

  await check('P6b the selector-hook hardening is intact (hook called WITH a selector)', async () => {
    const { outcome, hookCalls } = await renderCell({ mirrorSnapshot: wellFormed, value })
    assert.ok(!outcome.error, `render threw: ${outcome.error && outcome.error.message}`)
    assert.ok(hookCalls.length >= 1, 'the injected page hook was never called')
    const bad = hookCalls.filter((call) => call.selectorType !== 'function')
    assert.deepEqual(
      bad,
      [],
      `the page hook was called without a function selector — this is the abdication bug: ${JSON.stringify(bad)}`,
    )
    return `observed ${hookCalls.map((call) => `${call.name}(${call.selectorType})`).join(', ')}`
  })

  await check('P6c a throwing panel is contained and a chunk failure still shows copy', async () => {
    const boom = () => {
      throw new Error('polish harness: simulated panel crash')
    }
    const crashed = await renderCell({
      mirrorSnapshot: wellFormed,
      value,
      transformChunk: (fileName, api) => {
        if (fileName !== 'client.panels.js') return api
        const patched = Object.assign({}, api)
        for (const name of Object.keys(patched)) {
          if (/Panel$/.test(name) && typeof patched[name] === 'function') patched[name] = boom
        }
        return patched
      },
    })
    assert.ok(
      !crashed.outcome.error,
      `the panel crash escaped the boundary: ${crashed.outcome.error && crashed.outcome.error.message}`,
    )
    assert.ok(
      crashed.diagnostics.boundaryCatches.length >= 1,
      'no error boundary caught the panel crash (abdication risk)',
    )
    assert.match(
      String(crashed.outcome.text),
      /Extended model config/,
      'the page itself disappeared when a panel crashed',
    )

    const failedChunk = await renderCell({ mirrorSnapshot: wellFormed, value, failChunks: ['client.panels.js'] })
    assert.ok(
      !failedChunk.outcome.error,
      `a panels failure escaped: ${failedChunk.outcome.error && failedChunk.outcome.error.message}`,
    )
    assert.ok(String(failedChunk.outcome.text).trim().length > 0, 'chunk failure rendered nothing visible')
    return (
      `panel crash caught by ${crashed.diagnostics.boundaryCatches.map((c) => c.boundary).join(',')}; ` +
      `panels-failure text="${String(failedChunk.outcome.text).slice(0, 70)}"`
    )
  })
}

/* ==================================================================== *
 * PHASE P7 — compat gate truth (adapter vs the fields-chunk mirror)
 * ==================================================================== */

const ADAPTER_LIB = join(ASAR, 'dsh-llm-pi-ai/lib/index.js')

/** Parse the adapter's own COMPAT_GATES table out of its shipped source. */
function parseAdapterGates() {
  const src = readSource(ADAPTER_LIB, 'dsh-llm-pi-ai adapter')
  const pairs = (block) => {
    const out = {}
    for (const match of block.matchAll(/([A-Za-z][A-Za-z0-9_]*)\s*:\s*"(offer|withhold)"/g)) out[match[1]] = match[2]
    return out
  }
  const grab = (name) => {
    const at = src.indexOf(`const ${name} = {`)
    assert.ok(at !== -1, `adapter table ${name} not found (upstream changed)`)
    let depth = 0
    const start = src.indexOf('{', at)
    for (let i = start; i < src.length; i += 1) {
      if (src[i] === '{') depth += 1
      else if (src[i] === '}') {
        depth -= 1
        if (depth === 0) return src.slice(start, i + 1)
      }
    }
    throw new Error(`unbalanced ${name}`)
  }
  const completions = pairs(grab('COMPLETIONS_COMPAT_GATE'))
  const responses = pairs(grab('RESPONSES_COMPAT_GATE'))
  const block = grab('COMPAT_GATES')
  const table = {}
  let depth = 1
  let buf = ''
  let lastKey
  for (let i = block.indexOf('{') + 1; i < block.length; i += 1) {
    const ch = block[i]
    if (ch === '{') {
      depth += 1
      buf += ch
      continue
    }
    if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        if (buf.trim()) table[lastKey] = buf
        break
      }
      buf += ch
      continue
    }
    if (ch === ',' && depth === 1) {
      if (buf.trim()) table[lastKey] = buf
      buf = ''
      continue
    }
    buf += ch
    const keyMatch = buf.match(/"([^"]+)"\s*:\s*$/)
    if (keyMatch) {
      lastKey = keyMatch[1]
      buf = ''
    }
  }
  const resolved = {}
  for (const [api, body] of Object.entries(table)) {
    resolved[api] =
      body.includes('COMPLETIONS_COMPAT_GATE') ? completions
      : body.includes('RESPONSES_COMPAT_GATE') ? responses
      : pairs(body)
  }
  return resolved
}

async function phaseCompatGate() {
  section('P7 — compat gate truth (lead extra check: is "该协议不支持" honest?)')

  const adapter = parseAdapterGates()

  await check('P7a the fields-chunk mirror equals the real adapter gate for all 7 protocols', async () => {
    const { loadedChunks } = await renderCell({
      mirrorSnapshot: servedSnapshot(fixture(), { providers: { alpha: {} } }),
    })
    const fields = loadedChunks['client.fields.js']
    assert.ok(fields && typeof fields.compatGate === 'function', 'fields chunk exposes compatGate')
    const drift = []
    for (const [api, gate] of Object.entries(adapter)) {
      const seen = fields.compatGate(api)
      if (seen === undefined) {
        drift.push(`${api}: mirror has no gate`)
        continue
      }
      const adapterOffered = Object.entries(gate).filter(([, v]) => v === 'offer').map(([k]) => k).sort()
      const adapterWithheld = Object.entries(gate).filter(([, v]) => v !== 'offer').map(([k]) => k).sort()
      if (JSON.stringify([...seen.offered].sort()) !== JSON.stringify(adapterOffered)) drift.push(`${api}: offered`)
      if (JSON.stringify([...seen.withheld].sort()) !== JSON.stringify(adapterWithheld)) drift.push(`${api}: withheld`)
    }
    assert.deepEqual(drift, [], `mirror drifted from the adapter: ${JSON.stringify(drift)}`)
    return `${Object.keys(adapter).length} protocols identical (offered + withheld sets)`
  })

  await check('P7b no gate explicitly withholds any of the 26 frozen compat keys', () => {
    const explicit = []
    for (const [api, gate] of Object.entries(adapter)) {
      for (const key of FROZEN_COMPAT_KEYS) if (gate[key] === 'withhold') explicit.push(`${api}:${key}`)
    }
    assert.deepEqual(explicit, [], `frozen keys explicitly withheld: ${JSON.stringify(explicit)}`)
    const unionOffered = new Set()
    for (const gate of Object.values(adapter)) {
      for (const key of FROZEN_COMPAT_KEYS) if (gate[key] === 'offer') unionOffered.add(key)
    }
    assert.equal(unionOffered.size, FROZEN_COMPAT_KEYS.length, 'every frozen key should be offered by some protocol')
    return 'explicit withholds of frozen keys: none; all 26 offered by at least one protocol'
  })

  await check('P7c the marking rule matches the adapter runtime rule (no overstatement)', () => {
    // The adapter's own rule is `gate?.[field] !== "offer"` (resolveModelCompat):
    // for model-level compat that is a hard error, for route-level it is a skip.
    // So "not offered by this protocol" == "cannot take it", and the UI marking
    // every such key is faithful. Report the per-protocol marked counts.
    const source = readSource(ADAPTER_LIB, 'adapter')
    assert.match(
      source,
      /gate\?\.\[field\]\s*!==\s*"offer"/,
      'the adapter no longer uses the !== "offer" rule — re-derive the marking semantics',
    )
    const perProtocol = {}
    for (const api of Object.keys(adapter)) {
      perProtocol[api] = FROZEN_COMPAT_KEYS.filter((key) => adapter[api][key] !== 'offer').length
    }
    return `adapter rule confirmed; marked frozen keys per protocol: ${JSON.stringify(perProtocol)}`
  })
}

/* ==================================================================== *
 * PHASE P8 — owner chunk requests vs the wiring test's enumeration
 * ==================================================================== */

async function phaseChunkRequests() {
  section('P8 — stylesheet chunk request + wiring-test staleness')

  const requested = await (async () => {
    const { requested: list } = await renderCell({
      mirrorSnapshot: servedSnapshot(fixture(), { providers: { alpha: {} } }),
    })
    return list
  })()

  await check('P8a the owner requests client.styles.js', () => {
    assert.ok(
      requested.includes('./client.styles.js'),
      `the owner never asked for the styles sheet; requested=${JSON.stringify(requested)}`,
    )
    return `owner requests ${JSON.stringify(requested)}`
  })

  await observe('P8b tests/wiring.test.js chunk enumeration vs what the owner actually requests', () => {
    const wiring = readSource(join(ROOT, 'tests', 'wiring.test.js'), 'wiring test')
    const listed = [...wiring.matchAll(/'(client\.[A-Za-z0-9._-]+\.js)'/g)].map((match) => match[1])
    const unique = [...new Set(listed)].sort()
    const actual = [...new Set(requested.map((spec) => spec.replace('./', '')))].sort()
    const missingFromWiringTest = actual.filter((file) => !unique.includes(file))
    const staleText = missingFromWiringTest.length === 0 ? 'in sync' : `STALE: ${JSON.stringify(missingFromWiringTest)}`
    assert.ok(actual.length > 0, 'no chunk request recorded')
    return `wiring.test.js lists ${JSON.stringify(unique)}; owner requests ${JSON.stringify(actual)} -> ${staleText}`
  })
}

/* ==================================================================== *
 * PHASE P10 — served-bytes check (development.md §5 rev trap)
 * ==================================================================== */

const BASE_URL = process.env.VERIFY_POLISH_BASE_URL ?? 'http://127.0.0.1:19387'

/** GET a URL and buffer the body (short timeout; used only for the served check). */
function httpGetText(path, { timeoutMs = 6000, maxBytes = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL)
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: `${url.pathname}${url.search}`, method: 'GET' },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
          if (body.length > maxBytes) req.destroy()
        })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }))
      },
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)))
    req.on('error', reject)
    req.end()
  })
}

/**
 * Read our entry's `rev` from the client boot graph SSE (`/plugins/events`).
 * @param id - plugin id.
 * @returns the rev string.
 */
async function fetchEntryRev(id) {
  return new Promise((resolve, reject) => {
    const url = new URL('/plugins/events', BASE_URL)
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path: url.pathname, headers: { accept: 'text/event-stream' } },
      (res) => {
        let buffer = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          buffer += chunk
          const match = buffer.match(new RegExp(`"id":"${id}","url":"[^"]*","rev":"([0-9a-f]+)"`))
          if (match) {
            res.destroy()
            resolve(match[1])
          }
        })
        res.on('end', () => reject(new Error(`graph stream ended before ${id} appeared`)))
      },
    )
    req.setTimeout(6000, () => req.destroy(new Error('graph timeout')))
    req.on('error', reject)
    req.end()
  })
}

/**
 * Independently recompute the entry rev from the owner bundle's stat, using the
 * shipped algorithm (`dsh-client-modules` `artifactRevision`): sha1 of
 * `plugin-artifact\0` + byte-length-framed [mtimeMs, ctimeMs, size], first 12 hex.
 */
function computeOwnerRev(ownerPath = OWNER_LIB) {
  const stat = statSync(ownerPath)
  const parts = [String(stat.mtimeMs), String(stat.ctimeMs), String(stat.size)]
  const hash = createHash('sha1')
  hash.update('plugin-artifact')
  hash.update('\0')
  for (const part of parts) hash.update(`${Buffer.byteLength(part)}:`).update(part)
  return hash.digest('hex').slice(0, 12)
}

async function phaseServedBytes() {
  section('P10 — served-bytes check (the rev trap: on-disk ≠ delivered)')

  let rev
  let recomputed
  try {
    rev = await fetchEntryRev(OWNER_ID)
    try {
      recomputed = computeOwnerRev()
    } catch {
      recomputed = undefined
    }
  } catch (error) {
    await observe('P10a client bridge /plugins/events reachable', () => {
      throw new Error(`cannot read the current rev: ${error.message}`)
    })
    return
  }

  await observe(
    'P10a every served stylesheet chunk matches the on-disk bytes for the current rev',
    async () => {
      // Compare FILE BYTES, not the extracted STYLESHEET string: the served body
      // is the chunk file (a JS source whose CSS literal is escaped), so byte
      // containment of the file is the exact freshness test.
      //
      // v10: the sheet is composed from two fragments, so freshness and the marker
      // probes run over every stylesheet chunk, not one file.
      const served = {}
      const fresh = {}
      for (const file of [STYLES_LIB, ...STYLE_PART_FILES.map((name) => join(LIB, name))]) {
        const label = file.slice(ROOT.length + 1)
        const diskBytes = readFileSync(file)
        const path = `/plugins/${OWNER_ID}/${label.slice('lib/'.length)}?rev=${rev}`
        const res = await httpGetText(path)
        assert.equal(res.status, 200, `GET ${path} -> HTTP ${res.status}`)
        const body = Buffer.from(res.body, 'utf8')
        served[label] = body
        fresh[label] = body.includes(diskBytes)
      }
      const cssServed = Buffer.concat(
        STYLE_PART_FILES.map((name) => served[`lib/${name}`]),
      ).toString('utf8')
      // Marker verdicts: `fresh` proves the served body IS the disk file, so the
      // CSS structure comes from the parsed sheet (which strips CSS comments).
      // A regex over the raw body is unsafe here: the sheet's own comment says
      // "viewport @media never fires ... non-width preferences", and `\bwidth\b`
      // matches inside "non-width". Exact-string probes below are immune.
      const parsedSheet = parseStylesheet(loadStylesChunk().api.STYLESHEET)
      const widthMedia = widthMediaPreludes(parsedSheet).length > 0
      const rowColumn = /column/.test(declarationMap(parsedSheet, LAYOUT_RULES.row)['flex-direction'] ?? '')
      const probes = {
        'max-width: 719px': cssServed.includes('max-width: 719px'),
        'grid-template-columns: 240px': cssServed.includes('grid-template-columns: 240px'),
        'flex: 1 1 320px': cssServed.includes('flex: 1 1 320px'),
        'prefers-reduced-motion': cssServed.includes('prefers-reduced-motion'),
        '--dsw-alias-border-l4': cssServed.includes('--dsw-alias-border-l4'),
        // v7: `.piai-key` survives (the raw-key chip moved into the Tooltip
        // bubble, §15.3.4), and the three new card-head classes must be served.
        '.piai-key': cssServed.includes('.piai-key'),
        '.piai-item-head': cssServed.includes('.piai-item-head'),
        '.piai-item-remove': cssServed.includes('.piai-item-remove'),
        '.piai-provider-list': cssServed.includes('.piai-provider-list'),
        '--dsw-focus-ring-width': cssServed.includes('--dsw-focus-ring-width'),
        '.piai-tag': cssServed.includes('.piai-tag'),
        '.piai-cred': cssServed.includes('.piai-cred'),
        // T7: the two classes the two-slot tab bar and the provider pick list
        // introduced must be served too, so a stale served body cannot silently
        // ship a page whose strip has no bar rule.
        '.piai-tabs-bar': cssServed.includes('.piai-tabs-bar'),
        '.piai-catalog': cssServed.includes('.piai-catalog'),
      }
      const sizes = Object.entries(served)
        .map(([label, body]) => `${label}=${body.length}B`)
        .join(', ')
      const freshness = Object.entries(fresh)
        .map(([label, ok]) => `${label}:${ok}`)
        .join(', ')
      const markers =
        `served ${sizes}; containsDiskFile ${freshness}; ` +
        `width-@media=${widthMedia}; .piai-row column=${rowColumn}; probes=${JSON.stringify(probes)}`
      const V4_PROBES = ['prefers-reduced-motion', '--dsw-alias-border-l4', '.piai-key', '.piai-tag', '.piai-cred']
      const V7_PROBES = [
        '.piai-item-head',
        '.piai-item-remove',
        '.piai-provider-list',
        '--dsw-focus-ring-width',
      ]
      const T7_PROBES = ['.piai-tabs-bar', '.piai-catalog']
      const V1_PROBES = ['max-width: 719px', 'grid-template-columns: 240px', 'flex: 1 1 320px']
      assert.deepEqual(
        V4_PROBES.filter((probe) => !probes[probe]),
        [],
        `the served body must carry the v4 markers (key chips, tag lists, credential rows): ${JSON.stringify(probes)}`,
      )
      assert.deepEqual(
        V7_PROBES.filter((probe) => !probes[probe]),
        [],
        `the served body must carry the v7 markers (card head, tab row, focus ring): ${JSON.stringify(probes)}`,
      )
      assert.deepEqual(
        T7_PROBES.filter((probe) => !probes[probe]),
        [],
        `the served body must carry the T7 markers (two-slot tab bar, provider pick list): ${JSON.stringify(probes)}`,
      )
      assert.deepEqual(
        V1_PROBES.filter((probe) => probes[probe]),
        [],
        `the served body must NOT carry the retired two-column/240px layout: ${JSON.stringify(probes)}`,
      )
      const stale = Object.entries(fresh)
        .filter(([, ok]) => ok !== true)
        .map(([label]) => label)
      assert.deepEqual(
        stale,
        [],
        `STALE: the served chunk(s) at rev ${rev} do not contain the on-disk bytes — chunk edits do ` +
          `not bump the rev (development.md §5). The owner bundle must be saved/touched so the rev changes, ` +
          `then F5. ${markers}`,
      )
      return `rev=${rev}${recomputed === undefined ? '' : ` (recomputed from stat: ${recomputed})`}; ${markers}`
    },
  )
}

/* ==================================================================== *
 * main
 * ==================================================================== */

process.stdout.write('verify.polish.mjs — independent polish verification\n')
process.stdout.write(`project: ${ROOT}\n`)
for (const [label, file] of [
  ['client.styles.js', STYLES_LIB],
  ['client.js', OWNER_LIB],
  ['client.panels.js', PANELS_LIB],
]) {
  const exists = existsSync(file)
  process.stdout.write(
    `${label}: ${exists ? `${readFileSync(file).length} bytes, md5 ${md5(readFileSync(file))}` : 'MISSING'} (${file})\n`,
  )
}
process.stdout.write(`checked at: ${new Date().toISOString()}\n`)

const phases = [
  ['styles', phaseStyleContract],
  ['leak-tokens', async () => {
    await phaseLeak()
    await phaseTokens()
    await phaseClassCoverage()
    await phaseLayout()
  }],
  ['render', async () => {
    await phaseA11y()
    await phaseResilience()
  }],
  ['gate', async () => {
    await phaseCompatGate()
    await phaseChunkRequests()
  }],
  ['served', phaseServedBytes],
]

const only = process.env.VERIFY_POLISH_ONLY
for (const [name, run] of phases) {
  if (only !== undefined && !only.split(',').includes(name)) {
    process.stdout.write(`\n=== (skipped phase "${name}" via VERIFY_POLISH_ONLY)\n`)
    continue
  }
  try {
    await run()
  } catch (error) {
    process.stdout.write(`\n[HARNESS ERROR in phase "${name}"] ${error?.stack ?? error}\n`)
    process.exitCode = 1
  }
}

const failed = results.filter((r) => !r.ok && !r.observed)
const observationProblems = results.filter((r) => !r.ok && r.observed)
process.stdout.write(
  `\n--- summary: ${results.filter((r) => r.ok).length} passed, ${failed.length} failed` +
    `${observationProblems.length > 0 ? `, ${observationProblems.length} observation problem(s)` : ''} ---\n`,
)
if (failed.length > 0) {
  for (const f of failed) process.stdout.write(`  FAILED: ${f.name}\n`)
  process.exitCode = 1
}
