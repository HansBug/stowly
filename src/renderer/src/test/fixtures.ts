/** Shared fixtures for renderer tests: a solved demo and a preset catalogue shaped like the backend's answers. */
import { fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { Presets } from '../lib/api'
import { demoProject, type Project } from '../lib/project'
import type { PackedBin, SolveResult } from '../lib/result'

export function solvedDemo(): { project: Project; result: SolveResult } {
  const project = demoProject()
  const [a, b] = project.items
  const bin: PackedBin = {
    binId: project.bins[0].id, binIndex: 0, copies: 1, x: project.bins[0].x, y: project.bins[0].y, z: project.bins[0].z,
    placements: [
      { itemId: a.id, itemIndex: 0, x: 0, y: 0, z: 0, lx: 530, ly: 290, lz: 370, rotation: 'XYZ' },
      { itemId: a.id, itemIndex: 0, x: 530, y: 0, z: 0, lx: 530, ly: 290, lz: 370, rotation: 'XYZ' },
      { itemId: b.id, itemIndex: 1, x: 0, y: 290, z: 0, lx: 530, ly: 230, lz: 290, rotation: 'XYZ' }
    ],
    volumeUtilization: 0.42, weight: 22
  }
  const result: SolveResult = {
    status: 'feasible', objective: 'knapsack', value: 74521635000, bound: 76351413000, solveTime: 10.02, wallTime: 10.3,
    bins: [bin],
    counts: project.items.map((item, index) => ({ itemId: item.id, packed: index < 2 ? item.copies : item.copies - 1, total: item.copies })),
    statistics: {}, options: {}
  }
  return { project, result }
}

export const presets: Presets = {
  containers: [
    { id: 'c40hq', category: 'iso-container', name: { zh: '40 尺高柜', en: "40' HQ" }, x: 12032, y: 2352, z: 2698, maxWeight: 26460, note: { zh: '内尺寸', en: 'inner' }, source: 'ISO 668' },
    { id: 'truck96', category: 'truck-cn', name: { zh: '9.6 米货车', en: '9.6 m truck' }, x: 9600, y: 2350, z: 2500, maxWeight: 18000, source: 'GB 1589' }
  ],
  items: [
    { id: 'post1', category: 'postal-carton-cn', name: { zh: '邮政 1 号纸箱', en: 'China Post carton no. 1' }, x: 530, y: 290, z: 370, weight: 0.5, source: 'China Post' }
  ]
}

/** Open the n-th Ant Design Select on the page and click the option with the given label. */
export function pickOption(selectIndex: number, label: string): void {
  fireEvent.mouseDown(document.querySelectorAll('.ant-select')[selectIndex])
  const option = document.querySelector(`.ant-select-item-option[title="${label}"]`)
  if (!option) throw new Error(`option ${label} not found`)
  fireEvent.click(option)
}

type Route = (init?: RequestInit) => { status?: number; body: unknown }
/** A fetch stand-in keyed by "METHOD /path" (or "/path" for GET) that answers with JSON or text. */
export function fakeFetch(routes: Record<string, Route>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input).replace(/^https?:\/\/[^/]+/, '')
    const route = routes[`${init?.method ?? 'GET'} ${url}`] ?? routes[url]
    if (!route) return new Response('not found', { status: 404 })
    const { status = 200, body } = route(init)
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': typeof body === 'string' ? 'text/plain' : 'application/json' } })
  }) as unknown as typeof fetch
}
