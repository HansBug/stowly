/**
 * Pure geometry for the 3D view (unit-tested; the WebGL controller in scene.ts is not).
 *
 * Solver coordinates are x (length), y (width), z (height, up). Three.js is y-up, so solver (x, y, z) maps to
 * three (x, z, y): lengths along x stay, the solver's z becomes the vertical axis, the solver's y becomes depth.
 */
import { colorFor } from '../lib/colors'
import type { PackedBin, Placement } from '../lib/result'

export interface BoxDescriptor {
  index: number
  placement: Placement
  center: [number, number, number]
  size: [number, number, number]
  color: string
}

/** Geometry for every placement of a bin in three.js coordinates, in metres so large containers stay numerically tame. */
export function placementBoxes(bin: PackedBin, colors?: Record<string, string | null | undefined>): BoxDescriptor[] {
  return bin.placements.map((placement, index) => ({
    index,
    placement,
    center: [(placement.x + placement.lx / 2) / 1000, (placement.z + placement.lz / 2) / 1000, (placement.y + placement.ly / 2) / 1000],
    size: [placement.lx / 1000, placement.lz / 1000, placement.ly / 1000],
    color: colorFor(placement.itemIndex, colors?.[placement.itemId])
  }))
}
