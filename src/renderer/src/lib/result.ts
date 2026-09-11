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
  /** Solver that produced the result; the viewer's order label and floating check follow it, not the current setting. */
  solver: 'box' | 'boxstacks'
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

/**
 * Placements above the floor with nothing directly underneath. The box solver has no support constraint (upstream places
 * items by aligning with faces of the skyline, not by resting them on something), so its solutions can contain these;
 * boxstacks builds stacks and never does.
 */
export function floatingPlacements(bin: PackedBin): Placement[] {
  const overlaps = (a: Placement, b: Placement) => a.x < b.x + b.lx && b.x < a.x + a.lx && a.y < b.y + b.ly && b.y < a.y + a.ly
  return bin.placements.filter((p) => p.z > 0 && !bin.placements.some((q) => q !== p && q.z + q.lz === p.z && overlaps(p, q)))
}
