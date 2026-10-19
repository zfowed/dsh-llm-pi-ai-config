#!/usr/bin/env node
/**
 * Static browser-layout fixtures for the v8 R1–R3 defects.
 *
 * Why this exists
 * ---------------
 * Every other harness (tests/*.test.js, verify.polish.mjs, verify.render.mjs)
 * asserts the DOM, props and CSS TEXT. None of them computes layout, so none of
 * them could see the R1 defect: `.piai-row-control input { width: 100% }`
 * stretched the primitive Checkbox to its label's full width, and the label
 * span's `min-width: 0; overflow: hidden; text-overflow: ellipsis` then resolved
 * to ZERO width — the 输入模态 option labels disappeared in a real Chromium while
 * every DOM assertion kept passing. Only a real browser can measure that, so
 * this script emits real pages and `tests/layout/measure-in-page.js` measures
 * them through ego-browser.
 *
 * What it does (no dependencies, static HTML only)
 * -----------------------------------------------
 *   1. loads the stylesheet chunks (`lib/client.styles.chrome.js`,
 *      `lib/client.styles.controls.js`, then the `lib/client.styles.js` facade)
 *      and takes the REAL `STYLESHEET` string (never a hand-copied subset);
 *   2. concatenates the primitive module-CSS snapshots from
 *      `tests/layout/primitives/` (Checkbox/Input), so the boxes are the real
 *      primitive boxes;
 *   3. supplies a host theme block for the `--dsw-*` tokens DSH provides at
 *      runtime (the fixture is a page, not a DSH client, so it must define them);
 *   4. writes `r1-checks.html`, `r2-nested.html`, `r3-disclosure.html`,
 *      `index.html` and `manifest.json` to `/tmp/piai-layout/`.
 *
 * The DOM shapes are copied from the shipped primitives and our own panels:
 *   Checkbox  `label.checkbox > input[type=checkbox] + span`
 *   Input     `span.wrap > input.input`
 *   Row       `.piai-row > .piai-row-head + .piai-row-control`
 *   Head      `.piai-item-head > button[aria-expanded][aria-controls]` (chevron
 *             is a REAL 14x14 `<svg>`: the panel's LocalIcon fallback renders an
 *             unsized span, which would make the 18px alignment criterion lie).
 *
 * Usage:
 *   node tests/layout/build-fixture.mjs            # -> /tmp/piai-layout
 *   PIAI_LAYOUT_OUT=/tmp/x node tests/layout/build-fixture.mjs
 *
 * @module dsh-llm-pi-ai-config/tests/layout/build-fixture
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const LIB = join(ROOT, 'lib')
const OUT = process.env.PIAI_LAYOUT_OUT ?? '/tmp/piai-layout'
const PRIMITIVE_CSS = {
  Checkbox: join(HERE, 'primitives', 'Checkbox.module.css'),
  Input: join(HERE, 'primitives', 'Input.module.css'),
  Tooltip: join(HERE, 'primitives', 'Tooltip.module.css'),
}
const PRIMITIVE_SOURCE = {
  Checkbox: '/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Checkbox.module.css',
  Input: '/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Input.module.css',
  Tooltip: '/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/Tooltip.module.css',
}

const md5 = (text) => createHash('md5').update(text).digest('hex')

/** The real stylesheet string, straight out of the shipped chunk. */
function loadStylesheet() {
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
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  createContext(sandbox)
  // v10: the sheet is composed from two area fragments, so load them first.
  for (const part of ['client.styles.chrome.js', 'client.styles.controls.js']) {
    const partFile = join(LIB, part)
    runInContext(readFileSync(partFile, 'utf8'), sandbox, { filename: partFile })
    registrations[registrations.length - 1].factory()
  }
  const before = registrations.length
  const file = join(LIB, 'client.styles.js')
  runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  if (registrations.length - before !== 1) {
    throw new Error('client.styles.js must register exactly once')
  }
  const api = registrations[registrations.length - 1].factory()
  if (typeof api.STYLESHEET !== 'string' || api.STYLESHEET.length < 10_000) {
    throw new Error('client.styles.js did not expose the real STYLESHEET')
  }
  // Fail loudly if this ever stops being the real sheet rather than a slice.
  for (const marker of ['.piai-root .piai-checks > label > input', '.piai-root .piai-disclosure-body']) {
    if (!api.STYLESHEET.includes(marker)) {
      throw new Error(`the loaded STYLESHEET is missing ${marker}; refusing to build a lying fixture`)
    }
  }
  return api.STYLESHEET
}

