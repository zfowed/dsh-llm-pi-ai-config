/**
 * `llm-pi-ai` schema chunk — pure helpers over the host schema envelope.
 *
 * The host projects `volatileForm(Config).toJSON()` into a `{ uid, refs }` uid
 * graph and the client rehydrates it with `settingsSchema.rehydrate(envelope)`.
 * This chunk is the only place that knows how to read that graph, so no field
 * name is ever hardcoded: forgetting a field in a hand written list is exactly
 * the failure mode the project exists to remove.
 *
 * This file is a package-local chunk: it must be valid as BOTH a browser
 * classic script and a Node ES module, so it has no `import`, no `export` and
 * no `module.exports`. It publishes its API on
 * `globalThis.__dshLlmPiAiConfig.schema` and registers itself with
 * `window.__ModuleLoader__.load({ id, chunk, factory })` when that loader is
 * present. That envelope is what lets `node --test` exercise the exact shipped
 * bytes with no build step (docs/interface-contract.md, "Chunk envelope").
 *
 * ## Leaf model
 *
 * `leaves(envelope, rootRef, basePath)` walks every writable leaf in document
 * order and returns `Leaf` records:
 *
 *   { path, node, kind, enum?, def?, min?, max?, step?,
 *     nullable, required, description?, branches?, container?,
 *     keyEnum?, valueEnum?, valueNullable?, valueVar?, valueVarNames? }
 *
 * `container` is present only when the leaf sits inside an **instance
 * container** — an `array`/`dict` whose `inner` is itself object-like, i.e. a
 * repeatable group whose members are user-chosen instances (`models[]` is an
 * array of model objects, `modelOverrides` a dict of override objects). Those
 * containers are path-transparent (no leaf is emitted for them and their
 * members stay enumerated under the container path), so the container's own
 * path would otherwise be lost. `container` restores it:
 *
 *   container = { kind: "array" | "dict", path: string[] }
 *
 * A panel uses it to re-base each member leaf onto a real instance
 * (`providers.p.models.0.id`, `providers.p.modelOverrides.gpt.name`) — the only
 * shape the host's `applyPathOp` accepts (`docs/research-findings.md` §2). The
 * OUTERMOST container wins: once one is set it is passed down unchanged, so a
 * nested `compat` object does not replace it.
 *
 * `kind` is one of `string | number | integer | boolean | enum | const |
 * array | object | dict | union | unknown`:
 *
 *   - `const`  a `type: "const"` node (one allowed value; `enum` has one item);
 *   - `enum`   a `union` whose branches are ALL `const` — collapsed into ONE
 *              leaf, which is why `reasoning` (7 const branches) is a single
 *              `enum` and `cacheControlFormat` (1 const branch) is not dropped;
 *   - `union`  any other `union`. When a branch is `object`/`dict` the leaf is a
 *              discriminated variant: `branches` carries `{ label, value, ref }`
 *              and the panel walks the active branch with
 *              `leaves(envelope, branch.ref, [...path])`. Branches are never
 *              inlined here, because two branches of `retryPolicy` share a
 *              `backoff` node and inlining both would duplicate leaf paths;
 *   - `integer` a `number` node whose `meta.step === 1` (Schemastery's integral
 *              marker, e.g. `contextWindow`, `maxRetries`);
 *   - `dict`   an open map whose values are scalars/unions (`headers`,
 *              `chatTemplateKwargs`): ONE leaf holding the whole map. When a
 *              value union accepts an object branch binding a protocol variable
 *              (a `$var` key holding a closed const set) the leaf also carries
 *              `valueVar: true` and `valueVarNames: [...]` — structure only,
 *              no field name is involved;
 *   - `array`  a list whose inner is not an object (`retryableCodes`,
 *              `defaultInput`): ONE leaf holding the whole list.
 *
 * ## Container transparency
 *
 * `object` nodes and the open containers that hold one (`dict` with an `object`
 * inner, e.g. `providers`, `modelOverrides`; `array` with an `object` inner,
 * e.g. `models`) are path-transparent: their member fields are enumerated
 * directly under the container's path and no leaf is emitted for the container
 * itself. The user-chosen instance segment (`<provider>`, `<id>`, the array
 * index) is supplied by the CALLER through `basePath` — a provider panel calls
 * `leaves(envelope, providersDictRef, ["providers", providerName])` and gets
 * real absolute paths. Walking from the namespace root therefore yields the
 * canonical field inventory (`providers.apiKeyEnv`, `providers.models.id`,
 * `providers.modelOverrides.compat.*`), which is what makes the whole schema
 * auditable without inventing placeholder segments.
 *
 * `{ __jsExpr: string }` values are unevaluated host expressions: they are
 * read-only and never produce a leaf (nor does a subtree hanging off one).
 *
 * @module dsh-llm-pi-ai-config/client.schema
 */

