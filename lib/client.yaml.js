/**
 * `llm-pi-ai` YAML chunk — read-only serialisation for the "原代码" preview.
 *
 * This module exists for exactly one consumer: the page shows the committed
 * `llm-pi-ai` settings as YAML source so the user can read what the adapter
 * actually receives. It is a **one-way emitter**:
 *
 *   - there is no `parse`, no round-trip guarantee, and nothing here ever
 *     feeds the settings pipeline — the write path stays
 *     `configForms.mutate(ops, revision)`, YAML is display only;
 *   - it never throws. `undefined`, functions, symbols, `BigInt`, cycles and
 *     over-deep structures degrade to a safe rendering (`null`) instead of
 *     raising, because a preview must not be able to break its own page.
 *
 * Frozen rules (see the task contract §4.3):
 *
 *   - object  → one `key: value` per line; a nested container opens a block;
 *   - array   → `- item`, and an object element starts `- key: value`;
 *   - empty   → `{}` / `[]`;
 *   - scalars → bare for number/boolean, `null` for null, and a double-quoted
 *     string whenever a bare scalar would be ambiguous or illegal (empty,
 *     padded, special initial character, `: ` / ` #`, trailing `:`, a
 *     number/boolean/null look-alike, a control character);
 *   - keys    → quoted by the same rule;
 *   - expression node (`{ __jsExpr: string }`, the plugin's unevaluated `!!js`
 *     representation, see `lib/client.panels.js` `isExpression`) → `!!js <text>`,
 *     and a multi-line text becomes the `|-` block scalar with each line
 *     indented one level.
 *
 * This file is a package-local chunk: valid as BOTH a browser classic script
 * and a Node ES module, so no `import`, no `export`, no `module.exports`. It
 * publishes `globalThis.__dshLlmPiAiConfig.yaml` and registers with
 * `window.__ModuleLoader__.load({ id, chunk, factory })` when available.
 *
 * @module dsh-llm-pi-ai-config/client.yaml
 */

