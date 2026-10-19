/**
 * Test helper: the `lib/` files that emit `piai-*` class literals from
 * JavaScript.
 *
 * The frozen class list (`lib/client.styles.js`'s `CLASSES`) is checked
 * three-way: the exported list, the selectors in the stylesheet, and the class
 * literals the page *emits*. That third set used to be read from
 * `lib/client.js` + `lib/client.panels.js` by name, which stopped being a
 * complete answer the moment v10 split the page and the panels into chunks.
 *
 * So the list is derived from the directory instead: every `lib/client*.js`
 * except the stylesheet chunks (their `piai-*` occurrences are CSS selectors,
 * already covered by the stylesheet side of the comparison).
 *
 * @module dsh-llm-pi-ai-config/tests/helpers/class-sources
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'lib')

/** Every chunk whose CSS — not JS — carries class names. */
const CSS_CHUNK_PREFIXES = ['client.styles']

/**
 * The class-emitting JS chunks, sorted for a stable report.
 *
 * @returns `{name, source}[]`.
 */
export function jsClassSources() {
  return readdirSync(LIB)
    .filter((name) => name.startsWith('client') && name.endsWith('.js'))
    .filter((name) => !CSS_CHUNK_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .sort()
    .map((name) => ({ name, source: readFileSync(join(LIB, name), 'utf8') }))
}
