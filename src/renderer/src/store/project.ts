import { create } from 'zustand'
import type { BackendClient, Budget, JobState, Presets } from '../lib/api'
import { demoProject, emptyProject, newId, type BinSpec, type ItemSpec, type Project, type Settings, type Unit } from '../lib/project'
import type { SolveResult } from '../lib/result'

export type Language = 'zh-CN' | 'en-US'

/** Machine speed relative to packingsolver3d's reference machine, learnt from the first-solution time of every solve. */
export interface Calibration {
  speed: number
  samples: number
}

export const CALIBRATION_KEY = 'stowly.calibration'
const CALIBRATION_WEIGHT = 0.3
const SPEED_BOUNDS: [number, number] = [0.2, 5]

export interface StowlyState {
  project: Project
  result: SolveResult | null
  job: JobState | null
  solving: boolean
  error: string | null
  presets: Presets | null
  language: Language
  selectedBin: number
  dirty: boolean
  /** The budget the backend would solve the current project with; refreshed when the project changes. */
  recommendation: Budget | null
  calibration: Calibration
  refreshRecommendation: (client: BackendClient) => Promise<void>
  resetCalibration: () => void
  setLanguage: (language: Language) => void
  setProject: (project: Project) => void
  newProject: () => void
  loadDemo: () => void
  setName: (name: string) => void
  setUnit: (unit: Unit) => void
  updateSettings: (patch: Partial<Settings>) => void
  addBin: (bin?: Partial<BinSpec>) => void
  updateBin: (id: string, patch: Partial<BinSpec>) => void
  removeBin: (id: string) => void
  addItem: (item?: Partial<ItemSpec>) => void
  updateItem: (id: string, patch: Partial<ItemSpec>) => void
  removeItem: (id: string) => void
  mergeImport: (imported: Project) => void
  setPresets: (presets: Presets) => void
  setResult: (result: SolveResult | null) => void
  setSelectedBin: (index: number) => void
  setError: (error: string | null) => void
  solve: (client: BackendClient) => Promise<void>
}

const initialCalibration = (): Calibration => {
  try {
    const saved = JSON.parse(localStorage.getItem(CALIBRATION_KEY) ?? 'null') as Partial<Calibration> | null
    if (saved && typeof saved.speed === 'number' && saved.speed > 0 && typeof saved.samples === 'number') return { speed: saved.speed, samples: saved.samples }
  } catch {
    /* storage unavailable or corrupt */
  }
  return { speed: 1, samples: 0 }
}

const storeCalibration = (calibration: Calibration): void => {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration))
  } catch {
    /* storage unavailable */
  }
}

/** Fold one observed first-solution time into the speed estimate: speed = predicted latency / observed, smoothed and clamped. */
export function calibrate(current: Calibration, predictedLatency: number, observedFirstSolution: number): Calibration {
  if (!(predictedLatency > 0) || !(observedFirstSolution > 0.05)) return current
  const observed = Math.min(Math.max(predictedLatency / observedFirstSolution, SPEED_BOUNDS[0]), SPEED_BOUNDS[1])
  const speed = current.samples === 0 ? observed : current.speed + CALIBRATION_WEIGHT * (observed - current.speed)
  return { speed: Number(speed.toFixed(3)), samples: current.samples + 1 }
}

/** The project as sent to the backend: the machine speed travels inside the settings. */
export function requestProject(project: Project, calibration: Calibration): Project {
  return { ...project, settings: { ...project.settings, speed: calibration.speed } }
}

const initialLanguage = (): Language => {
  try {
    const saved = localStorage.getItem('stowly.language')
    if (saved === 'en-US' || saved === 'zh-CN') return saved
  } catch {
    /* storage unavailable */
  }
  return 'zh-CN'
}