/**
 * The bubble facts the R7 probe compares against, in the `rgb(...)` form
 * `getComputedStyle` reports. They are NOT fixture inventions any more (T40):
 * the two colours are the values the host theme below hands to the shipped
 * `Tooltip.module.css` — `--dsw-static-neutral-bluish-00` is the tooltip's own
 * static light foreground (the surface a nested root must inherit) and
 * `--dsw-alias-tooltip-bg` is its dark background — and `BUBBLE_ALIAS` is a
 * deliberately different dark `--dsw-alias-label-primary`, pinned by R7's
 * `shellStyle` so "inherited the surface" can never be confused with "resolved
 * the theme alias".
 */
const BUBBLE_SURFACE = 'rgb(230, 236, 245)'
const BUBBLE_ALIAS = 'rgb(21, 26, 35)'
const BUBBLE_BG = 'rgb(35, 42, 54)'
/**
 * The width the plugin actually gives its hint bubble
 * (`lib/client.panels.js`: `maxWidth: 360`); it overrides the shipped rule's
 * `max-width: 50vw` exactly as it does in the running GUI.
 */
const BUBBLE_MAX_WIDTH = 360

/** `rgb(r, g, b)` -> `#rrggbb`, so the theme block and the probe cannot drift. */
const rgbHex = (rgb) =>
  '#' +
  String(rgb)
    .match(/\d+/g)
    .map((part) => Number(part).toString(16).padStart(2, '0'))
    .join('')

/**
 * The `--dsw-*` tokens DSH's theme provides at runtime.
 *
 * These are NOT project CSS: the project sheet only ever reads them (the
 * 23-token allowlist, §15.8). Values are a plausible light theme so computed
 * styles resolve to real boxes. The first 19 are exactly the allowlist —
 * `grep -o -- '--dsw-[a-z0-9-]*' lib/client.styles*.js | sort -u` — and the
 * three after them are what the primitive CSS snapshots additionally consume:
 * the Tooltip's own surface pair plus the small radius. `--dsw-radius-sm` is not
 * read by the project sheet at all (`grep -- --dsw-radius-sm lib/*.js` is
 * empty), so defining it cannot move a project-owned box. The snapshots' other
 * token, `--dsw-alias-state-business-primary` (checked Checkbox / focused
 * Input), stays undefined on purpose: it only paints checked/active colours and
 * no criterion reads them.
 */
const HOST_THEME = `:root {
  --dsw-alias-bg-base: #ffffff;
  --dsw-alias-bg-layer-1: #ffffff;
  --dsw-alias-bg-layer-2: #f4f5f7;
  --dsw-alias-bg-module-platform: #f7f8fa;
  --dsw-alias-border-l1: #e5e6eb;
  --dsw-alias-border-l2: #d9dae0;
  --dsw-alias-border-l4: #c9cbd3;
  --dsw-alias-brand-primary: #4d6bfe;
  --dsw-alias-label-primary: #1d2129;
  --dsw-alias-label-primary-foreground: #ffffff;
  --dsw-alias-label-secondary: #4e5969;
  --dsw-alias-label-tertiary: #86909c;
  --dsw-alias-label-dimmed: #a9aeb8;
  --dsw-alias-state-error-primary: #f53f3f;
  --dsw-alias-state-warn-primary: #ff7d00;
  --dsw-focus-ring-width: 2px;
  --dsw-focus-ring-color: #4d6bfe;
  --dsw-radius-md: 10px;
  --dsw-radius-lg: 14px;
  /* Read only by the Tooltip.module.css snapshot (see its header). */
  --dsw-alias-tooltip-bg: ${rgbHex(BUBBLE_BG)};
  --dsw-static-neutral-bluish-00: ${rgbHex(BUBBLE_SURFACE)};
  --dsw-radius-sm: 6px;
}`

/** The fixture shell: a Settings-modal-like column, nothing else. */
const SHELL = `html, body { margin: 0; padding: 0; }
body { background: var(--dsw-alias-bg-base); font-family: -apple-system, "Segoe UI", sans-serif; }
.fixture-shell { width: 600px; margin: 0 auto; }
header.fixture-label { font: 12px/20px monospace; color: #86909c; padding: 12px 24px 0; }`

/** A real 14x14 chevron: the panels' icon fallback has no intrinsic size. */
const chevron = (direction) =>
  direction === 'down'
    ? '<svg class="piai-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg class="piai-chevron" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false"><path d="M5.5 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** `span.wrap > input.input` — the shipped Input primitive's DOM. */
const input = (value, id = '') =>
  `<span class="wrap"><input class="input" type="text"${id === '' ? '' : ` id="${id}"`} value="${value}"></span>`

