/**
 * Stylesheet fragment: the controls, the instance cards and the media rules.
 *
 * Areas: union/enum boxes, check groups, dictionaries, tag lists, tier tables,
 * arrays, credential rows, the boolean triple, compat disclosures, instance
 * cards, and the reduced-motion override.
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
 * @module dsh-llm-pi-ai-config/client.styles.controls
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.styles.controls.js'

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
    css: `.piai-root .piai-union {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* v7 R4 (§15.5): the enum is a radio group of self-drawn boxes — no
 * SegmentedControl track (its indicator escaped the control at
 * findIndex(value) === -1) and no Menu for 5+ options (it hid them). The
 * group wraps, so an enum of any length stays inside the column. */
.piai-root .piai-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2) var(--piai-space-4);
  min-width: 0;
  max-width: 100%;
}

/* One option: the box, then its text. flex: 0 1 auto keeps every option at
 * its natural width while still letting a single option too long for the line
 * shrink (min-width: 0), which is what turns the text into an ellipsis instead
 * of an overflow. */
.piai-root .piai-select > label {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: var(--piai-space-1);
  min-width: 0;
  max-width: 100%;
  cursor: pointer;
}

.piai-root .piai-select > label > span {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The box. appearance: none removes the platform's round radio so the square
 * below is all that is left, matching the 16px primitive checkbox (E9); the
 * check is drawn with two CSS borders, never a background image (§5/§10.7).
 * Focus stays entirely with the browser's own radio affordance — this sheet
 * declares no :focus-* rule for input/label (§15.8.3). */
.piai-root .piai-select input {
  appearance: none;
  -webkit-appearance: none;
  flex: none;
  position: relative;
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  margin: 0;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--piai-radius-sm);
  background: var(--dsw-alias-bg-layer-1);
  cursor: pointer;
}

.piai-root .piai-select input:checked {
  background: var(--dsw-alias-brand-primary);
  border-color: var(--dsw-alias-brand-primary);
}

.piai-root .piai-select input:checked::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4px;
  height: 7px;
  border-bottom: 1.5px solid var(--dsw-alias-label-primary-foreground);
  border-right: 1.5px solid var(--dsw-alias-label-primary-foreground);
  transform: translate(-50%, -50%) rotate(45deg);
}

/* v7: piai-clear is no longer the enum's extra "inherit" pill — the inherit
 * choice is the last radio of the group (§15.5.5). It stays for the one
 * remaining case (docs/interaction-design.md §9): the explicit null toggle of
 * a nullable dict value in DictControl. */
.piai-root .piai-clear {
  display: inline-flex;
  flex: none;
  align-items: center;
  height: 32px;
  padding: 0 var(--piai-space-3);
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--piai-radius-md);
  font: inherit;
  font-size: var(--piai-font-sm);
  cursor: pointer;
}

.piai-root .piai-clear[aria-pressed="true"] {
  color: var(--dsw-alias-label-primary);
  border-color: var(--dsw-alias-label-secondary);
}

.piai-root .piai-bool {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
  max-width: 100%;
}

.piai-root .piai-dict {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* v6 (§14): an instance entry is the shipped Models page's _modelEntry —
 * a light 0.5px stroke, the large radius, and only 6px of padding, because the
 * fields inside bring their own rhythm. v7 (§15.4): the card writes its own
 * head, so the column stretches its children instead of shrinking them. */
.piai-root .piai-dict-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--piai-space-2);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  padding: var(--piai-space-2);
  min-width: 0;
}

/* The card head spans the column so its action slot can hold the right edge,
 * and the body block below it keeps the full width. */
.piai-root .piai-dict-row > :first-child,
.piai-root .piai-array-row > :first-child {
  width: 100%;
}

.piai-root .piai-dict-row .piai-fields,
.piai-root .piai-array-row .piai-fields {
  width: 100%;
}

