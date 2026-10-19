/**
 * Unit tests for `lib/client.yaml.js` (chunk `yaml`).
 *
 * The raw-config face shows the committed `llm-pi-ai` draft as YAML. This chunk
 * is a one-way emitter, so what matters here is exactly what the preview can be
 * trusted to do: mirror nested config, quote anything a YAML reader would
 * resolve differently, emit an unevaluated `!!js` node verbatim, and — above
 * all — never throw, because a render-time throw abdicates the settings cell.
 *
 * The chunk is loaded through its shipped bytes (`await import`), exactly as the
 * browser loads them, and read back from `globalThis.__dshLlmPiAiConfig.yaml`
 * per the frozen chunk envelope. A fake `__ModuleLoader__` captures the
 * registration so the contract's `{ id, chunk, factory }` shape is asserted too.
 *
 * Run: node --test tests/yaml.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// --- load the shipped bytes through the documented chunk envelope -----------
const registrations = []
globalThis.__ModuleLoader__ = {
  load(record) {
    registrations.push(record)
  },
}
await import(pathToFileURL(join(root, 'lib', 'client.yaml.js')).href)

const api = globalThis.__dshLlmPiAiConfig?.yaml
assert.ok(api, 'chunk published globalThis.__dshLlmPiAiConfig.yaml')

const { toYaml } = api

describe('chunk envelope', () => {
  test('registers with the module loader under the frozen shape', () => {
    assert.equal(registrations.length, 1)
    const record = registrations[0]
    assert.equal(record.id, 'dsh-llm-pi-ai-config')
    assert.equal(record.chunk, 'client.yaml.js')
    assert.match(record.chunk, /^client\.[A-Za-z0-9][A-Za-z0-9._-]*\.js$/)
    assert.equal(typeof record.factory, 'function')
    assert.equal(record.factory(), api)
  })

  test('exposes exactly the toYaml export', () => {
    assert.deepEqual(Object.keys(api), ['toYaml'])
    assert.equal(typeof api.toYaml, 'function')
  })

  test('shipped bytes carry no import/export/module.exports', () => {
    const source = readFileSync(join(root, 'lib', 'client.yaml.js'), 'utf8')
    assert.doesNotMatch(source, /^\s*import\s/m)
    assert.doesNotMatch(source, /^\s*export\s/m)
    assert.doesNotMatch(source, /module\.exports\s*=/)
    assert.doesNotMatch(source, /^\s*const\s+\w+\s*=\s*require\(/m)
    // A package-local chunk is a classic-script IIFE over `globalThis`.
    assert.match(source, /\(function \(global\) \{/)
    assert.match(source, /\}\)\(globalThis\)/)
  })
})

describe('containers', () => {
  test('nested objects and arrays mirror the llm-pi-ai shape', () => {
    assert.equal(
      toYaml({
        providers: [
          { id: 'openai', apiKeyEnv: 'OPENAI_API_KEY', models: [{ id: 'gpt-5', contextWindow: 400000 }] },
          { id: 'anthropic', models: [] },
        ],
      }),
      [
        'providers:',
        '  - id: openai',
        '    apiKeyEnv: OPENAI_API_KEY',
        '    models:',
        '      - id: gpt-5',
        '        contextWindow: 400000',
        '  - id: anthropic',
        '    models: []',
      ].join('\n'),
    )
  })

  test('empty object and empty array are inline literals', () => {
    assert.equal(toYaml({}), '{}')
    assert.equal(toYaml([]), '[]')
    assert.equal(toYaml({ o: {}, a: [], deep: { d: {} } }), 'o: {}\na: []\ndeep:\n  d: {}')
  })

  test('an array item that is an object starts on the dash line', () => {
    assert.equal(toYaml([{ a: 1, b: 2 }]), '- a: 1\n  b: 2')
    assert.equal(toYaml([1, 'two', { three: 3 }, [4, 5]]), '- 1\n- two\n- three: 3\n- - 4\n  - 5')
  })

  test('a top-level scalar is a bare document', () => {
    assert.equal(toYaml(12), '12')
    assert.equal(toYaml('plain'), 'plain')
    assert.equal(toYaml(null), 'null')
  })

  test('no trailing newline is appended', () => {
    assert.equal(toYaml({ a: 1 }), 'a: 1')
    assert.equal(toYaml({ a: 1 }).endsWith('\n'), false)
    assert.equal(toYaml([1]), '- 1')
  })
})

describe('scalars and quoting', () => {
  test('number / boolean / null are bare', () => {
    assert.equal(toYaml({ count: 0, ratio: -3.5, enabled: true, disabled: false, nothing: null }), [
      'count: 0',
      'ratio: -3.5',
      'enabled: true',
      'disabled: false',
      'nothing: null',
    ].join('\n'))
  })

  test('a string that would resolve as another scalar is quoted', () => {
    const mustQuote = [
      'true', 'false', 'null', '~',
      'yes', 'no', 'on', 'off', 'y', 'n',
      'True', 'TRUE', 'ON', 'Off', 'Null', 'NULL',
      '123', '-0.5', '1e5', '.5', '0x10', '0o17', '0b11',
      'a: b', 'x # y', '', ' lead', 'trail ', '-x', '?x', ':x', '#x', '&x', '*x', '!x', '|x', '>x', "'x", '"x', '%x', '@x', '`x',
      'end:',
    ]
    for (const value of mustQuote) {
      assert.equal(
        toYaml({ v: value }),
        'v: ' + JSON.stringify(value),
        `${JSON.stringify(value)} must be double-quoted`,
      )
    }
  })

  test('an unambiguous plain string stays unquoted', () => {
    const bare = ['plain', 'a:b', 'a#b', 'a b', 'OPENAI_API_KEY', 'gpt-5', '2024-01-01']
    for (const value of bare) {
      assert.equal(toYaml({ v: value }), 'v: ' + value, `${JSON.stringify(value)} must stay bare`)
    }
  })

  test('keys are quoted by the same rule', () => {
    assert.equal(toYaml({ plain: 4 }), 'plain: 4')
    assert.equal(toYaml({ true: 1 }), '"true": 1')
    assert.equal(toYaml({ '': 2 }), '"": 2')
    assert.equal(toYaml({ 1: 3 }), '"1": 3')
    assert.equal(toYaml({ 'end:': 5 }), '"end:": 5')
    // An interior space is legal in a plain scalar, key or value.
    assert.equal(toYaml({ 'a b': 6 }), 'a b: 6')
  })

  test('quoting escapes a double quote and a backslash', () => {
    // The value `"a\b"` starts with `"`, so it must be quoted and escaped.
    assert.equal(toYaml({ s: '"a\\b"' }), 's: "\\"a\\\\b\\""')
  })

  test('a multi-line string is one double-quoted scalar with escapes', () => {
    assert.equal(toYaml({ s: 'a\nb' }), 's: "a\\nb"')
    assert.equal(toYaml({ s: 'a\tb' }), 's: "a\\tb"')
    assert.equal(toYaml({ s: 'a\rb' }), 's: "a\\rb"')
  })
})

describe('expression nodes', () => {
  test('a single-line `!!js` node is emitted verbatim after the tag', () => {
    assert.equal(toYaml({ e: { __jsExpr: 'process.env.KEY' } }), 'e: !!js process.env.KEY')
    assert.equal(toYaml({ e: { __jsExpr: 'a + b' } }), 'e: !!js a + b')
  })

  test('a multi-line `!!js` node becomes a `|-` block scalar', () => {
    assert.equal(
      toYaml({ fn: { __jsExpr: 'function () {\n  return 1\n}' } }),
      ['fn: !!js |-', '  function () {', '    return 1', '  }'].join('\n'),
    )
  })

  test('an expression node works as an array item too', () => {
    assert.equal(toYaml([{ __jsExpr: 'a\nb' }]), '- !!js |-\n  a\n  b')
    assert.equal(toYaml([{ __jsExpr: 'x' }]), '- !!js x')
  })

  test('the source text is never rewritten', () => {
    const node = { __jsExpr: 'if (a) {\n  return "b"\n}' }
    const before = node.__jsExpr
    assert.equal(toYaml({ e: node }), 'e: !!js |-\n  if (a) {\n    return "b"\n  }')
    assert.equal(node.__jsExpr, before)
    assert.deepEqual(Object.keys(node), ['__jsExpr'])
  })
})

describe('never throws on hostile input', () => {
  test('undefined / function / symbol / BigInt degrade to null', () => {
    assert.equal(toYaml(undefined), 'null')
    assert.equal(toYaml(function () {}), 'null')
    assert.equal(toYaml(Symbol('s')), 'null')
    assert.equal(toYaml(10n), 'null')
    assert.equal(toYaml({ u: undefined, fn: function () {}, sym: Symbol('s'), big: 10n }), 'u: null\nfn: null\nsym: null\nbig: null')
  })

  test('a cycle degrades the back-reference, not the document', () => {
    const cyclic = { name: 'root', child: { name: 'child' } }
    cyclic.child.parent = cyclic
    cyclic.self = cyclic
    assert.equal(toYaml(cyclic), ['name: root', 'child:', '  name: child', '  parent: null', 'self: null'].join('\n'))
  })

  test('a sibling sharing one reference is not a cycle', () => {
    const shared = { x: 1 }
    assert.equal(toYaml([shared, shared]), '- x: 1\n- x: 1')
  })

  test('a structure past the depth cap is truncated, never overflowed', () => {
    let deep = 'leaf'
    for (let i = 0; i < 40; i += 1) deep = { k: deep }
    const lines = toYaml(deep).split('\n')
    assert.ok(lines.length <= 30, `expected a truncated document, got ${lines.length} lines`)
    assert.match(lines[lines.length - 1], /k: null$/)
    assert.equal(toYaml(deep).includes('leaf'), false, 'the value below the cap must not be emitted')

    let veryDeep = 'leaf'
    for (let i = 0; i < 5000; i += 1) veryDeep = { k: veryDeep }
    assert.equal(typeof toYaml(veryDeep), 'string')
  })

  test('a throwing getter degrades that leaf only', () => {
    const object = {}
    Object.defineProperty(object, 'boom', {
      enumerable: true,
      get() {
        throw new Error('nope')
      },
    })
    object.safe = 1
    assert.equal(toYaml(object), 'boom: null\nsafe: 1')
  })

  test('an internal failure returns the documented fallback text', () => {
    // `Array.isArray` on a revoked proxy throws, which is the one path outside
    // the guarded property reads.
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    assert.equal(toYaml(proxy), '# 无法序列化的值')
  })

  test('the result is always a string, for a matrix of odd inputs', () => {
    const labelOf = (value) => {
      if (typeof value === 'bigint') return String(value) + 'n'
      if (typeof value === 'symbol') return String(value)
      if (typeof value === 'function') return 'function ' + (value.name || 'anonymous')
      try {
        return JSON.stringify(value)
      } catch {
        return '<unserialisable>'
      }
    }
    const values = [
      undefined,
      null,
      0,
      -0,
      NaN,
      Infinity,
      -Infinity,
      '',
      'x',
      true,
      false,
      1n,
      Symbol('s'),
      function named() {},
      [],
      {},
      [undefined, function () {}, Symbol('s')],
      new Date(0),
      new Map([['a', 1]]),
      { __jsExpr: '' },
      { nested: { 'a: b': ['true', null] } },
    ]
    for (const value of values) {
      assert.equal(typeof toYaml(value), 'string', `toYaml(${labelOf(value)}) must return a string`)
    }
  })

  test('serialisation does not mutate or depend on prior calls', () => {
    const value = { providers: [{ id: 'openai', models: [{ id: 'gpt-5', input: ['text', 'image'] }] }] }
    const before = JSON.stringify(value)
    const first = toYaml(value)
    const second = toYaml(value)
    assert.equal(first, second)
    assert.equal(JSON.stringify(value), before)
    assert.deepEqual(value.providers[0].models[0].input, ['text', 'image'])
  })
})
