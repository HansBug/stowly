import { Button, Input, InputNumber, Popconfirm, Select, Space, Table, Tooltip } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { fromMm, toMm, type BinSpec, type ItemSpec, type Rotations, type Unit } from '../lib/project'
import { colorFor } from '../lib/colors'

type Row = BinSpec | ItemSpec
type Patch = Partial<BinSpec> & Partial<ItemSpec>

interface Props {
  rows: Row[]
  unit: Unit
  kind: 'bins' | 'items'
  onChange: (id: string, patch: Patch) => void
  onRemove: (id: string) => void
}

/** One editable table for both containers and cargo: dimensions are edited in the project unit and stored in millimetres. */
export function EditableTable({ rows, unit, kind, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  type T = Row
  const dim = (field: 'x' | 'y' | 'z'): ColumnsType<T>[number] => ({
    title: `${t(`${kind}.${field === 'x' ? 'length' : field === 'y' ? 'width' : 'height'}`)} (${unit})`,
    dataIndex: field,
    width: 110,
    render: (_: unknown, row: T) => (
      <InputNumber size="small" min={0.001} step={unit === 'mm' ? 1 : 0.1} value={fromMm(row[field], unit)} style={{ width: 96 }}
        onChange={(value) => value !== null && onChange(row.id, { [field]: toMm(Number(value), unit) })} />
    )
  })
  const columns: ColumnsType<T> = [
    {
      title: '', dataIndex: 'color', width: 28,
      render: (_: unknown, row: T, index: number) => kind === 'items' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3, background: colorFor(index, (row as ItemSpec).color) }} /> : null
    },
    { title: t(`${kind}.name`), dataIndex: 'name', render: (_: unknown, row: T) => <Input size="small" value={row.name} onChange={(e) => onChange(row.id, { name: e.target.value })} /> },
    dim('x'), dim('y'), dim('z'),
    { title: t(`${kind}.copies`), dataIndex: 'copies', width: 90, render: (_: unknown, row: T) => <InputNumber size="small" min={1} value={row.copies} style={{ width: 76 }} onChange={(v) => v !== null && onChange(row.id, { copies: Math.max(1, Math.round(Number(v))) })} /> }
  ]
  if (kind === 'bins') {
    columns.push(
      { title: t('bins.cost'), dataIndex: 'cost', width: 90, render: (_: unknown, row: T) => <InputNumber size="small" min={0} value={(row as BinSpec).cost ?? undefined} style={{ width: 76 }} onChange={(v) => onChange(row.id, { cost: v === null ? null : Number(v) })} /> },
      { title: t('bins.maxWeight'), dataIndex: 'maxWeight', width: 120, render: (_: unknown, row: T) => <InputNumber size="small" min={0} value={(row as BinSpec).maxWeight ?? undefined} style={{ width: 100 }} onChange={(v) => onChange(row.id, { maxWeight: v === null ? null : Number(v) })} /> }
    )
  } else {
    columns.push(
      { title: t('items.weight'), dataIndex: 'weight', width: 110, render: (_: unknown, row: T) => <InputNumber size="small" min={0} value={(row as ItemSpec).weight ?? undefined} style={{ width: 90 }} onChange={(v) => onChange(row.id, { weight: v === null ? null : Number(v) })} /> },
      { title: t('items.profit'), dataIndex: 'profit', width: 90, render: (_: unknown, row: T) => <InputNumber size="small" min={0} value={(row as ItemSpec).profit ?? undefined} style={{ width: 76 }} onChange={(v) => onChange(row.id, { profit: v === null ? null : Number(v) })} /> },
      {
        title: t('items.rotations'), dataIndex: 'rotations', width: 100,
        render: (_: unknown, row: T) => (
          <Select size="small" value={(row as ItemSpec).rotations} style={{ width: 88 }} onChange={(value: Rotations) => onChange(row.id, { rotations: value })}
            options={(['all', 'upright', 'fixed'] as Rotations[]).map((r) => ({ value: r, label: t(`items.rot.${r}`) }))} />
        )
      }
    )
  }
  columns.push({
    title: '', dataIndex: 'actions', width: 44,
    render: (_: unknown, row: T) => (
      <Popconfirm title={t('common.delete')} onConfirm={() => onRemove(row.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
        <Tooltip title={t('common.delete')}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
      </Popconfirm>
    )
  })
  return <Table<Row> size="small" rowKey="id" pagination={false} columns={columns} dataSource={rows} scroll={{ x: true }} locale={{ emptyText: <Space>{t(`${kind}.empty`)}</Space> }} />
}