/** `label.checkbox > input + span` — the shipped Checkbox primitive's DOM. */
const checkbox = (label, checked) =>
  `<label class="checkbox"><input type="checkbox"${checked ? ' checked' : ''}><span>${label}</span></label>`

/**
 * `button.piai-info > svg` — the field help trigger.
 *
 * The real trigger is the shipped `Button` primitive wrapping a 12x12 info
 * icon; the fixture draws that shape directly so the trigger's box is real
 * (the panels' icon fallback has no intrinsic size, exactly like the chevron).
 */
const infoButton = (id, label) =>
  `<button type="button" class="piai-info" id="${id}" aria-label="${label}">` +
  '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">' +
  '<circle cx="6" cy="6" r="5" fill="none" stroke="currentColor"/>' +
  '</svg></button>'

/** `div.piai-select[role=radiogroup] > label > input + span` — the enum DOM. */
const radios = (name, ariaLabel, options) =>
  `<div class="piai-select" role="radiogroup" aria-label="${ariaLabel}">` +
  options
    .map(
      (option) =>
        `<label><input type="radio" name="${name}" value="${option.value}"${option.checked ? ' checked' : ''}><span>${option.label}</span></label>`,
    )
    .join('') +
  '</div>'

const CHECK_OPTIONS = ['文本（text）', '图片（image）']

/** R1 — a checkbox-group row plus a text row and an enum row. */
function r1Page() {
  const body = `
    <div class="piai-body">
      <div class="piai-fields">
        <div class="piai-row" data-probe="text">
          <div class="piai-row-head"><span class="piai-row-label">接口地址（Base URL）</span></div>
          <div class="piai-row-control">${input('https://api.example.com')}</div>
        </div>
        <div class="piai-row" data-probe="checks">
          <div class="piai-row-head"><span class="piai-row-label">输入模态</span></div>
          <div class="piai-row-control">
            <div class="piai-checks" role="group" aria-label="输入模态">
              ${checkbox(CHECK_OPTIONS[0], true)}
              ${checkbox(CHECK_OPTIONS[1], false)}
            </div>
          </div>
        </div>
        <div class="piai-row" data-probe="enum">
          <div class="piai-row-head"><span class="piai-row-label">推理强度</span></div>
          <div class="piai-row-control">
            <div class="piai-select" role="radiogroup" aria-label="推理强度">
              <label><input type="radio" name="reasoning" value="low" checked><span>低</span></label>
              <label><input type="radio" name="reasoning" value="high"><span>高</span></label>
            </div>
          </div>
        </div>
        <div class="piai-row" data-probe="bool">
          <div class="piai-row-head">
            <span class="piai-row-label">支持 Store</span>
            ${infoButton('piai-field-providers-alpha-compat-supportsStore-info', '支持 Store：说明')}
          </div>
          <div class="piai-row-control" aria-describedby="piai-field-providers-alpha-compat-supportsStore-info">
            <div class="piai-bool">
              ${radios('piai-field-providers-alpha-compat-supportsStore', '支持 Store', [
                { value: 'true', label: '开启' },
                { value: 'false', label: '关闭', checked: true },
                { value: '__unset__', label: '默认（未设置）' },
              ])}
            </div>
          </div>
        </div>
        <div class="piai-tier" data-probe="tier">
          <div class="piai-row">
            <div class="piai-row-head">
              <label class="piai-row-label" for="piai-field-providers-alpha-models-0-reasoningEfforts-off">off 档位</label>
              ${infoButton('piai-field-providers-alpha-models-0-reasoningEfforts-off-info', 'off 档位：说明')}
            </div>
            <div class="piai-row-control" aria-describedby="piai-field-providers-alpha-models-0-reasoningEfforts-off-info">
              ${input('', 'piai-field-providers-alpha-models-0-reasoningEfforts-off')}
            </div>
          </div>
        </div>
        <div class="piai-row" data-probe="template">
          <div class="piai-row-head"><span class="piai-row-label">chatTemplateArgs</span></div>
          <div class="piai-row-control">
            <div class="piai-dict">
              <div class="piai-dict-row">
                <code class="piai-dict-key">sys</code>
                ${radios('piai-field-providers-alpha-compat-chatTemplateArgs-mode-sys', 'sys：字面值 / $var 变量', [
                  { value: 'literal', label: '字面值', checked: true },
                  { value: 'var', label: '$var 变量' },
                ])}
                ${infoButton('piai-field-providers-alpha-compat-chatTemplateArgs-mode-sys-info', 'sys：模式说明')}
                ${input('', 'piai-field-providers-alpha-compat-chatTemplateArgs-literal-sys')}
                <button type="button" class="piai-clear" aria-pressed="false" aria-label="sys：null">null</button>
                <button type="button" class="piai-btn" data-part="delete" aria-label="删除 sys">删除</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`
  return page({
    slug: 'r1-checks',
    probe: 'r1',
    title: 'R1 — checkbox row, text row, enum row',
    note: 'R1: the `.piai-row-control input` width rule must exclude checkbox/radio, or the 输入模态 labels collapse to zero width.',
    body,
  })
}

