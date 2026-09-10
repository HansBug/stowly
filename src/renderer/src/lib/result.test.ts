import { describe, expect, it } from 'vitest'
import { demoProject } from './project'
import { binsUsed, isProvenOptimal, itemName, itemsPacked, itemsTotal, overallUtilization, type SolveResult } from './result'

const result: SolveResult = {
  status: 'optimal', objective: 'bin-packing', value: 2, bound: 2, solveTime: 0.1, wallTime: 0.2,
  bins: [
    { binId: 'b', binIndex: 0, copies: 2, x: 100, y: 100, z: 100, weight: 3, volumeUtilization: 0.5, placements: [{ itemId: 'item-1', itemIndex: 0, x: 0, y: 0, z: 0, lx: 100, ly: 100, lz: 50, rotation: 'XYZ' }] }
  ],
  counts: [{ itemId: 'item-1', packed: 2, total: 3 }],
  statistics: {}, options: {}
}

describe('result helpers', () => {
  it('counts bins and items over identical copies', () => {
    expect(binsUsed(result)).toBe(2)
    expect(itemsPacked(result)).toBe(2)
    expect(itemsTotal(result)).toBe(3)
    expect(isProvenOptimal(result)).toBe(true)
    expect(isProvenOptimal({ ...result, status: 'feasible' })).toBe(false)
  })
  it('computes the overall utilisation and handles empty results', () => {
    expect(overallUtilization(result)).toBeCloseTo(0.5)
    expect(overallUtilization({ ...result, bins: [] })).toBe(0)
  })
  it('resolves item names from the project', () => {
    expect(itemName(demoProject(), 'item-1')).toMatch(/邮政 1 号/)
    expect(itemName(demoProject(), 'missing')).toBe('missing')
  })
})
