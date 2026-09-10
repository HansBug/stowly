import { describe, expect, it } from 'vitest'
import { placementBoxes } from './boxes'
import type { PackedBin } from '../lib/result'

const bin: PackedBin = {
  binId: 'b', binIndex: 0, copies: 1, x: 1000, y: 500, z: 250, weight: 0, volumeUtilization: 0,
  placements: [
    { itemId: 'a', itemIndex: 0, x: 0, y: 0, z: 0, lx: 200, ly: 100, lz: 50, rotation: 'XYZ' },
    { itemId: 'b', itemIndex: 3, x: 200, y: 100, z: 50, lx: 300, ly: 200, lz: 100, rotation: 'YXZ' }
  ]
}

describe('placementBoxes', () => {
  it('maps solver z-up millimetres to three.js y-up metres', () => {
    const boxes = placementBoxes(bin)
    expect(boxes[0].center).toEqual([0.1, 0.025, 0.05])
    expect(boxes[0].size).toEqual([0.2, 0.05, 0.1])
    expect(boxes[1].center).toEqual([0.35, 0.1, 0.2])
    expect(boxes[1].index).toBe(1)
  })
  it('colours by item index unless the project overrides it', () => {
    const plain = placementBoxes(bin)
    expect(plain[0].color).not.toBe(plain[1].color)
    expect(placementBoxes(bin, { a: '#123456' })[0].color).toBe('#123456')
  })
})
