/**
 * Unit tests for `lib/client.form.js` (chunk `form`).
 *
 * Two layers are exercised:
 *
 *  1. `diffOps` — minimality, ordering, and the byte-level rule that a cleared
 *     field is `{op:"unset"}` and NEVER `{op:"set", value:null}`.
 *  2. `createStagedForm` — the staged lifecycle: dirty/subscribe transitions,
 *     save-once-on-success, baseline-not-advanced-on-conflict, discard restores.
 *
 * The op grammar is additionally replayed through the host's OWN `applyPathOp`
 * extracted verbatim from the installed `@deepseek-ai/dsh-settings` bytes, so a
 * passing test means the host accepts these ops, not merely that the strings
 * look right. That leg is skipped (not failed) when the installed app is absent.
 *
 * The chunk is loaded through its shipped bytes per the frozen chunk envelope.
 *
 * Run: node --test tests/form.test.js
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const registrations = []
globalThis.__ModuleLoader__ = {
  load(record) {
    registrations.push(record)
  },
}
await import(pathToFileURL(join(root, 'lib', 'client.form.js')).href)

const api = globalThis.__dshLlmPiAiConfig?.form
assert.ok(api, 'chunk published globalThis.__dshLlmPiAiConfig.form')

const { diffOps, createStagedForm } = api

// ---------------------------------------------------------------------------
// a controller-shaped harness: getSnapshot()/mutate() over a real value tree
// ---------------------------------------------------------------------------
function harness(initialValues, initialRevision = 7) {
  const state = {
    values: structuredClone(initialValues),
    revision: initialRevision,
    calls: [],
  }
  return {
    state,
    getSnapshot: () => ({ values: state.values, revision: state.revision }),
    mutate: async (ops, expectedRevision) => {
      state.calls.push({ ops: structuredClone(ops), expectedRevision })
      if (state.conflict) throw Object.assign(new Error('settings namespace changed'), {
        name: 'SettingsConflictError',
        code: 'SETTINGS_CONFLICT',
        expected: expectedRevision,
        actual: state.revision,
      })
      if (state.reject) return false
      state.values = applyOps(state.values, ops)
      state.revision += 1
      return true
    },
  }
}

/** Local applyPathOp equivalent, used only by the harness's fake host. */
function applyOps(section, ops) {
  let current = section
  for (const op of ops) {
    current = applyOp(current, op)
  }
  return current
}
function applyOp(section, op) {
  const edit = (input, path) => {
    const [head, ...rest] = path
    if (head === undefined) return op.op === 'set' ? op.value : undefined
    const value = input === undefined ? {} : input
    if (Array.isArray(value)) {
      const result = [...value]
      const index = Number(head)
      if (rest.length === 0 && op.op === 'unset') result.splice(index, 1)
      else result[index] = edit(value[index], rest)
      return result
    }
    const result = { ...value }
    const child = edit(result[head], rest)
    if (child === undefined) delete result[head]
    else result[head] = child
    return result
  }
  return edit(section, op.path)
}

