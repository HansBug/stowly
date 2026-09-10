import { Button, Empty, Segmented, Slider, Space, Tag, Typography } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../lib/project'
import type { PackedBin, SolveResult } from '../lib/result'
import { itemName } from '../lib/result'
import { SceneController, type BoxDescriptor } from '../three/scene'

interface Props {
  project: Project
  result: SolveResult | null
  selectedBin: number
  onSelectBin: (index: number) => void
}

export function Viewer3D({ project, result, selectedBin, onSelectBin }: Props) {
  const { t } = useTranslation()
  const container = useRef<HTMLDivElement>(null)
  const controller = useRef<SceneController | null>(null)
  const [hovered, setHovered] = useState<BoxDescriptor | null>(null)
  const [selected, setSelected] = useState<BoxDescriptor | null>(null)
  const [visible, setVisible] = useState<number | null>(null)
  const bin: PackedBin | null = result?.bins[selectedBin] ?? null
  const colors = useMemo(() => Object.fromEntries(project.items.map((item) => [item.id, item.color])), [project.items])

  useEffect(() => {
    if (!container.current) return
    const scene = new SceneController(container.current, { onHover: setHovered, onSelect: setSelected })
    controller.current = scene
    const observer = new ResizeObserver(() => scene.resize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      scene.dispose()
      controller.current = null
    }
  }, [])

  useEffect(() => {
    controller.current?.setBin(bin, colors)
    setVisible(null)
    setSelected(null)
    setHovered(null)
  }, [bin, colors])

  useEffect(() => {
    controller.current?.setVisibleCount(visible ?? Infinity)
  }, [visible])

  const count = bin?.placements.length ?? 0
  const describe = (box: BoxDescriptor) => `${itemName(project, box.placement.itemId)} @ (${box.placement.x}, ${box.placement.y}, ${box.placement.z}) ${box.placement.lx}×${box.placement.ly}×${box.placement.lz} ${box.placement.rotation}`
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Space wrap style={{ padding: '6px 8px' }}>
        {result && result.bins.length > 1 ? (
          <Segmented value={selectedBin} onChange={(value) => onSelectBin(Number(value))}
            options={result.bins.map((b, index) => ({ value: index, label: `${t('result.bin')} ${index + 1}${b.copies > 1 ? ` ×${b.copies}` : ''}` }))} />
        ) : null}
        {bin ? <Tag color="blue">{bin.x} × {bin.y} × {bin.z} mm</Tag> : null}
        {bin ? <Tag>{t('result.binUtil')} {(bin.volumeUtilization * 100).toFixed(1)}%</Tag> : null}
        <Button size="small" onClick={() => controller.current?.setBin(bin, colors)}>{t('viewer.reset')}</Button>
      </Space>
      <div ref={container} data-testid="viewer-canvas" style={{ flex: 1, minHeight: 240, position: 'relative' }}>
        {!bin ? <Empty description={t('viewer.noBin')} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} /> : null}
      </div>
      {bin ? (
        <div style={{ padding: '4px 12px 8px' }}>
          <Space align="center" style={{ width: '100%' }}>
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>{t('result.step')}</Typography.Text>
            <Slider style={{ width: 260 }} min={0} max={count} value={visible ?? count} onChange={(value) => setVisible(Number(value))} />
            <Button size="small" onClick={() => setVisible(null)}>{t('viewer.showAll')}</Button>
            <Typography.Text type="secondary">{(visible ?? count)}/{count}</Typography.Text>
          </Space>
          <Typography.Text style={{ display: 'block', fontSize: 12 }}>{selected ? describe(selected) : hovered ? describe(hovered) : t('result.hover')}</Typography.Text>
        </div>
      ) : null}
    </div>
  )
}
