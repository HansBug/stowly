/** Project model of the renderer (mirrors backend/stowly_backend/models.py). Lengths are stored in millimetres. */

export type Rotations = 'all' | 'upright' | 'fixed'
export type Solver = 'box' | 'boxstacks'
export type Objective = 'bin-packing' | 'knapsack' | 'variable-sized-bin-packing'
export type OptimizationMode = 'anytime' | 'not-anytime' | 'not-anytime-deterministic' | 'not-anytime-sequential'
export type Unit = 'mm' | 'cm' | 'm' | 'in'

export interface BinSpec {
  id: string
  name: string
  x: number
  y: number
  z: number
  copies: number
  cost?: number | null
  maxWeight?: number | null
}

export interface ItemSpec {
  id: string
  name: string
  x: number
  y: number
  z: number
  copies: number
  weight?: number | null
  profit?: number | null
  rotations: Rotations
  color?: string | null
}

export interface Settings {
  solver: Solver
  objective: Objective
  timeLimit: number
  optimizationMode: OptimizationMode
}

export interface Project {
  schema: string
  name: string
  unit: Unit
  bins: BinSpec[]
  items: ItemSpec[]
  settings: Settings
}

export const SCHEMA = 'stowly/1'
export const UNIT_TO_MM: Record<Unit, number> = { mm: 1, cm: 10, m: 1000, in: 25.4 }

let counter = 0
/** Ids only have to be unique inside one project; a short prefix keeps them readable in tables. */
export function newId(prefix: string): string {
  counter += 1
  return `${prefix}-${Date.now().toString(36)}-${counter}`
}

export function emptyProject(name = ''): Project {
  return { schema: SCHEMA, name, unit: 'mm', bins: [], items: [], settings: { solver: 'box', objective: 'bin-packing', timeLimit: 10, optimizationMode: 'anytime' } }
}

/** Convert a length shown in the project unit to the millimetre integer the solver needs. */
export function toMm(value: number, unit: Unit): number {
  return Math.max(1, Math.round(value * UNIT_TO_MM[unit]))
}

/** Convert millimetres to the display unit, rounded to a sensible number of decimals. */
export function fromMm(mm: number, unit: Unit): number {
  const value = mm / UNIT_TO_MM[unit]
  const decimals = unit === 'mm' ? 0 : unit === 'cm' ? 1 : 3
  return Number(value.toFixed(decimals))
}

export function volumeMm3(spec: { x: number; y: number; z: number }): number {
  return spec.x * spec.y * spec.z
}

export function totalItemVolume(project: Project): number {
  return project.items.reduce((sum, item) => sum + volumeMm3(item) * item.copies, 0)
}

export function totalBinVolume(project: Project): number {
  return project.bins.reduce((sum, bin) => sum + volumeMm3(bin) * bin.copies, 0)
}

/** Problems that would make the backend reject the project; empty when it can be solved. */
export function validateProject(project: Project): string[] {
  const problems: string[] = []
  if (project.bins.length === 0) problems.push('no-bins')
  if (project.items.length === 0) problems.push('no-items')
  for (const spec of [...project.bins, ...project.items]) {
    if (!(spec.x > 0 && spec.y > 0 && spec.z > 0)) problems.push(`bad-dimension:${spec.id}`)
    if (!(spec.copies >= 1)) problems.push(`bad-copies:${spec.id}`)
  }
  if (!(project.settings.timeLimit > 0)) problems.push('bad-time-limit')
  return problems
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

/** Parse a saved project, filling defaults for fields older files may lack. Throws on anything that is not a project. */
export function parseProject(text: string): Project {
  const raw = JSON.parse(text) as Partial<Project>
  if (typeof raw !== 'object' || raw === null || typeof raw.schema !== 'string' || !raw.schema.startsWith('stowly/')) {
    throw new Error('not a Stowly project')
  }
  const base = emptyProject(raw.name ?? '')
  return {
    ...base,
    ...raw,
    unit: raw.unit ?? 'mm',
    bins: (raw.bins ?? []).map((b) => ({ ...b, copies: b.copies ?? 1 })),
    items: (raw.items ?? []).map((i) => ({ ...i, copies: i.copies ?? 1, rotations: i.rotations ?? 'all' })),
    settings: { ...base.settings, ...(raw.settings ?? {}) }
  }
}

/** A ready-made project so the first click shows something: a 40' high cube with a mix of China Post cartons. */
export function demoProject(): Project {
  const project = emptyProject('demo')
  project.bins = [{ id: 'bin-40hq', name: "40' HQ", x: 12032, y: 2352, z: 2698, copies: 1, cost: 1, maxWeight: 26460 }]
  const cartons: [string, number, number, number, number, number][] = [
    ['邮政 1 号纸箱', 530, 290, 370, 300, 8],
    ['邮政 2 号纸箱', 530, 230, 290, 300, 6],
    ['邮政 3 号纸箱', 430, 210, 270, 400, 4],
    ['欧标托盘整托', 1200, 800, 1200, 24, 450],
    ['IBC 吨桶', 1200, 1000, 1150, 12, 1100]
  ]
  project.items = cartons.map(([name, x, y, z, copies, weight], index) => ({ id: `item-${index + 1}`, name, x, y, z, copies, weight, rotations: index < 3 ? 'all' : 'upright' }))
  project.settings = { solver: 'box', objective: 'knapsack', timeLimit: 10, optimizationMode: 'anytime' }
  return project
}