// ---------------------------------------------------------------------------
// 1. diffOps
// ---------------------------------------------------------------------------
describe('diffOps minimality', () => {
  const cases = [
    ['no change -> no ops', ['p'], { a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } }, []],
    ['changed scalar -> one set', ['p'], { timeoutMs: 1 }, { timeoutMs: 2 }, [{ op: 'set', path: ['p', 'timeoutMs'], value: 2 }]],
    ['removed key -> one unset', ['p'], { a: 1, b: 2 }, { a: 1 }, [{ op: 'unset', path: ['p', 'b'] }]],
    ['added key -> one set', ['p'], { a: 1 }, { a: 1, b: 2 }, [{ op: 'set', path: ['p', 'b'], value: 2 }]],
    ['nested scalar -> leaf-level op', ['p'], { a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }, [{ op: 'set', path: ['p', 'a', 'b', 'c'], value: 2 }]],
    ['nested removal -> leaf-level unset', ['p'], { a: { b: 1, c: 2 } }, { a: { b: 1 } }, [{ op: 'unset', path: ['p', 'a', 'c'] }]],
    ['array shrink -> unset per trailing index, high to low', ['p'], { xs: [1, 2, 3] }, { xs: [1] }, [{ op: 'unset', path: ['p', 'xs', 2] }, { op: 'unset', path: ['p', 'xs', 1] }]],
    ['array emptied -> all indexes unset, high to low', ['p'], { xs: [1, 2] }, { xs: [] }, [{ op: 'unset', path: ['p', 'xs', 1] }, { op: 'unset', path: ['p', 'xs', 0] }]],
    ['array grow -> set at the append index', ['p'], { xs: ['a'] }, { xs: ['a', 'b'] }, [{ op: 'set', path: ['p', 'xs', 1], value: 'b' }]],
    ['array element change -> one set', ['p'], { xs: [1, 2] }, { xs: [1, 9] }, [{ op: 'set', path: ['p', 'xs', 1], value: 9 }]],
    ['scalar -> object is one set of the subtree', ['p'], { v: 1 }, { v: { a: 1 } }, [{ op: 'set', path: ['p', 'v'], value: { a: 1 } }]],
    ['object -> scalar is one set', ['p'], { v: { a: 1 } }, { v: 3 }, [{ op: 'set', path: ['p', 'v'], value: 3 }]],
    ['explicit null pick -> set null (allowed only on purpose)', ['p'], {}, { v: null }, [{ op: 'set', path: ['p', 'v'], value: null }]],
    ['null -> value -> one set', ['p'], { v: null }, { v: 'x' }, [{ op: 'set', path: ['p', 'v'], value: 'x' }]],
    ['undefined counts as absent -> unset', ['p'], { v: 1 }, { v: undefined }, [{ op: 'unset', path: ['p', 'v'] }]],
    ['empty basePath yields root-relative paths', [], { a: 1 }, {}, [{ op: 'unset', path: ['a'] }]],
    ['string basePath splits on dots', 'providers.p', { a: 1 }, { a: 2 }, [{ op: 'set', path: ['providers', 'p', 'a'], value: 2 }]],
  ]

  for (const [label, base, before, after, expected] of cases) {
    test(label, () => {
      assert.deepEqual(diffOps(base, before, after), expected)
    })
  }

  test('a cleared field is unset, never set:null, in every removal shape', () => {
    const removals = [
      [{ a: 1 }, {}],
      [{ a: { b: 1, c: 2 } }, { a: { b: 1 } }],
      [{ xs: [1, 2] }, { xs: [] }],
      [{ xs: [1, 2] }, {}],
      [{ a: null }, {}],
    ]
    for (const [before, after] of removals) {
      const ops = diffOps(['p'], before, after)
      assert.ok(ops.length > 0)
      for (const op of ops) {
        assert.equal(op.op, 'unset', `removal produced ${JSON.stringify(op)}`)
        assert.equal(Object.prototype.hasOwnProperty.call(op, 'value'), false)
      }
    }
  })

  test('a deep round-trip replay reaches `after` exactly (no lost sibling)', () => {
    const before = {
      providers: {
        p: {
          timeoutMs: 5000,
          apiKeyEnv: 'OPENAI_KEY',
          models: [{ id: 'a', maxTokens: 10 }, { id: 'b' }],
          compat: { supportsStore: true, maxTokensField: 'max_tokens' },
        },
        q: { displayName: 'Q' },
      },
    }
    const after = {
      providers: {
        p: {
          apiKeyEnv: 'OPENAI_KEY',
          models: [{ id: 'a', maxTokens: 20 }],
          compat: { supportsStore: true, maxTokensField: 'max_tokens' },
          reasoning: 'high',
        },
        q: { displayName: 'Q' },
      },
    }
    const ops = diffOps([], before, after)
    assert.deepEqual(applyOps(structuredClone(before), ops), after)
    // `q` and the untouched compat fields produced nothing.
    assert.equal(ops.some((o) => o.path.join('.') === 'providers.q'), false)
    assert.equal(ops.some((o) => o.path.join('.') === 'providers.p.compat.supportsStore'), false)
  })

  test('inputs are never mutated', () => {
    const before = { a: { b: [1, 2, 3] }, c: 1 }
    const after = { a: { b: [1] }, d: 2 }
    const beforeCopy = structuredClone(before)
    const afterCopy = structuredClone(after)
    diffOps(['p'], before, after)
    assert.deepEqual(before, beforeCopy)
    assert.deepEqual(after, afterCopy)
  })

  test('emitted values are detached copies, not aliases of `after`', () => {
    const after = { a: { b: 1 } }
    const ops = diffOps(['p'], {}, after)
    ops[0].value.b = 99
    assert.equal(after.a.b, 1)
  })

  test('an array shrink emits indexes in splice-safe order on a real replay', () => {
    const before = { xs: ['a', 'b', 'c', 'd'] }
    const after = { xs: ['a', 'b'] }
    const ops = diffOps(['p'], before, after)
    assert.deepEqual(ops.map((o) => o.path[2]), [3, 2])
    // basePath `p` is where `before`/`after` live inside the document.
    assert.deepEqual(applyOps({ p: structuredClone(before) }, ops).p, after)
  })

  test('the six contract cases stay byte-identical', () => {
    assert.deepEqual(diffOps(['p'], { timeoutMs: 5000 }, {}), [{ op: 'unset', path: ['p', 'timeoutMs'] }])
    assert.deepEqual(diffOps(['p'], { timeoutMs: 1 }, { timeoutMs: 2 }), [{ op: 'set', path: ['p', 'timeoutMs'], value: 2 }])
    assert.deepEqual(diffOps(['p'], { a: { b: 1 } }, { a: { b: 1 } }), [])
    assert.deepEqual(diffOps(['p'], { a: 1, b: 2 }, { a: 1 }), [{ op: 'unset', path: ['p', 'b'] }])
    assert.deepEqual(diffOps(['p'], { xs: [1, 2, 3] }, { xs: [1] }), [
      { op: 'unset', path: ['p', 'xs', 2] },
      { op: 'unset', path: ['p', 'xs', 1] },
    ])
    assert.deepEqual(diffOps(['p'], {}, { v: null }), [{ op: 'set', path: ['p', 'v'], value: null }])
  })
})

