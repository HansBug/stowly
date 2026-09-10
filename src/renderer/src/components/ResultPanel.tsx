import { Alert, Button, Descriptions, Empty, Progress, Space, Table, Tag } from 'antd'
import { useTranslation } from 'react-i18next'
import type { Project } from '../lib/project'
import { binsUsed, itemName, itemsPacked, itemsTotal, overallUtilization, type SolveResult } from '../lib/result'
import { colorFor } from '../lib/colors'

interface Props {
  project: Project
  result: SolveResult | null
  error: string | null
  selectedBin: number
  onExport: () => void
}

const STATUS_COLOR: Record<string, string> = { optimal: 'green', feasible: 'blue', 'no-solution': 'orange', infeasible: 'red' }

export function ResultPanel({ project, result, error, selectedBin, onExport }: Props) {
  const { t } = useTranslation()
  if (error) return <Alert type="error" showIcon message={t('result.failed')} description={<pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{error}</pre>} />
  if (!result) return <Empty description={t('result.none')} />
  const bin = result.bins[selectedBin]
  const volumeValued = project.settings.objective === 'knapsack' && project.items.every((item) => item.profit == null)
  const fmt = (v: number | null) => (v == null ? '-' : volumeValued ? `${(v / 1e9).toFixed(2)} m³` : v.toLocaleString('en-US', { maximumFractionDigits: 2 }))
  const counts = result.counts.map((count) => ({ ...count, name: itemName(project, count.itemId), index: project.items.findIndex((item) => item.id === count.itemId) }))
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Descriptions size="small" column={2} bordered
        items={[
          { key: 'status', label: t('result.title'), children: <Tag color={STATUS_COLOR[result.status] ?? 'default'}>{t(`result.status.${result.status}`, { defaultValue: result.status })}</Tag> },
          { key: 'value', label: `${t('result.value')} / ${t('result.bound')}`, children: `${fmt(result.value)} / ${fmt(result.bound)}` },
          { key: 'bins', label: t('result.binsUsed'), children: binsUsed(result) },
          { key: 'packed', label: t('result.packed'), children: `${itemsPacked(result)} / ${itemsTotal(result)}` },
          { key: 'util', label: t('result.utilization'), children: <Progress percent={Number((overallUtilization(result) * 100).toFixed(1))} size="small" /> },
          { key: 'time', label: t('result.solveTime'), children: `${(result.solveTime ?? result.wallTime).toFixed(2)} s` }
        ]} />
      <Table size="small" pagination={false} rowKey="itemId" dataSource={counts}
        columns={[
          { title: '', dataIndex: 'index', width: 28, render: (index: number) => <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: colorFor(index) }} /> },
          { title: t('result.item'), dataIndex: 'name' },
          { title: t('result.packed'), dataIndex: 'packed', width: 120, render: (_: unknown, row) => <span style={{ color: row.packed < row.total ? '#cf1322' : undefined }}>{row.packed} / {row.total}{row.packed < row.total ? ` (${t('result.leftOut')} ${row.total - row.packed})` : ''}</span> }
        ]} />
      {bin ? (
        <Table size="small" rowKey={(p) => `${p.itemId}-${p.x}-${p.y}-${p.z}`} dataSource={bin.placements} pagination={{ pageSize: 8, size: 'small' }}
          title={() => <Space>{t('result.placements')} <Tag>{t('result.bin')} {selectedBin + 1}</Tag><Tag>{t('result.binWeight')} {bin.weight.toFixed(1)} kg</Tag><Button size="small" onClick={onExport}>{t('result.export')}</Button></Space>}
          columns={[
            { title: t('result.item'), dataIndex: 'itemId', render: (id: string) => itemName(project, id) },
            { title: t('result.position'), key: 'pos', render: (_: unknown, p) => `${p.x}, ${p.y}, ${p.z}` },
            { title: t('result.size'), key: 'size', render: (_: unknown, p) => `${p.lx} × ${p.ly} × ${p.lz}` },
            { title: t('result.rotation'), dataIndex: 'rotation', width: 80 }
          ]} />
      ) : null}
    </Space>
  )
}
