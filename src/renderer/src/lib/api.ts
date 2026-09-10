import type { Project } from './project'
import type { SolveResult } from './result'

export interface BackendInfo {
  baseUrl: string
  token: string
}

export interface JobState {
  id: string
  status: 'running' | 'done' | 'failed'
  result?: SolveResult | null
  error?: string | null
}

export interface Presets {
  containers: PresetEntry[]
  items: PresetEntry[]
}

export interface PresetEntry {
  id: string
  category: string
  name: { zh: string; en: string }
  x: number
  y: number
  z: number
  maxWeight?: number | null
  weight?: number | null
  note?: { zh: string; en: string }
  source: string
}

export class BackendClient {
  constructor(private readonly info: BackendInfo, private readonly fetchImpl: typeof fetch = fetch) {}

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
