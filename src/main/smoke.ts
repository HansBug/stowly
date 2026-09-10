/**
 * Self-test of a packaged build (`stowly --smoke[=report.json]`): does the bundled interpreter start, does the HTTP API answer,
 * does a small solve finish, does the renderer load and reach the backend? The Build Desktop workflow runs it on every
 * platform in an environment without Python or Node, so anything that only works on a developer machine fails here.
 */
import type { BackendInfo, PythonLocation } from './backend'

export interface SmokeReport {
  ok: boolean
  python: string
  backend: BackendInfo | null
  startupError: string | null
  health?: unknown
  presets?: { containers: number; items: number }
  solve?: { status: string; value: number | null; bins: number; placements: number; seconds: number }
  renderer?: boolean
  errors: string[]
  log: string[]
}

export const SMOKE_PROJECT = {
  schema: 'stowly/1', name: 'smoke', unit: 'mm',
  bins: [{ id: 'bin', name: 'crate', x: 100, y: 100, z: 100, copies: 5, cost: 10, maxWeight: null }],
  items: [
    { id: 'a', name: 'A', x: 20, y: 30, z: 40, copies: 6, weight: null, profit: null, rotations: 'all' },
    { id: 'b', name: 'B', x: 15, y: 15, z: 15, copies: 4, weight: 1.5, profit: null, rotations: 'fixed' }
  ],
  settings: { solver: 'box', objective: 'bin-packing', timeLimit: 2, optimizationMode: 'not-anytime-deterministic' }
}

export interface SmokeOptions {
  info: BackendInfo | null
  startupError: string | null
  log: string[]
  location: PythonLocation
  /** Resolves true once the renderer shows the app and has received the presets from the backend. */
  renderer: () => Promise<boolean>
  /** Called when the renderer check fails: what the window shows and what its console said, for the report. */
  rendererDetail?: () => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
}

export async function smokeTest(opts: SmokeOptions): Promise<SmokeReport> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const timeoutMs = opts.timeoutMs ?? 60000
  const report: SmokeReport = { ok: false, python: opts.location.command, backend: opts.info, startupError: opts.startupError, errors: [], log: opts.log.slice(-30) }
  const fail = (message: string) => { report.errors.push(message) }
  if (!opts.info) {
    fail(`backend did not start: ${opts.startupError ?? 'no error recorded'}`)
    return report
  }
  const headers = { 'X-Stowly-Token': opts.info.token, 'Content-Type': 'application/json' }
  const call = async (path: string, init?: RequestInit) => {
    const response = await fetchImpl(`${opts.info!.baseUrl}${path}`, init)
    if (!response.ok) throw new Error(`${path} -> ${response.status}`)
    return response.json()
  }
  try {
    report.health = await call('/api/health')
    if ((report.health as { status?: string }).status !== 'ok') fail(`health: ${JSON.stringify(report.health)}`)
  } catch (err) { fail(`health: ${(err as Error).message}`) }
  try {
    const presets = (await call('/api/presets', { headers })) as { containers: unknown[]; items: unknown[] }
    report.presets = { containers: presets.containers.length, items: presets.items.length }
    if (!presets.containers.length || !presets.items.length) fail('presets: empty')
  } catch (err) { fail(`presets: ${(err as Error).message}`) }
  try {
    const started = Date.now()
    const job = (await call('/api/solve', { method: 'POST', headers, body: JSON.stringify(SMOKE_PROJECT) })) as { id: string; status: string }
    let state = job as { status: string; result?: { status: string; value: number | null; bins: { placements: unknown[] }[] } | null; error?: string | null }
    while (state.status === 'running') {
      if (Date.now() - started > timeoutMs) throw new Error(`job still running after ${timeoutMs} ms`)
      await sleep(250)
      state = (await call(`/api/jobs/${job.id}`, { headers })) as typeof state
    }
    if (state.status !== 'done' || !state.result) throw new Error(`job ${state.status}: ${state.error ?? 'no result'}`)
    const placements = state.result.bins.reduce((sum, bin) => sum + bin.placements.length, 0)
    report.solve = { status: state.result.status, value: state.result.value, bins: state.result.bins.length, placements, seconds: (Date.now() - started) / 1000 }
    if (!['optimal', 'feasible'].includes(state.result.status)) fail(`solve status ${state.result.status}`)
    if (placements !== 10) fail(`solve placed ${placements} of 10 items`)
  } catch (err) { fail(`solve: ${(err as Error).message}`) }
  try {
    report.renderer = await opts.renderer()
    if (!report.renderer) {
      const detail = opts.rendererDetail ? await opts.rendererDetail().catch((err: Error) => `detail unavailable: ${err.message}`) : ''
      fail(`renderer did not show the app with presets loaded${detail ? `: ${detail}` : ''}`)
    }
  } catch (err) { fail(`renderer: ${(err as Error).message}`) }
  report.ok = report.errors.length === 0
  return report
}