export const useStowly = create<StowlyState>((set, get) => ({
  project: emptyProject(),
  result: null,
  job: null,
  solving: false,
  error: null,
  presets: null,
  language: initialLanguage(),
  selectedBin: 0,
  dirty: false,
  recommendation: null,
  calibration: initialCalibration(),
  refreshRecommendation: async (client) => {
    const { project, calibration } = get()
    if (!project.bins.length || !project.items.length) {
      set({ recommendation: null })
      return
    }
    try {
      const recommendation = await client.recommend(requestProject(project, calibration))
      // the project may have changed while the request was in flight; a later refresh will overwrite this one
      set({ recommendation })
    } catch {
      set({ recommendation: null })
    }
  },
  resetCalibration: () => {
    const calibration = { speed: 1, samples: 0 }
    storeCalibration(calibration)
    set({ calibration })
  },
  setLanguage: (language) => {
    try {
      localStorage.setItem('stowly.language', language)
    } catch {
      /* storage unavailable */
    }
    set({ language })
  },
  setProject: (project) => set({ project, result: null, job: null, selectedBin: 0, dirty: false, error: null }),
  newProject: () => get().setProject(emptyProject()),
  loadDemo: () => get().setProject(demoProject()),
  setName: (name) => set((s) => ({ project: { ...s.project, name }, dirty: true })),
  setUnit: (unit) => set((s) => ({ project: { ...s.project, unit }, dirty: true })),
  updateSettings: (patch) => set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ...patch } }, dirty: true })),
  addBin: (bin = {}) =>
    set((s) => ({ project: { ...s.project, bins: [...s.project.bins, { id: newId('bin'), name: '', x: 1200, y: 800, z: 1000, copies: 1, openSides: ['x-max'], ...bin }] }, dirty: true })),
  updateBin: (id, patch) => set((s) => ({ project: { ...s.project, bins: s.project.bins.map((b) => (b.id === id ? { ...b, ...patch } : b)) }, dirty: true })),
  removeBin: (id) => set((s) => ({ project: { ...s.project, bins: s.project.bins.filter((b) => b.id !== id) }, dirty: true })),
  addItem: (item = {}) =>
    set((s) => ({ project: { ...s.project, items: [...s.project.items, { id: newId('item'), name: '', x: 400, y: 300, z: 300, copies: 10, rotations: 'all', group: 0, ...item }] }, dirty: true })),
  updateItem: (id, patch) => set((s) => ({ project: { ...s.project, items: s.project.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }, dirty: true })),
  removeItem: (id) => set((s) => ({ project: { ...s.project, items: s.project.items.filter((i) => i.id !== id) }, dirty: true })),
  // A complete instance (containers and cargo) replaces the project; a plain cargo or container list is appended to it.
  mergeImport: (imported) =>
    set((s) => {
      const complete = imported.bins.length > 0 && imported.items.length > 0
      const project = complete
        ? { ...s.project, name: imported.name || s.project.name, bins: imported.bins, items: imported.items, settings: imported.settings }
        : { ...s.project, bins: [...s.project.bins, ...imported.bins], items: [...s.project.items, ...imported.items] }
      return { project, result: null, dirty: true }
    }),
  setPresets: (presets) => set({ presets }),
  setResult: (result) => set({ result, selectedBin: 0 }),
  setSelectedBin: (selectedBin) => set({ selectedBin }),
  setError: (error) => set({ error }),
  solve: async (client) => {
    const { project, calibration } = get()
    set({ solving: true, error: null, result: null, job: null })
    try {
      const started = await client.solve(requestProject(project, calibration))
      set({ job: started })
      const finished = await client.waitForJob(started.id, 250, (state) => set({ job: state }))
      if (finished.status === 'done' && finished.result) {
        set({ result: finished.result, selectedBin: 0 })
        if (finished.budget && finished.result.firstSolutionTime != null) {
          const updated = calibrate(get().calibration, finished.budget.latency * finished.budget.speed, finished.result.firstSolutionTime)
          storeCalibration(updated)
          set({ calibration: updated })
        }
      } else set({ error: finished.error ?? 'solve failed' })
      void client.forget(started.id).catch(() => undefined)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ solving: false })
    }
  }
}))
