/** Three.js scene for one packed bin. Geometry comes from boxes.ts; this file owns the WebGL renderer, camera, picking and highlight. */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PackedBin } from '../lib/result'
import type { Side } from '../lib/project'
import { placementBoxes, type BoxDescriptor } from './boxes'

export type { BoxDescriptor } from './boxes'
export { placementBoxes } from './boxes'

export interface SceneOptions {
  onHover?: (box: BoxDescriptor | null) => void
  onSelect?: (box: BoxDescriptor | null) => void
}

export class SceneController {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  private itemGroup = new THREE.Group()
  private binGroup = new THREE.Group()
  private boxes: BoxDescriptor[] = []
  private meshes: THREE.Mesh[] = []
  private raycaster = new THREE.Raycaster()
  private pointer = new THREE.Vector2()
  private hovered: number | null = null
  private selected: number | null = null
  private visibleCount = Infinity
  private frame = 0
  private disposed = false

  constructor(private readonly container: HTMLElement, private readonly options: SceneOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.container.appendChild(this.renderer.domElement)
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.scene.background = new THREE.Color('#f5f7fa')
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
    const sun = new THREE.DirectionalLight(0xffffff, 0.9)
    sun.position.set(5, 10, 7)
    this.scene.add(sun)
    this.scene.add(this.binGroup, this.itemGroup)
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.addEventListener('click', this.onClick)
    this.resize()
    this.animate()
  }