;(function (global) {
  'use strict'

  var MODULE_ID = 'dsh-llm-pi-ai-config'
  var CHUNK = 'client.yaml.js'

  /** Hard recursion cap; anything deeper degrades to `null` instead of overflowing. */
  var MAX_DEPTH = 24
  /** Whole-document fallback used only when the walk itself fails unexpectedly. */
  var BROKEN = '# 无法序列化的值'
  /** The only indent unit this emitter knows: two spaces per level. */
  var INDENT = '  '

  /** A plain scalar may not begin with any of these characters. */
  var SPECIAL_START = /^[-?:,[\]{}#&*!|>'"%@`]/
  /** Plain scalars a YAML reader would resolve as a number. */
  var NUMBER_LIKE = /^[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/
  var PREFIXED_NUMBER_LIKE = /^[-+]?0(?:[xX][0-9a-fA-F_]+|[oO][0-7_]+|[bB][01_]+)$/
  var SPECIAL_NUMBER_LIKE = /^[-+]?\.(?:inf|Inf|INF|nan|NaN|NAN)$/
  /** ...or a boolean / null, including the YAML 1.1 spellings. */
  var BOOLEAN_LIKE = /^(?:y|Y|yes|Yes|YES|n|N|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF|null|Null|NULL|~)$/
  var CONTROL_LIKE = /[\u0000-\u001f\u007f]/

  function padOf(level) {
    var pad = ''
    for (var i = 0; i < level; i += 1) pad += INDENT
    return pad
  }

  /** Own enumerable string keys, or `[]` when even that accessor throws. */
  function keysOf(value) {
    try {
      return Object.keys(value)
    } catch (error) {
      return []
    }
  }

  /** Read one property; a throwing getter or proxy degrades to `null`. */
  function readKey(object, key) {
    try {
      return object[key]
    } catch (error) {
      return null
    }
  }

  /**
   * `true` for the plugin's unevaluated `!!js` node (`{ __jsExpr: string }`) —
   * the same shape `lib/client.panels.js` `isExpression` recognises. Read-only:
   * the source text is emitted verbatim and never rewritten.
   */
  function isExpression(value) {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.__jsExpr === 'string'
    )
  }

  /** `true` when a string (or key) cannot be written as a bare plain scalar. */
  function needsQuotes(text) {
    if (text === '') return true
    if (/^\s|\s$/.test(text)) return true
    if (SPECIAL_START.test(text)) return true
    if (text.indexOf(': ') !== -1) return true
    if (text.indexOf(' #') !== -1) return true
    // A plain scalar may not end in `:` (`a:` is read as a mapping key).
    if (text.charAt(text.length - 1) === ':') return true
    if (NUMBER_LIKE.test(text)) return true
    if (PREFIXED_NUMBER_LIKE.test(text)) return true
    if (SPECIAL_NUMBER_LIKE.test(text)) return true
    if (BOOLEAN_LIKE.test(text)) return true
    if (CONTROL_LIKE.test(text)) return true
    return false
  }

  /** Double-quoted YAML scalar, escaping `"`, `\` and control characters. */
  function quote(text) {
    var out = '"'
    for (var i = 0; i < text.length; i += 1) {
      var ch = text.charAt(i)
      var code = text.charCodeAt(i)
      if (ch === '"') out += '\\"'
      else if (ch === '\\') out += '\\\\'
      else if (ch === '\n') out += '\\n'
      else if (ch === '\r') out += '\\r'
      else if (ch === '\t') out += '\\t'
      else if (code < 0x20 || code === 0x7f) out += '\\x' + ('0' + code.toString(16)).slice(-2)
      else out += ch
    }
    return out + '"'
  }

  /** Render a string as a single-line YAML scalar, quoting only when required. */
  function scalar(text) {
    return needsQuotes(text) ? quote(text) : text
  }

  /** Single-line rendering of a value the caller already classified as inline. */
  function inlineOf(value) {
    if (value === null || value === undefined) return 'null'
    var type = typeof value
    if (type === 'string') return scalar(value)
    if (type === 'number') return String(value)
    if (type === 'boolean') return value ? 'true' : 'false'
    // Unrepresentable leaves (function / symbol / BigInt) degrade to `null`.
    if (type === 'bigint' || type === 'function' || type === 'symbol') return 'null'
    if (Array.isArray(value)) return '[]'
    if (isExpression(value)) return '!!js ' + value.__jsExpr
    return '{}'
  }

  /**
   * Classify a node for `depth`. `degraded` covers both the depth cap and a
   * cycle, i.e. every case that must not recurse any further.
   */
  function nodeKind(value, depth, seen) {
    if (depth > MAX_DEPTH) return 'degraded'
    if (value === null || typeof value !== 'object') return 'inline'
    if (seen.indexOf(value) !== -1) return 'degraded'
    if (Array.isArray(value)) return value.length === 0 ? 'inline' : 'array'
    if (isExpression(value)) return value.__jsExpr.indexOf('\n') === -1 ? 'inline' : 'expr'
    return keysOf(value).length === 0 ? 'inline' : 'object'
  }

  /** Body of a `|-` block scalar: every source line indented one level. */
  function expressionLines(source, indent) {
    var pad = padOf(indent)
    var parts = String(source).split('\n')
    var lines = []
    for (var i = 0; i < parts.length; i += 1) {
      var line = parts[i].replace(/\r$/, '')
      lines.push(line === '' ? '' : pad + line)
    }
    return lines
  }

  function emitObject(object, depth, indent, seen) {
    var pad = padOf(indent)
    var keys = keysOf(object)
    var lines = []
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i]
      lines = lines.concat(emitPair(scalar(String(key)), readKey(object, key), depth + 1, indent, seen))
    }
    return lines.length === 0 ? [pad + '{}'] : lines
  }

  function emitPair(keyText, value, depth, indent, seen) {
    var pad = padOf(indent)
    var kind = nodeKind(value, depth, seen)
    if (kind === 'inline') return [pad + keyText + ': ' + inlineOf(value)]
    if (kind === 'degraded') return [pad + keyText + ': null']
    if (kind === 'expr') {
      return [pad + keyText + ': !!js |-'].concat(expressionLines(value.__jsExpr, indent + 1))
    }
    // object / array: the container opens on the next line and indents.
    return [pad + keyText + ':'].concat(emit(value, depth, indent + 1, seen))
  }

  function emitArray(array, depth, indent, seen) {
    var pad = padOf(indent)
    var childPad = padOf(indent + 1)
    var lines = []
    for (var i = 0; i < array.length; i += 1) {
      var item = readKey(array, i)
      var kind = nodeKind(item, depth + 1, seen)
      if (kind === 'inline') {
        lines.push(pad + '- ' + inlineOf(item))
        continue
      }
      if (kind === 'degraded') {
        lines.push(pad + '- null')
        continue
      }
      if (kind === 'expr') {
        lines.push(pad + '- !!js |-')
        lines = lines.concat(expressionLines(item.__jsExpr, indent + 1))
        continue
      }
      // Compact form: the child's block starts on the dash line, so its first
      // line loses the extra level and the rest keep it (`- a: 1` / `  b: 2`).
      var child = emit(item, depth + 1, indent + 1, seen)
      lines.push(pad + '- ' + child[0].slice(childPad.length))
      for (var j = 1; j < child.length; j += 1) lines.push(child[j])
    }
    return lines
  }

  /** Block lines for `value`, every line indented at `indent` levels. */
  function emit(value, depth, indent, seen) {
    var pad = padOf(indent)
    var kind = nodeKind(value, depth, seen)
    if (kind === 'inline') return [pad + inlineOf(value)]
    if (kind === 'degraded') return [pad + 'null']
    seen.push(value)
    var lines
    if (kind === 'expr') {
      lines = [pad + '!!js |-'].concat(expressionLines(value.__jsExpr, indent + 1))
    } else if (kind === 'array') {
      lines = emitArray(value, depth, indent, seen)
    } else {
      lines = emitObject(value, depth, indent, seen)
    }
    seen.pop()
    return lines
  }

  /**
   * Serialise any JSON-shaped value as a YAML document (read-only preview).
   *
   * Never throws and never returns a non-string: unsupported leaves, cycles and
   * structures past `MAX_DEPTH` levels degrade to `null`, and an unexpected
   * internal failure returns the `# 无法序列化的值` comment.
   *
   * @param {*} value value to serialise; any type is accepted.
   * @returns {string} YAML text, without a trailing newline.
   */
  function toYaml(value) {
    try {
      return emit(value, 0, 0, []).join('\n')
    } catch (error) {
      return BROKEN
    }
  }

  var api = {
    toYaml: toYaml,
  }

  var registry = (global.__dshLlmPiAiConfig = global.__dshLlmPiAiConfig || {})
  registry.yaml = api

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
