/**
 * Snapshot the `llm-pi-ai` settings-form schema envelope for offline tests.
 *
 * The browser half of this plugin never hardcodes field names: it walks the
 * schema envelope that the host settings pipeline already sends to the client.
 * That envelope is `volatileForm(Config).toJSON()` — a Schemastery
 * `{ uid, refs }` graph, *not* the JSON Schema 2020-12 document the
 * `Config.listConfigs` inspect query returns. Tests need the real thing, so this
 * script reproduces the host projection byte for byte:
 *
 *   plainSchema / volatileForm  (dsh-settings `lib/index.js`)
 *   Schema.prototype.toJSON     (@deepseek-ai/schemastery `lib/index.mjs`)
 *
 * Usage:
 *   node scripts/snapshot-schema.mjs [--out <file>] [--search <dir>]...
 *
 * `--search` is a directory that resolves `@deepseek-ai/schemastery` and
 * `@deepseek-ai/dsh-llm-pi-ai`; it may be repeated, and one directory may
 * satisfy both packages. Without `--search` the script tries, in order:
 *
 *   1. `DSH_APP_NODE_MODULES` (path-delimiter separated; explicit override);
 *   2. `$DSH_PROFILE_DIR/node_modules`;
 *   3. `$DSH_HOME/profiles/<profile>/node_modules`;
 *   4. `<app.asar>.unpacked/dsh/node_modules`;
 *   5. `<app.asar>/dsh/node_modules` (unreadable by plain Node — see below).
 *
 * The app's real dependencies ship INSIDE `app.asar`, which plain Node cannot
 * traverse, and the `.unpacked` sibling only carries unpacked (mostly native)
 * files. So on a stock install the default search legitimately cannot satisfy
 * both packages; the failure prints the exact extraction command to run.
 * `tests/fixtures/llm-pi-ai.schema.json` is the source of truth for the suite —
 * regeneration is a maintainer step, not part of `node --test`.
 *
 * No network access, no third-party dependency (this repo is deliberately
 * dependency-free), and no writes outside `--out`.
 *
 * @module dsh-llm-pi-ai-config/scripts/snapshot-schema
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The desktop app bundle; its `dsh/node_modules` carries the real packages. */
const APP_ASAR = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar'

/** Packages this script must be able to import, in resolution order. */
const REQUIRED_PACKAGES = ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-llm-pi-ai']

const USAGE = `usage: node scripts/snapshot-schema.mjs [--out <file>] [--search <dir>]...

  --out <file>     where to write the envelope
                   (default: tests/fixtures/llm-pi-ai.schema.json)
  --search <dir>   a directory that resolves @deepseek-ai/schemastery and
                   @deepseek-ai/dsh-llm-pi-ai; repeatable
  DSH_APP_NODE_MODULES   extra default search directories (path-delimiter
                   separated) for maintainers/CI with a readable extraction
`

/**
 * The ordered default search list.
 *
 * @param env - environment to read (injectable for tests).
 * @returns candidate base directories, de-duplicated.
 */
function defaultSearch(env = process.env) {
  const candidates = []
  const add = (dir) => {
    if (typeof dir !== 'string' || dir === '') return
    if (candidates.indexOf(dir) === -1) candidates.push(dir)
  }

  // 1. Explicit override first: CI and maintainers can point at a readable copy.
  for (const entry of String(env.DSH_APP_NODE_MODULES ?? '').split(delimiter)) add(entry)

  // 2. The profile's own node_modules (where schemastery resolves today).
  if (env.DSH_PROFILE_DIR) add(join(env.DSH_PROFILE_DIR, 'node_modules'))

  // 3. The same directory expressed through DSH_HOME, for a different profile.
  const profile =
    env.DSH_PROFILE || (env.DSH_PROFILE_DIR ? basename(env.DSH_PROFILE_DIR) : '')
  if (env.DSH_HOME && profile !== '') {
    add(join(env.DSH_HOME, 'profiles', profile, 'node_modules'))
  }

  // 4/5. The app's unpacked and archived node_modules.
  add(join(`${APP_ASAR}.unpacked`, 'dsh', 'node_modules'))
  add(join(APP_ASAR, 'dsh', 'node_modules'))

  return candidates
}

/**
 * Resolve a package entry point from any directory that can see it.
 *
 * @param search - candidate base directories.
 * @param specifier - package (and optional subpath) to resolve.
 * @returns `{url, base}`, or `undefined` when no candidate can see it.
 */
function resolveFrom(search, specifier) {
  for (const base of search) {
    if (!existsSync(base)) continue
    try {
      const require = createRequire(join(base, 'package.json'))
      return { url: pathToFileURL(require.resolve(specifier)).href, base }
    } catch {
      // Try the next candidate base.
    }
  }
  return undefined
}

/**
 * The failure a maintainer actually needs: what is missing, why the default
 * cannot find it, and the runnable remedy.
 *
 * @param search - the directories that were tried, in order.
 * @param missing - the packages none of them could resolve.
 * @returns an Error whose message is the whole report.
 */