;(function (global) {
  'use strict'

  /** The owning client module id; `chunk` names the file inside the package. */
  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.schema.js'

  /** Guard against a pathological (or recursive) envelope; the real graph is shallow. */
  var MAX_DEPTH = 256

  var EMPTY = {}

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key)
  }

  function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    var proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
  }

  /**
   * `true` when a value is an unevaluated host expression (`{ __jsExpr: string }`).
   * Such subtrees are read-only and contribute no leaves.
   * @param value - candidate value.
   * @returns whether the value is an expression wrapper.
   */
  function isExpression(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
    return typeof value.__jsExpr === 'string'
  }

  /** Look a uid up in the envelope's `refs` map (always keyed by decimal string). */
  function lookup(envelope, uid) {
    if (envelope === null || typeof envelope !== 'object') return undefined
    var refs = envelope.refs
    if (refs === null || typeof refs !== 'object') return undefined
    var found = refs[String(uid)]
    return found === undefined ? undefined : found
  }

  /**
   * Resolve a reference against the envelope. Every value that refers to
   * another schema node is either a bare uid (number), a `{ uid }` wrapper, or
   * an already-inlined node object; all three are accepted. A `{ __jsExpr }`
   * value is returned untouched so callers can detect it with
   * {@link isExpression}.
   * @param envelope - `{ uid, refs }` schema envelope.
   * @param ref - uid number, `{ uid }` wrapper, inlined node, or expression.
   * @returns the node, or `undefined` when the reference cannot be resolved.
   */
  function node(envelope, ref) {
    if (ref === undefined || ref === null) return undefined
    var type = typeof ref
    if (type === 'number') return lookup(envelope, ref)
    if (type === 'string') {
      if (!/^(0|[1-9][0-9]*)$/.test(ref)) return undefined
      return lookup(envelope, Number(ref))
    }
    if (type !== 'object') return undefined
    if (isExpression(ref)) return ref
    // An inlined node carries its own shape; a bare `{ uid }` wrapper does not.
    if (ref.type === undefined && typeof ref.uid === 'number') return lookup(envelope, ref.uid)
    return ref
  }

  /** `meta` of a node, defaulting to an empty object (it is always present in practice). */
  function metaOf(schemaNode) {
    if (schemaNode !== null && typeof schemaNode === 'object') {
      var meta = schemaNode.meta
      if (isPlainObject(meta)) return meta
    }
    return EMPTY
  }

  /** `meta.required` is only honoured when the key exists; absence means optional. */
  function requiredOf(schemaNode) {
    var meta = metaOf(schemaNode)
    return hasOwn(meta, 'required') ? meta.required === true : false
  }

  /** Human label for a scalar value (const/enum options). */
  function valueLabel(value) {
    if (value === null) return 'null'
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return JSON.stringify(value)
  }

  /** Keys that conventionally carry an option-union discriminator, in priority order. */
  var DISCRIMINATOR_KEYS = ['mode', 'type', 'kind', 'variant', 'discriminator', 'name']

  /**
   * Find the const field that discriminates an object branch. A union branch is
   * an anonymous option object such as `retryPolicy`'s
   * `{ mode: "normal", … }`; the selector needs that const, and the contract
   * calls this shape "a discriminated variant".
   * @returns `{ key, value }`, or `undefined` when the branch is not discriminated.
   */
  function discriminatorOf(envelope, objectNode) {
    var dict = isPlainObject(objectNode.dict) ? objectNode.dict : {}
    var keys = Object.keys(dict)
    var fallback
    for (var i = 0; i < keys.length; i += 1) {
      var child = node(envelope, dict[keys[i]])
      if (child === undefined || child === null || child.type !== 'const') continue
      var candidate = { key: keys[i], value: child.value }
      if (DISCRIMINATOR_KEYS.indexOf(keys[i]) !== -1) return candidate
      if (fallback === undefined) fallback = candidate
    }
    return fallback
  }

  /**
   * `{ label, value }` for one union branch. A `const` branch is its value; an
   * `object` branch is labelled by its discriminator so the panel can render a
   * meaningful selector (`normal` / `always`) instead of two identical rows;
   * that discriminator's key is reported too, because the panel must write the
   * option back as `{ <key>: <value> }` — without it a selection could only
   * ever write an empty object.
   */
  function branchInfo(envelope, branchNode) {
    if (branchNode.type === 'const') {
      return { label: valueLabel(branchNode.value), value: branchNode.value, kind: 'const' }
    }
    if (branchNode.type === 'object') {
      var discriminator = discriminatorOf(envelope, branchNode)
      if (discriminator !== undefined) {
        return {
          label: valueLabel(discriminator.value),
          value: discriminator.value,
          kind: 'object',
          discriminatorKey: discriminator.key,
        }
      }
    }
    var meta = metaOf(branchNode)
    if (typeof meta.description === 'string' && meta.description.length > 0) {
      return { label: meta.description, value: undefined, kind: typeof branchNode.type === 'string' ? branchNode.type : 'unknown' }
    }
    return {
      label: typeof branchNode.type === 'string' ? branchNode.type : 'unknown',
      value: undefined,
      kind: typeof branchNode.type === 'string' ? branchNode.type : 'unknown',
    }
  }

  /**
   * Shared leaf fields. Only keys that carry a value are written, so a leaf is
   * never padded with invented defaults (`def`/`min`/`max`/`step`/`description`
   * appear only when `meta` really has them).
   */
  function baseLeaf(schemaNode, path) {
    var meta = metaOf(schemaNode)
    var leaf = {
      path: path,
      node: schemaNode,
      kind: 'unknown',
      nullable: false,
      required: requiredOf(schemaNode),
    }
    if (meta.nullable === true) leaf.nullable = true
    if (hasOwn(meta, 'default')) leaf.def = meta.default
    if (typeof meta.min === 'number') leaf.min = meta.min
    if (typeof meta.max === 'number') leaf.max = meta.max
    if (typeof meta.step === 'number') leaf.step = meta.step
    if (typeof meta.description === 'string') leaf.description = meta.description
    return leaf
  }

  /**
   * Attach the instance-container descriptor when the leaf lives inside one.
   *
   * The copy keeps a leaf self-contained: nothing downstream can mutate the
   * descriptor through one leaf and affect another.
   *
   * @param leaf - the leaf under construction.
   * @param container - `{kind, path}` of the enclosing instance container, if any.
   * @returns the same leaf.
   */
  function withContainer(leaf, container) {
    if (container !== undefined) {
      leaf.container = { kind: container.kind, path: container.path.slice() }
    }
    return leaf
  }

  /** `true` for a node that opens a repeatable group (`object`, or open `dict`). */
  function isObjectLike(schemaNode) {
    return schemaNode !== undefined &&
      schemaNode !== null &&
      (schemaNode.type === 'object' || schemaNode.type === 'dict')
  }

  /** Const values of a node that is either a lone `const` or a union of consts. */
  function constValuesOf(envelope, ref, depth) {
    var level = depth === undefined ? 0 : depth
    if (level > 8) return undefined
    var resolved = node(envelope, ref)
    if (resolved === undefined || resolved === null || isExpression(resolved)) return undefined
    if (resolved.type === 'const') return [resolved.value]
    if (resolved.type !== 'union' || !Array.isArray(resolved.list)) return undefined
    var values = []
    for (var i = 0; i < resolved.list.length; i += 1) {
      var branch = node(envelope, resolved.list[i])
      if (branch === undefined || branch === null || isExpression(branch)) continue
      if (branch.type === 'const') {
        values.push(branch.value)
        continue
      }
      // A nested all-const union is still a closed set (the adapter nests one
      // level for e.g. the reasoningEfforts key vocabulary).
      if (branch.type === 'union') {
        var nested = constValuesOf(envelope, resolved.list[i], level + 1)
        if (nested === undefined) return undefined
        values = values.concat(nested)
        continue
      }
      return undefined
    }
    return values.length > 0 ? values : undefined
  }

  /** `true` when a value node allows the literal `null` (directly or in a union). */
  function allowsNullValue(envelope, ref, depth) {
    var level = depth === undefined ? 0 : depth
    if (level > 8) return false
    var resolved = node(envelope, ref)
    if (resolved === undefined || resolved === null || isExpression(resolved)) return false
    if (resolved.type === 'const') return resolved.value === null
    if (resolved.type !== 'union' || !Array.isArray(resolved.list)) return false
    for (var i = 0; i < resolved.list.length; i += 1) {
      if (allowsNullValue(envelope, resolved.list[i], level + 1)) return true
    }
    return false
  }

  /** The protocol key a dict value uses to name the variable it is bound to. */
  var VAR_KEY = '$var'

  /**
   * `$var` vocabulary of a dict value, derived from STRUCTURE only.
   *
   * Some dict values accept either a scalar (`boolean` / `number` / `string` /
   * `null`) or an object carrying the protocol's variable binding — the
   * `chatTemplateKwargs` family. A dict value is "variable-aware" when its
   * value union has an `object` branch whose field set contains `{@link VAR_KEY}`.
   * Detection is by shape, never by branch order or by the extra keys that
   * branch happens to carry, so an upstream reordering or an added sibling key
   * cannot silently drop the flag.
   *
   * @param envelope - `{ uid, refs }` schema envelope.
   * @param ref - the dict's value node (uid or inlined node).
   * @returns the `$var` const vocabulary in schema order (de-duplicated), or
   *   `[]` when the branch carries a `$var` node that is not a closed const set;
   *   `undefined` when no `object` branch binds a variable at all.
   */
  function varNamesOf(envelope, ref) {
    var resolved = node(envelope, ref)
    if (resolved === undefined || resolved === null || isExpression(resolved)) return undefined
    if (resolved.type !== 'union' || !Array.isArray(resolved.list)) return undefined
    for (var i = 0; i < resolved.list.length; i += 1) {
      var branch = node(envelope, resolved.list[i])
      if (branch === undefined || branch === null || isExpression(branch)) continue
      if (!isObjectLike(branch)) continue
      var dict = isPlainObject(branch.dict) ? branch.dict : {}
      if (!hasOwn(dict, VAR_KEY)) continue
      var names = constValuesOf(envelope, dict[VAR_KEY])
      var unique = []
      if (names !== undefined) {
        for (var n = 0; n < names.length; n += 1) {
          if (unique.indexOf(names[n]) === -1) unique.push(names[n])
        }
      }
      return unique
    }
    return undefined
  }

  /** Reference identity usable as a cycle key (bare uid, `{ uid }`, or inlined node object). */
  function cycleKey(ref) {
    if (typeof ref === 'number') return '#' + String(ref)
    if (ref !== null && typeof ref === 'object') {
      if (typeof ref.uid === 'number') return '#' + String(ref.uid)
      return undefined
    }
    return undefined
  }

  /** Emit the leaf for a scalar/`const`/unknown node. */
  function pushScalar(leaf, schemaNode) {
    var type = schemaNode.type
    if (type === 'const') {
      leaf.kind = 'const'
      leaf.enum = [schemaNode.value]
      leaf.def = hasOwn(metaOf(schemaNode), 'default') ? leaf.def : schemaNode.value
      if (schemaNode.value === null) leaf.nullable = true
    } else if (type === 'string') {
      leaf.kind = 'string'
    } else if (type === 'number') {
      leaf.kind = metaOf(schemaNode).step === 1 ? 'integer' : 'number'
    } else if (type === 'integer') {
      leaf.kind = 'integer'
    } else if (type === 'boolean') {
      leaf.kind = 'boolean'
    } else {
      leaf.kind = 'unknown'
    }
    return leaf
  }

  /**
   * Recursive walk. `ancestors` holds the cycle keys on the current path only,
   * so a node shared by two sibling subtrees (`compat` at provider and model
   * level) is still enumerated twice under its own paths.
   *
   * `container` is the instance container currently enclosing this subtree, if
   * any — see {@link withContainer}. It is passed down unchanged, so the
   * outermost container wins and a nested object cannot replace it.
   */
  function walk(envelope, ref, path, out, ancestors, depth, container) {
    if (depth > MAX_DEPTH) return
    var schemaNode = node(envelope, ref)
    if (schemaNode === undefined || schemaNode === null) return
    if (isExpression(schemaNode)) return

    var key = cycleKey(ref)
    var chain = ancestors
    if (key !== undefined) {
      if (ancestors.indexOf(key) !== -1) return
      chain = ancestors.concat([key])
    }

    var type = schemaNode.type

    if (type === 'object') {
      var dict = isPlainObject(schemaNode.dict) ? schemaNode.dict : {}
      var keys = Object.keys(dict)
      for (var i = 0; i < keys.length; i += 1) {
        var childRef = dict[keys[i]]
        if (isExpression(childRef)) continue
        walk(envelope, childRef, path.concat([keys[i]]), out, chain, depth + 1, container)
      }
      return
    }

    if (type === 'array') {
      var inner = schemaNode.inner === undefined ? undefined : node(envelope, schemaNode.inner)
      if (isObjectLike(inner)) {
        // Repeatable group: enumerate the inner object's fields in place. The
        // instance segment is not in the path, so record the container here —
        // that is what lets a panel re-base each member onto a real index
        // (`providers.p.models.0.id`), which is the only shape the host
        // accepts, and what makes the repeatable group renderable at all.
        walk(
          envelope,
          schemaNode.inner,
          path,
          out,
          chain,
          depth + 1,
          container !== undefined ? container : { kind: 'array', path: path.slice() },
        )
        return
      }
      var arrayLeaf = pushScalar(baseLeaf(schemaNode, path), { type: 'array', meta: metaOf(schemaNode) })
      arrayLeaf.kind = 'array'
      var itemEnum = schemaNode.inner === undefined ? undefined : constValuesOf(envelope, schemaNode.inner)
      if (itemEnum !== undefined) arrayLeaf.enum = itemEnum
      out.push(withContainer(arrayLeaf, container))
      return
    }

    if (type === 'dict') {
      var dictInner = schemaNode.inner === undefined ? undefined : node(envelope, schemaNode.inner)
      if (isObjectLike(dictInner)) {
        walk(
          envelope,
          schemaNode.inner,
          path,
          out,
          chain,
          depth + 1,
          container !== undefined ? container : { kind: 'dict', path: path.slice() },
        )
        return
      }
      var dictLeaf = baseLeaf(schemaNode, path)
      dictLeaf.kind = 'dict'
      // A closed key set (`sKey`) and/or a closed value set (`inner`) let the
      // panel render a real single-select table instead of a free-text editor.
      var keyEnum = schemaNode.sKey === undefined ? undefined : constValuesOf(envelope, schemaNode.sKey)
      if (keyEnum !== undefined) dictLeaf.keyEnum = keyEnum
      var valueEnum = schemaNode.inner === undefined ? undefined : constValuesOf(envelope, schemaNode.inner)
      if (valueEnum !== undefined) dictLeaf.valueEnum = valueEnum
      if (schemaNode.inner !== undefined && allowsNullValue(envelope, schemaNode.inner)) {
        dictLeaf.valueNullable = true
      }
      // A value union that also accepts an object branch binding a protocol
      // variable (`{ $var: <closed const set>, … }`) is surfaced as pure
      // structure: the panel can offer a variable picker without knowing any
      // field name, and a dict that lacks the shape simply has no flag.
      var valueVarNames = schemaNode.inner === undefined ? undefined : varNamesOf(envelope, schemaNode.inner)
      if (valueVarNames !== undefined) {
        dictLeaf.valueVar = true
        dictLeaf.valueVarNames = valueVarNames
      }
      out.push(withContainer(dictLeaf, container))
      return
    }

    if (type === 'union') {
      var list = Array.isArray(schemaNode.list) ? schemaNode.list : []
      var branchRefs = []
      var branchNodes = []
      for (var b = 0; b < list.length; b += 1) {
        if (isExpression(list[b])) continue
        var branchNode = node(envelope, list[b])
        if (branchNode === undefined || branchNode === null) continue
        if (isExpression(branchNode)) continue
        branchRefs.push(list[b])
        branchNodes.push(branchNode)
      }
      if (branchNodes.length === 0) {
        var emptyLeaf = baseLeaf(schemaNode, path)
        emptyLeaf.kind = 'unknown'
        out.push(withContainer(emptyLeaf, container))
        return
      }
      var allConst = true
      for (var c = 0; c < branchNodes.length; c += 1) {
        if (branchNodes[c].type !== 'const') {
          allConst = false
          break
        }
      }
      var unionLeaf = baseLeaf(schemaNode, path)
      if (allConst) {
        // All-const union -> ONE enum leaf (this is why `reasoning` is one field).
        unionLeaf.kind = 'enum'
        var values = []
        for (var v = 0; v < branchNodes.length; v += 1) {
          values.push(branchNodes[v].value)
          if (branchNodes[v].value === null) unionLeaf.nullable = true
        }
        unionLeaf.enum = values
        out.push(withContainer(unionLeaf, container))
        return
      }
      unionLeaf.kind = 'union'
      var branches = []
      for (var n = 0; n < branchNodes.length; n += 1) {
        var info = branchInfo(envelope, branchNodes[n])
        branches.push({
          label: info.label,
          value: info.value,
          kind: info.kind,
          ref: branchRefs[n],
        })
        // The discriminator key is a property of the union, not of one branch:
        // every branch that carries one must name the same field, so the first
        // one found decides how a selection is written back (`{mode:"always"}`).
        if (info.discriminatorKey !== undefined && unionLeaf.discriminator === undefined) {
          unionLeaf.discriminator = info.discriminatorKey
        }
        if (branchNodes[n].type === 'const' && branchNodes[n].value === null) unionLeaf.nullable = true
      }
      unionLeaf.branches = branches
      out.push(withContainer(unionLeaf, container))
      return
    }

    if (type === 'lazy') {
      // Not present in the snapshot, but a lazy node may still hold its builder.
      var target = schemaNode.inner
      if (target !== undefined && target !== null) {
        var before = out.length
        if (typeof target.toJSON === 'function') {
          var rebuilt = target.toJSON()
          if (rebuilt !== undefined && rebuilt !== null && typeof rebuilt === 'object') {
            if (rebuilt.refs !== undefined && typeof rebuilt.uid === 'number') {
              walk(rebuilt, rebuilt.uid, path, out, chain, depth + 1, container)
            } else {
              walk(envelope, rebuilt, path, out, chain, depth + 1, container)
            }
          }
        } else {
          walk(envelope, target, path, out, chain, depth + 1, container)
        }
        if (out.length > before) return
      }
      var lazyLeaf = baseLeaf(schemaNode, path)
      lazyLeaf.kind = 'unknown'
      out.push(withContainer(lazyLeaf, container))
      return
    }

    out.push(withContainer(pushScalar(baseLeaf(schemaNode, path), schemaNode), container))
  }

  /**
   * Walk every writable leaf under `rootRef` in document order.
   * @param envelope - `{ uid, refs }` schema envelope.
   * @param rootRef - uid (or inlined node) to start from.
   * @param basePath - absolute path prefix; callers pass the instance path for
   *   open containers (`["providers", name]`), the namespace root passes `[]`.
   * @param presentationBase - optional prefix for `leaf.presentationPath`, so a
   *   nested walk started from an instance-rebased path still keys presentation.
   * @returns Leaf[] with absolute `path`s; empty when the root cannot be resolved.
   */
  function leaves(envelope, rootRef, basePath, presentationBase) {
    var out = []
    var base = Array.isArray(basePath) ? basePath.slice() : []
    walk(envelope, rootRef, base, out, [], 0, undefined)
    // A nested walk (a union branch, a nested object, an array item) starts from
    // an instance-rebased path, which the presentation table cannot key. The
    // caller passes the matching presentation prefix so every leaf still
    // resolves its curated label, hint and key.
    if (Array.isArray(presentationBase)) {
      for (var index = 0; index < out.length; index += 1) {
        var leaf = out[index]
        leaf.presentationPath = presentationBase.concat(leaf.path.slice(base.length))
      }
    }
    return out
  }

  /**
   * Structure of an `object`/`dict` node for the form tree.
   *
   * `object` -> `{ kind: "object", open: false, fields: [{ key, ref, node, required }] }`
   * `dict`   -> `{ kind: "dict", open: true, inner, keyRef, keyNode, valueShape }`
   *            (`inner`/`keyRef` are raw refs; `valueShape` is the shape of the
   *            value node when it is itself an object, i.e. the row template).
   *
   * `fields` is `[]` for a `dict` because its keys are user-chosen; enumerate
   * rows with `leaves(envelope, dictRef, instancePath)` instead.
   * @returns the shape, or `undefined` for a non-object/dict/unresolvable node.
   */
  function shape(envelope, ref) {
    var schemaNode = node(envelope, ref)
    if (schemaNode === undefined || schemaNode === null || isExpression(schemaNode)) return undefined

    if (schemaNode.type === 'object') {
      var dict = isPlainObject(schemaNode.dict) ? schemaNode.dict : {}
      var keys = Object.keys(dict)
      var fields = []
      for (var i = 0; i < keys.length; i += 1) {
        var childRef = dict[keys[i]]
        if (isExpression(childRef)) continue
        var childNode = node(envelope, childRef)
        if (childNode === undefined || childNode === null || isExpression(childNode)) continue
        fields.push({ key: keys[i], ref: childRef, node: childNode, required: requiredOf(childNode) })
      }
      return { kind: 'object', open: false, ref: ref, node: schemaNode, fields: fields }
    }

    if (schemaNode.type === 'dict') {
      var keyNode = schemaNode.sKey === undefined ? undefined : node(envelope, schemaNode.sKey)
      return {
        kind: 'dict',
        open: true,
        ref: ref,
        node: schemaNode,
        fields: [],
        inner: schemaNode.inner,
        keyRef: schemaNode.sKey,
        keyNode: isExpression(keyNode) ? undefined : keyNode,
        valueShape: schemaNode.inner === undefined ? undefined : shape(envelope, schemaNode.inner),
      }
    }

    return undefined
  }

  var api = {
    node: node,
    leaves: leaves,
    shape: shape,
    isExpression: isExpression,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.schema = api

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
