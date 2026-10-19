/**
 * Extended model configuration for `@deepseek-ai/dsh-llm-pi-ai`, node half.
 *
 * This half is intentionally empty. It exists so the package appears in the
 * host `cordis.yml` / Loader as a real entry, which is what lets the browser
 * half be discovered: the client module system scans Loader entries for
 * packages declaring `dsh.client` and serves their `exports["./client"]`
 * bundle. A package with no host half would never be scanned.
 *
 * All behaviour lives in `./client.js`. That page edits the configuration of
 * the `llm-pi-ai` entry through the official settings pipeline
 * (`ctx.configForms` -> `remote.settings.mutate` -> `ctx.configEditor`); this
 * package registers no settings namespace of its own and persists nothing by
 * itself.
 *
 * @module dsh-llm-pi-ai-config
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply() {}

export const name = 'dsh-llm-pi-ai-config'
