import type { Project, Side } from './project'
import type { SolveResult } from './result'

export interface BackendInfo {
  baseUrl: string
  token: string
}

/** The stopping policy a solve runs with: the recommendation (source 'auto') or the manual values with the prediction alongside. */
export interface Budget {
  source: 'auto' | 'manual'
  timeLimit: number
  stopWhenUnimprovedFor?: number | null
  stopWhenUnimprovedAfter?: number | null
  stopWhenUnimprovedRatio?: number | null
  path: string
  /** Covered (upper) prediction of the first-solution time the budget is built on. */
  latency: number
  /** Median prediction of the same time: the comparison point for machine-speed calibration. */
  typicalLatency: number
  improvement: number
  alpha: number
  speed: number
  /** Set when an automatic single-pass run found nothing at its first limit and got a second attempt: the first limit. */
  extendedFrom?: number | null
}

export interface ProgressEvent {
  time: number
  items: number
  bins: number
  profit: number
  cost: number
  label: string
}

export interface Progress {
  startedAt: number
  elapsed: number
  events: ProgressEvent[]
}

export interface JobState {
  id: string
  status: 'running' | 'done' | 'failed'
  result?: SolveResult | null
  error?: string | null
  budget?: Budget | null
  progress?: Progress | null
}

export interface Presets {
  containers: PresetEntry[]
  items: PresetEntry[]
}

export type PresetLanguage = 'zh' | 'en' | 'ja'

export interface PresetEntry {
  id: string
  category: string
  name: Record<PresetLanguage, string>
  x: number
  y: number
  z: number
  maxWeight?: number | null
  weight?: number | null
  note?: Record<PresetLanguage, string>
  source: string
  openSides?: Side[]
}

export class BackendClient {
  // Stored as a closure on purpose: calling a bare `fetch` reference as a method makes `this` the client
  // and the browser throws "Illegal invocation".
  constructor(
    private readonly info: BackendInfo,
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { 'X-Stowly-Token': this.info.token, ...extra }
  }

  private async check(response: Response): Promise<Response> {
    if (response.ok) return response
    let detail = response.statusText
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (body && body.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      /* not JSON */
    }
    throw new Error(`${response.status}: ${detail}`)
  }

  async health(): Promise<{ status: string; backend: string; packingsolver3d: string; upstream: string }> {
    return (await this.check(await this.fetchImpl(`${this.info.baseUrl}/api/health`))).json()
  }

  async presets(): Promise<Presets> {
    return (await this.check(await this.fetchImpl(`${this.info.baseUrl}/api/presets`, { headers: this.headers() }))).json()
  }

  /** The budget a solve of this project would run with; 422 when the project has no container or no item. */
  async recommend(project: Project): Promise<Budget> {
    const response = await this.fetchImpl(`${this.info.baseUrl}/api/recommend`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(project) })
    return (await this.check(response)).json()
  }

  async solve(project: Project): Promise<JobState> {
    const response = await this.fetchImpl(`${this.info.baseUrl}/api/solve`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(project) })
    return (await this.check(response)).json()
  }

  async job(id: string): Promise<JobState> {
    return (await this.check(await this.fetchImpl(`${this.info.baseUrl}/api/jobs/${id}`, { headers: this.headers() }))).json()
  }

  async forget(id: string): Promise<void> {
    await this.check(await this.fetchImpl(`${this.info.baseUrl}/api/jobs/${id}`, { method: 'DELETE', headers: this.headers() }))
  }

  /** Poll a job until it leaves the running state. */
  async waitForJob(id: string, intervalMs = 400, onTick?: (state: JobState) => void): Promise<JobState> {
    for (;;) {
      const state = await this.job(id)
      onTick?.(state)
      if (state.status !== 'running') return state
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  async importFiles(files: { name: string; data: ArrayBuffer }[], unit: string, instanceIndex = 0): Promise<Project> {
    const form = new FormData()
    for (const file of files) form.append('files', new Blob([file.data]), file.name)
    form.append('unit', unit)
    form.append('instanceIndex', String(instanceIndex))
    const response = await this.fetchImpl(`${this.info.baseUrl}/api/import`, { method: 'POST', headers: this.headers(), body: form })
    return (await this.check(response)).json()
  }

  async exportPlacements(project: Project, result: SolveResult): Promise<string> {
    const response = await this.fetchImpl(`${this.info.baseUrl}/api/export/placements`, { method: 'POST', headers: this.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ project, result }) })
    return (await this.check(response)).text()
  }
}
