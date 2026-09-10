import type { Project } from './project'

export interface Placement {
  itemId: string
  itemIndex: number
  x: number
  y: number
  z: number
  lx: number
  ly: number
  lz: number
  rotation: string
}

export interface PackedBin {
  binId: string
  binIndex: number
  copies: number
  x: number
  y: number
  z: number
  placements: Placement[]
  volumeUtilization: number
  weight: number
}

export interface ItemCount {
  itemId: string
  packed: number
  total: number
}

export interface SolveResult {
  status: 'optimal' | 'feasible' | 'no-solution' | 'infeasible' | string
  objective: string
  value: number | null
  bound: number | null
  solveTime: number | null
  wallTime: number
  bins: PackedBin[]
  counts: ItemCount[]
  statistics: Record<string, unknown>
  options: Record<string, unknown>
}

export function binsUsed(result: SolveResult): number {
  return result.bins.reduce((sum, bin) => sum + bin.copies, 0)
}

export function itemsPacked(result: SolveResult): number {
  return result.counts.reduce((sum, count) => sum + count.packed, 0)
}

export function itemsTotal(result: SolveResult): number {
  return result.counts.reduce((sum, count) => sum + count.total, 0)
}

/** Whether the achieved value meets the reported bound; the backend already says so through `status`, this is the same rule. */
export function isProvenOptimal(result: SolveResult): boolean {
  return result.status === 'optimal'
}

/** Overall utilisation over all used bins, weighting identical bins by their copies. */
export function overallUtilization(result: SolveResult): number {
  const capacity = result.bins.reduce((sum, bin) => sum + bin.x * bin.y * bin.z * bin.copies, 0)
  if (capacity === 0) return 0
  const used = result.bins.reduce((sum, bin) => sum + bin.placements.reduce((s, p) => s + p.lx * p.ly * p.lz, 0) * bin.copies, 0)
  return used / capacity
}

export function itemName(project: Project, itemId: string): string {
  return project.items.find((item) => item.id === itemId)?.name ?? itemId
}