.piai-root .piai-dict-key {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-dict-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* Same defect class as the add-provider row: the primitive Input wrapper is
 * the flex item, so it must be the element that compresses next to a button. */
.piai-root .piai-dict-add > * {
  flex: 1 1 160px;
  min-width: 0;
}

.piai-root .piai-dict-add input {
  width: 100%;
  min-width: 0;
}

/* A closed multi-select (input: text/image): every allowed value visible as a
 * checkbox, so the row shows what the model accepts instead of hiding the
 * unchosen values behind an add menu.
 *
 * v7 R5 (§15.6): column gap stays the shipped Models page's 16px (E10), the row
 * gap tightens to 8px so a wrapped group does not read as two separate rows. */
.piai-root .piai-checks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2) var(--piai-space-4);
  min-width: 0;
  max-width: 100%;
}

/* Coupling to the primitives' internal shape (§15.6): the shipped Checkbox
 * renders label > input > span with its own gap: 6px (E9), and these rules
 * reach inside it — the label is a direct child of piai-checks, so the
 * "> label" / "> label > input" / "> label > span" shape must keep matching.
 * Tightening the box ↔ label gap to 4px is this project's decision; 6px is the
 * primitive's. If the primitive ever nests its markup differently these rules
 * go inert (the group stays usable, just at 6px / wrapping), which is the safe
 * failure. accent-color still comes from Checkbox.module.css (E9). No focus
 * rule is declared here (§15.8.3).
 *
 * v8 R1: this v7 rule set had a defect no stub harness could see. The generic
 * text-input rule above also matched the checkbox, stretched the box to the
 * label's full width, and the span's min-width: 0 + overflow: hidden +
 * text-overflow: ellipsis then resolved to ZERO width — the input-mode option
 * labels (text / image) disappeared in a real Chromium while every DOM-level
 * assertion still passed, because none of them compute layout. Two guards:
 * pin the box size here so no ancestor stretch can reach it, and never let the
 * span silently vanish — if the group is too narrow the text overflows, which
 * is visible and therefore fixable. Layout bugs of this family can only be
 * caught with a real-browser fixture, not with the tests/ stub harness. */
.piai-root .piai-checks > label {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--piai-space-1);
  min-width: 0;
  max-width: 100%;
}

.piai-root .piai-checks > label > input {
  flex: none;
  width: 16px;
  min-width: 16px;
  height: 16px;
}

.piai-root .piai-checks > label > span {
  white-space: nowrap;
}

/* A closed key set with scalar values (reasoningEfforts): one compact row per
 * declared key — chip, label, input — instead of a card per entry with its own
 * add / remove / null chrome. */
.piai-root .piai-tiers {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  min-width: 0;
}

.piai-root .piai-tier {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

.piai-root .piai-tier > * {
  flex: 1 1 200px;
  min-width: 0;
}

/* T7: the retired tier-key cell is gone — a tier row is a plain .piai-tier row
 * whose key/label/input children share the > * rule above. */

.piai-root .piai-tier input {
  width: 100%;
  min-width: 0;
}

.piai-root .piai-array {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
  min-width: 0;
}

.piai-root .piai-array-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--piai-space-2);
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  padding: var(--piai-space-2);
  min-width: 0;
}

.piai-root .piai-array-index {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  min-width: var(--piai-space-5);
}

/* v7 (§15.4): the instance card head is self-written, because DisclosureRow
 * has no right-hand action slot and its collapsed content lives inside a 24px
 * overflow: hidden row that would clip the delete control. */
.piai-root .piai-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

/* The disclosure button carries the chevron AND the title, so the whole title
 * is clickable and Enter/Space come from the native button. */
