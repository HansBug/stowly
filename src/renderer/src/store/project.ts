import { create } from 'zustand'
import type { BackendClient, JobState, Presets } from '../lib/api'
import { demoProject, emptyProject, newId, type BinSpec, type ItemSpec, type Project, type Settings, type Unit } from '../lib/project'
import type { SolveResult } from '../lib/result'

export type Language = 'zh-CN' | 'en-US'

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
    const { project } = get()
    set({ solving: true, error: null, result: null })
    try {
      const started = await client.solve(project)
      set({ job: started })
      const finished = await client.waitForJob(started.id, 400, (state) => set({ job: state }))
      if (finished.status === 'done' && finished.result) set({ result: finished.result, selectedBin: 0 })
      else set({ error: finished.error ?? 'solve failed' })
      void client.forget(started.id).catch(() => undefined)
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    } finally {
      set({ solving: false })
    }
  }
}))
