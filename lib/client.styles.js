/**
 * Stylesheet chunk for the `llm-pi-ai` extended configuration page.
 *
 * Why this is a JS chunk and not a `.css` file
 * --------------------------------------------
 * The plugin route only serves `client.js`, `client.<name>.js` and `.map`
 * (docs/interaction-design.md §1), so the stylesheet ships as a chunk that
 * injects one `<style>` element.
 *
 * Ownership matters: `dsh-client-modules`' `claimStyles(ownerId)` tags any
 * UNTAGGED `<style>` with whichever plugin materialises next, and
 * `removeOwnedStyles(id)` then deletes `style[data-plugin=<id>]` on hot reload.
 * An untagged element would therefore be mis-owned and could be removed by
 * someone else's reload, so the element is tagged explicitly with
 * `data-plugin="dsh-llm-pi-ai-config"`.
 *
 * Contract (docs/interaction-design.md §7):
 *
 *   { STYLESHEET, CLASSES, COMPLETE, install(): () => void, uninstall(): void }
 *
 * v10: the sheet itself is composed from two area fragments
 * (`client.styles.chrome.js`, `client.styles.controls.js`); `STYLESHEET` is the
 * concatenation and `CLASSES` stays the single authoritative class list.
 *
 * `install()` is idempotent (one node, reused), a silent no-op without a
 * `document` (Node tests), and its disposer removes only its own node and is
 * safe to call twice. Loading or installing this chunk must never be able to
 * blank the page: every failure path returns rather than throws.
 *
 * Chunk envelope: plain script, no `import`/`export`/`module.exports`.
 *
 * @module dsh-llm-pi-ai-config/client.styles
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.styles.js'

  /** The explicit ownership tags. Without these the host claims the node. */
  var PLUGIN_TAG = MODULE_ID
  var CSS_TAG = 'llm-pi-ai-config'

  /**
   * The frozen class list (docs/interaction-design.md §4), sorted — 67 names.
   *
   * T7 moves the v8 count from 66 to 67: + `piai-tabs-bar` (the two-slot
   * provider strip) and `piai-catalog` (the provider pick list), - the retired
   * tier-key cell (a tier row is a plain `piai-tier` row again).
   *
   * `tests/styles.test.js` asserts three-way equality: this list, the class
   * names that appear in the selectors below, and the `piai-*` literals in
   * `lib/client.js` + `lib/client.panels.js`.
   */
  var CLASSES = [
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
   * The two stylesheet fragments, read out of the registry at eval time.
   *
   * v10 split the sheet by area (`client.styles.chrome.js` and
   * `client.styles.controls.js`); the owner requests both in phase 0, before
   * this chunk. `COMPLETE` records whether every fragment arrived: an incomplete
   * sheet is never installed, because half a stylesheet is worse than none —
   * the page then renders with the host's own defaults, exactly as it did when
   * the whole chunk was missing.
   */
  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  var chrome = registry.stylesChrome
  var controls = registry.stylesControls

  /** `true` when every fragment is present and carries a string sheet. */
  var COMPLETE =
    chrome !== null &&
    chrome !== undefined &&
    typeof chrome.css === 'string' &&
    controls !== null &&
    controls !== undefined &&
    typeof controls.css === 'string'

  /** The composed sheet, in fragment order (the root scope comes first). */
  var STYLESHEET = COMPLETE ? chrome.css + controls.css : ''

  /** The one node this module owns, reused across installs. */
  var node

  /** Remove our own node. Safe when it is absent or already detached. */
  function removeNode() {
    if (node === undefined || node === null) return
    var parent = node.parentNode
    if (parent === null || parent === undefined) return
    if (typeof parent.removeChild !== 'function') return
    parent.removeChild(node)
  }

  /**
   * Inject the stylesheet into `document.head`.
   *
   * Idempotent: repeated calls reuse the same element. Without a `document`
   * (Node tests, a non-DOM host) this is a silent no-op so that a missing DOM
   * can never break the page. An incomplete sheet (`COMPLETE === false`, i.e. a
   * fragment never arrived) is not installed at all: partial CSS would restyle
   * some areas and leave others on the host defaults.
   *
   * @returns an idempotent disposer that removes only this node.
   */
  function install() {
    if (COMPLETE !== true) return function () {}
    if (typeof document === 'undefined' || document === null) return function () {}
    var head = document.head
    if (head === undefined || head === null) return function () {}
    if (node === undefined || node === null) {
      node = document.createElement('style')
      node.setAttribute('data-plugin', PLUGIN_TAG)
      node.setAttribute('data-plugin-css', CSS_TAG)
      node.textContent = STYLESHEET
    }
    if (node.parentNode !== head) {
      if (typeof head.appendChild === 'function') head.appendChild(node)
    }
    return function () {
      removeNode()
    }
  }

  /** Remove the stylesheet if it is currently installed. */
  function uninstall() {
    removeNode()
  }

  var api = {
    STYLESHEET: STYLESHEET,
    CLASSES: CLASSES,
    COMPLETE: COMPLETE,
    install: install,
    uninstall: uninstall,
  }

  registry.styles = api

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
