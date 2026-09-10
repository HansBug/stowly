/** Three.js scene for one packed bin. Geometry comes from boxes.ts; this file owns the WebGL renderer, camera, picking and highlight. */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { PackedBin } from '../lib/result'
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

  /** Replace the displayed bin. `colors` maps item ids to overrides. */
  setBin(bin: PackedBin | null, colors?: Record<string, string | null | undefined>): void {
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
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.z), new THREE.MeshBasicMaterial({ color: 0xdde3ea, side: THREE.DoubleSide }))
    floor.rotation.x = -Math.PI / 2
    floor.position.set(size.x / 2, 0, size.z / 2)
    this.binGroup.add(floor)
    for (const box of this.boxes) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...box.size), new THREE.MeshLambertMaterial({ color: box.color }))
      mesh.position.set(...box.center)
      mesh.userData.index = box.index
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.55 }))
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