/** R2 — a union selector plus its branch-parameter block. */
function r2Page() {
  const branchLabel = '按档位表设置'
  const body = `
    <div class="piai-body">
      <div class="piai-fields">
        <div class="piai-row" data-probe="union">
          <div class="piai-row-head"><span class="piai-row-label">推理强度</span></div>
          <div class="piai-row-control">
            <div class="piai-union">
              <div class="piai-select" role="radiogroup" aria-label="推理强度">
                <label><input type="radio" name="reasoningEfforts" value="false"><span>false</span></label>
                <label><input type="radio" name="reasoningEfforts" value="tiers" checked><span>${branchLabel}</span></label>
                <label><input type="radio" name="reasoningEfforts" value="__unset__"><span>默认（未设置）</span></label>
              </div>
              <div class="piai-nested" data-probe="nested">
                <div class="piai-nested-title">${branchLabel}的参数</div>
                <div class="piai-fields">
                  <div class="piai-row" data-probe="nested-row">
                    <div class="piai-row-head"><span class="piai-row-label">低档</span></div>
                    <div class="piai-row-control">${input('low')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`
  return page({
    slug: 'r2-nested',
    probe: 'r2',
    title: 'R2 — union selector + branch-parameter block',
    note: 'R2: the branch block must carry no border-left rail and no padding-left; only the title line separates it.',
    body,
  })
}

/** R3 — the six frozen compat sections, one expanded, five collapsed. */
function r3Page() {
  const sections = [
    '通用能力',
    'Token 与字段名',
    '推理 / Thinking',
    '工具调用',
    '缓存',
    '模板与路由',
  ]
  const rows = sections
    .map((title, index) => {
      const expanded = index === 0
      const bodyId = `compat-section-${index}-body`
      const inner = expanded
        ? `<div class="piai-fields">
            <div class="piai-row" data-probe="first-row">
              <div class="piai-row-head"><span class="piai-row-label">支持 Store</span></div>
              <div class="piai-row-control">${input('')}</div>
            </div>
          </div>`
        : ''
      return `      <div>
        <div class="piai-item-head">
          <button type="button" role="button" aria-expanded="${expanded}" aria-controls="${bodyId}">
            ${chevron(expanded ? 'down' : 'right')}
            <span class="section-title">${title}</span>
          </button>
        </div>
        <div class="piai-disclosure-body" id="${bodyId}"${expanded ? '' : ' hidden'}>${inner}</div>
      </div>`
    })
    .join('\n')
  const body = `
    <div class="piai-body">
      <div class="piai-disclosure">
${rows}
      </div>
    </div>`
  return page({
    slug: 'r3-disclosure',
    probe: 'r3',
    title: 'R3 — compat disclosures (one expanded)',
    note: 'R3: no count badge, six permanent bodies, 14x14 chevrons, body content aligned with the title span.',
    body,
  })
}

/** R6 / T7 — the tab strip as a two-slot bar: tablist left, actions right. */
function r4Page() {
  const tabs = ['Deepseek 月卡', 'gpt-x']
    .map(
      (label, index) =>
        `<button type="button" role="tab" class="tab" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${label}</button>`,
    )
    .join('')
  const body = `
    <div class="piai-body">
      <div class="piai-tabs" data-probe="tabs">
        <div class="piai-tabs-bar">
          <div class="piai-provider-list" role="tablist" aria-label="提供商">${tabs}</div>
          <div class="piai-item-actions">
            <button type="button" class="piai-btn" aria-pressed="false">原代码</button>
          </div>
        </div>
      </div>
    </div>`
  return page({
    slug: 'r4-tabs',
    probe: 'r4',
    title: 'R6 — tab strip two-slot bar',
    note: 'R6: the tablist and the right-hand action slot share one bar line (baseline-aligned); the action must not wrap under the tablist.',
    body,
  })
}

/**
 * R7 / T7 — the read-only raw view.
 *
 * The real face mounts the primitives `CodeBlock` (whose DOM is not snapshotted
 * here) and degrades to `<pre class="piai-expr-body">` when that serializer is
 * absent. The fixture draws the FALLBACK shape, so this page checks the
 * read-only chrome — the unsaved-draft notice plus a scrollable code body
 * contained by the page column — not the primitive's own layout. Recorded as a
 * partial check in the README.
 */
