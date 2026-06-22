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
