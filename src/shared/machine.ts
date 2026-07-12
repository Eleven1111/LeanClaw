import type { InternalStatus, UserStatus } from './types'

export const USER_STATUS_MAP: Record<InternalStatus, UserStatus> = {
  draft: 'Draft',
  planning: 'Planning',
  queued: 'Running',
  step_running: 'Running',
  step_retrying: 'Running',
  paused_by_user: 'Running',
  awaiting_approval: 'Waiting for You',
  andon_open: 'Waiting for You',
  verifying: 'Verifying',
  verification_failed: 'Blocked',
  failed: 'Blocked',
  delivered: 'Delivered',
  cancelled_by_user: 'Cancelled',
  archived: 'Archived'
}

export const ALLOWED: Record<InternalStatus, InternalStatus[]> = {
  draft: ['planning', 'cancelled_by_user'],
  planning: ['queued', 'failed', 'cancelled_by_user'],
  queued: ['step_running', 'verifying', 'paused_by_user', 'cancelled_by_user'],
  step_running: [
    'queued',
    'step_retrying',
    'awaiting_approval',
    'andon_open',
    'verifying',
    'paused_by_user',
    'failed',
    'cancelled_by_user'
  ],
  step_retrying: ['queued', 'andon_open', 'paused_by_user', 'cancelled_by_user'],
  verifying: [
    'queued',
    'step_retrying',
    'verification_failed',
    'delivered',
    'andon_open',
    'paused_by_user',
    'cancelled_by_user'
  ],
  awaiting_approval: ['queued', 'cancelled_by_user'],
  andon_open: ['queued', 'cancelled_by_user'],
  verification_failed: ['queued', 'cancelled_by_user', 'archived'],
  paused_by_user: ['queued', 'cancelled_by_user'],
  delivered: ['queued', 'archived'],
  failed: ['queued', 'archived', 'cancelled_by_user'],
  cancelled_by_user: ['archived'],
  archived: []
}

export function canTransition(from: InternalStatus, to: InternalStatus): boolean {
  if (from === to) return false
  return (ALLOWED[from] ?? []).includes(to)
}