function r5Page() {
  const yaml = [
    'providers:',
    '  alpha:',
    '    api: anthropic-messages',
    '    baseURL: https://api.example.com',
    '    compat:',
    '      chatTemplateArgs:',
    '        sys:',
    '          $var: thinking.enabled',
    '          omitWhenOff: true',
  ].join('\n')
  const body = `
    <div class="piai-body">
      <div class="piai-hint" data-probe="raw-notice">只读预览：以下是当前草稿的完整 llm-pi-ai 配置，含未保存的修改。</div>
      <pre class="piai-expr-body" data-probe="raw-code">${yaml}</pre>
    </div>`
  return page({
    slug: 'r5-raw',
    probe: 'r5',
    title: 'R7 — read-only raw view (fallback code body)',
    note: 'R7: the dirty-draft notice is visible and the code body stays inside the page column (overflow scrolls inside, never sideways).',
    body,
  })
}

/**
 * R6 / T16 — the model picker inside a PORTAL.
 *
 * The shipped `Modal` renders through `createPortal(…, document.body)`, so its
 * content sits outside every `.piai-root` ancestor and all scoped rules stop
 * matching: in the real GUI the candidate rows lost their flex layout and the
 * raw id glued itself to the display name (`deepseek-flashdeepseek-flash…`).
 * T16's fix wraps the Modal CONTENT in its own `.piai-root`, which re-enters
 * the scope for that subtree.
 *
 * This page reproduces that shape exactly:
 *
 *   .fixture-shell[data-probe=catalog]   <- NOT a .piai-root (portal host)
 *     .dialog
 *       .piai-root                       <- the nested wrapper T16 added
 *         .piai-item-actions  (search + 全选)
 *         .piai-catalog > label > input + code.piai-dict-key + span
 *
 * The negative control is simply unwrapping that inner `.piai-root`: the same
 * page then measures as unstyled, which is what the probe's `portalCatalog*`
 * checks must catch.
 */
function r6Page() {
  // 74 characters: long enough that, without the scoped flex rules, the raw id
  // overflows the row.
  const LONG_ID = ('deepseek-v4-flash-preview-' + '0123456789abcdef'.repeat(4)).slice(0, 74)
  // T25: a candidate row is `label > input + code.piai-dict-key` — the raw id is
  // the ONLY visible text and the display name lives in `title` (falling back to
  // the id). The mix below covers a distinct name, a name equal to the id, and
  // a candidate whose listing carries no name at all.
  const rows = [
    { id: LONG_ID, name: 'Deepseek V4 Flash Preview', picked: true },
    { id: 'deepseek-v4-pro', name: 'deepseek-v4-pro', picked: false },
    { id: LONG_ID.slice(0, 60), name: '', picked: false },
    { id: 'gpt-x', name: 'GPT X', picked: false },
  ]
    .map((entry) => {
      const title = entry.name !== '' ? entry.name : entry.id
      return (
        `<label><input type="checkbox"${entry.picked ? ' checked' : ''}>` +
        `<code class="piai-dict-key" title="${title}">${entry.id}</code></label>`
      )
    })
    .join('\n        ')
  const body = `  <div class="dialog" role="dialog" aria-label="选择要添加的模型">
    <div class="piai-root">
      <div class="dialog-title">选择要添加的模型</div>
      <div class="piai-item-actions">
        <span class="wrap"><input class="input" type="search" aria-label="搜索模型" placeholder="搜索模型"></span>
        <button type="button" class="piai-btn">全选</button>
      </div>
      <div class="piai-catalog">
        ${rows}
      </div>
      <div class="dialog-footer">
        <button type="button" class="piai-btn">取消</button>
        <button type="button" class="piai-btn">添加所选</button>
      </div>
    </div>
  </div>`
  return page({
    slug: 'r6-catalog',
    probe: 'catalog',
    title: 'R6 — portal catalog list',
    note: 'R6: the picker content sits inside a nested .piai-root (portal re-entry); each row is a checkbox plus the raw id (the name lives in title), must stay one line and never overflow horizontally.',
    body,
    bare: true,
  })
}

