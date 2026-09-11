import { Button, Input, InputNumber, Popconfirm, Select, Space, Table, Tooltip } from 'antd'
import { DeleteOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { fromMm, SIDES, toMm, type BinSpec, type ItemSpec, type Rotations, type Side, type Unit } from '../lib/project'
import { colorFor } from '../lib/colors'

type Row = BinSpec | ItemSpec
type Patch = Partial<BinSpec> & Partial<ItemSpec>

interface Props {
  rows: Row[]
  unit: Unit
  kind: 'bins' | 'items'
  /** Show the boxstacks-only stacking columns (the box solver has no stacking model). */
  stacking?: boolean
  onChange: (id: string, patch: Patch) => void
  onRemove: (id: string) => void
}

/** A column title with a small help icon. */
function Help({ title, help }: { title: string; help: string }) {
  return (
    <Space size={4}>
      {title}
      <Tooltip title={help}><QuestionCircleOutlined style={{ color: '#999' }} /></Tooltip>
    </Space>
  )
}

/** One editable table for both containers and cargo: dimensions are edited in the project unit and stored in millimetres. */
export function EditableTable({ rows, unit, kind, stacking = false, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  type T = Row
  const number = (row: T, key: keyof Patch, value: number | null | undefined, width: number, opts: { min?: number; integer?: boolean } = {}) => (
    <InputNumber size="small" min={opts.min ?? 0} value={value ?? undefined} style={{ width }} controls={false} precision={opts.integer ? 0 : undefined}
      onChange={(v) => onChange(row.id, { [key]: v === null || v === undefined ? null : Number(v) } as Patch)} />
  )
  const dim = (field: 'x' | 'y' | 'z'): ColumnsType<T>[number] => ({
    title: `${t(`${kind}.${field === 'x' ? 'length' : field === 'y' ? 'width' : 'height'}`)} (${unit})`,
    dataIndex: field,
    width: 80,
    render: (_: unknown, row: T) => (
      <InputNumber size="small" min={0.001} step={unit === 'mm' ? 1 : 0.1} value={fromMm(row[field], unit)} style={{ width: 66 }} controls={false}
        onChange={(value) => value !== null && onChange(row.id, { [field]: toMm(Number(value), unit) })} />
    )
  })
  const columns: ColumnsType<T> = [
    {
      title: t(`${kind}.name`), dataIndex: 'name', width: 140, fixed: 'left',
      render: (_: unknown, row: T, index: number) => (
        <Input size="small" value={row.name} placeholder={t(`${kind}.name`)} onChange={(e) => onChange(row.id, { name: e.target.value })}
          prefix={kind === 'items' ? <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colorFor(index, (row as ItemSpec).color) }} /> : undefined} />
      )
    },
    dim('x'), dim('y'), dim('z'),
    { title: t(`${kind}.copies`), dataIndex: 'copies', width: 68, render: (_: unknown, row: T) => <InputNumber size="small" min={1} value={row.copies} style={{ width: 52 }} controls={false} onChange={(v) => v !== null && onChange(row.id, { copies: Math.max(1, Math.round(Number(v))) })} /> }
  ]
  if (kind === 'bins') {
    columns.push(
      { title: t('bins.cost'), dataIndex: 'cost', width: 68, render: (_: unknown, row: T) => number(row, 'cost', (row as BinSpec).cost, 52) },
      { title: t('bins.maxWeight'), dataIndex: 'maxWeight', width: 92, render: (_: unknown, row: T) => number(row, 'maxWeight', (row as BinSpec).maxWeight, 76) },
      {
        title: <Help title={t('bins.openSides')} help={t('bins.openSidesHelp')} />, dataIndex: 'openSides', width: 170,
        render: (_: unknown, row: T) => (
          <Select size="small" mode="multiple" maxTagCount="responsive" style={{ width: 154 }} value={(row as BinSpec).openSides}
            onChange={(value: Side[]) => onChange(row.id, { openSides: value })}
            options={SIDES.map((side) => ({ value: side, label: t(`bins.sides.${side}`) }))} />
        )
      }
    )
    if (stacking) {
      columns.push({ title: <Help title={t('bins.maxStackDensity')} help={t('bins.maxStackDensityHelp')} />, dataIndex: 'maxStackDensity', width: 118, render: (_: unknown, row: T) => number(row, 'maxStackDensity', (row as BinSpec).maxStackDensity, 90) })
    }
  } else {
    columns.push(
      { title: t('items.weight'), dataIndex: 'weight', width: 82, render: (_: unknown, row: T) => number(row, 'weight', (row as ItemSpec).weight, 66) },
      { title: t('items.profit'), dataIndex: 'profit', width: 72, render: (_: unknown, row: T) => number(row, 'profit', (row as ItemSpec).profit, 56) },
      {
        title: t('items.rotations'), dataIndex: 'rotations', width: 88,
        render: (_: unknown, row: T) => (
          <Select size="small" value={(row as ItemSpec).rotations} style={{ width: 72 }} onChange={(value: Rotations) => onChange(row.id, { rotations: value })}
            options={(['all', 'upright', 'fixed'] as Rotations[]).map((r) => ({ value: r, label: t(`items.rot.${r}`) }))} />
        )
      }
    )
    if (stacking) {
      columns.push(
        { title: <Help title={t('items.maxStack')} help={t('items.stackingHelp.maxStack')} />, dataIndex: 'maxStack', width: 96, render: (_: unknown, row: T) => number(row, 'maxStack', (row as ItemSpec).maxStack, 72, { min: 1, integer: true }) },
        { title: <Help title={t('items.maxWeightAbove')} help={t('items.stackingHelp.maxWeightAbove')} />, dataIndex: 'maxWeightAbove', width: 112, render: (_: unknown, row: T) => number(row, 'maxWeightAbove', (row as ItemSpec).maxWeightAbove, 84) },
        { title: <Help title={t('items.nestingHeight')} help={t('items.stackingHelp.nestingHeight')} />, dataIndex: 'nestingHeight', width: 108, render: (_: unknown, row: T) => number(row, 'nestingHeight', (row as ItemSpec).nestingHeight, 80, { integer: true }) },
        {
          title: <Help title={t('items.group')} help={t('items.stackingHelp.group')} />, dataIndex: 'group', width: 84,
          render: (_: unknown, row: T) => (
            <InputNumber size="small" min={0} precision={0} value={(row as ItemSpec).group ?? 0} style={{ width: 60 }} controls={false}
              onChange={(v) => onChange(row.id, { group: Math.max(0, Math.round(Number(v ?? 0))) })} />
          )
        }
      )
    }
  }
  columns.push({
    title: '', dataIndex: 'actions', width: 40,
    render: (_: unknown, row: T) => (
      <Popconfirm title={t('common.delete')} onConfirm={() => onRemove(row.id)} okText={t('common.confirm')} cancelText={t('common.cancel')}>
        <Tooltip title={t('common.delete')}><Button size="small" type="text" danger icon={<DeleteOutlined />} /></Tooltip>
      </Popconfirm>
    )
  })
  return <Table<Row> size="small" rowKey="id" pagination={false} columns={columns} dataSource={rows} scroll={{ x: 'max-content' }} locale={{ emptyText: <Space>{t(`${kind}.empty`)}</Space> }} />
}