// ---------------------------------------------------------------------------
// 2. staged form lifecycle
// ---------------------------------------------------------------------------
describe('createStagedForm', () => {
  test('starts clean with an empty op list', () => {
    const h = harness({ providers: { p: { timeoutMs: 5000 } } })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    const snapshot = form.getSnapshot()
    assert.deepEqual(snapshot.values, { providers: { p: { timeoutMs: 5000 } } })
    assert.equal(snapshot.dirty, false)
    assert.equal(snapshot.saving, false)
    assert.equal(snapshot.error, undefined)
    assert.deepEqual(snapshot.ops, [])
    assert.equal(form.dirty, false)
    assert.deepEqual(form.ops, [])
  })

  test('edit() stages a value; remove() clears it with unset, never null', () => {
    const h = harness({ providers: { p: { timeoutMs: 5000, apiKeyEnv: 'K' } } })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })

    form.edit(['providers', 'p', 'timeoutMs'], 9000)
    assert.equal(form.dirty, true)
    assert.deepEqual(form.ops, [{ op: 'set', path: ['providers', 'p', 'timeoutMs'], value: 9000 }])

    form.remove(['providers', 'p', 'apiKeyEnv'])
    assert.deepEqual(form.ops, [
      { op: 'set', path: ['providers', 'p', 'timeoutMs'], value: 9000 },
      { op: 'unset', path: ['providers', 'p', 'apiKeyEnv'] },
    ])
    assert.equal(form.ops.some((o) => o.op === 'set' && o.value === null), false)
  })

  test('edit(path, undefined) is a clear, identical to remove()', () => {
    const h = harness({ providers: { p: { timeoutMs: 5000 } } })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['providers', 'p', 'timeoutMs'], undefined)
    assert.deepEqual(form.ops, [{ op: 'unset', path: ['providers', 'p', 'timeoutMs'] }])
  })

  test('subscribe notifies on dirty transitions, not on identical re-edits', () => {
    const h = harness({ providers: { p: { timeoutMs: 5000 } } })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    let notifications = 0
    const unsubscribe = form.subscribe(() => {
      notifications += 1
    })

    form.edit(['providers', 'p', 'timeoutMs'], 9000)
    assert.equal(notifications, 1, 'dirty transition notified')

    form.edit(['providers', 'p', 'timeoutMs'], 9000)
    assert.equal(notifications, 1, 'no-op re-edit does not notify')

    form.edit(['providers', 'p', 'timeoutMs'], 5000)
    assert.equal(notifications, 2, 'returning to baseline notifies again')
    assert.equal(form.dirty, false)

    unsubscribe()
    form.edit(['providers', 'p', 'timeoutMs'], 1)
    assert.equal(notifications, 2, 'unsubscribe stops notifications')
  })

  test('getSnapshot() keeps a stable identity until something changes', () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    const first = form.getSnapshot()
    assert.equal(form.getSnapshot(), first)
    form.edit(['a'], 2)
    const second = form.getSnapshot()
    assert.notEqual(second, first)
    assert.equal(form.getSnapshot(), second)
  })

  test('save() succeeds: mutate once, expectedRevision pinned, baseline rolled forward', async () => {
    const h = harness({ providers: { p: { timeoutMs: 5000 } } }, 7)
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.remove(['providers', 'p', 'timeoutMs'])

    const result = await form.save()
    assert.equal(result, true)
    assert.equal(h.state.calls.length, 1, 'mutate called exactly once')
    assert.equal(h.state.calls[0].expectedRevision, 7, 'read revision passed through')
    assert.deepEqual(h.state.calls[0].ops, [{ op: 'unset', path: ['providers', 'p', 'timeoutMs'] }])
    assert.equal(h.state.calls[0].ops.some((o) => o.op === 'set' && o.value === null), false)

    const snapshot = form.getSnapshot()
    assert.equal(snapshot.dirty, false, 'baseline advanced, nothing left to save')
    assert.deepEqual(snapshot.ops, [])
    assert.equal(snapshot.saving, false)
    assert.equal(snapshot.error, undefined)

    // A second save has nothing to write, so mutate is still at one call.
    assert.equal(await form.save(), true)
    assert.equal(h.state.calls.length, 1)
  })

  test('save() adopts the revision the host reports for the next write', async () => {
    const h = harness({ a: 1 }, 7)
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['a'], 2)
    await form.save()
    assert.equal(h.state.revision, 8)
    form.edit(['a'], 3)
    await form.save()
    assert.equal(h.state.calls.length, 2)
    assert.equal(h.state.calls[1].expectedRevision, 8)
  })

  test('save() is a no-op without pending ops', async () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    assert.equal(await form.save(), true)
    assert.equal(h.state.calls.length, 0)
  })

  test('a SETTINGS_CONFLICT leaves the draft intact and does not advance the baseline', async () => {
    const h = harness({ providers: { p: { timeoutMs: 5000, apiKeyEnv: 'K' } } }, 7)
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['providers', 'p', 'timeoutMs'], 9000)
    const draftBefore = form.getSnapshot().values
    const opsBefore = form.ops

    // A concurrent edit lands: the host moves to revision 9 without our write.
    h.state.revision = 9
    h.state.conflict = true

    const result = await form.save()
    assert.equal(result, false)
    assert.equal(h.state.calls.length, 1, 'no blind retry')

    const snapshot = form.getSnapshot()
    assert.equal(snapshot.error?.code, 'SETTINGS_CONFLICT')
    assert.equal(snapshot.saving, false)
    assert.equal(snapshot.dirty, true, 'draft still pending')
    assert.deepEqual(snapshot.values, draftBefore, 'draft not clobbered')
    assert.deepEqual(snapshot.ops, opsBefore, 'the same ops are still pending')
    assert.equal(snapshot.stale, true, 'revision moved under us')
    assert.equal(h.state.calls[0].expectedRevision, 7, 'still fenced on the baseline revision')

    // The next explicit save still fences on the OLD baseline revision: the user
    // is forced to discard (re-read) rather than silently overwrite the peer.
    h.state.conflict = false
    await form.save()
    assert.equal(h.state.calls[1].expectedRevision, 7)
  })

  test('mutate() resolving false is treated as a rejected write, not a success', async () => {
    const h = harness({ a: 1 }, 3)
    h.state.reject = true
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['a'], 2)
    const result = await form.save()
    assert.equal(result, false)
    assert.equal(form.dirty, true, 'baseline not advanced')
    assert.ok(form.getSnapshot().error instanceof Error)
    assert.equal(form.getSnapshot().saving, false)
  })

  test('a throwing mutate() surfaces the error and keeps the draft', async () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({
      getSnapshot: h.getSnapshot,
      mutate: async () => {
        throw new Error('network down')
      },
    })
    form.edit(['a'], 2)
    assert.equal(await form.save(), false)
    assert.equal(form.getSnapshot().error.message, 'network down')
    assert.equal(form.dirty, true, 'baseline not advanced')
    assert.equal(form.getSnapshot().saving, false)
  })

  test('concurrent save() calls share one in-flight write', async () => {
    const h = harness({ a: 1 })
    let release
    const gate = new Promise((resolve) => {
      release = resolve
    })
    let calls = 0
    const form = createStagedForm({
      getSnapshot: h.getSnapshot,
      mutate: async () => {
        calls += 1
        await gate
        return true
      },
    })
    form.edit(['a'], 2)
    const first = form.save()
    const second = form.save()
    assert.equal(form.getSnapshot().saving, true)
    release()
    assert.equal(await first, true)
    assert.equal(await second, true)
    assert.equal(calls, 1, 'mutate called exactly once')
  })

  test('discard() drops the draft and re-reads the host baseline', async () => {
    const h = harness({ providers: { p: { timeoutMs: 5000 } } }, 7)
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['providers', 'p', 'timeoutMs'], 9000)
    form.remove(['providers', 'p'])

    // A peer commits a different tree while our draft is pending.
    h.state.values = { providers: { p: { timeoutMs: 1, displayName: 'peer' } } }
    h.state.revision = 11

    form.discard()
    const snapshot = form.getSnapshot()
    assert.equal(snapshot.dirty, false)
    assert.deepEqual(snapshot.values, { providers: { p: { timeoutMs: 1, displayName: 'peer' } } })
    assert.deepEqual(snapshot.ops, [])
    assert.equal(snapshot.stale, false)

    // The next write fences on the re-read revision, so it can succeed.
    form.edit(['providers', 'p', 'displayName'], 'mine')
    await form.save()
    assert.equal(h.state.calls[0].expectedRevision, 11)
  })

  test('reset(path) restores one subtree; reset() restores the whole draft', () => {
    const h = harness({ a: { b: 1 }, c: 2 })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })

    form.edit(['a', 'b'], 9)
    form.edit(['c'], 8)
    assert.equal(form.dirty, true)

    form.reset(['a'])
    assert.deepEqual(form.getSnapshot().values, { a: { b: 1 }, c: 8 })
    assert.deepEqual(form.ops, [{ op: 'set', path: ['c'], value: 8 }])

    form.reset()
    assert.equal(form.dirty, false)
    assert.deepEqual(form.getSnapshot().values, { a: { b: 1 }, c: 2 })
  })

  test('reset(path) on a key added by the draft removes that key', () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['newKey'], 'x')
    assert.deepEqual(form.ops, [{ op: 'set', path: ['newKey'], value: 'x' }])
    form.reset(['newKey'])
    assert.equal(form.dirty, false)
    assert.equal(Object.hasOwn(form.getSnapshot().values, 'newKey'), false)
  })

  test('refresh() adopts a moved revision without touching the draft', () => {
    const h = harness({ a: 1 }, 7)
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    form.edit(['a'], 2)
    assert.equal(form.getSnapshot().stale, false)
    h.state.revision = 12
    assert.equal(form.getSnapshot().stale, true)
    form.refresh()
    assert.deepEqual(form.getSnapshot().values, { a: 2 }, 'draft preserved')
    assert.equal(form.getSnapshot().stale, false, 'baseline revision re-read')
    assert.equal(form.dirty, true)
  })

  test('validation drives `invalid` and blocks nothing (the host stays authoritative)', async () => {
    const h = harness({ timeoutMs: 5000 })
    const form = createStagedForm({
      getSnapshot: h.getSnapshot,
      mutate: h.mutate,
      schema: (draft) => {
        if (typeof draft.timeoutMs !== 'number') throw new Error('timeoutMs must be a number')
      },
    })
    assert.equal(form.invalid, false)
    form.edit(['timeoutMs'], 9000)
    assert.equal(form.invalid, false)
    form.edit(['timeoutMs'], 'nope')
    assert.equal(form.invalid, true)
    assert.equal(form.getSnapshot().invalidText, 'timeoutMs must be a number')
    assert.equal((await form.save()), true, 'invalid is advisory; the host validates')
  })

  test('a schema object exposes validate() too', () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({
      getSnapshot: h.getSnapshot,
      mutate: h.mutate,
      schema: { validate: (draft) => (draft.a === 2 ? undefined : 'a must be 2') },
    })
    assert.equal(form.invalid, true, 'initial draft fails')
    form.edit(['a'], 2)
    assert.equal(form.invalid, false)
    assert.equal(form.getSnapshot().invalidText, undefined)
  })

  test('no schema means never invalid, and a hostile schema never throws out', () => {
    const h = harness({ a: 1 })
    const without = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })
    without.edit(['a'], 2)
    assert.equal(without.invalid, false)

    const hostile = createStagedForm({
      getSnapshot: h.getSnapshot,
      mutate: h.mutate,
      schema: () => {
        throw new Error('schema exploded')
      },
    })
    assert.doesNotThrow(() => hostile.getSnapshot())
    assert.equal(hostile.getSnapshot().invalid, true)
    assert.equal(hostile.getSnapshot().invalidText, 'schema exploded')
  })

  test('a caller with no mutate() gets a surfaced failure, not a crash', async () => {
    const h = harness({ a: 1 })
    const form = createStagedForm({ getSnapshot: h.getSnapshot })
    form.edit(['a'], 2)
    assert.equal(await form.save(), false)
    assert.match(form.getSnapshot().error.message, /mutate/)
    assert.equal(form.dirty, true)
  })

  test('getSnapshot() exposes values that are detached from the internal draft', () => {
    const h = harness({ a: { b: 1 } })
    const form = createStagedForm({ getSnapshot: h.getSnapshot, mutate: h.mutate })

    const first = form.getSnapshot()
    assert.deepEqual(first.values, { a: { b: 1 } })
    // Mutating the published tree must not rewrite the draft. (The snapshot
    // OBJECT is deliberately stable between changes — `useSyncExternalStore`
    // requires that identity — so consumers are handed a snapshot they read,
    // never write; the draft below is the thing that must stay isolated.)
    first.values.a.b = 99
    assert.deepEqual(form.ops, [], 'draft untouched by a consumer mutating the snapshot')
    assert.deepEqual(form.getSnapshot().values, { a: { b: 1 } })
  })

  test('accepts the ConfigFormController dialect (`value`, not `values`)', () => {
    const controller = { value: { a: 1 }, revision: 4 }
    const sent = []
    const form = createStagedForm({
      getSnapshot: () => controller,
      mutate: async (ops, revision) => {
        sent.push({ ops, revision })
        return true
      },
    })
    assert.deepEqual(form.getSnapshot().values, { a: 1 })
    form.edit(['a'], 2)
    return form.save().then(() => {
      assert.deepEqual(sent, [{ ops: [{ op: 'set', path: ['a'], value: 2 }], revision: 4 }])
      assert.equal(form.dirty, false)
    })
  })
})

