/**
 * Shared base for the page, the panels and every field control.
 *
 * This chunk is the single source of the things that used to be written twice:
 *
 *   - the pure value helpers (`hasOwn`, `isPlainObject`, `isExpression`,
 *     `readPath`, `attempt`, `describeError`, `textOf`, `readView`,
 *     `snapshotOf`) — before v10 `isExpression` existed three times and
 *     `isComponent` twice, once in the owner and once here;
 *   - the primitives resolution layer: `isComponent`, `primitive()`, the
 *     `createUi(require)` factory and every local stand-in for an export
 *     `@deepseek-ai/dsh-client-ui-primitives` does not ship.
 *
 * Why the stand-ins matter (docs/verification.md §11): a render-time throw
 * abdicates the whole settings cell, so a primitive the bundle does not export
 * must degrade to a local stand-in with the same role and keyboard contract
 * instead of rendering `h(undefined, …)`. "Present" is never
 * `typeof x === 'function'`: the shipped bundle exports `Button` and `Input` as
 * `React.forwardRef(...)` wrapper objects, and judging those "missing" silently
 * swapped in the natives — the defect this layer exists to prevent.
 *
 * What deliberately does NOT live here: the four pure logic chunks
 * (`client.schema.js`, `client.form.js`, `client.fields.js`,
 * `client.yaml.js`) stay dependency-free, because the test suite imports them
 * standalone (`node --test` has no browser module table) and because the write
 * semantics of `client.form.js` must stay auditable in one file. The few
 * micro-helpers they share with each other (`hasOwn`, `isPlainObject`,
 * `isExpression`) are therefore kept local on purpose; docs/architecture.md
 * records that trade.
 *
 * Load position: phase 0, before `page`, `panels` and every `panels.*` chunk.
 *
 * Chunk envelope: plain script, no `import`/`export`. The factory receives the
 * bundle `require`, which is what makes `createUi(require)` possible.
 *
 * @module dsh-llm-pi-ai-config/client.core
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.core.js'

  // -------------------------------------------------------------------------
  // pure helpers
  // -------------------------------------------------------------------------

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key)
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    var proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  }

  /**
   * `true` when a value is an unevaluated host expression (`{__jsExpr: string}`).
   *
   * Expressions are read-only everywhere: the schema walker emits no leaves for
   * them, the raw view prints them as `!!js`, and a control renders their body
   * instead of an editor.
   */
  function isExpression(value) {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.__jsExpr === 'string'
    )
  }

  /** Read a value at a path, treating a missing segment as `undefined`. */
  function readPath(root, path) {
    var cursor = root
    for (var index = 0; index < path.length; index += 1) {
      if (cursor === null || cursor === undefined || typeof cursor !== 'object') return undefined
      cursor = cursor[path[index]]
    }
    return cursor
  }

  /** The selector the injected page hook requires (it is a selector hook). */
  function identity(snapshot) {
    return snapshot
  }

  /** Run `fn`, returning `fallback` instead of letting it throw during render. */
  function attempt(fn, fallback) {
    try {
      return fn()
    } catch (error) {
      return fallback
    }
  }

  /** A short, safe rendering of a caught value. */
  function describeError(error) {
    if (error === null || error === undefined) return ''
    if (typeof error === 'string') return error
    if (typeof error.message === 'string') return error.message
    return attempt(function () {
      return String(error)
    }, '')
  }

  /**
   * Best-effort localized text. Never throws and always yields a string, so a
   * missing or broken locale binding cannot take the page down.
   */
  function textOf(props, key, fallback) {
    if (props !== null && props !== undefined && typeof props.t === 'function') {
      try {
        var text = props.t(key)
        if (typeof text === 'string' && text.length > 0) return text
      } catch (error) {
        // Fall through to the bundled default.
      }
    }
    return fallback
  }

  /**
   * Read the page view through the injected hook — and do it the way the hook
   * actually works.
   *
   * `apply()` registers with `inject: () => ({ hooks: { page: pageStore } })`.
   * The slot renderer's `bindInjectSources()` turns every `hooks` source into a
   * prop named `use<Name>` whose value is a SELECTOR hook, so
   * `props.usePage()` with no selector throws `TypeError` inside render — the
   * crash that made the slot framework abdicate the cell. Always pass one.
   *
   * A missing hook means "no view": the page then renders its explicit
   * missing-source state instead of crashing.
   */
  function readView(usePage) {
    if (typeof usePage !== 'function') return undefined
    return usePage(identity)
  }

  /** A controller snapshot, or `{}` when the controller is missing or broken. */
  function snapshotOf(controller) {
    if (
      controller === null ||
      controller === undefined ||
      typeof controller.getSnapshot !== 'function'
    ) {
      return {}
    }
    var snapshot = attempt(function () {
      return controller.getSnapshot()
    }, undefined)
    return snapshot !== null && typeof snapshot === 'object' ? snapshot : {}
  }

  /** `true` when the draft differs from the committed baseline at this path. */
  function isDirtyAt(form, path) {
    var key = path.join(',')
    var ops = form.ops || []
    for (var index = 0; index < ops.length; index += 1) {
      var opPath = ops[index].path || []
      if (opPath.slice(0, path.length).join(',') === key) return true
    }
    return false
  }

  /** A short, human-readable rendering of an arbitrary value for a read-only display. */
  function preview(value) {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value)
    } catch (error) {
      return String(value)
    }
  }

  /** A stable DOM id for one leaf's control, derived from its schema path. */
  function controlIdOf(path) {
    var parts = ['piai', 'field']
    for (var index = 0; index < path.length; index += 1) {
      parts.push(String(path[index]).replace(/[^A-Za-z0-9_-]/g, '-'))
    }
    return parts.join('-')
  }

  /** The last segment of a leaf path: the field key inside its own object. */
  function keyOf(path) {
    return path.length === 0 ? '' : String(path[path.length - 1])
  }

  /**
   * The wire protocol of the profile a compat leaf belongs to.
   *
   * Deliberately name-free: it scans the profile's own string values for one the
   * fields API recognises as a protocol, so no provider/model field name is
   * hardcoded here and an upstream rename cannot break the advisory marking.
   *
   * @param profile - the profile object (path minus `compat.<key>`).
   * @param fields - the presentation API, which owns the gate table.
   * @returns the protocol, or `undefined` when it cannot be resolved.
   */
  function protocolOfProfile(profile, fields) {
    if (profile === null || typeof profile !== 'object') return undefined
    if (fields === undefined || typeof fields.compatGate !== 'function') return undefined
    var names = Object.keys(profile)
    for (var index = 0; index < names.length; index += 1) {
      var value = profile[names[index]]
      if (typeof value !== 'string') continue
      if (fields.compatGate(value) !== undefined) return value
    }
    return undefined
  }

  /**
   * The value the enum radio group's inherit option carries.
   *
   * A string, not `undefined` and not a Symbol: it becomes the radio's DOM
   * `value`, which must stringify, and it must never collide with a real option
   * (the inherit radio is selected by "no listed option matched", and a `null`
   * sentinel would collide with a nullable enum's own `null` option). It
   * deliberately carries no `piai-` substring, which the class-set test would
   * read as a class.
   */
  var UNSET_VALUE = '__unset__'

  /**
   * The two-step confirmation state machine shared by the destructive controls.
   *
   * The first click only arms the control; the second confirms. Escape anywhere
   * on the document — or on the armed group itself — cancels, and the armed
   * state is presentation only: it never changes what the write does
   * (docs/interaction-design.md §6, §8 item 8).
   *
   * The page's sticky-bar delete (native `.piai-btn`) and the panels'
   * `ConfirmButton` (the shipped `Button` primitive) render different chrome
   * because two verified interaction specs ask for different ones, so only the
   * behaviour is shared here — v10 used to carry two copies of this effect.
   *
   * @param react - the React module the hook is read off.
   * @returns `{armed, arm, cancel}`.
   */
  function useArmedConfirm(react) {
    var state = react.useState(false)
    var armed = state[0]
    var setArmed = state[1]
    react.useEffect(
      function () {
        if (armed !== true) return undefined
        if (typeof document === 'undefined' || document === null) return undefined
        if (typeof document.addEventListener !== 'function') return undefined
        var onKey = function (event) {
          if (event.key === 'Escape') setArmed(false)
        }
        document.addEventListener('keydown', onKey)
        return function () {
          document.removeEventListener('keydown', onKey)
        }
      },
      [armed],
    )
    return {
      armed: armed === true,
      arm: function () {
        setArmed(true)
      },
      cancel: function () {
        setArmed(false)
      },
    }
  }

  /** A React type marker symbol, or `undefined` when the platform has none. */
  function symbolFor(description) {
    if (typeof Symbol !== 'function' || typeof Symbol.for !== 'function') return undefined
    return Symbol.for(description)
  }

  /**
   * `true` for anything React can render as a component type: a function, or a
   * `forwardRef` / `memo` / `lazy` wrapper object.
   *
   * Deliberately narrow: an already-rendered element
   * (`$$typeof === Symbol.for('react.element')`) and any plain object are
   * rejected, because accepting them would make `h(type, …)` throw during
   * render — the abdication failure this project already shipped once. When the
   * platform has no `Symbol.for`, only functions are accepted.
   *
   * @param value - a candidate export from the primitives bundle.
   * @returns whether it is a component type.
   */
  function isComponent(value) {
    if (typeof value === 'function') return true
    if (value === null || typeof value !== 'object') return false
    var tag = value.$$typeof
    if (tag === undefined) return false
    var forward = symbolFor('react.forward_ref')
    var memo = symbolFor('react.memo')
    var lazy = symbolFor('react.lazy')
    if (forward === undefined && memo === undefined && lazy === undefined) return false
    return tag === forward || tag === memo || tag === lazy
  }

  // -------------------------------------------------------------------------
  // primitives
  // -------------------------------------------------------------------------

  /**
   * Build the primitive layer against one bundle `require`.
   *
   * Every export is resolved once, at chunk build time, so a missing export can
   * never throw during render. `Input` and `Checkbox` degrade to the host's
   * native `'input'` type (the shipped components are themed wrappers; the
   * native element keeps the same value/onChange contract).
   *
   * @param require - the bundle require, offering `react` and the primitives.
   * @returns the resolved components plus the raw `react`/`h`/`primitives`.
   */
  function createUi(require) {
    var react = require('react')
    var primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    var h = react.createElement

    /** The first renderable primitive from `primitives`, else `fallback`. */
    function primitive(name, fallback) {
      var found = primitives === null || primitives === undefined ? undefined : primitives[name]
      return isComponent(found) ? found : fallback
    }

    function FallbackTooltip(props) {
      var child = props.children
      if (typeof react.cloneElement === 'function' && child !== null && child !== undefined) {
        return react.cloneElement(child, { title: typeof props.label === 'string' ? props.label : undefined })
      }
      return child
    }

    function FallbackTag(props) {
      return h('span', { className: props.className }, props.children)
    }

    /**
     * Stand-in for a bundle without `Button` / `Pill`.
     *
     * It has to keep the contract of the control it replaces: a disabled action
     * must stay disabled and keep its reason in `title`, or a bundle without
     * `Button` would offer a clickable no-op. A node without `onClick` renders
     * as a `span`, exactly like the shipped `Pill`.
     */
    function FallbackPill(props) {
      if (typeof props.onClick !== 'function') {
        return h('span', { className: props.className, title: props.title }, props.children)
      }
      return h(
        'button',
        {
          type: 'button',
          className: props.className,
          onClick: props.onClick,
          disabled: props.disabled === true,
          title: props.title,
          'aria-label': props['aria-label'],
        },
        props.children,
      )
    }

    /**
     * Stand-in for a bundle without `StateDot` and for the owner's unsaved-state
     * dot. It is the non-colour half of the unsaved signal
     * (docs/interaction-design.md §6, §8.4): decorative, so `aria-hidden`.
     */
    function FallbackStateDot(props) {
      return h('span', {
        className: props.className,
        'aria-hidden': 'true',
        'data-state': props.state,
      })
    }

    /**
     * Stand-in for a bundle without an icon.
     *
     * Decorative only: the control that carries the icon keeps its own
     * `aria-label`, so a missing icon never removes anything from the
     * accessibility tree (docs/interaction-design.md §15.3).
     */
    function FallbackIcon(props) {
      return h('span', { className: props.className, 'aria-hidden': 'true' })
    }

    /**
     * Stand-in for a bundle without `Modal`.
     *
     * The discovered-model picker is optional chrome, but without the shipped
     * dialog it still has to open: the fallback renders the same content in a
     * `role="dialog"` box and never throws during render. `aria-modal` plus the
     * title keep the accessible name the real dialog supplies.
     */
    function FallbackModal(props) {
      if (props.open !== true) return null
      var children = [h('div', { className: 'piai-group-title', key: 'title' }, props.title)]
      if (props.description !== undefined && props.description !== null) {
        children.push(h('div', { className: 'piai-hint', key: 'description' }, props.description))
      }
      children.push(h('div', { key: 'content' }, props.children))
      if (props.footer !== undefined && props.footer !== null) {
        children.push(h('div', { className: 'piai-item-actions', key: 'footer' }, props.footer))
      }
      return h(
        'div',
        {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': props.title,
          className: props.className,
        },
        children,
      )
    }

    /**
     * Stand-in for a bundle without `CodeBlock`.
     *
     * The raw-config face is read-only chrome: even without the shipped
     * highlighter it has to show the draft, so it degrades to the same
     * monospace body the expression viewer uses. `code` is coerced to a string
     * because the shipped block calls `endsWith` on it.
     */
    function FallbackPre(props) {
      var code =
        props !== null && props !== undefined && typeof props.code === 'string' ? props.code : ''
      return h('pre', { className: 'piai-expr-body' }, code)
    }

    return {
      react: react,
      h: h,
      primitives: primitives,
      primitive: primitive,
      isComponent: isComponent,
      Button: primitive('Button', FallbackPill),
      Modal: primitive('Modal', FallbackModal),
      Input: primitive('Input', 'input'),
      Checkbox: primitive('Checkbox', 'input'),
      // No `SegmentedControl` / `Menu` / `MenuItemButton` binding: the enum is a
      // native radio group (§15.5), and the menu was the only consumer of the
      // latter two, so their stand-ins were dropped with them.
      Tooltip: primitive('Tooltip', FallbackTooltip),
      Tag: primitive('Tag', FallbackTag),
      Pill: primitive('Pill', FallbackPill),
      StateDot: primitive('StateDot', FallbackStateDot),
      CodeBlock: primitive('CodeBlock', FallbackPre),
      IconInfoOutlineRegular: primitive('IconInfoOutlineRegular', FallbackIcon),
      // The instance-card chrome is self-written (v7, §15.4), so it needs the two
      // disclosure chevrons and the delete icon. They all degrade to the shared
      // decorative-icon stand-in when the bundle exports no icon.
      IconChevronRightOutlineRegular: primitive('IconChevronRightOutlineRegular', FallbackIcon),
      IconChevronDownOutlineRegular: primitive('IconChevronDownOutlineRegular', FallbackIcon),
      IconTrashOutlineRegular: primitive('IconTrashOutlineRegular', FallbackIcon),
      fallbacks: {
        Tooltip: FallbackTooltip,
        Tag: FallbackTag,
        Pill: FallbackPill,
        StateDot: FallbackStateDot,
        Icon: FallbackIcon,
        Modal: FallbackModal,
        Pre: FallbackPre,
      },
    }
  }

  var api = {
    hasOwn: hasOwn,
    isPlainObject: isPlainObject,
    isExpression: isExpression,
    readPath: readPath,
    identity: identity,
    attempt: attempt,
    describeError: describeError,
    textOf: textOf,
    readView: readView,
    snapshotOf: snapshotOf,
    isDirtyAt: isDirtyAt,
    preview: preview,
    controlIdOf: controlIdOf,
    keyOf: keyOf,
    protocolOfProfile: protocolOfProfile,
    useArmedConfirm: useArmedConfirm,
    UNSET_VALUE: UNSET_VALUE,
    symbolFor: symbolFor,
    isComponent: isComponent,
    createUi: createUi,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.core = api

  if (global.__ModuleLoader__ !== undefined) {
    global.__ModuleLoader__.load({
      id: MODULE_ID,
      chunk: CHUNK,
      factory: function (require) {
        // `ui` needs a `require`, so the built API replaces the deferred one in
        // the registry: `client.page.js` / `client.panels.js` read it from there
        // (the owner loads this chunk in phase 0, before both).
        var built = Object.assign({}, api, { ui: createUi(require) })
        var live = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
        live.core = built
        return built
      },
    })
  }
})(globalThis)
