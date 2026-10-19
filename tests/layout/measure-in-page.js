/*
 * In-page measurement for the static fixtures built by
 * tests/layout/build-fixture.mjs.
 *
 * It is a single self-contained expression: pass this file's text to
 * `page.evaluate()` through ego-browser, e.g.
 *
 *   const code = await fs.readFile("tests/layout/measure-in-page.js", "utf8");
 *   const page = task.page("p1");
 *   await page.goto("file:///tmp/piai-layout/r1-checks.html");
 *   console.log(await page.evaluate(code));
 *
 * It returns `{probe, viewport, measurements, checks, pass}` with raw pixel
 * values, so a reviewer can recompute every verdict instead of trusting a
 * boolean. No project code runs here: the page is static HTML + the real
 * STYLESHEET + primitive CSS snapshots.
 */
;(() => {
  const W = Math.round(window.innerWidth)
  const H = Math.round(window.innerHeight)
  const round = (value) => Math.round(value * 100) / 100
  const rect = (element) => {
    if (element === null || element === undefined) return null
    const box = element.getBoundingClientRect()
    return {
      x: round(box.x),
      y: round(box.y),
      width: round(box.width),
      height: round(box.height),
      left: round(box.left),
      right: round(box.right),
      top: round(box.top),
      bottom: round(box.bottom),
    }
  }
  const visible = (element) => {
    const box = rect(element)
    return box !== null && box.width > 0 && box.height > 0
  }
  const all = (selector, root = document) => [...root.querySelectorAll(selector)]
  const probe = document.querySelector('[data-probe]')?.dataset.probe ?? 'unknown'
  const measurements = {}
  const checks = {}
  // F1: a probe element that the fixture no longer renders must not turn the
  // whole page unmeasurable. Every required node goes through `need()`/`q()`,
  // which record the miss in `measurements.missing` and return null instead of
  // throwing; the dependent checks then read as `false` with an explanation.
  const missing = []
  const need = (element, label) => {
    if (element === null || element === undefined) missing.push(label)
    return element === undefined ? null : element
  }
  const q = (root, selector, label) =>
    need(root === null || root === undefined ? null : root.querySelector(selector), label)
  /** The probe root. `data-probe` lives on different elements per page. */
  const probeEl = (name) => document.querySelector(`[data-probe="${name}"]`)
  /** Document order of a node inside `root`, or null when absent. */
  const orderOf = (root, node) =>
    root === null || node === null ? null : [...root.querySelectorAll('*')].indexOf(node)
  const overlapOf = (a, b) =>
    a === null || b === null ? 0 : round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))

  // --- T40: the padding half, shared by the bubble and catalog probes ----------
  // The primitives' own `.bubble` padding, straight out of the snapshot header
  // (`primitives/Tooltip.module.css`: `padding: 3px 7px`). `bubbleInsetGrew`
  // means "roomier than the primitive alone on EVERY side", which is the
  // strongest form of "the complaint (3/7) is gone".
  const PRIMITIVE_INSET = { top: 3, right: 7, bottom: 3, left: 7 }
  /** T39's four selectors, verbatim from lib/client.styles.chrome.js (v10 split). */
  const GATE_SELECTORS = [
    '.piai-root .piai-root:has(> .piai-key)',
    '.piai-root:not(.piai-page):has(> .piai-key)',
    '.piai-root .piai-root:has(> span)',
    '.piai-root:not(.piai-page):has(> span)',
  ]
  const px = (value) => {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  /** The CONTENT box of `element`, from its border box plus border + padding. */
  const contentBox = (element) => {
    if (element === null) return null
    const box = rect(element)
    const style = getComputedStyle(element)
    return {
      left: round(box.left + px(style.borderLeftWidth) + px(style.paddingLeft)),
      right: round(box.right - px(style.borderRightWidth) - px(style.paddingRight)),
      top: round(box.top + px(style.borderTopWidth) + px(style.paddingTop)),
      bottom: round(box.bottom - px(style.borderBottomWidth) - px(style.paddingBottom)),
    }
  }
  /** Inset of `inner` (a content box) from `outer` (a border box), four sides. */
  const borderBoxInset = (outer, inner) =>
    outer === null || inner === null
      ? null
      : {
          top: round(inner.top - outer.top),
          right: round(outer.right - inner.right),
          bottom: round(outer.bottom - inner.bottom),
          left: round(inner.left - outer.left),
        }
  const sides = (inset) => (inset === null ? null : [inset.top, inset.right, inset.bottom, inset.left])
  const paddingOf = (element) => {
    if (element === null) return null
    const style = getComputedStyle(element)
    return {
      top: style.paddingTop,
      right: style.paddingRight,
      bottom: style.paddingBottom,
      left: style.paddingLeft,
    }
  }
  const matchesOf = (element, selectors) =>
    element === null ? null : selectors.map((selector) => element.matches(selector))

  if (probe === 'r1') {
    const row = (name) => need(probeEl(name), `[data-probe="${name}"]`)
    const checkboxInputs = all('.piai-checks input[type=checkbox]')
    const optionLabels = all('.piai-checks > label')
    const optionSpans = all('.piai-checks > label > span')
    const textControl = q(row('text'), '.piai-row-control', 'text .piai-row-control')
    const textWrap = q(textControl, '.wrap', 'text .wrap')
    const selectInputs = all('.piai-select input')
    const labelRects = optionLabels.map(rect)

    measurements.checkboxInputs = checkboxInputs.map(rect)
    measurements.optionSpans = optionSpans.map((span) => ({
      text: span.textContent,
      ...rect(span),
    }))
    measurements.adjacentLabelGap =
      labelRects.length === 2 ? round(labelRects[1].left - labelRects[0].right) : null
    measurements.textInput = {
      controlContentWidth: textControl === null ? null : textControl.clientWidth,
      wrap: rect(textWrap),
      delta:
        textControl === null || textWrap === null
          ? null
          : round(rect(textWrap).width - textControl.clientWidth),
    }
    measurements.selectInputs = selectInputs.map(rect)

    checks.checkbox16 =
      checkboxInputs.length === 2 &&
      measurements.checkboxInputs.every((box) => box.width === 16 && box.height === 16)
    checks.optionSpansVisible =
      optionSpans.length === 2 &&
      measurements.optionSpans.every((span) => span.width > 40 && span.text.trim() !== '')
    checks.adjacentLabelGap16 =
      measurements.adjacentLabelGap !== null && Math.abs(measurements.adjacentLabelGap - 16) <= 0.5
    checks.textInputFillsRow =
      measurements.textInput.delta !== null && Math.abs(measurements.textInput.delta) <= 1
    checks.selectInput16 = selectInputs.length > 0 && measurements.selectInputs.every((box) => box.width === 16 && box.height === 16)

    // T7 contract B/C/E: the three-way boolean, the ordinary Row tier and the
    // template dict row must survive the same `.piai-row-control input` rule.
    const boolGroup = q(row('bool'), '.piai-bool [role=radiogroup]', 'bool radiogroup')
    const boolInputs = all('.piai-bool input[type=radio]')
    const boolSpans = all('.piai-bool .piai-select > label > span')
    // F1: the probe root of the tier fixture is `.piai-tier[data-probe="tier"]`
    // — `piai-tier` is a delivered class, so the SELECTOR follows the real
    // structure instead of the fixture gaining a `piai-row` class for the test.
    const tier = row('tier')
    const tierRow = q(tier, '.piai-row', '.piai-tier[data-probe="tier"] > .piai-row')
    const tierControl = q(tierRow, '.piai-row-control', 'tier .piai-row-control')
    const tierWrap = q(tierControl, '.wrap', 'tier .wrap')
    const tierInfo = q(tierRow, '.piai-info', 'tier .piai-info')
    const templateRow = row('template')
    const templateDictRow = q(templateRow, '.piai-dict-row', 'template .piai-dict-row')

    measurements.bool = {
      group: rect(boolGroup),
      inputs: boolInputs.map(rect),
      spans: boolSpans.map((span) => ({ text: span.textContent, ...rect(span) })),
    }
    measurements.tier = {
      probe: rect(tier),
      row: rect(tierRow),
      controlContentWidth: tierControl === null ? null : tierControl.clientWidth,
      wrap: rect(tierWrap),
      delta:
        tierControl === null || tierWrap === null
          ? null
          : round(rect(tierWrap).width - tierControl.clientWidth),
      info: rect(tierInfo),
    }

    checks.boolRadios16 =
      boolInputs.length === 3 &&
      measurements.bool.inputs.every((box) => box.width === 16 && box.height === 16)
    checks.boolLabelsVisible =
      boolSpans.length === 3 &&
      measurements.bool.spans.every((span) => span.width > 20 && span.text.trim() !== '')
    checks.tierInputFillsRow = measurements.tier.delta !== null && Math.abs(measurements.tier.delta) <= 1
    checks.tierInfoVisible = visible(tierInfo) && rect(tierInfo).width >= 12

    // F2: `.piai-dict-row` is a bordered CARD (`flex-direction: column`,
    // styles.interaction-design §14.2 / `.piai-dict-row` in the sheet), so its
    // parts stack — the old `templateRowOnOneLine` criterion contradicted the
    // design. The measurable criterion is READABILITY instead: all four parts
    // render, stay inside the card (nothing clipped), and appear in the order
    // 键名 → 模式 → 值 → 删除. The stacked tops are recorded, not asserted.
    const keyChip = q(templateDictRow, 'code.piai-dict-key', 'template key chip')
    const modeGroup = q(templateDictRow, '[role=radiogroup]', 'template mode radiogroup')
    const modeOptions = modeGroup === null ? [] : all('label', modeGroup)
    const valueInput = q(templateDictRow, '.wrap input', 'template value input')
    const nullButton = q(templateDictRow, '.piai-clear', 'template null button')
    const deleteButton = q(templateDictRow, '[data-part="delete"]', 'template delete button')
    const parts = [
      { name: 'key', element: keyChip },
      { name: 'mode', element: modeGroup },
      { name: 'value', element: valueInput },
      { name: 'delete', element: deleteButton },
    ]
    const partRects = parts.map((part) => ({ name: part.name, rect: rect(part.element) }))
    const partTops = partRects.map((part) => (part.rect === null ? null : part.rect.top))
    const distinctRows = [...new Set(partTops.filter((top) => top !== null))].length
    const order = parts.map((part) => orderOf(templateDictRow, part.element))
    const ordered =
      order.every((index) => index !== null) &&
      order.every((index, position) => position === 0 || index > order[position - 1])
    const cardBox = rect(templateDictRow)
    const insideCard = (box) =>
      box !== null &&
      cardBox !== null &&
      box.left >= cardBox.left - 1 &&
      box.right <= cardBox.right + 1
    const modeLabelsReadable =
      modeOptions.length === 2 &&
      modeOptions.every((option) => {
        const span = option.querySelector('span')
        return span !== null && span.textContent.trim() !== '' && rect(span).width > 20
      })

    measurements.template = {
      row: cardBox,
      parts: partRects,
      partTops,
      distinctRows,
      order,
      modeLabels: modeOptions.map((option) => option.textContent.trim()),
      modeInputs: modeOptions.map((option) => rect(option.querySelector('input'))),
      info: rect(q(templateDictRow, '.piai-info', 'template info trigger')),
      nullButton: rect(nullButton),
      valueInput: rect(valueInput),
    }

    checks.templateRowReadable =
      keyChip !== null &&
      modeGroup !== null &&
      valueInput !== null &&
      deleteButton !== null &&
      nullButton !== null &&
      visible(keyChip) &&
      visible(modeGroup) &&
      visible(valueInput) &&
      visible(deleteButton) &&
      visible(nullButton) &&
      modeLabelsReadable &&
      rect(valueInput).width > 40 &&
      rect(valueInput).height >= 16 &&
      partRects.every((part) => insideCard(part.rect))
    checks.templatePartOrder = ordered
  }

  if (probe === 'r4') {
    const barEl = need(probeEl('tabs'), '[data-probe="tabs"]')
    const bar = q(barEl, '.piai-tabs-bar', 'r4 .piai-tabs-bar')
    const list = q(bar, '.piai-provider-list', 'r4 .piai-provider-list')
    const actions = q(bar, '.piai-item-actions', 'r4 .piai-item-actions')
    const action = q(actions, 'button.piai-btn', 'r4 button.piai-btn')

    const barBox = rect(bar)
    const listBox = rect(list)
    const actionsBox = rect(actions)
    const actionBox = rect(action)
    const overlap = overlapOf(listBox, actionsBox)

    measurements.bar = {
      bar: barBox,
      list: listBox,
      actions: actionsBox,
      action: actionBox,
      overlap,
      bottomDelta:
        listBox === null || actionsBox === null ? null : round(listBox.bottom - actionsBox.bottom),
      actionRightGap: barBox === null || actionBox === null ? null : round(barBox.right - actionBox.right),
    }

    // F3: `.piai-tabs-bar` aligns its two slots on the BASELINE
    // (`align-items: flex-end`, sheet `.piai-root .piai-tabs-bar`), so the tops
    // legitimately differ (the tablist is the taller slot). "Same row" therefore
    // means: the slots vertically overlap, their bottom edges coincide, the
    // action slot stays pinned to the bar's right edge, and the action does not
    // wrap inside its slot.
    checks.barIsOneRow =
      listBox !== null &&
      actionsBox !== null &&
      overlap > 0 &&
      Math.abs(listBox.bottom - actionsBox.bottom) <= 1
    checks.actionsRightOfList = listBox !== null && actionsBox !== null && actionsBox.left >= listBox.right - 1
    checks.actionsFlushRight =
      barBox !== null && actionsBox !== null && Math.abs(barBox.right - actionsBox.right) <= 1
    checks.actionVisible = visible(action) && actionBox.width > 0 && actionBox.height > 0
    checks.actionSlotDoesNotWrap =
      actionsBox !== null && actionBox !== null && actionsBox.height <= actionBox.height + 2
  }

  if (probe === 'r5') {
    // The read-only raw view. The real face mounts the primitives `CodeBlock`
    // (not snapshotted here) and falls back to `<pre class="piai-expr-body">`;
    // the fixture renders the FALLBACK shape, so this page is a partial check of
    // the read-only chrome (notice + scrollable code body), not of CodeBlock.
    const body = need(q(document, '.piai-body', 'r5 .piai-body'), 'r5 .piai-body')
    const notice = need(q(body, '.piai-hint[data-probe="raw-notice"]', 'raw notice'), 'raw notice')
    const code = need(q(body, 'pre.piai-expr-body[data-probe="raw-code"]', 'raw code block'), 'raw code block')
    const codeBox = rect(code)

    measurements.raw = {
      body: rect(body),
      notice: notice === null ? null : { text: notice.textContent.trim(), ...rect(notice) },
      code: codeBox,
      codeScroll: code === null ? null : { scrollWidth: code.scrollWidth, clientWidth: code.clientWidth },
    }

    checks.rawNoticeVisible = visible(notice) && notice.textContent.trim() !== ''
    checks.rawCodeVisible = visible(code) && code.textContent.trim() !== ''
    checks.rawCodeContained =
      codeBox !== null && rect(body) !== null && codeBox.right <= rect(body).right + 1
  }

  if (probe === 'catalog') {
    // T16/T17: the picker lives inside a PORTAL. Its content has no
    // `.piai-root` ancestor until its own nested wrapper, so the checks below
    // are exactly the properties the missing scope used to destroy: rows that
    // stay one line, the checkbox -> id gap, and no horizontal overflow.
    // T25: a row is `label > input + code.piai-dict-key` — the raw id is the
    // ONLY visible text (the display name moved into the chip's `title`), so
    // there is no name span left to measure.
    // Unwrapping the nested `.piai-root` (the negative control) must turn every
    // one of them false.
    const host = need(probeEl('catalog'), '[data-probe="catalog"] (the portal host)')
    const scope = q(host, '.piai-root', 'nested .piai-root wrapper (T16 scope re-entry)')
    const toolbar = q(scope, '.piai-item-actions', 'portal toolbar')
    const search = q(toolbar, 'input[type=search]', 'portal search input')
    const list = q(scope, '.piai-catalog', 'portal .piai-catalog list')
    const rows = list === null ? [] : all(':scope > label', list)

    const rowInfo = rows.map((row) => {
      const input = row.querySelector('input[type=checkbox]')
      const code = row.querySelector('code.piai-dict-key')
      const extraSpans = all(':scope > span', row)
      const rowBox = rect(row)
      const inputBox = rect(input)
      const codeBox = rect(code)
      const bottoms = [inputBox, codeBox]
        .filter((box) => box !== null)
        .map((box) => box.bottom)
      return {
        text: row.textContent.trim().slice(0, 32),
        visibleText: row.textContent.trim(),
        id: code === null ? null : code.textContent,
        title: code === null ? null : code.getAttribute('title'),
        spanCount: extraSpans.length,
        row: rowBox,
        input: inputBox,
        code: codeBox,
        codeScrollWidth: code === null ? null : code.scrollWidth,
        codeClientWidth: code === null ? null : code.clientWidth,
        scrollWidth: row.scrollWidth,
        clientWidth: row.clientWidth,
        // The scoped `.piai-catalog > label { gap: 8px }` sits between the
        // checkbox and the id chip now that the name span is gone.
        gap: codeBox === null || inputBox === null ? null : round(codeBox.left - inputBox.right),
        bottomSpread: bottoms.length === 2 ? round(Math.max(...bottoms) - Math.min(...bottoms)) : null,
      }
    })

    measurements.portalCatalog = {
      host: rect(host),
      scope: rect(scope),
      search: rect(search),
      list: rect(list),
      rows: rowInfo,
    }

    // Scope-INDEPENDENT diagnostics: these read the same DOM whether or not the
    // nested `.piai-root` is present, so the negative control can show *what*
    // breaks (computed layout, the checkbox -> id gap, the chip's own overflow)
    // instead of only that a scoped selector stopped matching. They are
    // reported, never asserted, so a design tweak cannot redden the page.
    const anywhereList = document.querySelector('.piai-catalog')
    const anywhereRow = anywhereList === null ? null : anywhereList.querySelector('label')
    const laidOut = (element) => {
      if (element === null) return null
      const style = getComputedStyle(element)
      return {
        display: style.display,
        flexDirection: style.flexDirection,
        gap: style.gap,
        alignItems: style.alignItems,
        overflow: style.overflow,
      }
    }
    const anywhereCode = anywhereRow === null ? null : anywhereRow.querySelector('code.piai-dict-key')
    const anywhereInput = anywhereRow === null ? null : anywhereRow.querySelector('input')
    measurements.portalCatalogDiagnostics = {
      listComputed: laidOut(anywhereList),
      rowComputed: laidOut(anywhereRow),
      codeComputed: laidOut(anywhereCode),
      // T40 corroboration: this is the REAL picker shape T39's `:has()` gate has
      // to exclude (direct children are div.dialog-title, div.piai-item-actions,
      // div.piai-catalog, div.dialog-footer — no `.piai-key`, no direct span), so
      // the portal root must be unpadded. Reported, not asserted here: R7 owns
      // the gated criterion.
      scopePadding: paddingOf(scope),
      scopeGateMatches: matchesOf(scope, GATE_SELECTORS),
      firstRowText: anywhereRow === null ? null : anywhereRow.textContent.trim().slice(0, 56),
      firstRowId: anywhereCode === null ? null : anywhereCode.textContent,
      firstRowTitle: anywhereCode === null ? null : anywhereCode.getAttribute('title'),
      firstRowSpanCount: anywhereRow === null ? 0 : anywhereRow.querySelectorAll('span').length,
      firstRowInput: rect(anywhereInput),
      firstRowGap:
        anywhereCode === null || anywhereInput === null
          ? null
          : round(rect(anywhereCode).left - rect(anywhereInput).right),
      firstRowOverflow:
        anywhereList === null ? null : anywhereList.scrollWidth - anywhereList.clientWidth,
    }

    checks.portalCatalogScoped = scope !== null
    checks.portalCatalogSearch =
      search !== null && search.getAttribute('type') === 'search' && visible(search)
    checks.portalCatalogRows = rows.length === 4
    checks.portalCatalogRowsSingleLine =
      rowInfo.length === 4 &&
      rowInfo.every(
        (info) =>
          info.input !== null &&
          info.code !== null &&
          info.bottomSpread !== null &&
          info.bottomSpread <= 2 &&
          overlapOf(info.input, info.code) > 0 &&
          Math.abs(info.code.bottom - info.row.bottom) <= 2,
      )
    checks.portalCatalogNoOverflow =
      rowInfo.length === 4 && rowInfo.every((info) => info.scrollWidth <= info.clientWidth + 1)
    checks.portalCatalogInput16 =
      rowInfo.length === 4 &&
      rowInfo.every(
        (info) => info.input !== null && info.input.width === 16 && info.input.height === 16,
      )
    // T25: the gap is now between the checkbox and the id chip.
    checks.portalCatalogCheckboxIdGap8 =
      rowInfo.length === 4 && rowInfo.every((info) => info.gap !== null && info.gap >= 7.5)
    // T25 replaces the removed id/name-overlap check: each row must carry NO
    // extra span, its only visible text must be the raw id, and the chip must
    // not overflow itself.
    checks.portalCatalogIdSingleLine =
      rowInfo.length === 4 &&
      rowInfo.every(
        (info) =>
          info.spanCount === 0 &&
          info.id !== null &&
          info.visibleText === info.id &&
          info.codeScrollWidth !== null &&
          info.codeClientWidth !== null &&
          info.codeScrollWidth <= info.codeClientWidth + 1,
      )
    checks.portalCatalogStacked =
      rowInfo.length === 4 &&
      rowInfo.every(
        (info, index) =>
          info.row !== null && (index === 0 || info.row.top >= rowInfo[index - 1].row.bottom - 1),
      )
  }

  if (probe === 'bubble') {
    // T20: the Tooltip bubble is portalled, so it re-enters the scope with its
    // own nested `.piai-root`. That wrapper is a flex COLUMN (one part per row,
    // spacing from `gap`) and the chip is `align-self: flex-start` so its own
    // background / radius / padding stay visible. Both branches are measured:
    // the scoped one (the criteria must pass) and the SAME parts unwrapped (the
    // criteria must fail, or they would not discriminate).
    //
    // T40: the fixture draws the primitive's REAL DOM — `.bubble` is the shipped
    // Tooltip surface (Tooltip.module.css snapshot: `padding: 3px 7px`) and the
    // wrapper sits behind the primitive's own `span.label` box, so the inset
    // chain measured below is the shipped one, not a simulation. The page also
    // carries a Modal-shaped `.piai-root` (children: `.piai-item-actions` +
    // `.piai-catalog`) whose 0 padding shows T39's `:has()` gate at work.
    const host = need(probeEl('bubble'), '[data-probe="bubble"]')
    const scoped = need(q(host, '[data-role="positive"] .piai-root', 'scoped bubble wrapper'), 'scoped bubble wrapper')
    const bubbleEl = q(host, '[data-role="positive"]', 'positive .bubble')
    const unscoped = q(host, '[data-role="negative"] > .label', 'unwrapped bubble branch')
    const dialog = q(host, '[data-role="dialog"]', 'modal dialog box')
    const modal = q(host, '[data-role="modal"]', 'modal-shaped wrapper')

    // The resolved theme alias, read from a throwaway element rather than by
    // string-matching the custom property, so it is a real computed colour. It
    // is attached INSIDE the probe shell: the shell is where the page pins the
    // alias, and `document.body` would resolve the `:root` value instead.
    const aliasProbe = document.createElement('span')
    aliasProbe.style.color = 'var(--dsw-alias-label-primary)'
    aliasProbe.style.display = 'none'
    const probeScope = document.querySelector('.fixture-shell') ?? document.body
    probeScope.appendChild(aliasProbe)
    const aliasColor = getComputedStyle(aliasProbe).color
    aliasProbe.remove()
    // The surface the bubble is portalled into: the primitives' own static
    // light foreground, taken from the bubble element itself.
    const surfaceHost = document.querySelector('[data-role="positive"]')
    const surfaceColor = surfaceHost === null ? null : getComputedStyle(surfaceHost).color
    const bubbleBackground =
      surfaceHost === null ? null : getComputedStyle(surfaceHost).backgroundColor

    /** WCAG 2.x sRGB relative luminance of an `rgb(...)` computed colour. */
    const luminance = (color) => {
      const match = /rgba?\(([^)]+)\)/.exec(String(color))
      if (match === null) return null
      const parts = match[1].split(',').map((part) => parseFloat(part.trim()))
      if (parts.length < 3) return null
      const channel = (value) => {
        const scaled = value / 255
        return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * channel(parts[0]) + 0.7152 * channel(parts[1]) + 0.0722 * channel(parts[2])
    }

    /** WCAG contrast ratio; `null` when either colour is unparseable. */
    const contrastRatio = (foreground, background) => {
      const front = luminance(foreground)
      const back = luminance(background)
      if (front === null || back === null) return null
      const high = Math.max(front, back)
      const low = Math.min(front, back)
      return Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100
    }

    /** One foreground/background pair with its luminances and ratio. */
    const contrastPair = (foreground, background) =>
      foreground === null || background === null
        ? null
        : {
            foreground,
            background,
            luminance: {
              foreground: luminance(foreground),
              background: luminance(background),
            },
            ratio: contrastRatio(foreground, background),
          }

    // --- T40: the padding half -------------------------------------------------
    // `PRIMITIVE_INSET` / `GATE_SELECTORS` / `contentBox` / `matchesOf` are the
    // shared helpers declared at the top of this expression.

    const analyzeBubble = (scope) => {
      if (scope === null) return null
      const chip = scope.querySelector('code.piai-key')
      const lines = all(':scope > span', scope)
      const styleOf = (element) => {
        if (element === null) return null
        const style = getComputedStyle(element)
        return {
          display: style.display,
          flexDirection: style.flexDirection,
          gap: style.gap,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderRadius: style.borderRadius,
          paddingLeft: style.paddingLeft,
          alignSelf: style.alignSelf,
        }
      }
      const boxes = [rect(chip)].concat(lines.map(rect))
      const tops = boxes.map((box) => (box === null ? null : box.top))
      const adjacentGaps = []
      for (let index = 1; index < boxes.length; index += 1) {
        const previous = boxes[index - 1]
        const current = boxes[index]
        adjacentGaps.push(
          previous === null || current === null ? null : round(current.top - previous.bottom),
        )
      }
      const wrapper = styleOf(scope)
      return {
        scope: rect(scope),
        wrapper,
        scopedStack:
          wrapper !== null &&
          wrapper.display === 'flex' &&
          wrapper.flexDirection === 'column' &&
          wrapper.gap === '4px',
        chip: styleOf(chip),
        chipBox: rect(chip),
        lineColors: lines.map((line) => getComputedStyle(line).color),
        lineBoxes: lines.map(rect),
        tops,
        adjacentGaps,
        stacked: tops.every((top, index) => top !== null && (index === 0 || top > tops[index - 1])),
        disjoint: boxes.every(
          (box, index) => box !== null && (index === 0 || overlapOf(boxes[index - 1], box) <= 0),
        ),
      }
    }

    const positive = analyzeBubble(scoped)
    const negative = analyzeBubble(unscoped)
    // T36: the two contrast pairs this page adjudicates — the bubble BODY text
    // against the bubble's own surface, and the chip's text against the chip's
    // OWN background (the chip keeps its theme token pair, so it must not be
    // compared against the bubble's background).
    const bodyContrast =
      positive === null || positive.wrapper === null
        ? null
        : contrastPair(positive.wrapper.color, bubbleBackground)
    const chipContrast =
      positive === null || positive.chip === null
        ? null
        : contrastPair(positive.chip.color, positive.chip.backgroundColor)
    measurements.bubble = {
      positive,
      negative,
      aliasColor,
      surfaceColor,
      bubbleBackground,
      contrast: { body: bodyContrast, chip: chipContrast },
    }

    // T40: the four-sided inset, measured from the wrapper's CONTENT box (where
    // the chip and the lines actually start) to the `.bubble` border box. The
    // primitive alone gives 3 / 7 / 3 / 7; T39's compensation must make all four
    // 15px. `bubbleComputed` records the primitive rule really being in play.
    const bubbleInset =
      positive === null || bubbleEl === null
        ? null
        : borderBoxInset(rect(bubbleEl), contentBox(scoped))
    const bubbleInsetSides = sides(bubbleInset)
    const bubbleComputed =
      bubbleEl === null
        ? null
        : (() => {
            const style = getComputedStyle(bubbleEl)
            return {
              position: style.position,
              padding: paddingOf(bubbleEl),
              maxWidth: style.maxWidth,
              width: style.width,
              color: style.color,
              backgroundColor: style.backgroundColor,
              borderRadius: style.borderRadius,
              // The snapshot uses `animation: tooltip-in 150ms var(--ds-ease-in-out)`.
              // The fixture intentionally leaves that host token undefined, so the
              // shorthand is invalid at computed-value time and resolves to `none`
              // — a fading bubble would make screenshots non-deterministic.
              animationName: style.animationName,
              visibility: style.visibility,
            }
          })()
    const dialogBox = contentBox(dialog)
    const modalInset = borderBoxInset(dialogBox, contentBox(modal))
    const modalPadding = paddingOf(modal)
    const modalGateMatches = matchesOf(modal, GATE_SELECTORS)
    const wrapperGateMatches = matchesOf(scoped, GATE_SELECTORS)
    measurements.bubbleInset = {
      positive: bubbleInset,
      primitives: PRIMITIVE_INSET,
      // Spread is the whole "equal on all four sides" question in one number.
      spread:
        bubbleInsetSides === null ? null : round(Math.max(...bubbleInsetSides) - Math.min(...bubbleInsetSides)),
      bubbleComputed,
      modal: {
        inset: modalInset,
        padding: modalPadding,
        dialogPadding: paddingOf(dialog),
        gateSelectors: GATE_SELECTORS,
        gateMatches: modalGateMatches,
        wrapperGateMatches,
      },
    }

    const chipStyled =
      positive !== null &&
      positive.chip !== null &&
      positive.chip.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      positive.chip.backgroundColor !== 'transparent' &&
      parseFloat(positive.chip.borderRadius) > 0 &&
      parseFloat(positive.chip.paddingLeft) > 0 &&
      positive.chip.alignSelf === 'flex-start' &&
      positive.chipBox !== null &&
      positive.scope !== null &&
      positive.chipBox.width < positive.scope.width

    checks.bubbleWrapperScoped = positive !== null && positive.scopedStack
    checks.bubbleKeyChipStyled = chipStyled
    // T31: the nested root inherits the surface colour instead of resolving the
    // page's theme alias. Both must be true: equal to the surface AND different
    // from the alias (a fixture where they coincided would prove nothing).
    checks.bubbleTextInheritsSurface =
      positive !== null &&
      surfaceColor !== null &&
      aliasColor !== surfaceColor &&
      positive.wrapper !== null &&
      positive.wrapper.color === surfaceColor &&
      positive.lineColors.length === 3 &&
      positive.lineColors.every((color) => color === surfaceColor)
    // T36: readability, not colour identity. The body must clear WCAG AA against
    // the bubble surface; the chip must clear it against its OWN box (T35 keeps
    // the chip on its theme token pair, where the secondary is readable).
    checks.bubbleBodyContrast = bodyContrast !== null && bodyContrast.ratio !== null && bodyContrast.ratio >= 4.5
    checks.bubbleChipContrast = chipContrast !== null && chipContrast.ratio !== null && chipContrast.ratio >= 4.5
    checks.bubbleLinesStacked =
      positive !== null &&
      positive.lineBoxes.length === 3 &&
      positive.stacked === true &&
      positive.disjoint === true
    checks.bubbleLineGapAtLeast1 =
      positive !== null &&
      positive.adjacentGaps.length === 3 &&
      positive.adjacentGaps.every((gap) => gap !== null && gap >= 1)
    checks.bubbleNegativeIsUnstyled =
      negative !== null &&
      negative.scopedStack === false &&
      !(negative.chip !== null && parseFloat(negative.chip.borderRadius) > 0)
    // T40: the user complaint was "3px top/bottom vs 7px left/right". Uniform
    // means the spread is <= 1px AND every side is at least 12px (roomy, not
    // squeezed); grew means every side is strictly larger than the primitives'
    // widest side (7px), i.e. 3/7 is gone on all four, not just squared up.
    checks.bubbleInsetUniform =
      bubbleInsetSides !== null &&
      measurements.bubbleInset.spread <= 1 &&
      bubbleInsetSides.every((value) => value >= 12)
    checks.bubbleInsetGrew =
      bubbleInsetSides !== null &&
      bubbleInsetSides.every((value) => value > Math.max(...Object.values(PRIMITIVE_INSET)))
    // T40: T39's `:has()` gate must leave the Modal-shaped wrapper alone: 0
    // padding on all four sides, so the modal content box sits exactly at the
    // dialog's own content box (the fixture's 16px dialog padding, untouched).
    // Not vacuous: the SAME selectors must be live on this page — they match the
    // bubble wrapper — otherwise "false for the Modal" would prove nothing.
    checks.modalWrapperUnaffected =
      modal !== null &&
      modalPadding !== null &&
      [modalPadding.top, modalPadding.right, modalPadding.bottom, modalPadding.left].every(
        (value) => px(value) === 0,
      ) &&
      modalInset !== null &&
      [modalInset.top, modalInset.right, modalInset.bottom, modalInset.left].every(
        (value) => Math.abs(value) <= 0.5,
      )
    checks.modalGateDoesNotMatch =
      modalGateMatches !== null &&
      modalGateMatches.every((matched) => matched === false) &&
      wrapperGateMatches !== null &&
      wrapperGateMatches.some((matched) => matched === true)
  }

  if (probe === 'r2') {
    const nested = document.querySelector('.piai-nested')
    const title = document.querySelector('.piai-nested-title')
    const style = getComputedStyle(nested)
    measurements.nested = {
      borderLeftWidth: style.borderLeftWidth,
      paddingLeft: style.paddingLeft,
      rect: rect(nested),
    }
    measurements.nestedTitle = { text: title.textContent, ...rect(title) }
    checks.nestedNoRail =
      style.borderLeftWidth === '0px' && style.paddingLeft === '0px'
    checks.nestedTitle =
      title.textContent.includes('按档位表设置') && title.textContent.includes('的参数')
  }

  if (probe === 'r3') {
    const sections = all('.piai-disclosure > div')
    const heads = all('.piai-item-head')
    const bodies = all('.piai-disclosure-body')
    const toggles = all('.piai-item-head button[aria-controls]')
    const bodyInfo = bodies.map((body) => ({
      id: body.id,
      hidden: body.hasAttribute('hidden'),
      display: getComputedStyle(body).display,
      rect: rect(body),
    }))
    const collapsedChevrons = sections
      .filter((section) => section.querySelector('.piai-disclosure-body[hidden]') !== null)
      .map((section) => rect(section.querySelector('.piai-item-head svg')))
    const expandedSection = sections.find(
      (section) => section.querySelector('.piai-disclosure-body:not([hidden])') !== null,
    )
    const titleSpan = expandedSection?.querySelector('.section-title')
    const firstRow = expandedSection?.querySelector('.piai-disclosure-body .piai-row')

    measurements.countBadges = document.querySelectorAll('.piai-count').length
    measurements.sectionTitles = heads.map((head) => head.textContent.trim())
    measurements.bodies = bodyInfo
    measurements.expandedAlignment = {
      titleSpanLeft: rect(titleSpan)?.left ?? null,
      bodyContentLeft: rect(firstRow)?.left ?? null,
      delta:
        titleSpan !== undefined && firstRow !== undefined && firstRow !== null
          ? round(rect(firstRow).left - rect(titleSpan).left)
          : null,
    }
    measurements.collapsedChevrons = collapsedChevrons
    measurements.ariaControls = toggles.map((toggle) => toggle.getAttribute('aria-controls'))
    measurements.ariaControlsResolve = measurements.ariaControls.map(
      (id) => document.getElementById(id) !== null,
    )

    checks.noCountBadge = measurements.countBadges === 0
    checks.sixPermanentBodies =
      bodies.length === 6 &&
      bodyInfo.filter((body) => body.hidden).length === 5 &&
      bodyInfo.every((body) => body.hidden || body.rect.height > 0)
    checks.collapsedBodiesHaveNoBox =
      bodyInfo.filter((body) => body.hidden).length === 5 &&
      bodyInfo.filter((body) => body.hidden).every((body) => body.rect.width === 0 && body.rect.height === 0)
    checks.bodyContentAligned =
      measurements.expandedAlignment.delta !== null &&
      Math.abs(measurements.expandedAlignment.delta) <= 1
    checks.collapsedChevrons14 =
      collapsedChevrons.length === 5 &&
      collapsedChevrons.every((box) => box.width === 14 && box.height === 14)
    checks.ariaControlsResolve =
      new Set(measurements.ariaControls).size === 6 &&
      measurements.ariaControlsResolve.every(Boolean)
  }

  // F1: a missing fixture node is reported as an explainable `false` (with the
  // list of what was not found), never as a TypeError that blanks the page.
  measurements.missing = missing
  checks.probeStructure = missing.length === 0

  return {
    probe,
    viewport: { width: W, height: H },
    measurements,
    checks,
    pass: Object.values(checks).every(Boolean),
  }
})()
