import { Progress, Space, Tag, Typography } from 'antd'
import { useTranslation } from 'react-i18next'
import type { JobState } from '../lib/api'
import type { SolveResult } from '../lib/result'

interface Props {
  job: JobState | null
  solving: boolean
  result: SolveResult | null
  /** Knapsack without profits values solutions by volume; the live value is shown in m³ then. */
  volumeValued: boolean
}

const SHOWN_EVENTS = 8

/** The time-driven progress bar and live improvement log of the running (or just finished) solve. */
export function SolveProgress({ job, solving, result, volumeValued }: Props) {
  const { t } = useTranslation()
  if (!job || !job.budget) return null
  const budget = job.budget
  const events = job.progress?.events ?? []
  const elapsed = solving ? job.progress?.elapsed ?? 0 : result?.wallTime ?? job.progress?.elapsed ?? 0
  const percent = solving ? Math.min(99, Math.round((elapsed / budget.timeLimit) * 100)) : 100
  const last = events[events.length - 1]
  const singlePass = budget.improvement === 0
  const fmtValue = (v: number) => (volumeValued ? `${(v / 1e9).toFixed(2)} m³` : v.toLocaleString('en-US', { maximumFractionDigits: 2 }))

  let finished: string | null = null
  if (!solving && result) {
    if (result.stopReason === 'unimproved') finished = t('progress.finishedUnimproved', { silence: Math.max(0, elapsed - (last?.time ?? 0)).toFixed(1), since: (last?.time ?? 0).toFixed(1) })
    else if (result.stopReason === 'callback') finished = t('progress.finishedCallback')
    else if (result.status === 'optimal') finished = t('progress.finishedProved')
    else if (result.status === 'no-solution' && singlePass) finished = t('progress.finishedSinglePass', { path: budget.path, timeLimit: budget.timeLimit.toFixed(0) })
    else finished = t('progress.finishedLimit')
  }

  return (
    <Space direction="vertical" size={4} style={{ width: '100%' }} data-testid="solve-progress">
      <Space wrap>
        <Typography.Text strong>{t('progress.title')}</Typography.Text>
        <Tag color={budget.source === 'auto' ? 'blue' : 'default'}>{t(budget.source === 'auto' ? 'progress.budgetAuto' : 'progress.budgetManual')}</Tag>
        <Tag>{t('progress.path', { path: budget.path })}</Tag>
        <Typography.Text type="secondary">{t('progress.elapsed', { elapsed: elapsed.toFixed(1), timeLimit: budget.timeLimit.toFixed(0) })}</Typography.Text>
      </Space>
      {budget.extendedFrom != null ? <Typography.Text type="warning" data-testid="progress-extended">{t('progress.extended', { first: budget.extendedFrom.toFixed(0), timeLimit: budget.timeLimit.toFixed(0) })}</Typography.Text> : null}
      <Progress percent={percent} status={solving ? 'active' : result?.status === 'no-solution' || result?.status === 'infeasible' ? 'exception' : 'success'} size="small" data-testid="progress-bar" />
      <Typography.Text data-testid="progress-live">
        {finished
          ? finished
          : last
            ? `${t('progress.current', { items: last.items, bins: last.bins, ago: Math.max(0, elapsed - last.time).toFixed(1) })} · ${t('progress.value', { value: fmtValue(last.profit) })}`
            : t('progress.waitingFirst', { latency: budget.latency.toFixed(1) })}
      </Typography.Text>
      <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', maxHeight: 120, overflow: 'auto' }} data-testid="progress-log">
        {events.length === 0 ? t('progress.noEvents') : null}
        {events.slice(-SHOWN_EVENTS).reverse().map((e, i) => (
          <div key={`${e.time}-${i}`}>{t('progress.eventLine', { time: e.time.toFixed(2), items: e.items, bins: e.bins, label: e.label })}</div>
        ))}
      </div>
    </Space>
  )
}