// ---------------------------------------------------------------------------
// 3. the emitted grammar replayed through the host's own applyPathOp
// ---------------------------------------------------------------------------
const SETTINGS_SRC = '/tmp/asarx/out/dsh/node_modules/@deepseek-ai/dsh-settings/lib/index.js'
const hostAvailable = existsSync(SETTINGS_SRC)

describe('host op grammar (applyPathOp from the installed dsh-settings)', { skip: hostAvailable ? false : 'installed app not present' }, () => {
  const source = readFileSync(SETTINGS_SRC, 'utf8')
  const grab = (anchor) => {
    const start = source.indexOf(anchor)
    assert.ok(start >= 0, `missing ${anchor}`)
    let index = source.indexOf('{', start)
    let depth = 0
    for (let i = index; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1
      else if (source[i] === '}') {
        depth -= 1
        if (depth === 0) return source.slice(start, i + 1)
      }
    }
    throw new Error(`unbalanced ${anchor}`)
  }
  const host = new Function(
    `${[grab('function isPlainObject'), grab('function applyPathOp')].join('\n\n')}\nreturn { applyPathOp }`,
  )()

  const schema = {
    type: 'object',
    meta: {},
    dict: {
      providers: {
        type: 'dict',
        meta: {},
        inner: {
          type: 'object',
          meta: {},
          dict: {
            timeoutMs: { type: 'number', meta: {} },
            apiKeyEnv: { type: 'string', meta: {} },
            models: { type: 'array', meta: {}, inner: { type: 'object', meta: {}, dict: { id: { type: 'string', meta: {} } } } },
          },
        },
      },
    },
  }

  const applyAll = (section, ops) => ops.reduce((value, op) => host.applyPathOp(value, op, schema), section)

  test('a full staged diff replays to the draft through the host implementation', () => {
    const before = { providers: { p: { timeoutMs: 5000, apiKeyEnv: 'K', models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } }
    const after = { providers: { p: { apiKeyEnv: 'K2', models: [{ id: 'a' }] } } }

    const ops = diffOps([], before, after)
    assert.ok(ops.some((o) => o.op === 'unset') && ops.some((o) => o.op === 'set'))
    assert.deepEqual(applyAll(structuredClone(before), ops), after)
  })

  test('unset on an object key deletes it; unset on an array index splices', () => {
    const deleted = host.applyPathOp({ providers: { p: { timeoutMs: 5000, apiKeyEnv: 'X' } } }, { op: 'unset', path: ['providers', 'p', 'timeoutMs'] }, schema)
    assert.equal(Object.hasOwn(deleted.providers.p, 'timeoutMs'), false)
    assert.equal(deleted.providers.p.apiKeyEnv, 'X')

    const spliced = host.applyPathOp({ providers: { p: { models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } }, { op: 'unset', path: ['providers', 'p', 'models', '1'] }, schema)
    assert.deepEqual(spliced.providers.p.models, [{ id: 'a' }, { id: 'c' }])
  })

  test('array-shrink ops are splice-safe in our emitted order (and unsafe reversed)', () => {
    const before = { providers: { p: { models: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } } }
    const ops = diffOps([], before, { providers: { p: { models: [{ id: 'a' }] } } })
    assert.deepEqual(ops.map((o) => o.path[3]), [2, 1])
    assert.doesNotThrow(() => applyAll(structuredClone(before), ops))

    const reversed = [...ops].reverse()
    assert.throws(
      () => applyAll(structuredClone(before), reversed),
      /out of range/,
      'proves the high-to-low order is load bearing',
    )
  })

  test('set at index === length appends, which is how growth is expressed', () => {
    const grown = host.applyPathOp(
      { providers: { p: { models: [{ id: 'a' }] } } },
      { op: 'set', path: ['providers', 'p', 'models', '1'], value: { id: 'b' } },
      schema,
    )
    assert.deepEqual(grown.providers.p.models, [{ id: 'a' }, { id: 'b' }])
    const ops = diffOps([], { providers: { p: { models: [{ id: 'a' }] } } }, { providers: { p: { models: [{ id: 'a' }, { id: 'b' }] } } })
    assert.deepEqual(ops, [{ op: 'set', path: ['providers', 'p', 'models', 1], value: { id: 'b' } }])
  })

  test('array-shrink ops use only in-range indexes', () => {
    const before = { providers: { p: { models: [{ id: 'a' }, { id: 'b' }] } } }
    const after = { providers: { p: { models: [{ id: 'a' }] } } }
    const ops = diffOps([], before, after)
    assert.deepEqual(ops, [{ op: 'unset', path: ['providers', 'p', 'models', 1] }])
    // Only index 1 existed in the shrunk list; index 0 was never touched.
    for (const op of ops) {
      const index = op.path[op.path.length - 1]
      assert.ok(typeof index !== 'number' || index < before.providers.p.models.length, 'index in range')
    }
    // Replaying through the host must not raise the out-of-range TypeError.
    const replay = ops.reduce((value, op) => host.applyPathOp(value, op, schema), structuredClone(before))
    assert.deepEqual(replay, after)
  })
})