function resolutionError(search, missing) {
  return new Error(
    [
      `snapshot-schema: cannot resolve ${missing.join(' and ')}`,
      '',
      '  searched (in order):',
      ...search.map((dir) => `    - ${dir}`),
      '',
      '  why: the adapter and its dependencies ship INSIDE the app archive, and',
      '  plain Node cannot read a directory inside an asar. The app.asar.unpacked',
      '  sibling only carries unpacked (mostly native) files, so it normally lacks',
      '  @deepseek-ai/schemastery and @deepseek-ai/dsh-llm-pi-ai.',
      `    archive: ${APP_ASAR}`,
      '',
      '  fix (maintainer, one-time): extract the archive, then point the script at it',
      `    npx @electron/asar extract "${APP_ASAR}" /tmp/dsh-asar`,
      '    node scripts/snapshot-schema.mjs --search /tmp/dsh-asar/dsh/node_modules',
      '',
      "  or point at any readable copy of the app's node_modules:",
      '    DSH_APP_NODE_MODULES=/path/to/dsh/node_modules node scripts/snapshot-schema.mjs',
      '',
      '  --search may be repeated, and one directory may satisfy both packages.',
    ].join('\n'),
  )
}

/** Mirror of dsh-settings `plainSchema`: rehydrate, then drop `volatile`. */
function plainSchema(Schema, schema, redact) {
  const result = new Schema(schema.toJSON())
  const walk = (node) => {
    if (node === undefined || node === null || typeof node !== 'object') return
    if (node.meta !== undefined) {
      delete node.meta.volatile
      if (node.meta.role === 'secret') {
        delete node.meta.default
        delete node.meta.required
      } else if (node.meta.default !== undefined) {
        node.meta.default = redact(node, node.meta.default)
      }
    }
    for (const child of Object.values(node.dict ?? {})) walk(child)
    if (node.inner) walk(node.inner)
    for (const child of node.list ?? []) walk(child)
  }
  walk(result)
  return result
}

/**
 * Mirror of dsh-settings `volatileForm`: keep only fields a live write can
 * reach, so the client form never offers a field the host would reject.
 */
function volatileForm(Schema, schema, redact) {
  if (schema.meta.volatile) return plainSchema(Schema, schema, redact)
  if (schema.type !== 'object') return undefined
  const dict = {}
  for (const [key, child] of Object.entries(schema.dict ?? {})) {
    const field = volatileForm(Schema, child, redact)
    if (field !== undefined) dict[key] = field
  }
  return Object.keys(dict).length === 0 ? undefined : Schema.object(dict)
}

/** Identity redaction: this plugin's own snapshot carries no secrets. */
const noRedaction = (_node, value) => value

/**
 * Build the envelope the browser half receives.
 *
 * @param search - directories to resolve packages from; the default list is
 *   used when omitted.
 * @returns `{envelope, schema, resolvedFrom}`.
 */
export async function snapshot(search) {
  const base = search ?? defaultSearch()
  const missing = REQUIRED_PACKAGES.filter(
    (specifier) => resolveFrom(base, specifier) === undefined,
  )
  if (missing.length > 0) throw resolutionError(base, missing)

  const schemaResolved = resolveFrom(base, '@deepseek-ai/schemastery')
  const adapterResolved = resolveFrom(base, '@deepseek-ai/dsh-llm-pi-ai')
  const Schema = (await import(schemaResolved.url)).default
  const { Config } = await import(adapterResolved.url)
  if (Config === undefined) throw new Error('snapshot-schema: llm-pi-ai exports no Config schema')
  const form = volatileForm(Schema, Config, noRedaction)
  if (form === undefined) throw new Error('snapshot-schema: no live-editable field was projected')
  return {
    envelope: form.toJSON(),
    schema: Schema,
    resolvedFrom: { schemastery: schemaResolved.base, adapter: adapterResolved.base },
  }
}

/** Command-line entry. */
async function main(argv) {
  let out = join(process.cwd(), 'tests', 'fixtures', 'llm-pi-ai.schema.json')
  let search
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(USAGE)
      return
    }
    if (flag !== '--out' && flag !== '--search') continue
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`snapshot-schema: ${flag} needs a path`)
    }
    i += 1
    if (flag === '--out') out = resolve(value)
    else (search ??= []).push(resolve(value))
  }
  const { envelope, resolvedFrom } = await snapshot(search)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify(envelope, undefined, 2)}\n`)
  const uids = Object.keys(envelope.refs ?? {})
  process.stdout.write(
    `snapshot-schema: wrote ${out} (uid ${envelope.uid}, ${uids.length} nodes)\n` +
      `snapshot-schema: @deepseek-ai/schemastery <- ${resolvedFrom.schemastery}\n` +
      `snapshot-schema: @deepseek-ai/dsh-llm-pi-ai <- ${resolvedFrom.adapter}\n`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    // Print the report without a stack: the message is the actionable part.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
