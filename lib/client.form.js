/**
 * `llm-pi-ai` form chunk — minimal-diff staged editor.
 *
 * This module is transport-free by design: it never touches `remote.*`, a
 * Cordis context, or a global. It is a state machine over
 *   - a `getSnapshot()` reader shaped like `ConfigFormController.getSnapshot()`
 *     (which exposes the committed settings under `value`, or `values` in the
 *     offline harness), and
 *   - a `mutate(ops, expectedRevision)` writer.
 *
 * The edit is expressed as host path ops, because that is the only write
 * grammar the settings pipeline accepts (`applyPathOp` in
 * `@deepseek-ai/dsh-settings`):
 *
 *   { op: "unset", path }            // deletes an object key, SPLICES an array index
 *   { op: "set", path, value }       // writes `value`, including a literal `null`
 *
 * Two consequences shape every rule below:
 *
 *  1. **A cleared field is `unset`, never `null`.** `null` is a real value the
 *     host stores; clearing means "inherit the base layer again", which only
 *     `unset` does.
 *  2. **Array shrinks must be unset high-to-low.** `unset` on index `i` splices,
 *     so removing index 2 then 1 works while 1 then 2 would raise
 *     `Config array index is out of range` from the host.
 *
 * This file is a package-local chunk: valid as BOTH a browser classic script
 * and a Node ES module, so no `import`, no `export`, no `module.exports`. It
 * publishes `globalThis.__dshLlmPiAiConfig.form` and registers with
 * `window.__ModuleLoader__.load({ id, chunk, factory })` when available.
 *
 * @module dsh-llm-pi-ai-config/client.form
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.form.js'

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key)
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    var proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  }

  /** A key/value is "present" only when it exists AND is not `undefined`. */
  function present(object, key) {
    return isPlainObject(object) && hasOwn(object, key) && object[key] !== undefined
  }

  /** Deep clone of a JSON-shaped value; primitives pass through untouched. */
  function clone(value) {
    if (Array.isArray(value)) {
      var array = new Array(value.length)
      for (var i = 0; i < value.length; i += 1) array[i] = clone(value[i])
      return array
    }
    if (isPlainObject(value)) {
      var object = {}
      var keys = Object.keys(value)
      for (var k = 0; k < keys.length; k += 1) object[keys[k]] = clone(value[keys[k]])
      return object
    }
    return value
  }

  /** JSON identity of a value, used to cache snapshots and detect real changes. */
  function stable(value) {
    if (value === undefined) return 'undefined'
    try {
      return JSON.stringify(value)
    } catch (_unserializable) {
      return 'unserializable'
    }
  }

  /** Normalise a path to an array of string keys / numeric indexes. */
  function normalisePath(path) {
    if (path === undefined || path === null) return []
    if (typeof path === 'string') return path.length === 0 ? [] : path.split('.')
    if (!Array.isArray(path)) return [path]
    return path.slice()
  }

  /** Array indexes arrive as numbers or decimal strings; anything else stays a key. */
  function toIndex(key) {
    if (typeof key === 'number' && Number.isInteger(key) && key >= 0) return key
    if (typeof key === 'string' && /^(0|[1-9][0-9]*)$/.test(key)) return Number(key)
    return undefined
  }

  function readPath(root, path) {
    var current = root
    for (var i = 0; i < path.length; i += 1) {
      if (Array.isArray(current)) {
        var index = toIndex(path[i])
        if (index === undefined) return undefined
        current = current[index]
        continue
      }
      if (current === null || typeof current !== 'object') return undefined
      current = current[path[i]]
    }
    return current
  }

  /** Whether a path resolves, distinguishing "absent" from "present but undefined". */
  function hasPath(root, path) {
    if (path.length === 0) return root !== undefined
    var parent = readPath(root, path.slice(0, -1))
    var key = path[path.length - 1]
    if (Array.isArray(parent)) {
      var index = toIndex(key)
      return index !== undefined && index < parent.length
    }
    if (!isPlainObject(parent)) return false
    return present(parent, key)
  }

  /**
   * Immutably set a nested value. Missing intermediate containers are created:
   * an array when the next key is an index, else an object. An index beyond the
   * current length is clamped to the append position, because the host rejects
   * `set` past `length` (it would be a sparse write).
   */
  function setPath(root, path, value) {
    if (path.length === 0) return value
    var head = path[0]
    var rest = path.slice(1)

    if (Array.isArray(root)) {
      var copy = root.slice()
      var index = toIndex(head)
      if (index === undefined) return copy
      if (index > copy.length) index = copy.length
      if (rest.length === 0) copy[index] = value
      else copy[index] = setPath(copy[index], rest, value)
      return copy
    }

    var result = isPlainObject(root) ? clone(root) : {}
    var key = typeof head === 'number' ? String(head) : head
    if (rest.length === 0) result[key] = value
    else result[key] = setPath(isPlainObject(root) || Array.isArray(root) ? root[key] : undefined, rest, value)
    return result
  }

  /**
   * Immutably remove a nested value. An array index splices, an object key is
   * deleted; an absent path leaves the root untouched.
   */
  function deletePath(root, path) {
    if (path.length === 0) return root
    if (!hasPath(root, path)) return root
    var head = path[0]
    var rest = path.slice(1)

    if (Array.isArray(root)) {
      var copy = root.slice()
      var index = toIndex(head)
      if (index === undefined || index >= copy.length) return copy
      if (rest.length === 0) {
        copy.splice(index, 1)
        return copy
      }
      copy[index] = deletePath(copy[index], rest)
      return copy
    }

    var result = clone(root)
    var key = typeof head === 'number' ? String(head) : head
    if (rest.length === 0) {
      delete result[key]
      return result
    }
    result[key] = deletePath(root[key], rest)
    return result
  }

  /**
   * Minimal `set`/`unset` delta between two plain values at `basePath`.
   *
   * - unchanged subtrees produce nothing (deep equality, not reference equality);
   * - a removed object key produces one `unset` for that key;
   * - a shortened array produces one `unset` per trailing index, emitted from
   *   the highest index down, because each `unset` splices;
   * - a grown array produces one `set` per appended index, in ascending order,
   *   which the host accepts because `set` at `index === length` appends;
   * - a changed container CLASS (scalar <-> object <-> array) is replaced by one
   *   `set` of the whole subtree, because the host merges a descent and would
   *   otherwise yield a hybrid value;
   * - a value that is only present on one side is a single `set`/`unset` for the
   *   whole subtree, never a per-leaf explosion;
   * - `undefined` counts as absent, so no op ever carries `value: undefined`.
   * @param basePath - absolute path prefix (e.g. `["providers", name]`).
   * @param before - committed value.
   * @param after - draft value.
   * @returns Op[] in application order.
   */
  function diffOps(basePath, before, after) {
    var ops = []
    var base = normalisePath(basePath)
    diffInto(base, before, after, ops)
    return ops
  }

  /** Container class of a value; a kind change must be replaced wholesale. */
  function containerKind(value) {
    if (value === undefined) return 'absent'
    if (Array.isArray(value)) return 'array'
    if (isPlainObject(value)) return 'object'
    return 'scalar'
  }

  function diffInto(path, before, after, ops) {
    if (Object.is(before, after)) return

    var kindBefore = containerKind(before)
    var kindAfter = containerKind(after)

    if (kindAfter === 'absent') {
      if (path.length > 0) ops.push({ op: 'unset', path: path.slice() })
      return
    }
    if (kindBefore === 'absent') {
      ops.push({ op: 'set', path: path.slice(), value: clone(after) })
      return
    }
    if (kindBefore !== kindAfter) {
      // The container class changed (scalar <-> object <-> array). Descending
      // would make the host MERGE the new shape into the old one — `set` at
      // `a.0` on an object silently yields `{a:{...},0:v}` instead of `{a:[v]}` —
      // so the whole subtree is replaced by one `set`.
      ops.push({ op: 'set', path: path.slice(), value: clone(after) })
      return
    }

    if (kindAfter === 'array') {
      var beforeList = before
      var afterList = after
      var shared = Math.min(beforeList.length, afterList.length)
      for (var i = 0; i < shared; i += 1) {
        diffInto(path.concat([i]), beforeList[i], afterList[i], ops)
      }
      for (var trailing = beforeList.length - 1; trailing >= shared; trailing -= 1) {
        ops.push({ op: 'unset', path: path.concat([trailing]) })
      }
      for (var appended = shared; appended < afterList.length; appended += 1) {
        ops.push({ op: 'set', path: path.concat([appended]), value: clone(afterList[appended]) })
      }
      return
    }

    if (kindAfter === 'object') {
      var beforeObject = before
      var afterObject = after

      var afterKeys = Object.keys(afterObject)
      for (var a = 0; a < afterKeys.length; a += 1) {
        var key = afterKeys[a]
        if (!present(afterObject, key)) continue
        if (!present(beforeObject, key)) {
          ops.push({ op: 'set', path: path.concat([key]), value: clone(afterObject[key]) })
          continue
        }
        diffInto(path.concat([key]), beforeObject[key], afterObject[key], ops)
      }

      var beforeKeys = Object.keys(beforeObject)
      for (var b = 0; b < beforeKeys.length; b += 1) {
        var removed = beforeKeys[b]
        if (!present(beforeObject, removed)) continue
        if (present(afterObject, removed)) continue
        ops.push({ op: 'unset', path: path.concat([removed]) })
      }
      return
    }

    // Scalars, null, and non-JSON values: a straight replacement. `null` is
    // written only when the caller explicitly chose it (see the module docs).
    ops.push({ op: 'set', path: path.slice(), value: clone(after) })
  }

  /** Read the committed settings out of either snapshot dialect. */
  function snapshotValues(controllerSnapshot) {
    if (controllerSnapshot === null || typeof controllerSnapshot !== 'object') return {}
    if (controllerSnapshot.values !== undefined) return controllerSnapshot.values
    if (controllerSnapshot.value !== undefined) return controllerSnapshot.value
    return controllerSnapshot
  }

  /**
   * Build the staged editor.
   *
   * Returned surface:
   *
   *   dirty     boolean   draft differs from the staged baseline
   *   invalid   boolean   optional schema validation of the draft failed
   *   ops       Op[]      minimal ops that would make the host match the draft
   *   error     Error|undefined   last save failure (conflict included)
   *   stale     boolean   the host revision moved since the baseline was taken
   *   edit(path, value)   stage a value; `undefined` clears the field
   *   remove(path)        stage a clear (`unset`, never `null`)
   *   reset(path?)        restore one subtree, or the whole draft, from the baseline
   *   save()              one `mutate(ops, expectedRevision)`; true on success
   *   discard()           drop every edit AND re-read the host baseline
   *   refresh()           re-read the host baseline when the draft is clean
   *   subscribe(fn)       notify on dirty/invalid/error/saving transitions
   *   getSnapshot()       stable `{ values, dirty, invalid, error, saving, stale, ops, revision }`
   *
   * `schema` is optional and only used for `invalid`: a callable live node
   * (`schema(draft)`), `{ validate(draft) }`, or `{ validate(root, draft), root }`.
   * Anything else disables validation rather than guessing.
   *
   * `expectedRevision` is pinned to the revision the baseline was read at, so a
   * conflict cannot be silently retried over a concurrent edit; `discard()`
   * re-reads and re-baselines.
   */
  function createStagedForm(options) {
    var opts = options || {}
    var getSnapshot = typeof opts.getSnapshot === 'function' ? opts.getSnapshot : function () { return {} }
    var mutate = opts.mutate
    var schema = opts.schema

    function readController() {
      var controllerSnapshot
      try {
        controllerSnapshot = getSnapshot()
      } catch (error) {
        controllerSnapshot = undefined
      }
      return controllerSnapshot
    }

    var initial = readController()
    var baseline = clone(snapshotValues(initial) || {})
    var baselineRevision = initial === undefined || initial === null ? undefined : initial.revision
    var draft = clone(baseline)
    var error
    var saving = false
    var inFlight
    var listeners = []
    var cachedSnapshot

    // ---------------------------------------------------------------------
    // derived state
    // ---------------------------------------------------------------------
    function currentOps() {
      return diffOps([], baseline, draft)
    }

    function controllerRevision() {
      var controllerSnapshot = readController()
      if (controllerSnapshot === null || typeof controllerSnapshot !== 'object') return undefined
      return controllerSnapshot.revision
    }

    /** `undefined` when valid (or uncheckable), else a failure message. */
    function validationFailure() {
      if (schema === undefined || schema === null) return undefined
      var value = clone(draft)
      try {
        if (typeof schema === 'function') {
          schema(value)
          return undefined
        }
        if (typeof schema.validate !== 'function') return undefined
        var failure
        if (schema.validate.length >= 2) {
          if (schema.root === undefined) return undefined
          failure = schema.validate(schema.root, value)
        } else {
          failure = schema.validate(value)
        }
        if (failure === undefined || failure === null || failure === false) return undefined
        return typeof failure === 'string' ? failure : String(failure)
      } catch (validationError) {
        return validationError instanceof Error ? validationError.message : String(validationError)
      }
    }

    function buildSnapshot(previous) {
      var ops = currentOps()
      var dirty = ops.length > 0
      var invalidText = validationFailure()
      var invalid = invalidText !== undefined
      var revision = controllerRevision()
      var stale = dirty && revision !== undefined && baselineRevision !== undefined && revision !== baselineRevision
      var opsJson = stable(ops)
      // `valuesJson` exists so that a consumer which mutates the published tree
      // in place (it must not, but `useSyncExternalStore` consumers are only a
      // convention) is detected and repaired on the next read instead of
      // corrupting every subsequent render. It also keeps the snapshot identity
      // stable when nothing changed, which React requires.
      var valuesJson = stable(draft)

      if (previous !== undefined &&
        previous.dirty === dirty &&
        previous.invalid === invalid &&
        previous.invalidText === invalidText &&
        previous.error === error &&
        previous.saving === saving &&
        previous.stale === stale &&
        previous.revision === revision &&
        previous.opsJson === opsJson &&
        previous.valuesJson === valuesJson) {
        return previous
      }

      return {
        values: clone(draft),
        dirty: dirty,
        invalid: invalid,
        invalidText: invalidText,
        error: error,
        saving: saving,
        stale: stale,
        revision: revision,
        ops: ops,
        opsJson: opsJson,
        valuesJson: valuesJson,
      }
    }

    /** Rebuild the cached snapshot and notify listeners only when it really changed. */
    function publish() {
      if (cachedSnapshot !== undefined && stable(cachedSnapshot.values) !== cachedSnapshot.valuesJson) {
        cachedSnapshot = undefined
      }
      var next = buildSnapshot(cachedSnapshot)
      if (next === cachedSnapshot) return
      cachedSnapshot = next
      var subscribers = listeners.slice()
      for (var i = 0; i < subscribers.length; i += 1) {
        try {
          subscribers[i]()
        } catch (_subscriberFailure) {
          // A throwing subscriber must not corrupt another subscriber's view.
        }
      }
    }

    function getSnapshotForStore() {
      // The snapshot identity must stay stable between changes, so it is cached.
      // A consumer that mutates the published `values` in place would otherwise
      // poison every later read; detect that and rebuild instead of serving the
      // corrupted tree.
      if (cachedSnapshot !== undefined && stable(cachedSnapshot.values) !== cachedSnapshot.valuesJson) {
        cachedSnapshot = undefined
      }
      cachedSnapshot = buildSnapshot(cachedSnapshot)
      return cachedSnapshot
    }

    function clearError() {
      error = undefined
    }

    // ---------------------------------------------------------------------
    // staged edits
    // ---------------------------------------------------------------------
    /** Stage a value at an absolute path. `undefined` clears the field instead. */
    function edit(path, value) {
      var target = normalisePath(path)
      if (target.length === 0) {
        if (value === undefined) return remove(target)
        draft = clone(value)
      } else if (value === undefined) {
        return remove(target)
      } else {
        draft = setPath(draft, target, clone(value))
      }
      clearError()
      publish()
    }

    /** Stage a clear. Always an `unset`, never `{op:"set", value:null}`. */
    function remove(path) {
      var target = normalisePath(path)
      if (target.length === 0) return
      draft = deletePath(draft, target)
      clearError()
      publish()
    }

    /** Restore one subtree (or the whole draft when `path` is empty) from the baseline. */
    function reset(path) {
      var target = normalisePath(path)
      if (target.length === 0) {
        draft = clone(baseline)
      } else if (hasPath(baseline, target)) {
        draft = setPath(draft, target, clone(readPath(baseline, target)))
      } else {
        draft = deletePath(draft, target)
      }
      clearError()
      publish()
    }

    /** Re-read the host baseline without changing the draft (used on mount). */
    function refresh() {
      var controllerSnapshot = readController()
      var revision = controllerSnapshot === undefined || controllerSnapshot === null ? undefined : controllerSnapshot.revision
      if (revision !== undefined) baselineRevision = revision
      publish()
    }

    /** Drop every edit and re-baseline on the newest host snapshot. */
    function discard() {
      var controllerSnapshot = readController()
      baseline = clone(snapshotValues(controllerSnapshot) || {})
      baselineRevision = controllerSnapshot === undefined || controllerSnapshot === null ? undefined : controllerSnapshot.revision
      draft = clone(baseline)
      error = undefined
      saving = false
      publish()
    }

    /**
     * Write the pending ops once. Success rolls the staged baseline forward to
     * the draft; any failure (a `SETTINGS_CONFLICT` included) keeps the draft
     * and surfaces the error, so the user decides what happens next.
     * @returns whether the host accepted the write (or nothing was pending).
     */
    function save() {
      if (saving && inFlight !== undefined) return inFlight
      var ops = currentOps()
      if (ops.length === 0) {
        clearError()
        publish()
        return Promise.resolve(true)
      }
      if (typeof mutate !== 'function') {
        error = new Error('form: no mutate() writer was provided')
        publish()
        return Promise.resolve(false)
      }

      var expectedRevision = baselineRevision
      saving = true
      error = undefined
      publish()

      var task = Promise.resolve()
        .then(function () {
          return mutate(clone(ops), expectedRevision)
        })
        .then(function (result) {
          if (result === false) {
            // The controller recovers the mirror itself; a rejected write did
            // not happen, so the baseline must not move.
            throw new Error('form: the settings write was rejected')
          }
          // Accepted: the host now stores exactly these ops. Roll the baseline
          // forward so `dirty` clears, and adopt the revision the host reports.
          baseline = clone(draft)
          var revision = controllerRevision()
          baselineRevision = revision === undefined ? expectedRevision : revision
          return true
        })
        .catch(function (failure) {
          error = failure
          saving = false
          inFlight = undefined
          publish()
          return false
        })
        .then(function (result) {
          if (result === true) {
            saving = false
            inFlight = undefined
            publish()
          }
          return result
        })

      inFlight = task
      return task
    }

    /** Observe snapshot replacements. @returns the disposer. */
    function subscribe(listener) {
      if (typeof listener !== 'function') return function () {}
      listeners.push(listener)
      var removed = false
      return function unsubscribe() {
        if (removed) return
        removed = true
        var index = listeners.indexOf(listener)
        if (index !== -1) listeners.splice(index, 1)
      }
    }

    cachedSnapshot = buildSnapshot(undefined)

    var api = {
      // state
      get dirty() {
        return getSnapshotForStore().dirty
      },
      get invalid() {
        return getSnapshotForStore().invalid
      },
      get ops() {
        return getSnapshotForStore().ops
      },
      get error() {
        return getSnapshotForStore().error
      },
      get stale() {
        return getSnapshotForStore().stale
      },
      // edits
      edit: edit,
      remove: remove,
      reset: reset,
      // transport
      save: save,
      discard: discard,
      refresh: refresh,
      // store bridge
      subscribe: subscribe,
      getSnapshot: getSnapshotForStore,
      // explicit aliases for callers that prefer functions over getters
      isDirty: function () { return getSnapshotForStore().dirty },
      isInvalid: function () { return getSnapshotForStore().invalid },
      pendingOps: function () { return getSnapshotForStore().ops },
    }

    return api
  }

  var api = {
    diffOps: diffOps,
    createStagedForm: createStagedForm,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.form = api

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
