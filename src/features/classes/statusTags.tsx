import { Tag } from 'antd'
import type { AssignmentStatus } from '../../shared/quiz/types'

const STATUS: Record<AssignmentStatus, { label: string; color: string }> = {
  todo: { label: 'Do zrobienia', color: 'default' },
  in_progress: { label: 'W toku', color: 'processing' },
  done: { label: 'Zrobione', color: 'success' },
}

export function StatusTag({ status }: { status: AssignmentStatus }) {
  return <Tag color={STATUS[status].color}>{STATUS[status].label}</Tag>
}
