/**
 * Test helper: build the real `lib/client.core.js` against one react/primitives
 * pair.
 *
 * v10 split the shared base (pure helpers, `isComponent`, the primitives
 * resolution and every local stand-in) out of the owner and the panels chunk
 * into `lib/client.core.js`, which the owner loads in phase 0. Harnesses that
 * stub the chunk map for `makePage(chunks)` still need a real `core` entry, so
 * they build it here from the shipped bytes rather than hand-rolling a stub —
 * the primitives fallbacks (e.g. a bundle without `CodeBlock`) are exactly what
 * several of those tests assert.
 *
 * @module dsh-llm-pi-ai-config/tests/helpers/load-core
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, runInContext } from 'node:vm'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib')

/**
 * Run the shipped core chunk in a fresh context and materialise its factory.
 *
 * @param react - the harness's react stand-in.
 * @param primitives - the harness's primitives bundle (may omit exports).
 * @returns the built core API (`{...helpers, ui}`).
 */
export function loadCore(react, primitives) {
  const registrations = []
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    Promise,
    Object,
    Array,
    JSON,
    Number,
    String,
    Boolean,
    Error,
    TypeError,
    Symbol,
    Set,
    Map,
    Date,
    RegExp,
    Math,
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  sandbox.__ModuleLoader__ = { registrations, load: (entry) => registrations.push(entry) }
  createContext(sandbox)

  const require = (specifier) => {
    if (specifier === 'react') return react
    if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error(`load-core helper: unexpected require(${JSON.stringify(specifier)})`)
  }

  const file = join(LIB, 'client.core.js')
  runInContext(readFileSync(file, 'utf8'), sandbox, { filename: file })
  const registration = registrations[0]
  if (registration === undefined) throw new Error('load-core helper: core registered nothing')
  return registration.factory(require)
}