/**
 * R7 / T20 — the Tooltip bubble inside a PORTAL (T31 colour half, T36 contrast,
 * T40 inset half).
 *
 * The shipped `Tooltip` also renders through `createPortal(…, document.body)`,
 * so the bubble's key chip, hint and explanation lines sit outside every
 * `.piai-root` ancestor. T20 re-entered the scope inside the bubble itself:
 * `label = [ span.piai-root > (code.piai-key?, span(hint), span(line)*) ]`,
 * with the nested root a flex COLUMN (one part per row, spacing from `gap`) and
 * the chip `align-self: flex-start` so its own background/border/radius/padding
 * stay visible instead of stretching across the bubble.
 *
 * T31 added the colour half: a nested root inherits the colour of the surface it
 * is portalled into (`color: inherit`) instead of pointing at a theme alias. The
 * fixture reproduces the real situation — the primitives' `.bubble` paints its
 * own STATIC light foreground, while the page's `--dsw-alias-label-primary` is a
 * clearly different dark value — so "inherited the surface" and "used the theme
 * alias" are distinguishable at all.
 *
 * T40 added the inset half. `.bubble` is the REAL primitive surface now (its
 * `Tooltip.module.css` is snapshotted, see `primitives/`), so the page shows the
 * actual `padding: 3px 7px` asymmetry T39 compensates for on our wrapper:
 * `3 + space-3 = 7 + space-2 = 15px` of visual inset on every side. The DOM
 * nesting is the primitive's own render — `span.bubble > span.label >
 * span.piai-root` — with `span.label` the primitive's label box (`min-width: 0`,
 * no padding of its own), so the inset is measured through the real chain.
 *
 * The page carries both branches so the criteria can be shown to discriminate:
 * the scoped wrapper, and the same parts WITHOUT one (the pre-T20 shape). It also
 * carries a Modal-shaped portal wrapper (`div.piai-root` whose direct children
 * are `div.piai-item-actions` + `div.piai-catalog`, i.e. the picker, NOT a
 * bubble), because T39's `:has()` gate must leave that one unpadded.
 */
function r7Page() {
  // The real key length the tier rows produce.
  const KEY = 'models[].reasoningEfforts.off'
  const HINT = '关闭思考时发送的取值；留空＝不声明该档位（等于该模型关不掉思考）。'
  const LINE_OFF = '「off 档位」：关闭思考时发送的取值；留空＝不声明该档位。'
  const LINE_LOW = '「low 档位」：low 档位分派时发送的接口取值；留空＝不声明该档位。'
  const parts =
    `<code class="piai-key">${KEY}</code>` +
    `<span>${HINT}</span><span>${LINE_OFF}</span><span>${LINE_LOW}</span>`
  // T40: the shipped Tooltip sets `left`/`top` inline from its own measurement
  // (`lib/index.js`, the ResizeObserver `fit()`); the fixture does the same so
  // the real `position: fixed` rule stays untouched. `max-width: 360px` is the
  // plugin's own prop (`lib/client.panels.js`, `maxWidth: 360`), which overrides
  // the rule's `50vw`; the `data-side` transform is deliberately NOT set — it
  // would translate the fixed bubble off this small viewport, and every inset
  // criterion is internal to the bubble, so a translation could only blur the
  // reading.
  const bubbleStyle = (top) =>
    `left: 24px; top: ${top}px; max-width: ${BUBBLE_MAX_WIDTH}px`
  // The Modal stand-in: same shape as r6's picker (`div.piai-root` directly
  // inside the dialog, children = item-actions + catalog). Its 16px padding
  // stands in for the primitives' Modal.module.css own dialog padding, which is
  // NOT snapshotted; the criterion is that the nested root adds NOTHING on top
  // of it. `margin-top` keeps the (fixed) bubbles from overlaying it in
  // screenshots; no criterion reads it.
  const body = `  <div class="dialog" role="dialog" data-role="dialog" aria-label="选择要添加的模型" style="padding: 16px; margin-top: 480px">
    <div class="piai-root" data-role="modal">
      <div class="piai-item-actions">
        <span class="wrap"><input class="input" type="search" aria-label="搜索模型" placeholder="搜索模型"></span>
        <button type="button" class="piai-btn">全选</button>
      </div>
      <div class="piai-catalog">
        <label><input type="checkbox" checked><code class="piai-dict-key" title="Deepseek V4 Flash">deepseek-v4-flash</code></label>
        <label><input type="checkbox"><code class="piai-dict-key" title="deepseek-v4-pro">deepseek-v4-pro</code></label>
      </div>
      <div class="dialog-footer">
        <button type="button" class="piai-btn">取消</button>
        <button type="button" class="piai-btn">添加所选</button>
      </div>
    </div>
  </div>
  <div class="bubble" data-role="positive" style="${bubbleStyle(90)}">
    <span class="label"><span class="piai-root">${parts}</span></span>
  </div>
  <div class="bubble" data-role="negative" style="${bubbleStyle(330)}">
    <span class="label">${parts}</span>
  </div>`
  return page({
    slug: 'r7-bubble',
    probe: 'bubble',
    title: 'R7 — portal tooltip bubble',
    note: 'R7: the real Tooltip surface (3px 7px padding) carries a flex-column wrapper whose T39 compensation makes the visual inset 15px on all four sides; the chip keeps its own box, the text inherits the surface colour, and the Modal-shaped wrapper above stays unpadded (:has() gate). The unwrapped branch below must fail the geometry criteria.',
    body,
    bare: true,
    // Make the page's theme alias unmistakably dark, so inheriting the light
    // `.bubble` surface cannot be confused with resolving the alias.
    shellStyle: `--dsw-alias-label-primary: ${BUBBLE_ALIAS}`,
  })
}