  /**
   * Replace the displayed bin. `colors` maps item ids to overrides; `openSides` are drawn amber, closed walls light grey;
   * placements whose index is in `highlight` (the floating ones) get a red outline.
   */
  setBin(bin: PackedBin | null, colors?: Record<string, string | null | undefined>, openSides: Side[] = [], highlight: Set<number> = new Set()): void {
    this.clearGroup(this.itemGroup)
    this.clearGroup(this.binGroup)
    this.meshes = []
    this.hovered = null
    this.selected = null
    this.boxes = bin ? placementBoxes(bin, colors) : []
    if (!bin) return
    const size = new THREE.Vector3(bin.x / 1000, bin.z / 1000, bin.y / 1000)
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), new THREE.LineBasicMaterial({ color: 0x333333 }))
    outline.position.set(size.x / 2, size.y / 2, size.z / 2)
    this.binGroup.add(outline)
    this.addFloor(size)
    this.addWalls(size, openSides)
    for (const box of this.boxes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size), new THREE.MeshLambertMaterial({ color: box.color }))
      mesh.position.set(...box.center)
      mesh.userData.index = box.index
      const floating = highlight.has(box.index)
      mesh.userData.floating = floating
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial(floating ? { color: 0xd4380d } : { color: 0x222222, transparent: true, opacity: 0.55 }))
      mesh.add(edges)
      this.itemGroup.add(mesh)
      this.meshes.push(mesh)
    }
    this.applyVisibility()
    this.frameBin(size)
  }

  /** Show only the first `count` placements (the loading-order slider). */
  setVisibleCount(count: number): void {
    this.visibleCount = count
    this.applyVisibility()
  }

  select(index: number | null): void {
    this.selected = index
    this.refreshHighlight()
  }

  resize(): void {
    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove)
    this.renderer.domElement.removeEventListener('click', this.onClick)
    this.controls.dispose()
    this.clearGroup(this.itemGroup)
    this.clearGroup(this.binGroup)
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  /**
   * The floor is the one opaque face: a dark plate with a 0.5 m grid, plus a gravity arrow beside the origin corner, so
   * "down" and "resting on the floor" can be read at a glance even after rotating the camera.
   */
  private addFloor(size: THREE.Vector3): void {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.z), new THREE.MeshBasicMaterial({ color: 0xb9c2cc, side: THREE.DoubleSide }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(size.x / 2, 0, size.z / 2)
    floor.userData.floor = true
    this.binGroup.add(floor)
    const step = 0.5
    const points: number[] = []
    for (let x = 0; x <= size.x + 1e-9; x += step) points.push(x, 0.001, 0, x, 0.001, size.z)
    for (let z = 0; z <= size.z + 1e-9; z += step) points.push(0, 0.001, z, size.x, 0.001, z)
    const grid = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3)), new THREE.LineBasicMaterial({ color: 0x7d8a99, transparent: true, opacity: 0.6 }))
    grid.userData.grid = true
    this.binGroup.add(grid)
    // The arrow stands just outside the corner nearest the default camera (x-max / y-max), full container height, in the
    // same blue as the dimension tag, so it stays readable when the bin is packed solid.
    const offset = 0.06 * Math.max(size.x, size.z)
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(size.x + offset, size.y, size.z + offset), size.y, 0x1d39c4, 0.18 * size.y, 0.12 * size.y)
    arrow.userData.gravity = true
    this.binGroup.add(arrow)
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.05 * size.y, 0.13 * size.y, 24), new THREE.MeshBasicMaterial({ color: 0x1d39c4, transparent: true, opacity: 0.5, side: THREE.DoubleSide }))
    foot.rotation.x = -Math.PI / 2
    foot.position.set(size.x + offset, 0.002, size.z + offset)
    foot.userData.gravity = true
    this.binGroup.add(foot)
  }

  /**
   * Walls of the container. Solver x is the length axis (three.js x), solver y the width (three.js z), solver z the height
   * (three.js y). Open sides (doors, open tops) are amber and a little more opaque so the loading direction is visible.
   */
  private addWalls(size: THREE.Vector3, openSides: Side[]): void {
    const walls: Array<{ side: Side; geometry: THREE.PlaneGeometry; position: [number, number, number]; rotation: [number, number, number] }> = [
      { side: 'x-min', geometry: new THREE.PlaneGeometry(size.z, size.y), position: [0, size.y / 2, size.z / 2], rotation: [0, Math.PI / 2, 0] },
      { side: 'x-max', geometry: new THREE.PlaneGeometry(size.z, size.y), position: [size.x, size.y / 2, size.z / 2], rotation: [0, Math.PI / 2, 0] },
      { side: 'y-min', geometry: new THREE.PlaneGeometry(size.x, size.y), position: [size.x / 2, size.y / 2, 0], rotation: [0, 0, 0] },
      { side: 'y-max', geometry: new THREE.PlaneGeometry(size.x, size.y), position: [size.x / 2, size.y / 2, size.z], rotation: [0, 0, 0] },
      { side: 'top', geometry: new THREE.PlaneGeometry(size.x, size.z), position: [size.x / 2, size.y, size.z / 2], rotation: [-Math.PI / 2, 0, 0] }
    ]
    for (const wall of walls) {
      const open = openSides.includes(wall.side)
      const mesh = new THREE.Mesh(wall.geometry, new THREE.MeshBasicMaterial({ color: open ? 0xf5a623 : 0x9aa5b1, transparent: true, opacity: open ? 0.22 : 0.07, side: THREE.DoubleSide, depthWrite: false }))
      mesh.position.set(...wall.position)
      mesh.rotation.set(...wall.rotation)
      mesh.userData.side = wall.side
      mesh.userData.open = open
      this.binGroup.add(mesh)
      if (open) {
        const frame = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), new THREE.LineBasicMaterial({ color: 0xd9822b }))
        frame.position.copy(mesh.position)
        frame.rotation.copy(mesh.rotation)
        this.binGroup.add(frame)
      }
    }
  }

  private frameBin(size: THREE.Vector3): void {
    const longest = Math.max(size.x, size.y, size.z)
    this.controls.target.set(size.x / 2, size.y / 2, size.z / 2)
    this.camera.position.set(size.x / 2 + longest * 1.1, size.y / 2 + longest * 0.9, size.z / 2 + longest * 1.3)
    this.camera.near = longest / 1000
    this.camera.far = longest * 50
    this.camera.updateProjectionMatrix()
    this.controls.update()
  }

  private applyVisibility(): void {
    this.meshes.forEach((mesh, index) => {
      mesh.visible = index < this.visibleCount
    })
  }

  private refreshHighlight(): void {
    this.meshes.forEach((mesh, index) => {
      const material = mesh.material as THREE.MeshLambertMaterial
      const box = this.boxes[index]
      material.color.set(box.color)
      material.emissive.set(index === this.selected ? 0x333333 : index === this.hovered ? 0x1a1a1a : 0x000000)
    })
  }

  private pick(event: PointerEvent | MouseEvent): BoxDescriptor | null {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.meshes.filter((m) => m.visible), false)[0]
    if (!hit) return null
    return this.boxes[hit.object.userData.index as number] ?? null
  }

  private onPointerMove = (event: PointerEvent): void => {
    const box = this.pick(event)
    const index = box ? box.index : null
    if (index !== this.hovered) {
      this.hovered = index
      this.refreshHighlight()
      this.options.onHover?.(box)
    }
  }

  private onClick = (event: MouseEvent): void => {
    const box = this.pick(event)
    this.selected = box ? box.index : null
    this.refreshHighlight()
    this.options.onSelect?.(box)
  }

  private clearGroup(group: THREE.Group): void {
    for (const child of [...group.children]) {
      group.remove(child)
      child.traverse((node) => {
        const mesh = node as THREE.Mesh
        mesh.geometry?.dispose?.()
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose?.()
      })
    }
  }

  private animate = (): void => {
    if (this.disposed) return
    this.frame = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}
