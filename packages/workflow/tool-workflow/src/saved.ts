/**
 * Deployment-owned saved workflows: each one is a `<name>.meta.json` file and a
 * `<name>.js` script body in a configured directory. These are Host files read
 * with `node:fs`, because `ctx.fs` addresses a Session's execution world.
 * @module @deepseek-ai/dsh-tool-workflow/saved
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { validateMeta } from '@deepseek-ai/dsh-workflow'
import type { WorkflowMeta } from '@deepseek-ai/dsh-workflow'

const META_SUFFIX = '.meta.json'

/** One saved workflow's load-time catalog entry. */
export interface SavedWorkflow {
  /** Identity block validated when the plugin loaded. */
  readonly meta: WorkflowMeta
  /** Absolute path of the script body, read again for every launch. */
  readonly scriptPath: string
}

/** A saved workflow's script body as read for one launch. */
export interface SavedWorkflowScript {
  readonly script: string
  /** Lowercase hexadecimal SHA-256 of the script's UTF-8 bytes. */
  readonly scriptSha256: string
}

async function requireDirectory(dir: string): Promise<void> {
  const info = await stat(dir).catch((cause: unknown) => {
    throw new Error(`tool-workflow: workflowDirs entry ${dir} cannot be read`, { cause })
  })
  if (!info.isDirectory()) throw new Error(`tool-workflow: workflowDirs entry ${dir} is not a directory`)
}

async function requireScriptFile(scriptPath: string, metaPath: string): Promise<void> {
  const info = await stat(scriptPath).catch((cause: unknown) => {
    throw new Error(`tool-workflow: ${metaPath} has no script at ${scriptPath}`, { cause })
  })
  if (!info.isFile()) throw new Error(`tool-workflow: ${scriptPath} is not a file`)
}

async function readMeta(metaPath: string): Promise<WorkflowMeta> {
  try {
    return validateMeta(JSON.parse(await readFile(metaPath, 'utf8')))
  } catch (cause: unknown) {
    throw new Error(`tool-workflow: invalid saved workflow ${metaPath}: ${String(cause)}`, { cause })
  }
}

/**
 * Load the saved-workflow catalog in name order.
 * @param dirs - configured directories; relative entries resolve against the process working directory.
 * @returns the catalog keyed by workflow name.
 * @throws when a directory is unreadable, a meta file is invalid or lacks its script,
 *   a file name differs from `meta.name`, or two directories define one name.
 */
export async function loadSavedWorkflows(dirs: readonly string[]): Promise<ReadonlyMap<string, SavedWorkflow>> {
  const found: [string, SavedWorkflow][] = []
  const seen = new Map<string, string>()
  for (const configured of dirs) {
    const dir = resolve(configured)
    await requireDirectory(dir)
    for (const entry of await readdir(dir)) {
      if (!entry.endsWith(META_SUFFIX)) continue
      const stem = entry.slice(0, -META_SUFFIX.length)
      const metaPath = join(dir, entry)
      const scriptPath = join(dir, `${stem}.js`)
      await requireScriptFile(scriptPath, metaPath)
      const meta = await readMeta(metaPath)
      if (meta.name !== stem) {
        throw new Error(`tool-workflow: ${metaPath} declares name "${meta.name}"; a saved workflow's name must match its file name`)
      }
      const previous = seen.get(stem)
      if (previous !== undefined) {
        throw new Error(`tool-workflow: saved workflow "${stem}" is defined in both ${previous} and ${dir}`)
      }
      seen.set(stem, dir)
      found.push([stem, { meta, scriptPath }])
    }
  }
  found.sort(([left], [right]) => (left < right ? -1 : 1))
  return new Map(found)
}

/**
 * Read a saved workflow's current script body for one launch.
 * @param saved - the catalog entry.
 * @returns the script and the digest of the exact text that will run.
 * @throws when the file can no longer be read.
 */
export async function readSavedScript(saved: SavedWorkflow): Promise<SavedWorkflowScript> {
  const script = await readFile(saved.scriptPath, 'utf8').catch((cause: unknown) => {
    throw new Error(`saved workflow "${saved.meta.name}" could not be read from ${saved.scriptPath}`, { cause })
  })
  return { script, scriptSha256: createHash('sha256').update(script, 'utf8').digest('hex') }
}

/**
 * Render the prompt listing of a non-empty catalog. Fields come from the
 * load-time catalog, so the text stays prefix-stable while the plugin lives.
 * @param saved - the catalog in name order.
 * @returns one line per workflow.
 */
export function renderSavedWorkflowList(saved: ReadonlyMap<string, SavedWorkflow>): string {
  return [...saved.values()]
    .map(({ meta }) => `- ${meta.name}: ${meta.description}${meta.whenToUse === undefined ? '' : ` ${meta.whenToUse}`}`)
    .join('\n')
}