/**
 * Wrap one probe page in the shared shell.
 *
 * `bare: true` omits the page-level `.piai-root piai-page` wrapper. It exists
 * for the portal probe (R6): the whole point there is that the content has NO
 * `.piai-root` ancestor until its own nested wrapper, exactly like
 * `createPortal(…, document.body)`. A page-level root would make the nested
 * wrapper match `.piai-root .piai-root` (the in-page stand-in) instead of the
 * real portal case, which `.piai-root:not(.piai-page)` covers.
 *
 * @param options - `{slug, probe, title, note, body, bare, shellStyle}`.
 *   `shellStyle` is extra CSS declared inline on the fixture shell (used by R7
 *   to pin the page's `--dsw-alias-label-primary` to a value clearly different
 *   from the bubble surface).
 * @returns the probe page's HTML.
 */
function page({ slug, probe, title, note, body, bare = false, shellStyle = '' }) {
  const styles = [
    HOST_THEME,
    readCss(PRIMITIVE_CSS.Checkbox),
    readCss(PRIMITIVE_CSS.Input),
    readCss(PRIMITIVE_CSS.Tooltip),
    STYLESHEET,
    SHELL,
  ]
  const inner = bare
    ? `  <div class="piai-header">
    <div class="piai-title">模型扩展配置</div>
    <div class="piai-subtitle">${title}</div>
  </div>
${body}`
    : `  <div class="piai-root piai-page" data-piai="1" data-probe="${probe}">
    <div class="piai-header">
      <div class="piai-title">模型扩展配置</div>
      <div class="piai-subtitle">${title}</div>
    </div>
${body}
  </div>`
  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=600">
<title>piai-layout ${slug}</title>
<style>
${styles.join('\n\n')}
</style>
</head>
<body>
<header class="fixture-label">piai-layout / ${slug} — ${note}</header>
<div class="fixture-shell"${bare ? ` data-probe="${probe}"` : ''}${shellStyle === '' ? '' : ` style="${shellStyle}"`}>
${inner}
</div>
</body>
</html>
`
}

function readCss(file) {
  return readFileSync(file, 'utf8')
}

const STYLESHEET = loadStylesheet()

function main() {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const pages = { r1: r1Page(), r2: r2Page(), r3: r3Page(), r4: r4Page(), r5: r5Page(), r6: r6Page(), r7: r7Page() }
  const files = {
    'r1-checks.html': pages.r1,
    'r2-nested.html': pages.r2,
    'r3-disclosure.html': pages.r3,
    'r4-tabs.html': pages.r4,
    'r5-raw.html': pages.r5,
    'r6-catalog.html': pages.r6,
    'r7-bubble.html': pages.r7,
  }
  for (const [name, html] of Object.entries(files)) writeFileSync(join(OUT, name), html)

  const index = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8"><title>piai-layout fixtures</title></head>
<body>
<h1>piai-layout fixtures</h1>
<ul>
${Object.keys(files)
  .map((name) => `  <li><a href="./${name}">${name}</a></li>`)
  .join('\n')}
</ul>
</body></html>
`
  writeFileSync(join(OUT, 'index.html'), index)

  const manifest = {
    generated_by: 'tests/layout/build-fixture.mjs',
    stylesheet_sha256: createHash('sha256').update(STYLESHEET).digest('hex'),
    stylesheet_bytes: Buffer.byteLength(STYLESHEET, 'utf8'),
    primitives: Object.fromEntries(
      Object.entries(PRIMITIVE_CSS).map(([name, file]) => {
        const css = readCss(file)
        return [name, { snapshot: file, source: PRIMITIVE_SOURCE[name], md5: md5(css) }]
      }),
    ),
    pages: Object.keys(files),
    criteria: {
      r1: [
        'two input[type=checkbox] are 16x16',
        'two .piai-checks > label > span have width > 40px and non-empty text',
        'adjacent .piai-checks labels are exactly 16px apart (column-gap --piai-space-4)',
        'a normal text input (.wrap) fills its .piai-row-control content box +/-1px',
        '.piai-select input stays 16x16',
        'the three boolean radios (开启 / 关闭 / 默认（未设置）) stay 16x16 with visible labels',
        'the tier (.piai-tier[data-probe="tier"] > .piai-row) input fills its control box +/-1px and its .piai-info trigger is visible',
        'templateRowReadable: all four parts (key / mode / value / delete) render visible, unclipped, inside the card',
        'templatePartOrder: the parts appear in DOM order 键名 -> 模式 -> 值 -> 删除',
      ],
      r2: [
        '.piai-nested computed borderLeftWidth === "0px"',
        '.piai-nested computed paddingLeft === "0px"',
        '.piai-nested-title contains the branch name and "的参数"',
      ],
      r3: [
        'document.querySelectorAll(".piai-count").length === 0',
        'six .piai-disclosure-body[hidden] are present and collapsed ones have no box',
        'the expanded body content left edge equals the title span left edge +/-1px',
        'a collapsed chevron is visible and 14x14',
        'six aria-controls are distinct and all resolve through getElementById',
      ],
      r4: [
        'barIsOneRow: the tablist and the action slot vertically overlap and their bottom edges coincide (baseline-aligned; tops may differ)',
        'actionsRightOfList: the action slot starts at or right of the tablist right edge',
        'actionsFlushRight: the action slot is pinned to the bar right edge',
        'actionVisible: the action button is visible (width > 0 and height > 0)',
        'actionSlotDoesNotWrap: the action does not wrap inside its slot',
      ],
      r5: [
        'rawNoticeVisible: the unsaved-draft notice renders with text',
        'rawCodeVisible: the code body renders with text',
        'rawCodeContained: the code body stays inside .piai-body (it may scroll internally)',
      ],
      r6: [
        'portalCatalogScoped: the picker content carries its own nested .piai-root (portal re-entry)',
        'portalCatalogSearch: the search Input renders inside that scope',
        'portalCatalogRows: four candidate rows render',
        'portalCatalogRowsSingleLine: the checkbox and the id chip overlap vertically and share the row baseline',
        'portalCatalogNoOverflow: every row keeps scrollWidth <= clientWidth + 1',
        'portalCatalogInput16: every candidate checkbox is 16x16',
        'portalCatalogCheckboxIdGap8: the checkbox -> id gap is at least 8px (the scoped flex gap)',
        'portalCatalogIdSingleLine: each row has NO extra span, its only visible text is the raw id, and the chip does not overflow itself',
        'portalCatalogStacked: rows stack with strictly increasing tops and no vertical overlap',
      ],
      r7: [
        'bubbleWrapperScoped: the bubble wrapper is the scoped flex column (display:flex, column, gap 4px)',
        'bubbleKeyChipStyled: the chip keeps a background, radius, left padding, align-self:flex-start and a width below the wrapper',
        'bubbleTextInheritsSurface: the wrapper and its explanation spans inherit the bubble surface colour, not the theme alias',
        'bubbleBodyContrast: the bubble body text clears WCAG AA (>= 4.5:1) against the bubble surface',
        'bubbleChipContrast: the chip text clears WCAG AA (>= 4.5:1) against the chip own background',
        'bubbleInsetUniform: the wrapper content box sits the same distance from the .bubble border box on all four sides (spread <= 1px) and every side is >= 12px',
        'bubbleInsetGrew: every side is strictly larger than the primitives-only inset (3px top/bottom, 7px left/right)',
        'bubbleLinesStacked: chip / hint / two explanation lines have strictly increasing tops and never overlap',
        'bubbleLineGapAtLeast1: every adjacent pair leaves at least 1px of vertical gap',
        'modalWrapperUnaffected: the Modal-shaped .piai-root has 0 padding on all four sides and adds nothing to the dialog 16px inset',
        'modalGateDoesNotMatch: neither T39 :has() branch matches the Modal wrapper (matches() === false)',
        'bubbleNegativeIsUnstyled: the unwrapped branch fails the same style criteria (the probe discriminates)',
      ],
    },
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  process.stdout.write(`piai-layout -> ${OUT}\n`)
  for (const [name, html] of Object.entries(files)) {
    process.stdout.write(`  ${name}  ${Buffer.byteLength(html, 'utf8')} bytes\n`)
  }
  process.stdout.write(`  stylesheet ${manifest.stylesheet_bytes} bytes, sha256 ${manifest.stylesheet_sha256}\n`)
  process.stdout.write(`  primitives ${Object.values(manifest.primitives).map((p) => `${p.md5}`).join(' ')}\n`)
}

main()

export { HOST_THEME, loadStylesheet }