.piai-root .piai-item-head > button {
  display: inline-flex;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--piai-space-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.piai-root .piai-item-head > button > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* §15.4: _rowActions. */
.piai-root .piai-item-actions {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: var(--piai-space-1);
  margin-left: auto;
}

/* The armed two-step confirmation replaces the icon inside the action slot. */
.piai-root .piai-item-actions > span[role="group"] {
  display: inline-flex;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* §15.4: _iconButton. Low contrast until the head is hovered or the control is
 * keyboard-focused, but never hidden: it stays clickable and keyboard reachable
 * while the card is collapsed. */
.piai-root .piai-item-remove {
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--piai-radius-sm);
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  opacity: 0.5;
}

.piai-root .piai-item-head:hover .piai-item-remove,
.piai-root .piai-item-remove:hover {
  opacity: 1;
}

/* Keyboard reveal. :has() is used because the ONLY allowed focus forms are
 * selectors that hit our own classes, never a primitives internal node
 * (docs/interaction-design.md §15.8 no.3: .piai-item-head / .piai-item-remove
 * are whitelisted, :focus-within is not). T5 adds the :has(:focus-visible) form
 * to the styles.test.js focus whitelist. */
.piai-root .piai-item-head:has(:focus-visible) .piai-item-remove {
  opacity: 1;
}

.piai-root .piai-item-remove:hover {
  color: var(--dsw-alias-state-error-primary);
  background: var(--dsw-alias-bg-layer-2);
}

/* §12: the credential reference is data, not a text field; the secret editor is
 * a separate inline row whose value goes straight to the credential store. */
.piai-root .piai-cred {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
  max-width: 100%;
}

.piai-root .piai-readonly {
  display: inline-flex;
  align-items: center;
  height: 32px;
  max-width: 100%;
  min-width: 0;
  padding: 0 var(--piai-space-2);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-md);
  font-size: var(--piai-font-md);
}

.piai-root .piai-cred-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  width: 100%;
  min-width: 0;
}

.piai-root .piai-cred-editor > :first-child {
  flex: 1 1 200px;
  min-width: 0;
}

.piai-root .piai-cred-editor input {
  width: 100%;
  min-width: 0;
}

/* §12: an editable list renders as removable chips — denser than a checkbox
 * wall and clearer about what is currently set. */
.piai-root .piai-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
  max-width: 100%;
}

.piai-root .piai-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--piai-space-1);
  height: 28px;
  max-width: 100%;
  min-width: 0;
  padding: 0 var(--piai-space-2);
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--piai-radius-lg);
  font-size: var(--piai-font-sm);
}

.piai-root .piai-tag span {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.piai-root .piai-tag button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  color: var(--dsw-alias-label-secondary);
  background: none;
  border: 0;
  border-radius: 50%;
  font: inherit;
  cursor: pointer;
}

.piai-root .piai-tag-add {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--piai-space-2);
  min-width: 0;
}

/* The free-text variant is an input plus a button, so the wrapper grows. */
.piai-root .piai-tag-add[data-tag-add="free"] > :first-child {
  flex: 1 1 160px;
  min-width: 0;
}

.piai-root .piai-tag-add input {
  width: 100%;
  min-width: 0;
}

/* A branch body (a union's deeper fields) is one block, not a second
 * copy of the field label repeated per child.
 *
 * v8 R2: the padding-left plus border-left rail is gone. The branch is already
 * introduced by .piai-nested-title, so the rail only added a second vertical
 * line beside the enclosing card border and ate horizontal room on narrow
 * panels; spacing alone separates the block now. */
.piai-root .piai-nested {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-2);
  min-width: 0;
}

.piai-root .piai-nested-title {
  color: var(--dsw-alias-label-secondary);
  font-size: var(--piai-font-sm);
  font-weight: 500;
}

.piai-root .piai-expr {
  display: flex;
  flex-direction: column;
  gap: var(--piai-space-1);
  min-width: 0;
}

.piai-root .piai-expr-body {
  display: block;
  overflow-x: auto;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-2);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--piai-radius-sm);
  padding: var(--piai-space-2);
  font-size: var(--piai-font-sm);
}

@keyframes piai-pulse {
  0% {
    opacity: 0.55;
  }
  100% {
    opacity: 1;
  }
}

/* No width breakpoint: the row layout above collapses on its own when its own
 * container narrows (a Settings modal is narrower than the viewport, so a
 * viewport @media never fires). Only non-width preferences may appear. */
@media (prefers-reduced-motion: reduce) {
  .piai-root .piai-loading {
    animation: none;
  }
}
`,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.stylesControls = api

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
