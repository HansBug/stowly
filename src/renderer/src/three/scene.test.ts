import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom has no WebGL; everything else in three (geometry, camera, raycasting) is plain maths and runs for real.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()
  class FakeRenderer {
    domElement = document.createElement('canvas')
    setPixelRatio = vi.fn()
    setSize = vi.fn()
    render = vi.fn()
    dispose = vi.fn()
  }
  return { ...actual, WebGLRenderer: FakeRenderer }
})

import type * as THREE from 'three'
import { SceneController } from './scene'
import type { PackedBin } from '../lib/result'

const bin: PackedBin = {
  binId: 'b', binIndex: 0, copies: 1, x: 1000, y: 1000, z: 1000, volumeUtilization: 1, weight: 0,
  placements: [
    { itemId: 'big', itemIndex: 0, x: 0, y: 0, z: 0, lx: 1000, ly: 1000, lz: 500, rotation: 'XYZ' },
    { itemId: 'top', itemIndex: 1, x: 0, y: 0, z: 500, lx: 1000, ly: 1000, lz: 500, rotation: 'XYZ' }
  ]
}

function mount() {
  const container = document.createElement('div')
  Object.defineProperty(container, 'clientWidth', { value: 400 })
  Object.defineProperty(container, 'clientHeight', { value: 300 })
  document.body.appendChild(container)
  const onHover = vi.fn()
  const onSelect = vi.fn()
  const scene = new SceneController(container, { onHover, onSelect })
  scene.renderer.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  return { container, scene, onHover, onSelect }
}

let current: SceneController | null = null
afterEach(() => { current?.dispose(); current = null; document.body.innerHTML = '' })

describe('SceneController', () => {
  it('builds meshes for a bin, frames the camera and clears again', () => {
    const { container, scene } = mount()
    current = scene
    expect(container.querySelector('canvas')).not.toBeNull()
    expect(scene.camera.aspect).toBeCloseTo(400 / 300)
    scene.setBin(bin, { big: '#ff0000' })
    expect(scene.scene.children.length).toBeGreaterThan(2)
    const meshes = (scene as unknown as { meshes: THREE.Mesh[] }).meshes
    expect(meshes).toHaveLength(2)
    expect(scene.controls.target.toArray()).toEqual([0.5, 0.5, 0.5])
    scene.setVisibleCount(1)
    expect(meshes.map((m) => m.visible)).toEqual([true, false])
    scene.select(1)
    scene.select(null)
    scene.setBin(null)
    expect((scene as unknown as { meshes: unknown[] }).meshes).toHaveLength(0)
  })

  it('reports hovered and clicked boxes through the callbacks', () => {
    const { scene, onHover, onSelect } = mount()
    current = scene
    scene.setBin(bin)
    // The render loop normally refreshes world matrices every frame; the fake renderer does not, so do it here.
    scene.scene.updateMatrixWorld(true)
    scene.camera.updateMatrixWorld(true)
    const canvas = scene.renderer.domElement
    // The camera looks at the bin centre, so the middle of the canvas hits the upper box; a corner misses everything.
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 150, bubbles: true }))
    expect(onHover).toHaveBeenCalledTimes(1)
    expect(onHover.mock.calls[0][0]?.placement.itemId).toBe('top')
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 201, clientY: 150, bubbles: true }))
    expect(onHover).toHaveBeenCalledTimes(1) // same box, no repeat
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 200, clientY: 150, bubbles: true }))
    expect(onSelect.mock.calls[0][0]?.placement.itemId).toBe('top')
    scene.setVisibleCount(1)
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 150, bubbles: true }))
    expect(onHover.mock.calls[1][0]?.placement.itemId).toBe('big')
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 1, clientY: 1, bubbles: true }))
    expect(onHover).toHaveBeenLastCalledWith(null)
    canvas.dispatchEvent(new MouseEvent('click', { clientX: 1, clientY: 1, bubbles: true }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
    scene.dispose()
    expect(document.body.querySelector('canvas')).toBeNull()
    current = null
  })
})
