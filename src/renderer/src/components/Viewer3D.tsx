import { Alert, Button, Empty, Segmented, Slider, Space, Tag, Tooltip, Typography } from 'antd'
import { InfoCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Project } from '../lib/project'
import type { PackedBin, SolveResult } from '../lib/result'
import { floatingPlacements, itemName } from '../lib/result'
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
  const [unavailable, setUnavailable] = useState<string | null>(null)
  // Without a result the first container is drawn empty, so the user sees what they are editing.
  const preview = project.bins[0]
  const bin: PackedBin | null = result
    ? result.bins[selectedBin] ?? null
    : preview ? { binId: preview.id, binIndex: 0, copies: preview.copies, x: preview.x, y: preview.y, z: preview.z, placements: [], volumeUtilization: 0, weight: 0 } : null
  const colors = useMemo(() => Object.fromEntries(project.items.map((item) => [item.id, item.color])), [project.items])
  const spec = bin ? project.bins.find((b) => b.id === bin.binId) ?? project.bins[bin.binIndex] : undefined
  const openSides = spec?.openSides ?? []
  const openSidesKey = openSides.join(',')
  const stacked = (result?.solver ?? project.settings.solver) === 'boxstacks'
  const floatingIdx = useMemo(() => new Set(bin && result && result.solver === 'box' ? floatingPlacements(bin).map((p) => bin.placements.indexOf(p)) : []), [bin, result])
  const floating = floatingIdx.size

  useEffect(() => {
    if (!container.current) return
    let scene: SceneController
    try {
      scene = new SceneController(container.current, { onHover: setHovered, onSelect: setSelected })
    } catch (err) {
      // No WebGL context (virtual machines, remote desktops, blocked GPUs): the tables, solver and exports must keep working.
      setUnavailable(err instanceof Error ? err.message : String(err))
      return
    }
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
    controller.current?.setBin(bin, colors, openSides, floatingIdx)
    setVisible(null)
    setSelected(null)
    setHovered(null)
    // openSides is derived from the project; its joined key keeps the effect stable across renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bin, colors, openSidesKey, floatingIdx])

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
        {bin && openSides.length ? <Tooltip title={t('bins.openSidesHelp')}><Tag color="orange">{t('viewer.openSides')}: {openSides.map((side) => t(`bins.sides.${side}`)).join(' / ')}</Tag></Tooltip> : null}
        {bin && result ? <Tag>{t('result.binUtil')} {(bin.volumeUtilization * 100).toFixed(1)}%</Tag> : null}
        {floating > 0 ? <Tooltip title={t('viewer.floatingHelp')}><Tag color="warning" icon={<WarningOutlined />} data-testid="floating-tag">{t('viewer.floating', { count: floating })}</Tag></Tooltip> : null}
        {bin ? <Tooltip title={t('viewer.gravityHelp')}><Tag>{t('viewer.gravity')}</Tag></Tooltip> : null}
        <Button size="small" onClick={() => controller.current?.setBin(bin, colors, openSides, floatingIdx)}>{t('viewer.reset')}</Button>
      </Space>
      <div ref={container} data-testid="viewer-canvas" style={{ flex: 1, minHeight: 240, position: 'relative' }}>
        {unavailable ? <Alert type="warning" showIcon message={t('viewer.unavailable')} description={unavailable} style={{ margin: 12 }} /> : null}
        {!bin && !unavailable ? <Empty description={t('viewer.noBin')} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} /> : null}
      </div>
      {bin && result ? (
        <div style={{ padding: '4px 12px 8px' }}>
          <Space align="center" style={{ width: '100%' }}>
            <Tooltip title={stacked ? t('viewer.orderStacksHelp') : t('viewer.orderBoxHelp')}>
              <Typography.Text type={stacked ? 'secondary' : 'warning'} style={{ whiteSpace: 'nowrap', cursor: 'help' }} data-testid="order-label">
                {stacked ? <InfoCircleOutlined /> : <WarningOutlined />} {stacked ? t('viewer.orderStacks') : t('viewer.orderBox')}
              </Typography.Text>
            </Tooltip>
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
