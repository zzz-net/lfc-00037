import type { TicketStatus, TimelineEventType } from '../../shared/types';
import { STATUS_LABELS, STATUS_COLORS } from '../../shared/types';

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getStatusLabel(status: TicketStatus): string {
  return STATUS_LABELS[status] || status;
}

export function getStatusBadgeClass(status: TicketStatus): string {
  return STATUS_COLORS[status] || 'bg-gray-100 text-gray-700 border-gray-200';
}

export function getTimelineEventLabel(type: TimelineEventType): string {
  const labels: Record<TimelineEventType, string> = {
    created: '创建工单',
    assigned: '派工',
    status_changed: '状态变更',
    note_added: '添加备注',
    reopened: '重新打开',
    escalated: '催办升级',
    de_escalated: '撤销催办',
    escalation_exception_created: '设置催办例外',
    escalation_exception_revoked: '撤销催办例外',
    batch_priority_changed: '批量改优先级',
    batch_assignee_changed: '批量派工',
    batch_exception_set: '批量设置催办例外',
    batch_exception_revoked: '批量撤销催办例外',
  };
  return labels[type] || type;
}

export function getTimelineEventIconType(type: TimelineEventType): string {
  const icons: Record<TimelineEventType, string> = {
    created: 'plus',
    assigned: 'user-check',
    status_changed: 'refresh-cw',
    note_added: 'message-square',
    reopened: 'rotate-ccw',
    escalated: 'megaphone',
    de_escalated: 'undo-2',
    escalation_exception_created: 'shield',
    escalation_exception_revoked: 'shield-off',
    batch_priority_changed: 'alert-circle',
    batch_assignee_changed: 'users',
    batch_exception_set: 'shield-plus',
    batch_exception_revoked: 'shield-off',
  };
  return icons[type] || 'circle';
}

export function timeAgo(isoString: string): string {
  const now = new Date().getTime();
  const then = new Date(isoString).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return '刚刚';
}

export function copyToClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function getEscalationBadgeClass(): string {
  return 'bg-rose-100 text-rose-700 border border-rose-200';
}

export function getExceptionBadgeClass(type: 'delay' | 'exempt'): string {
  if (type === 'delay') return 'bg-amber-100 text-amber-700 border border-amber-200';
  return 'bg-teal-100 text-teal-700 border border-teal-200';
}

export function formatMinutes(minutes: number | undefined | null): string {
  if (minutes === undefined || minutes === null || minutes <= 0) return '不限时';
  if (minutes < 60) return `${minutes} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}
