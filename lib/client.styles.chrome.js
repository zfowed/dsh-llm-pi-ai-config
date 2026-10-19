/**
 * Stylesheet fragment: the root scope, the page shell and the field rows.
 *
 * Areas: the `.piai-root` variable scale and portalled-root rules, the page
 * header, the provider tab strip, notices, the sticky bar, the generic button,
 * the provider pick list and the field row/hint/key rules.
 *
 * v10 split the stylesheet into area fragments so no single file carries the
 * whole sheet; `client.styles.js` concatenates them (this fragment first) and
 * keeps the authoritative `CLASSES` list. Every selector is still anchored at
 * `.piai-root`, every colour still comes from the 23-token allowlist, and the
 * local `--piai-*` scale is declared once, in this fragment.
 *
 * Load position: phase 0. `client.styles.js` reads it out of the registry at
 * eval time, and installs nothing unless every fragment arrived.
 *
 * Chunk envelope: plain script, no `import`/`export`.
 *
 * @module dsh-llm-pi-ai-config/client.styles.chrome
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.styles.chrome.js'

  /**
   * This fragment's slice of the sheet.
   *
   * The facade composes `chrome.css + controls.css`; the leading and trailing
   * newlines inside the template literal are the exact pre-split bytes, so the
   * composed `STYLESHEET` stays byte-identical to the single-file version
   * (`tests/verify.polish.mjs` parses it and the layout fixture hashes it).
   * Do not re-indent or trim this literal.
   */
  var api = {
    css: `
.piai-root {
  --piai-space-1: 4px;
  --piai-space-2: 8px;
  --piai-space-3: 12px;
  --piai-space-4: 16px;
  --piai-space-5: 24px;
  --piai-space-6: 32px;
  --piai-radius-sm: 6px;
  --piai-radius-md: 10px;
  --piai-radius-lg: 14px;
  --piai-font-sm: 12px;
  --piai-font-md: 13px;
  --piai-font-lg: 15px;
  --piai-line: 1.5;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: var(--piai-font-md);
  line-height: var(--piai-line);
  min-width: 0;
}

/* T16: a portalled root has to re-enter the scope. The primitives' Modal (and
 * the Tooltip bubble) render through createPortal(…, document.body), so that
 * content sits outside every .piai-root ancestor and no scoped rule matches —
 * the model picker lost all of its list layout while the primitives' own search
 * field stayed styled. Portalled content therefore carries its own nested
 * .piai-root wrapper; the base background is neutralised here, while font size,
 * line height and the local --piai-* variables keep coming from the rule above.
 * .piai-root .piai-root covers a nested root that is inside the page root (the
 * local Modal stand-in); :not(.piai-page) covers the real portal, whose root has
 * no .piai-root ancestor at all. The page root itself always carries piai-page,
 * so it keeps the base background and the theme label colour.
 *
 * T31: the nested root must not re-apply the theme label colour either. The
 * Tooltip bubble is permanently light-on-dark and the primitives'
 * Tooltip.module.css sets a static light foreground on .bubble (the static
 * bluish-00 token, which is outside our 23-token allowlist and therefore not
 * reusable here). A nested .piai-root out-specifies that declaration and painted
 * dark-on-dark in the light theme (the third GUI report), so the nested root
 * inherits the colour of the surface it is actually portalled into — the bubble's
 * own body text and hint lines then measure ≈12:1, and the Modal keeps the
 * dialog's own colour. Never point a nested root at a theme alias: the surface
 * there is not the page background. One child is deliberately excluded from this
 * inheritance — the raw-key chip keeps its own theme colour pair, see its rule
 * below. */
.piai-root .piai-root,
.piai-root:not(.piai-page) {
  background: none;
  color: inherit;
  /* T20: a nested/portalled root is a vertical stack. The Tooltip bubble's key
   * chip, hint and explanation lines are one row each — the br separators are
   * gone and the gap below spaces them — and the Modal picker's toolbar and
   * list stack the same way. */
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  min-width: 0;
  max-width: 100%;
}

/* T39 (third GUI report): the bubble must read the same distance on all four
 * sides. The primitives' own .bubble rule is padding: 3px 7px — 3 top/bottom
 * against 7 left/right — and our content layer sits inside it, so squaring it up
 * can only happen here, by compensation: 3 + 12 (space-3) = 7 + 8 (space-2) =
 * 15px of visual padding on every side, and visibly roomier than the 3/7 it
 * starts from. Only the bubble is targeted, via the children it is parent of:
 * its wrapper holds the key chip and/or the hint spans. The Modal picker's
 * portal wrapper is a .piai-root too, but its direct children are
 * div.piai-item-actions plus div.piai-catalog / p.piai-hint, so neither :has()
 * branch matches and the dialog keeps its own spacing. */
.piai-root .piai-root:has(> .piai-key),
.piai-root:not(.piai-page):has(> .piai-key),
.piai-root .piai-root:has(> span),
.piai-root:not(.piai-page):has(> span) {
  padding: var(--piai-space-3) var(--piai-space-2);
}

/* T20: the raw-key chip keeps its own width inside the stack, so its
 * background / border / radius / padding are visible instead of being
 * stretched across the bubble (align-self overrides the flex stretch).
 * T35: unlike the bubble's body text, the chip keeps its own theme colour pair.
 * Its background, border and text all come from the same theme-token family, so
 * in the light theme it is a light chip with dark text
 * (--dsw-alias-label-secondary on --dsw-alias-bg-layer-2 ≈ 6.5:1). It must NOT
 * inherit the bubble's static light foreground: that is light-on-light, ≈ 1.1:1,
 * and the chip all but disappears. The base .piai-key rule still owns the chip
 * colour; this rule only pins its width. */
.piai-root .piai-root > .piai-key,
.piai-root:not(.piai-page) > .piai-key {
  align-self: flex-start;
}

/* T20: a long hint or explanation line wraps instead of overflowing. */
.piai-root .piai-root > span,
.piai-root:not(.piai-page) > span {
  min-width: 0;
}

/* T20: inside the nested stack, .piai-item-actions' own margin-left:auto would
 * right-align the picker's whole toolbar (search box included); there it is a
 * full-width row instead. */
.piai-root .piai-root > .piai-item-actions,
.piai-root:not(.piai-page) > .piai-item-actions {
  margin-left: 0;
  align-self: stretch;
}

.piai-root .piai-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-5);
  width: 100%;
  max-width: 880px;
  min-width: 0;
  margin: 0 auto;
  padding: var(--piai-space-4) var(--piai-space-5) var(--piai-space-6);
}

.piai-root .piai-header {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
}

.piai-root .piai-title {
  color: var(--dsw-alias-label-primary);
  font-size: var(--piai-font-lg);
  font-weight: 600;
}

.piai-root .piai-subtitle {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
}

/* T7 (§4.6): the provider strip is a two-slot row — the tablist on the left,
 * the provider-level actions (catalog / add) on the right. The bar is pure
 * layout: it draws no hairline of its own and never touches the tab row's own
 * border-bottom, so the underline still runs along the left slot only. */
.piai-root .piai-tabs-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--piai-space-3);
  width: 100%;
  min-width: 0;
}

/* R1 (§15.2): the strip is still a column — the tab row, then (only while the
 * add tab is active) its own panel. The row's look is copied from the shipped
 * PluginsSettingsSection tab row below. §15.2 item 5 adds a bottom margin,
 * because here the strip and the page body are not siblings in one flex column
 * the way the official section is. */
.piai-root .piai-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
  width: 100%;
  min-width: 0;
  margin-bottom: var(--piai-space-4);
}

.piai-root .piai-notices {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
}

/* §15.2 item 3: the panel side of the official tabs rule is padding-top: 2px,
 * and on our page that is the body holding both tabpanels. */
.piai-root .piai-body {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-4);
  padding-top: 2px;
  min-width: 0;
}

/* R1 / §15.2 item 9: the sticky bar also hosts the destructive provider action,
 * whose armed state is wider than one button; let the row wrap instead of
 * overflowing a narrow Settings modal. */
.piai-root .piai-bar {
  position: sticky;
  bottom: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-3);
  padding: var(--piai-space-3) var(--piai-space-4);
  background: var(--dsw-alias-bg-layer-2);
  border-top: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-md);
}

.piai-root .piai-dirty {
  display: inline-flex;
  align-items: center;
  gap: var(--piai-space-1);
  color: var(--dsw-alias-state-warn-primary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-loading {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  padding: var(--piai-space-4);
  text-align: center;
  animation: piai-pulse 1.2s ease-in-out infinite alternate;
}

.piai-root .piai-empty {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  padding: var(--piai-space-4);
  text-align: center;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-md);
}

.piai-root .piai-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-warn {
  color: var(--dsw-alias-state-warn-primary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-boundary {
  display: block;
  color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-state-error-primary);
  border-radius: var(--piai-radius-sm);
  padding: var(--piai-space-3);
}

.piai-root .piai-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--piai-space-1);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  padding: var(--piai-space-1) var(--piai-space-3);
  font-size: var(--piai-font-md);
  cursor: pointer;
}

.piai-root .piai-btn-primary {
  color: var(--dsw-alias-bg-base);
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}

.piai-root .piai-panel {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-4);
  min-width: 0;
}

.piai-root .piai-providers {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-4);
}

/* R1 (§15.2 item 3): the tab row copies the shipped PluginsSettingsSection
 * .tabs rule (E1) — a bottom hairline, baseline-aligned text tabs and a wide
 * 22px gap. Intentional deviation 1 (§15.2 item 4): flex-wrap: wrap, because
 * the number of providers is user input and one 22px gap line would clip
 * (the project rule since §10.2: wrap intrinsically, never break on width). */
.piai-root .piai-provider-list {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 22px;
  margin-top: 2px;
  min-width: 0;
  max-width: 100%;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

/* R1 / E1: the tab is a bare text button (no Pill), 7px/1px/9px of padding and
 * a 2px underline for the active or focused tab. */
.piai-root .piai-provider-list [role="tab"] {
  position: relative;
  max-width: 100%;
  min-width: 0;
  padding: 7px 1px 9px;
  color: var(--dsw-alias-label-tertiary);
  background: none;
  border: 0;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.piai-root .piai-provider-list [role="tab"]:hover,
.piai-root .piai-provider-list [role="tab"][data-active="true"] {
  color: var(--dsw-alias-label-primary);
}

.piai-root .piai-provider-list [role="tab"][data-active="true"]::after,
.piai-root .piai-provider-list [role="tab"]:focus-visible::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--dsw-alias-label-primary);
  border-radius: 2px 2px 0 0;
}

/* The official focus ring (E1/E12): --dsw-focus-ring-width solid
 * --dsw-focus-ring-color, offset 2px, with the label brightened. Only the two
 * ring tokens are used — no business-primary fallback (v7 §15.9 D3). */
.piai-root .piai-provider-list [role="tab"]:focus-visible {
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);
  outline-offset: 2px;
  border-radius: 2px;
  color: var(--dsw-alias-label-primary);
}

.piai-root .piai-provider-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* v7 §15.7 (R6): every button that shares its row with an input matches the
 * primitive Input's 32px height (shipped _input{height:32px}, E5). The
 * Button keeps size:'sm' (28px, Button.module.css E11), so only the box
 * is overridden here — the 12px type and the primitive's own radius scale are
 * left alone. Padding/radius follow the 32px control: --piai-space-3 = 12px
 * and --dsw-radius-md, both inside the whitelist (§15.9 D3). */
.piai-root .piai-provider-add button {
  height: 32px;
  padding: 0 var(--piai-space-3);
  border-radius: var(--dsw-radius-md);
}

/* The other four rows that pair a Button with an input get the same box:
 * dict-add (a dictionary entry), tag-add (an editable list), cred / cred-editor
 * (the credential reference beside its secret editor, E5's piai-readonly is
 * already 32px). Buttons in a different row — card icon buttons, 添加一项 and
 * 移除 — are deliberately NOT touched (§15.7.3). */
.piai-root .piai-dict-add button,
.piai-root .piai-tag-add button,
.piai-root .piai-cred button,
.piai-root .piai-cred-editor button {
  height: 32px;
  padding: 0 var(--piai-space-3);
  border-radius: var(--dsw-radius-md);
}

/* §10.3 + §11: the add-provider row must let its control shrink.
 * The shipped Input primitive renders a wrapper span, so the flex item is that wrapper
 * (a bare input selector left the wrapper collapsed and the field tiny). */
.piai-root .piai-provider-add > * {
  flex: 1 1 160px;
  min-width: 0;
}

.piai-root .piai-provider-add input {
  width: 100%;
  min-width: 0;
}

/* T7 (§4.6): the provider catalog is a scrolling list of checkable rows, one
 * per provider the adapter knows about — picking one beats typing an id. The
 * 40vh ceiling keeps the list from pushing 保存 out of reach inside the
 * Settings modal; the checkbox and the id chip stay pinned (T28: the row is
 * checkbox + id only, so no text node is left to ellipsise). */
.piai-root .piai-catalog {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  max-height: 40vh;
  overflow: auto;
  min-width: 0;
}

.piai-root .piai-catalog > label {
  display: flex;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

.piai-root .piai-catalog > label > input {
  flex: none;
  width: 16px;
  min-width: 16px;
  height: 16px;
}

.piai-root .piai-catalog > label > code {
  flex: none;
}

.piai-root .piai-fields {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-3);
  min-width: 0;
}

/* v6 (§14): consecutive short fields that belong together share a two-column
 * grid, the way the shipped Models page puts 上下文窗口 next to 最大输出 token 数
 * (_modelAdvanced { grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px }).
 * Inside a pair the label sits 4px above its control, as in that grid. */
.piai-root .piai-row-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--piai-space-2) var(--piai-space-3);
  min-width: 0;
}

.piai-root .piai-row-pair > .piai-row {
  gap: var(--piai-space-1);
}

.piai-root .piai-group {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-3);
  background: var(--dsw-alias-bg-module-platform);
  border-radius: var(--dsw-radius-lg);
  padding: 14px var(--piai-space-4);
  min-width: 0;
}

/* _modelCatalogTitle: the section heading is a small secondary caption, not a
 * headline — the controls carry the hierarchy. */
.piai-root .piai-group-title {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  font-weight: 500;
}

.piai-root .piai-disclosure {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-md);
  padding: var(--piai-space-2);
}

/* v8 R3: the disclosure header is a chevron button plus its title; the body
 * indents by exactly that header chrome (14px chevron + 4px button gap) so the
 * content lines up with the title text instead of the row's left edge. */
.piai-root .piai-disclosure-body {
  padding-left: 18px;
  min-width: 0;
}

/* §12: the field row is a vertical stack — label row, control, hint — the same
 * anatomy the shipped settings form uses. The previous two-column flex row
 * drifted as soon as a control was wider than its column: the control wrapped
 * onto the next line and started under the label, which read as broken spacing
 * (docs/verification.md §12). A vertical stack cannot drift at any width.
 *
 * v6 (docs/interaction-design.md §14): the shipped Models page draws its field
 * rows as _field { flex-direction:column; gap:6px } inside a gap-spaced body —
 * NO per-row separator. The row-level hairline is gone; spacing comes from
 * .piai-fields, and hairlines are reserved for section boundaries. */
.piai-root .piai-row {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  min-width: 0;
}

.piai-root .piai-row-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-1);
  min-width: 0;
}

/* _fieldLabel: 12px/500 in the secondary label colour, above its control. */
.piai-root .piai-row-label {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  font-weight: 500;
  line-height: var(--piai-line);
  min-width: 0;
}

.piai-root .piai-row-control {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
  max-width: 100%;
}

/* Controls fill the column instead of shrinking to their content (the
 * primitives' Input is an inline-flex box, so without this every input in a
 * card sizes to its own text). §10.3 prescribes a CHILD universal here; §10.6
 * forbids the descendant form, which would leak, not this one. */
.piai-root .piai-row-control > * {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}

/* v8 R1 root cause (docs/interaction-design.md §16): this rule was a plain
 * descendant match, so it also hit the Checkbox primitive's internal
 * label > input > span markup whenever the control row wrapped in
 * .piai-checks. The box then stretched to the label's whole width, which in
 * turn collapsed the span (min-width: 0 + overflow: hidden + nowrap) to zero
 * width — the input-mode labels rendered as blank space. Excluding checkbox
 * and radio keeps the stretch for real text inputs and leaves every other
 * control's internal geometry to the primitives. */
.piai-root .piai-row-control input:not([type="checkbox"]):not([type="radio"]) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.piai-root .piai-row-control input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

/* v7 §15.3 (R2): the hint trigger moved OUT of the control row and into the
 * label row, so the "> *" stretch rule no longer reaches it. This head-scoped
 * rule keeps the button at its own size beside the label; width:auto plus
 * the min-width:24px on the generic rule below is what holds the 24px hit
 * target without letting the flex row squeeze it. */
.piai-root .piai-row-head > .piai-info {
  flex: none;
  width: auto;
}

/* Focus presentation is owned by the platform controls (docs/verification.md
 * §14): the shipped Input draws its own :focus-within border colour, and
 * Switch / Checkbox carry their own :focus-visible ring (SegmentedControl and
 * Menu left this page in v7, §15.5, so nothing here may style them).
 * Adding a ring here stacked a third border on a focused input — the official
 * settings-form deliberately uses outline: none plus a border colour
 * (settings-form/fields.module.css). So this sheet declares NO focus rule that
 * hits a primitive's internal node: the only :focus-visible rules v7 adds are
 * on our own piai-* elements, exactly the whitelist of
 * docs/interaction-design.md §15.8 no.3 (.piai-info below; a bare button we
 * render keeps the browser's default focus ring). */

.piai-root .piai-row[data-withheld="true"] .piai-row-label {
  color: var(--dsw-alias-label-secondary);
}

/* v7 (§15.3.5): .piai-hint is kept for what is NOT a field-level hint — the
 * group-level hint, boolean status text, credential notices and the expression
 * notice. _advancedHint / _modelCatalogMeta: this help text is the tertiary
 * label colour at 12px, one step quieter than the field label itself. */
.piai-root .piai-hint {
  color: var(--dsw-alias-label-tertiary);
  font-size: var(--piai-font-sm);
  line-height: var(--piai-line);
  min-width: 0;
}

/* The raw YAML key chip. v7 moved it off the row and into the hint Tooltip
 * bubble, so every row can still be mapped back to the config file. */
.piai-root .piai-key {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-sm);
  padding: 0 var(--piai-space-1);
  font-size: var(--piai-font-sm);
}

/* E3's .helpButton: a bare 24x24 icon button in the field row's label line.
 * min-width guarantees the 24px square even though the head-scoped rule
 * above sets width:auto. Hover uses the whitelisted layer-2 background token
 * and the local radius --piai-radius-sm — the two substitutions fixed by
 * §15.9 D3 (the official hover background token and the official small
 * radius token it copies are outside the whitelist). */
.piai-root .piai-info {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  min-width: 24px;
  height: 24px;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  background: none;
  border: 0;
  border-radius: var(--piai-radius-sm);
  font-size: var(--piai-font-sm);
  cursor: pointer;
}

/* §15.3.1: hover and the pinned/open state share this look (the pin state is
 * Tooltip-internal, so :hover is the whole of what the sheet can express). */
.piai-root .piai-info:hover {
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
}

/* E12's official focus ring, at E3's 1px offset. Allowed because it hits our
 * own class only — never a primitive's internal node (§15.8 no.3). */
.piai-root .piai-info:focus-visible {
  color: var(--dsw-alias-label-secondary);
  outline: var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);
  outline-offset: 1px;
}

.piai-root .piai-required {
  color: var(--dsw-alias-state-error-primary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-reset {
  color: var(--dsw-alias-state-warn-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-md);
  padding: 0 var(--piai-space-2);
  font-size: var(--piai-font-sm);
  cursor: pointer;
}

.piai-root .piai-unit {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-with-unit {
  display: inline-flex;
  align-items: center;
  gap: var(--piai-space-1);
  min-width: 0;
}

`,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.stylesChrome = api

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
